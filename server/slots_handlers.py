"""Slots WebSocket message handlers and timer helpers."""

import asyncio
import json
import logging
import time

from game_room import validate_player_name
from slots_engine import SlotsEngine
from slots_room import (
    SLOTS_MIN_PLAYERS,
    add_player_to_slots_room,
    create_slots_room,
    get_slots_player_list,
    get_slots_room,
    remove_player_from_slots_room,
    slots_rooms,
)

from connection import (
    manager,
    player_game_types,
    room_create_cooldowns,
    slots_spin_timers,
    MAX_ROOMS,
    ROOM_CREATE_COOLDOWN_SECONDS,
    SLOTS_SPIN_TIMEOUT,
    SLOTS_ROUND_ADVANCE_DELAY,
)

logger = logging.getLogger("blackjack")

slots_engine = SlotsEngine()


# --- Slots Broadcast Helper ---


async def slots_broadcast(room_code: str, message: dict, exclude: str | None = None):
    """Broadcast a message to all connected players in a slots room."""
    room = get_slots_room(room_code)
    if not room:
        return
    msg_text = json.dumps(message)
    for pid, player in room.players.items():
        if pid == exclude or not player.connected:
            continue
        ws = manager.connections.get(pid)
        if ws:
            try:
                await ws.send_text(msg_text)
            except Exception as e:
                logger.warning("Failed to broadcast slots to player %s: %s", pid, e)


# --- Slots Timer Helpers ---


def cancel_slots_spin_timer(room_code: str):
    """Cancel any active slots spin timer for this room."""
    task = slots_spin_timers.pop(room_code, None)
    if task and not task.done():
        task.cancel()


def start_slots_spin_timer(room_code: str):
    """Start a timer that auto-spins AFK players after SLOTS_SPIN_TIMEOUT."""
    cancel_slots_spin_timer(room_code)

    async def _auto_spin_afk():
        await asyncio.sleep(SLOTS_SPIN_TIMEOUT)
        room = get_slots_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "spinning":
                return
            all_events = []
            for pid, player in room.players.items():
                if player.connected and not player.has_spun:
                    logger.info(f"Auto-spinning AFK player {pid} in slots room {room_code}")
                    events = slots_engine.auto_spin(room, pid)
                    all_events.extend(events)
            for event in all_events:
                await slots_broadcast(room_code, event)
            if room.phase == "round_result":
                schedule_slots_round_advance(room_code)

    slots_spin_timers[room_code] = asyncio.create_task(_auto_spin_afk())


def schedule_slots_round_advance(room_code: str):
    """Schedule round advancement after a delay so clients can display results."""
    async def _advance():
        await asyncio.sleep(SLOTS_ROUND_ADVANCE_DELAY)
        room = get_slots_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "round_result":
                return
            events = slots_engine.advance_round(room)
            for event in events:
                await slots_broadcast(room_code, event)
            start_slots_spin_timer(room_code)

    asyncio.create_task(_advance())


# --- Slots Room Handlers ---


async def handle_create_slots_room(player_id: str, message: dict):
    if len(slots_rooms) >= MAX_ROOMS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Server is full. Try again later."}
        )
        return
    now = time.monotonic()
    if now - room_create_cooldowns.get(player_id, 0) < ROOM_CREATE_COOLDOWN_SECONDS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Please wait before creating another room."}
        )
        return
    room_create_cooldowns[player_id] = now

    if player_id in manager.player_rooms:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are already in a room. Leave first."}
        )
        return

    try:
        name = validate_player_name(message.get("player_name"))
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    room = create_slots_room(name, player_id)
    manager.player_rooms[player_id] = room.code
    player_game_types[player_id] = "slots"

    logger.info(f"Slots room {room.code} created by {name} ({player_id})")

    await manager.send_to_player(
        player_id,
        {
            "type": "slots_room_created",
            "code": room.code,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "players": get_slots_player_list(room),
        },
    )


async def handle_join_slots_room(player_id: str, message: dict):
    if player_id in manager.player_rooms:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are already in a room. Leave first."}
        )
        return

    try:
        name = validate_player_name(message.get("player_name"))
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    code = message.get("code", "").strip().upper()
    if not code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room code is required"}
        )
        return

    room = get_slots_room(code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    try:
        add_player_to_slots_room(room, name, player_id)
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    manager.player_rooms[player_id] = room.code
    player_game_types[player_id] = "slots"

    logger.info(f"{name} ({player_id}) joined slots room {room.code}")

    player_list = get_slots_player_list(room)

    await manager.send_to_player(
        player_id,
        {
            "type": "slots_player_joined",
            "player_name": name,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "code": room.code,
            "players": player_list,
        },
    )

    await slots_broadcast(
        room.code,
        {
            "type": "slots_player_joined",
            "player_name": name,
            "player_id": player_id,
            "players": player_list,
        },
        exclude=player_id,
    )


async def handle_configure_slots(player_id: str, message: dict):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can configure the game"}
        )
        return

    if room.phase != "lobby":
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Cannot configure during game"}
        )
        return

    from slots_constants import ROUND_OPTIONS

    total_rounds = message.get("total_rounds")
    if total_rounds is not None:
        if total_rounds not in ROUND_OPTIONS:
            await manager.send_to_player(
                player_id, {"type": "error", "message": f"Rounds must be one of {ROUND_OPTIONS}"}
            )
            return
        room.total_rounds = total_rounds

    VALID_BETS = [100, 500, 1000, 5000]
    bet_per_round = message.get("bet_per_round")
    if bet_per_round is not None:
        if isinstance(bet_per_round, bool) or bet_per_round not in VALID_BETS:
            await manager.send_to_player(
                player_id, {"type": "error", "message": f"Bet must be one of {VALID_BETS}"}
            )
            return
        room.bet_per_round = bet_per_round

    await slots_broadcast(
        room.code,
        {
            "type": "slots_configured",
            "total_rounds": room.total_rounds,
            "bet_per_round": room.bet_per_round,
        },
    )


async def handle_start_slots(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can start the game"}
        )
        return

    async with room._lock:
        try:
            events = slots_engine.start_game(room)
        except ValueError as e:
            await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
            return

        logger.info(f"Slots game started in room {room_code}")

        for event in events:
            await slots_broadcast(room_code, event)

        start_slots_spin_timer(room_code)


async def handle_slots_spin(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    async with room._lock:
        try:
            events = slots_engine.handle_spin(room, player_id)
        except ValueError as e:
            await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
            return

        for event in events:
            await slots_broadcast(room_code, event)

        if room.phase == "round_result":
            cancel_slots_spin_timer(room_code)
            if room.current_round < room.total_rounds:
                schedule_slots_round_advance(room_code)
        elif room.phase == "final_result":
            cancel_slots_spin_timer(room_code)


async def handle_leave_slots(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(player_id, {"type": "left_room"})
        return

    room = get_slots_room(room_code)
    if not room:
        manager.player_rooms.pop(player_id, None)
        player_game_types.pop(player_id, None)
        await manager.send_to_player(player_id, {"type": "left_room"})
        return

    async with room._lock:
        player_name = room.players[player_id].name if player_id in room.players else "Unknown"

        if room.phase == "spinning" and player_id in room.players:
            player = room.players[player_id]
            if not player.has_spun:
                player.connected = False
                connected = [p for p in room.players.values() if p.connected]
                if connected and all(p.has_spun for p in connected):
                    resolve_events = slots_engine.resolve_round(room)
                    for event in resolve_events:
                        await slots_broadcast(room_code, event)
                    if room.phase == "round_result":
                        cancel_slots_spin_timer(room_code)
                        schedule_slots_round_advance(room_code)

        new_host_id = remove_player_from_slots_room(room, player_id)
        manager.player_rooms.pop(player_id, None)
        player_game_types.pop(player_id, None)
        manager.cancel_disconnect_task(player_id)

        logger.info(f"{player_name} ({player_id}) left slots room {room_code}")

        await manager.send_to_player(player_id, {"type": "left_room"})

        remaining_room = get_slots_room(room_code)
        if remaining_room:
            new_host_name = None
            if new_host_id and new_host_id in remaining_room.players:
                new_host_name = remaining_room.players[new_host_id].name

            await slots_broadcast(
                room_code,
                {
                    "type": "slots_player_left",
                    "player_name": player_name,
                    "players": get_slots_player_list(remaining_room),
                    "new_host": new_host_name,
                },
            )

            connected = [p for p in remaining_room.players.values() if p.connected]
            if remaining_room.phase != "lobby" and len(connected) < SLOTS_MIN_PLAYERS:
                cancel_slots_spin_timer(room_code)
                events = slots_engine.return_to_lobby(remaining_room)
                for event in events:
                    await slots_broadcast(room_code, event)
        else:
            cancel_slots_spin_timer(room_code)


async def handle_slots_play_again(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_slots_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can start a new game"}
        )
        return

    if room.phase != "final_result":
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Game is not finished"}
        )
        return

    async with room._lock:
        events = slots_engine.return_to_lobby(room)
        for event in events:
            await slots_broadcast(room_code, event)
