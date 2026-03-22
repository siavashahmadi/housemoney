"""FastAPI WebSocket server for multiplayer blackjack."""

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from constants import NEW_ROUND_DELAY
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


class ConnectionManager:
    """Manages WebSocket connections, mapping player_ids to sockets and rooms."""

    def __init__(self):
        self.connections: dict[str, WebSocket] = {}  # player_id -> websocket
        self.player_rooms: dict[str, str] = {}  # player_id -> room_code
        self.disconnect_tasks: dict[str, asyncio.Task] = {}  # player_id -> timeout task

    async def connect(self, player_id: str, websocket: WebSocket):
        self.connections[player_id] = websocket

    def disconnect(self, player_id: str):
        self.connections.pop(player_id, None)

    async def send_to_player(self, player_id: str, message: dict):
        ws = self.connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                pass

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
                except Exception:
                    pass

    def cancel_disconnect_task(self, player_id: str):
        task = self.disconnect_tasks.pop(player_id, None)
        if task and not task.done():
            task.cancel()


manager = ConnectionManager()
engine = GameEngine()


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

    # Send to the joining player
    await manager.send_to_player(
        player_id,
        {
            "type": "player_joined",
            "player_name": name,
            "player_id": player_id,
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


async def handle_leave(player_id: str):
    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        await manager.send_to_player(
            player_id, {"type": "error", "message": "You are not in a room"}
        )
        return

    room = get_room(room_code)
    if not room:
        manager.player_rooms.pop(player_id, None)
        return

    player_name = room.players[player_id].name if player_id in room.players else "Unknown"
    new_host_id = remove_player_from_room(room, player_id)
    manager.player_rooms.pop(player_id, None)
    manager.cancel_disconnect_task(player_id)

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


async def handle_disconnect(player_id: str):
    """Handle unexpected WebSocket disconnection with grace period."""
    manager.disconnect(player_id)

    room_code = manager.player_rooms.get(player_id)
    if not room_code:
        return

    room = get_room(room_code)
    if not room or player_id not in room.players:
        manager.player_rooms.pop(player_id, None)
        return

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

    # Schedule auto-leave after grace period
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


async def handle_reconnect(player_id_from_msg: str, code: str, websocket: WebSocket) -> str | None:
    """Attempt to restore a disconnected player's session.

    Returns the restored player_id on success, None on failure.
    """
    code = code.strip().upper()
    room = get_room(code)
    if not room:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Reconnection failed. Room no longer exists."})
        )
        return None

    if player_id_from_msg not in room.players:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Reconnection failed. Player not found in room."})
        )
        return None

    player = room.players[player_id_from_msg]
    if player.connected:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Reconnection failed. Player already connected."})
        )
        return None

    if player.disconnected_at is None:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Reconnection failed. Invalid state."})
        )
        return None

    elapsed = (datetime.now(timezone.utc) - player.disconnected_at).total_seconds()
    if elapsed > DISCONNECT_GRACE_PERIOD:
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Reconnection failed. Session expired."})
        )
        return None

    # Restore the player
    player.connected = True
    player.disconnected_at = None
    manager.connections[player_id_from_msg] = websocket
    manager.cancel_disconnect_task(player_id_from_msg)

    logger.info(f"{player.name} ({player_id_from_msg}) reconnected to room {code}")

    # Notify the reconnecting player — include full game state if in-game
    reconnect_msg = {
        "type": "reconnected",
        "code": code,
        "player_id": player_id_from_msg,
        "players": get_player_list(room),
        "phase": room.phase,
    }
    if room.phase not in ("lobby",):
        reconnect_msg["state"] = engine.get_room_state(room)
    await websocket.send_text(json.dumps(reconnect_msg))

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


async def handle_game_action(player_id: str, message: dict):
    """Handle game actions (place_bet, hit, stand, double_down, bet_asset).

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

    msg_type = message.get("type")

    try:
        if msg_type == "place_bet":
            amount = message.get("amount")
            if not isinstance(amount, int):
                raise ValueError("Bet amount must be an integer")
            events = engine.place_bet(room, player_id, amount)
        elif msg_type == "bet_asset":
            asset_id = message.get("asset_id", "")
            events = engine.bet_asset(room, player_id, asset_id)
        elif msg_type == "hit":
            events = engine.hit(room, player_id)
        elif msg_type == "stand":
            events = engine.stand(room, player_id)
        elif msg_type == "double_down":
            events = engine.double_down(room, player_id)
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

    # If we transitioned to dealer_turn, run the dealer asynchronously
    if room.phase == "dealer_turn":
        asyncio.create_task(_run_dealer_and_advance(room, room_code))


async def _run_dealer_and_advance(room: GameRoom, room_code: str):
    """Run dealer turn with broadcasting, then auto-advance to next round."""

    async def broadcast_fn(event: dict):
        await manager.broadcast_to_room(room_code, event)

    await engine.run_dealer_turn(room, broadcast_fn)

    # Auto-advance to next betting phase after delay
    await asyncio.sleep(NEW_ROUND_DELAY)

    # Verify room still exists and is in result phase
    r = get_room(room_code)
    if r and r.phase == "result":
        events = engine.start_betting_phase(r)
        for event in events:
            await manager.broadcast_to_room(room_code, event)


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
    elif msg_type in ("place_bet", "bet_asset", "hit", "stand", "double_down"):
        await handle_game_action(player_id, message)
    else:
        await manager.send_to_player(
            player_id,
            {"type": "error", "message": f"Unknown message type: {msg_type}"},
        )


# --- WebSocket Endpoint ---


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    player_id = None

    try:
        # First message determines if this is a new connection or reconnection
        data = await websocket.receive_text()
        message = json.loads(data)

        if message.get("type") == "reconnect":
            restored_id = await handle_reconnect(
                message.get("player_id", ""),
                message.get("code", ""),
                websocket,
            )
            if restored_id:
                player_id = restored_id
            else:
                # Reconnect failed — assign new ID, let them create/join fresh
                player_id = str(uuid.uuid4())
                await manager.connect(player_id, websocket)
        else:
            player_id = str(uuid.uuid4())
            await manager.connect(player_id, websocket)
            await handle_message(player_id, message)

        # Main message loop
        while True:
            data = await websocket.receive_text()
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
            await handle_disconnect(player_id)
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
            await handle_disconnect(player_id)
