"""FastAPI WebSocket server for multiplayer blackjack."""

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from game_room import rooms
from slots_room import slots_rooms

from connection import (
    manager,
    action_cooldowns,
    room_cleanup_loop,
    heartbeat_loop,
    ALLOWED_ORIGINS,
    MAX_MESSAGE_SIZE,
    ACTION_COOLDOWN_SECONDS,
)

from blackjack_handlers import (
    handle_create_room,
    handle_join_room,
    handle_start_game,
    handle_leave,
    handle_disconnect,
    handle_reconnect,
    handle_game_action,
    handle_quick_chat,
    handle_view_stats,
)

from slots_handlers import (
    handle_create_slots_room,
    handle_join_slots_room,
    handle_configure_slots,
    handle_start_slots,
    handle_slots_spin,
    handle_leave_slots,
    handle_slots_play_again,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("blackjack")


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
    return {"status": "ok", "rooms": len(rooms), "slots_rooms": len(slots_rooms)}


# --- Message Router ---


async def handle_message(player_id: str, message: dict):
    msg_type = message.get("type")

    # Rate limit all messages except heartbeat responses
    if msg_type != "pong":
        now = time.monotonic()
        last_action = action_cooldowns.get(player_id, 0)
        if now - last_action < ACTION_COOLDOWN_SECONDS:
            await manager.send_to_player(
                player_id, {"type": "error", "message": "Too fast — slow down"}
            )
            return
        action_cooldowns[player_id] = now

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
    elif msg_type == "create_slots_room":
        await handle_create_slots_room(player_id, message)
    elif msg_type == "join_slots_room":
        await handle_join_slots_room(player_id, message)
    elif msg_type == "configure_slots":
        await handle_configure_slots(player_id, message)
    elif msg_type == "start_slots":
        await handle_start_slots(player_id)
    elif msg_type == "slots_spin":
        await handle_slots_spin(player_id)
    elif msg_type == "leave_slots":
        await handle_leave_slots(player_id)
    elif msg_type == "slots_play_again":
        await handle_slots_play_again(player_id)
    else:
        await manager.send_to_player(
            player_id,
            {"type": "error", "message": f"Unknown message type: {msg_type}"},
        )


# --- WebSocket Endpoint ---


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Validate origin — missing origin is intentionally allowed for non-browser
    # clients (Postman, CLI tools, native apps, etc.) that don't send Origin headers.
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
        # First message was invalid JSON — send error and close
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": "Invalid JSON"})
            )
            await websocket.close()
        except Exception:
            pass
    except Exception as e:
        logger.error(f"WebSocket error for {player_id}: {e}")
        if player_id:
            await handle_disconnect(player_id, websocket, generation=conn_gen)
