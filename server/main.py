"""FastAPI WebSocket server for multiplayer blackjack."""

import asyncio
import json
import logging
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import time

from constants import NEW_ROUND_DELAY, QUICK_CHAT_MESSAGES, STARTING_BANKROLL
from game_logic import GameEngine
from game_room import (
    MAX_PLAYERS,
    MIN_PLAYERS,
    GameRoom,
    add_player_to_room,
    cleanup_empty_rooms,
    create_room,
    get_player_list,
    get_room,
    remove_player_from_room,
    rooms,
    validate_player_name,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("blackjack")

HEARTBEAT_INTERVAL = 30  # seconds
HEARTBEAT_TIMEOUT = 10  # seconds
DISCONNECT_GRACE_PERIOD = 120  # seconds
CLEANUP_INTERVAL = 60  # seconds
TURN_TIMEOUT = 60  # seconds — auto-stand AFK players
BET_TIMEOUT = 30  # seconds — auto-skip AFK players who don't bet

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "https://blackjack.siaahmadi.com",
}

MAX_MESSAGE_SIZE = 4096  # 4KB


class ConnectionManager:
    """Manages WebSocket connections, mapping player_ids to sockets and rooms."""

    def __init__(self):
        self.connections: dict[str, WebSocket] = {}  # player_id -> websocket
        self.player_rooms: dict[str, str] = {}  # player_id -> room_code
        self.disconnect_tasks: dict[str, asyncio.Task] = {}  # player_id -> timeout task
        self._conn_generation: dict[str, int] = {}  # player_id -> monotonic counter

    async def connect(self, player_id: str, websocket: WebSocket) -> int:
        """Register a connection and return its generation number."""
        self.connections[player_id] = websocket
        gen = self._conn_generation.get(player_id, 0) + 1
        self._conn_generation[player_id] = gen
        return gen

    def get_generation(self, player_id: str) -> int:
        return self._conn_generation.get(player_id, 0)

    def disconnect(self, player_id: str):
        self.connections.pop(player_id, None)

    async def send_to_player(self, player_id: str, message: dict):
        ws = self.connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.debug("Failed to send to player %s: %s", player_id, e)

    async def broadcast_to_room(
        self, room_code: str, message: dict, exclude: str | None = None
    ):
        room = get_room(room_code)
        if not room:
            return
        msg_text = json.dumps(message)
        for pid, player in room.players.items():
            if pid == exclude or not player.connected:
                continue
            ws = self.connections.get(pid)
            if ws:
                try:
                    await ws.send_text(msg_text)
                except Exception as e:
                    logger.warning("Failed to broadcast to player %s: %s", pid, e)

    def cancel_disconnect_task(self, player_id: str):
        task = self.disconnect_tasks.pop(player_id, None)
        if task and not task.done():
            task.cancel()


manager = ConnectionManager()
engine = GameEngine()

# Quick chat rate limiting: player_id -> last send timestamp
chat_cooldowns: dict[str, float] = {}
CHAT_COOLDOWN_SECONDS = 2.0

# Game action rate limiting: player_id -> last action timestamp
action_cooldowns: dict[str, float] = {}
ACTION_COOLDOWN_SECONDS = 0.2

# Turn timers: player_id -> asyncio.Task that auto-stands after TURN_TIMEOUT
turn_timers: dict[str, asyncio.Task] = {}

# Bet timers: room_code -> asyncio.Task that auto-skips AFK bettors after BET_TIMEOUT
bet_timers: dict[str, asyncio.Task] = {}


# --- Background Tasks ---


async def room_cleanup_loop():
    """Periodically prune rooms where all players disconnected > 5 min ago."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        removed = cleanup_empty_rooms(max_age_seconds=300)
        if removed > 0:
            logger.info(f"Cleaned up {removed} empty room(s). Active rooms: {len(rooms)}")


async def heartbeat_loop():
    """Ping all connected WebSockets every 30s to detect dead connections."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        stale = []
        for player_id, ws in list(manager.connections.items()):
            try:
                await asyncio.wait_for(ws.send_text(json.dumps({"type": "ping"})), timeout=HEARTBEAT_TIMEOUT)
            except Exception:
                stale.append(player_id)

        for player_id in stale:
            logger.info(f"Heartbeat failed for {player_id}, triggering disconnect")
            await handle_disconnect(player_id)

        # Purge stale chat cooldown entries for disconnected players
        now = time.monotonic()
        stale_cooldowns = [
            pid for pid, ts in chat_cooldowns.items()
            if pid not in manager.connections and now - ts > CHAT_COOLDOWN_SECONDS
        ]
        for pid in stale_cooldowns:
            del chat_cooldowns[pid]

        # Purge stale action cooldown entries for disconnected players
        stale_action_cooldowns = [
            pid for pid, ts in action_cooldowns.items()
            if pid not in manager.connections and now - ts > ACTION_COOLDOWN_SECONDS
        ]
        for pid in stale_action_cooldowns:
            del action_cooldowns[pid]


# --- Lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(room_cleanup_loop())
    heartbeat_task = asyncio.create_task(heartbeat_loop())
    yield
    cleanup_task.cancel()
    heartbeat_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://blackjack.siaahmadi.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- HTTP Endpoints ---


@app.get("/health")
async def health():
    return {"status": "ok", "rooms": len(rooms)}


# --- Message Handlers ---


async def handle_create_room(player_id: str, message: dict):
    # Validate player is not already in a room
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

    room = create_room(name, player_id)
    manager.player_rooms[player_id] = room.code

    logger.info(f"Room {room.code} created by {name} ({player_id})")

    await manager.send_to_player(
        player_id,
        {
            "type": "room_created",
            "code": room.code,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "players": get_player_list(room),
        },
    )


async def handle_join_room(player_id: str, message: dict):
    # Validate player is not already in a room
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

    room = get_room(code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    try:
        add_player_to_room(room, name, player_id)
    except ValueError as e:
        await manager.send_to_player(player_id, {"type": "error", "message": str(e)})
        return

    manager.player_rooms[player_id] = room.code

    logger.info(f"{name} ({player_id}) joined room {room.code}")

    player_list = get_player_list(room)

    # Send to the joining player (includes session_token — never broadcast)
    await manager.send_to_player(
        player_id,
        {
            "type": "player_joined",
            "player_name": name,
            "player_id": player_id,
            "session_token": room.players[player_id].session_token,
            "code": room.code,
            "players": player_list,
        },
    )

    # Broadcast to existing players
    await manager.broadcast_to_room(
        room.code,
        {
            "type": "player_joined",
            "player_name": name,
            "player_id": player_id,
            "players": player_list,
        },
        exclude=player_id,
    )


async def handle_start_game(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_room(room_code)
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

    if room.phase != "lobby":
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Game already started"}
        )
        return

    connected_count = sum(1 for p in room.players.values() if p.connected)
    if connected_count < MIN_PLAYERS:
        await manager.send_to_player(
            player_id,
            {"type": "error", "message": f"Need at least {MIN_PLAYERS} players to start"},
        )
        return

    logger.info(f"Game started in room {room_code} with {connected_count} players")

    async with room._lock:
        # Initialize game engine — transitions to betting phase
        events = engine.start_game(room)

        await manager.broadcast_to_room(
            room_code,
            {
                "type": "game_started",
                "players": get_player_list(room),
            },
        )

        # Broadcast engine events (betting_phase)
        for event in events:
            await manager.broadcast_to_room(room_code, event)

        _start_bet_timer(room_code)


async def handle_leave(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        # Idempotent: always confirm the leave so the client can reset
        await manager.send_to_player(player_id, {"type": "left_room"})
        return

    room = get_room(room_code)
    if not room:
        manager.player_rooms.pop(player_id, None)
        return

    async with room._lock:
        player_name = room.players[player_id].name if player_id in room.players else "Unknown"

        # Handle mid-game departure BEFORE removing player (needs turn order intact)
        # Mark disconnected so _skip_done_players treats them as gone
        if player_id in room.players:
            room.players[player_id].connected = False
        departure_events = engine.handle_player_departure(room, player_id)
        triggered_dealer = room.phase == "dealer_turn"

        new_host_id = remove_player_from_room(room, player_id)
        manager.player_rooms.pop(player_id, None)
        manager.cancel_disconnect_task(player_id)
        chat_cooldowns.pop(player_id, None)
        action_cooldowns.pop(player_id, None)
        _cancel_turn_timer(player_id)

        logger.info(f"{player_name} ({player_id}) left room {room_code}")

        # Notify the leaving player
        await manager.send_to_player(player_id, {"type": "left_room"})

        # Broadcast to remaining players (room may have been deleted if empty)
        remaining_room = get_room(room_code)
        if remaining_room:
            new_host_name = None
            if new_host_id and new_host_id in remaining_room.players:
                new_host_name = remaining_room.players[new_host_id].name

            await manager.broadcast_to_room(
                room_code,
                {
                    "type": "player_left",
                    "player_name": player_name,
                    "players": get_player_list(remaining_room),
                    "new_host": new_host_name,
                },
            )

            # Broadcast departure events (turn advancement, auto-deal, etc.)
            for event in departure_events:
                await manager.broadcast_to_room(room_code, event)

            # Cancel bet timer if departure triggered dealing
            if any(e.get("type") == "cards_dealt" for e in departure_events):
                _cancel_bet_timer(room_code)

            # If departure triggered dealer turn, run it
            if triggered_dealer:
                _start_dealer_turn_if_needed(remaining_room, room_code)
        else:
            # Room was deleted — clean up bet timer
            _cancel_bet_timer(room_code)


async def handle_disconnect(player_id: str, websocket: WebSocket = None, generation: int = None):
    """Handle unexpected WebSocket disconnection with grace period.

    If websocket is provided, skip if the connection was already taken over
    by a newer WebSocket (e.g., reconnection replaced the old one).
    If generation is provided, skip if a newer connection has since been
    established (prevents stale disconnect handlers from tearing down
    reconnected sessions).
    """
    if websocket is not None:
        current_ws = manager.connections.get(player_id)
        if current_ws is not None and current_ws is not websocket:
            logger.debug(f"Skipping disconnect for {player_id} — connection was taken over")
            return
    if generation is not None:
        if manager.get_generation(player_id) != generation:
            logger.debug(f"Skipping disconnect for {player_id} — generation mismatch")
            return
    manager.disconnect(player_id)
    chat_cooldowns.pop(player_id, None)
    action_cooldowns.pop(player_id, None)
    _cancel_turn_timer(player_id)

    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        return

    room = get_room(room_code)
    if not room or player_id not in room.players:
        manager.player_rooms.pop(player_id, None)
        return

    async with room._lock:
        player = room.players[player_id]
        player.connected = False
        player.disconnected_at = datetime.now(timezone.utc)

        logger.info(f"{player.name} ({player_id}) disconnected from room {room_code}")

        await manager.broadcast_to_room(
            room_code,
            {
                "type": "player_disconnected",
                "player_name": player.name,
                "players": get_player_list(room),
            },
        )

        # Handle mid-game departure (advance turn, auto-deal, etc.)
        departure_events = engine.handle_player_departure(room, player_id)
        for event in departure_events:
            await manager.broadcast_to_room(room_code, event)

        # Cancel bet timer if departure triggered dealing
        if any(e.get("type") == "cards_dealt" for e in departure_events):
            _cancel_bet_timer(room_code)

        # If departure triggered dealer turn, run it
        if room.phase == "dealer_turn":
            _start_dealer_turn_if_needed(room, room_code)

    # Schedule auto-leave after grace period (outside lock — task runs later)
    async def auto_leave():
        await asyncio.sleep(DISCONNECT_GRACE_PERIOD)
        # Check if still disconnected
        r = get_room(room_code)
        if r and player_id in r.players and not r.players[player_id].connected:
            logger.info(
                f"{player.name} ({player_id}) grace period expired, removing from room {room_code}"
            )
            await handle_leave(player_id)

    manager.cancel_disconnect_task(player_id)
    manager.disconnect_tasks[player_id] = asyncio.create_task(auto_leave())


async def handle_reconnect(player_id_from_msg: str, code: str, session_token: str, websocket: WebSocket) -> str | None:
    """Attempt to restore a disconnected player's session.

    Returns the restored player_id on success, None on failure.
    """
    code = code.strip().upper()
    room = get_room(code)
    if not room:
        await websocket.send_text(
            json.dumps({"type": "reconnect_failed", "message": "Reconnection failed. Room no longer exists."})
        )
        return None

    async with room._lock:
        if player_id_from_msg not in room.players:
            await websocket.send_text(
                json.dumps({"type": "reconnect_failed", "message": "Reconnection failed. Player not found in room."})
            )
            return None

        player = room.players[player_id_from_msg]
        if player.connected:
            # Connection takeover: the old WS is likely dead (e.g., mobile Safari
            # killed it on app switch) but the server hasn't detected it yet.
            old_ws = manager.connections.get(player_id_from_msg)
            manager.disconnect(player_id_from_msg)
            manager.cancel_disconnect_task(player_id_from_msg)
            player.connected = False
            player.disconnected_at = datetime.now(timezone.utc)
            if old_ws is not None and old_ws is not websocket:
                try:
                    await old_ws.close(code=4000, reason="Session taken over by new connection")
                except Exception:
                    pass
            logger.info(
                f"Connection takeover for {player.name} ({player_id_from_msg}) — old WS replaced"
            )

        if not session_token or not secrets.compare_digest(player.session_token, session_token):
            await websocket.send_text(
                json.dumps({"type": "reconnect_failed", "message": "Reconnection failed. Invalid session."})
            )
            return None

        if player.disconnected_at is None:
            await websocket.send_text(
                json.dumps({"type": "reconnect_failed", "message": "Reconnection failed. Invalid state."})
            )
            return None

        elapsed = (datetime.now(timezone.utc) - player.disconnected_at).total_seconds()
        if elapsed > DISCONNECT_GRACE_PERIOD:
            await websocket.send_text(
                json.dumps({"type": "reconnect_failed", "message": "Reconnection failed. Session expired."})
            )
            return None

        # Restore the player
        player.connected = True
        player.disconnected_at = None
        await manager.connect(player_id_from_msg, websocket)
        manager.cancel_disconnect_task(player_id_from_msg)

        logger.info(f"{player.name} ({player_id_from_msg}) reconnected to room {code}")

        # Notify the reconnecting player — include full game state if in-game
        reconnect_msg = {
            "type": "reconnected",
            "code": code,
            "player_id": player_id_from_msg,
            "session_token": player.session_token,
            "players": get_player_list(room),
            "phase": room.phase,
        }
        if room.phase not in ("lobby",):
            reconnect_msg["state"] = engine.get_room_state(room)
        await websocket.send_text(json.dumps(reconnect_msg))

        # If it's this player's turn, notify them and start turn timer
        if room.phase == "playing":
            current_pid = engine._get_current_player_id(room)
            if current_pid == player_id_from_msg:
                await websocket.send_text(
                    json.dumps({"type": "your_turn", "player_id": player_id_from_msg})
                )
                _start_turn_timer(player_id_from_msg, code)

        # Broadcast to others
        await manager.broadcast_to_room(
            code,
            {
                "type": "player_reconnected",
                "player_name": player.name,
                "players": get_player_list(room),
            },
            exclude=player_id_from_msg,
        )

        return player_id_from_msg


# --- Turn Timer ---


def _cancel_turn_timer(player_id: str):
    """Cancel any active turn timer for this player."""
    task = turn_timers.pop(player_id, None)
    if task and not task.done():
        task.cancel()


def _start_turn_timer(player_id: str, room_code: str):
    """Start a timer that auto-stands the player after TURN_TIMEOUT seconds."""
    _cancel_turn_timer(player_id)

    async def _auto_stand():
        await asyncio.sleep(TURN_TIMEOUT)
        room = get_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "playing":
                return
            if player_id not in room.players:
                return
            # Verify it is still this player's turn
            current_pid = None
            for pid in room.turn_order:
                if pid in room.players and room.players[pid].status == "playing":
                    current_pid = pid
                    break
            if current_pid != player_id:
                return
            logger.info(f"Turn timer expired for {player_id} in room {room_code}, auto-standing")
            try:
                events = engine.stand(room, player_id)
                for event in events:
                    await manager.broadcast_to_room(room_code, event)
                # Check if a new your_turn was emitted and start timer for next player
                for event in events:
                    if event.get("type") == "your_turn":
                        _start_turn_timer(event["player_id"], room_code)
                if room.phase == "dealer_turn":
                    _start_dealer_turn_if_needed(room, room_code)
            except ValueError:
                pass  # Player already stood or game state changed

    turn_timers[player_id] = asyncio.create_task(_auto_stand())


def _cancel_bet_timer(room_code: str):
    """Cancel any active bet timer for this room."""
    task = bet_timers.pop(room_code, None)
    if task and not task.done():
        task.cancel()


def _start_bet_timer(room_code: str):
    """Start a timer that auto-skips AFK players after BET_TIMEOUT seconds."""
    _cancel_bet_timer(room_code)

    async def _auto_skip_afk():
        await asyncio.sleep(BET_TIMEOUT)
        room = get_room(room_code)
        if not room:
            return
        async with room._lock:
            if room.phase != "betting":
                return

            # Mark AFK players as sitting out
            afk_names = []
            for player in room.players.values():
                if player.connected and player.status == "betting":
                    player.status = "sitting_out"
                    afk_names.append(player.name)

            if not afk_names:
                return  # Everyone bet just in time

            logger.info(f"Bet timer expired in room {room_code}, sitting out: {afk_names}")

            # Broadcast timeout notification
            await manager.broadcast_to_room(room_code, {
                "type": "bet_timeout",
                "sat_out": afk_names,
                "state": engine.get_room_state(room),
            })

            # Deal to ready players (or restart if nobody bet)
            ready = [p for p in room.players.values() if p.connected and p.status == "ready"]
            if ready:
                events = engine.deal_initial_cards(room)
                for event in events:
                    await manager.broadcast_to_room(room_code, event)
                for event in events:
                    if event.get("type") == "your_turn":
                        _start_turn_timer(event["player_id"], room_code)
                if room.phase == "dealer_turn":
                    _start_dealer_turn_if_needed(room, room_code)
            else:
                # Nobody bet — restart betting phase
                events = engine.start_betting_phase(room)
                for event in events:
                    await manager.broadcast_to_room(room_code, event)
                _start_bet_timer(room_code)

    bet_timers[room_code] = asyncio.create_task(_auto_skip_afk())


async def handle_game_action(player_id: str, message: dict):
    """Handle game actions (place_bet, hit, stand, double_down, split, bet_asset, remove_asset).

    Routes to the appropriate GameEngine method, broadcasts results.
    """
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_room(room_code)
    if not room:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Room not found"}
        )
        return

    # Rate limit: 200ms cooldown per player
    now = time.monotonic()
    last_action = action_cooldowns.get(player_id, 0)
    if now - last_action < ACTION_COOLDOWN_SECONDS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Too fast — slow down"}
        )
        return
    action_cooldowns[player_id] = now

    async with room._lock:
        msg_type = message.get("type")

        # Cancel turn timer when a player acts
        _cancel_turn_timer(player_id)

        try:
            if msg_type == "place_bet":
                amount = message.get("amount")
                if not isinstance(amount, int):
                    raise ValueError("Bet amount must be an integer")
                events = engine.place_bet(room, player_id, amount)
            elif msg_type == "bet_asset":
                asset_id = message.get("asset_id", "")
                events = engine.bet_asset(room, player_id, asset_id)
            elif msg_type == "remove_asset":
                asset_id = message.get("asset_id", "")
                events = engine.remove_asset(room, player_id, asset_id)
            elif msg_type == "take_loan":
                events = engine.take_loan(room, player_id)
            elif msg_type == "hit":
                events = engine.hit(room, player_id)
            elif msg_type == "stand":
                events = engine.stand(room, player_id)
            elif msg_type == "double_down":
                events = engine.double_down(room, player_id)
            elif msg_type == "split":
                events = engine.split(room, player_id)
            else:
                await manager.send_to_player(
                    player_id,
                    {"type": "error", "message": f"Unknown game action: {msg_type}"},
                )
                return
        except ValueError as e:
            await manager.send_to_player(
                player_id, {"type": "error", "message": str(e)}
            )
            return

        # Broadcast all events to the room
        for event in events:
            await manager.broadcast_to_room(room_code, event)

        # Cancel bet timer if cards were dealt (all bets placed naturally)
        if any(e.get("type") == "cards_dealt" for e in events):
            _cancel_bet_timer(room_code)

        # Start turn timer for the next player if a your_turn event was emitted
        for event in events:
            if event.get("type") == "your_turn":
                _start_turn_timer(event["player_id"], room_code)

        # If we transitioned to dealer_turn, run the dealer asynchronously
        if room.phase == "dealer_turn":
            _start_dealer_turn_if_needed(room, room_code)


def _start_dealer_turn_if_needed(room: GameRoom, room_code: str):
    """Start dealer turn task only if one isn't already running."""
    if room.dealer_turn_task and not room.dealer_turn_task.done():
        return
    room.dealer_turn_task = asyncio.create_task(_run_dealer_and_advance(room, room_code))


async def _run_dealer_and_advance(room: GameRoom, room_code: str):
    """Run dealer turn with broadcasting, then auto-advance to next round."""
    try:
        # Phase 1: Run dealer turn (lock for state mutations + broadcasts)
        async with room._lock:
            async def broadcast_fn(event: dict):
                await manager.broadcast_to_room(room_code, event)

            await engine.run_dealer_turn(room, broadcast_fn)

        # Phase 2: Wait for result display (NO lock — players can interact)
        await asyncio.sleep(NEW_ROUND_DELAY)

        # Phase 3: Advance to next round (re-acquire lock for state transition)
        async with room._lock:
            r = get_room(room_code)
            if r and r.phase == "result":
                events = engine.start_betting_phase(r)
                for event in events:
                    await manager.broadcast_to_room(room_code, event)
                _start_bet_timer(room_code)
    finally:
        room.dealer_turn_task = None


async def handle_quick_chat(player_id: str, message: dict):
    """Handle quick chat messages with rate limiting."""
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_room(room_code)
    if not room or player_id not in room.players:
        return

    message_id = message.get("message_id", "")
    if message_id not in QUICK_CHAT_MESSAGES:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Invalid chat message"}
        )
        return

    # Rate limit: 2s cooldown per player
    now = time.monotonic()
    last_sent = chat_cooldowns.get(player_id, 0)
    if now - last_sent < CHAT_COOLDOWN_SECONDS:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Chat cooldown active"}
        )
        return
    chat_cooldowns[player_id] = now

    player = room.players[player_id]
    await manager.broadcast_to_room(
        room_code,
        {
            "type": "quick_chat",
            "player_id": player_id,
            "player_name": player.name,
            "message_id": message_id,
            "message_text": QUICK_CHAT_MESSAGES[message_id],
        },
    )


async def handle_view_stats(player_id: str):
    """Compile and broadcast session stats (host-only)."""
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_room(room_code)
    if not room:
        return

    if room.host_id != player_id:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "Only the host can view stats"}
        )
        return

    # Build per-player leaderboard entries
    leaderboard = []
    for pid, player in room.players.items():
        net_change = player.bankroll - STARTING_BANKROLL
        leaderboard.append({
            "player_id": pid,
            "name": player.name,
            "bankroll": player.bankroll,
            "net_change": net_change,
            "hands_played": player.hands_played,
            "total_won": player.total_won,
            "total_lost": player.total_lost,
            "lowest_bankroll": player.lowest_bankroll,
            "total_assets_bet": player.total_assets_bet,
            "total_assets_lost": player.total_assets_lost,
            "best_win_streak": player.best_win_streak,
        })

    # Sort by net change (best first)
    leaderboard.sort(key=lambda x: x["net_change"], reverse=True)

    # Compute awards
    awards = []
    if leaderboard:
        biggest_loser = max(leaderboard, key=lambda x: x["total_lost"])
        if biggest_loser["total_lost"] > 0:
            awards.append({
                "title": "Biggest Loser",
                "emoji": "💸",
                "winner": biggest_loser["name"],
                "value": f"${biggest_loser['total_lost']:,} lost",
            })

        deepest_debt = min(leaderboard, key=lambda x: x["lowest_bankroll"])
        if deepest_debt["lowest_bankroll"] < STARTING_BANKROLL:
            awards.append({
                "title": "Deepest in Debt",
                "emoji": "🕳️",
                "winner": deepest_debt["name"],
                "value": f"${deepest_debt['lowest_bankroll']:,}",
            })

        asset_gambler = max(leaderboard, key=lambda x: x["total_assets_bet"])
        if asset_gambler["total_assets_bet"] > 0:
            awards.append({
                "title": "Asset Gambler",
                "emoji": "🎰",
                "winner": asset_gambler["name"],
                "value": f"{asset_gambler['total_assets_bet']} assets bet",
            })

        hot_hand = max(leaderboard, key=lambda x: x["best_win_streak"])
        if hot_hand["best_win_streak"] > 1:
            awards.append({
                "title": "Hot Hand",
                "emoji": "🔥",
                "winner": hot_hand["name"],
                "value": f"{hot_hand['best_win_streak']} wins in a row",
            })

    await manager.broadcast_to_room(
        room_code,
        {
            "type": "session_stats",
            "stats": {
                "leaderboard": leaderboard,
                "awards": awards,
            },
            "round_count": room.round_number,
        },
    )


async def handle_message(player_id: str, message: dict):
    msg_type = message.get("type")

    if msg_type == "create_room":
        await handle_create_room(player_id, message)
    elif msg_type == "join_room":
        await handle_join_room(player_id, message)
    elif msg_type == "start_game":
        await handle_start_game(player_id)
    elif msg_type == "leave":
        await handle_leave(player_id)
    elif msg_type == "pong":
        pass  # Heartbeat response, no action needed
    elif msg_type == "quick_chat":
        await handle_quick_chat(player_id, message)
    elif msg_type == "view_stats":
        await handle_view_stats(player_id)
    elif msg_type in ("place_bet", "bet_asset", "remove_asset", "take_loan", "hit", "stand", "double_down", "split"):
        await handle_game_action(player_id, message)
    else:
        await manager.send_to_player(
            player_id,
            {"type": "error", "message": f"Unknown message type: {msg_type}"},
        )


# --- WebSocket Endpoint ---


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Validate origin
    origin = websocket.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=4003, reason="Origin not allowed")
        return

    await websocket.accept()
    player_id = None
    conn_gen = None  # connection generation for stale-disconnect detection

    try:
        # First message determines if this is a new connection or reconnection
        data = await websocket.receive_text()
        if len(data) > MAX_MESSAGE_SIZE:
            await websocket.send_text(
                json.dumps({"type": "error", "message": "Message too large"})
            )
            await websocket.close()
            return
        message = json.loads(data)

        if message.get("type") == "reconnect":
            restored_id = await handle_reconnect(
                message.get("player_id", ""),
                message.get("code", ""),
                message.get("session_token", ""),
                websocket,
            )
            if restored_id:
                player_id = restored_id
                conn_gen = manager.get_generation(player_id)
            else:
                # Reconnect failed — assign new ID, let them create/join fresh
                player_id = str(uuid.uuid4())
                conn_gen = await manager.connect(player_id, websocket)
        else:
            player_id = str(uuid.uuid4())
            conn_gen = await manager.connect(player_id, websocket)
            await handle_message(player_id, message)

        # Main message loop
        while True:
            data = await websocket.receive_text()
            if len(data) > MAX_MESSAGE_SIZE:
                await manager.send_to_player(
                    player_id, {"type": "error", "message": "Message too large"}
                )
                continue
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_to_player(
                    player_id, {"type": "error", "message": "Invalid JSON"}
                )
                continue
            await handle_message(player_id, message)

    except WebSocketDisconnect:
        if player_id:
            await handle_disconnect(player_id, websocket, generation=conn_gen)
    except json.JSONDecodeError:
        # First message was invalid JSON
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": "Invalid JSON"})
            )
        except Exception:
            pass
    except Exception as e:
        logger.error(f"WebSocket error for {player_id}: {e}")
        if player_id:
            await handle_disconnect(player_id, websocket, generation=conn_gen)
