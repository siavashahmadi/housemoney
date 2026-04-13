"""Connection manager, shared state, constants, and background loops."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import WebSocket

from game_room import (
    cleanup_empty_rooms,
    get_room,
    rooms,
)
from slots_room import (
    get_slots_room,
    slots_rooms,
)

logger = logging.getLogger("blackjack")

# --- Constants ---

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

# Quick chat rate limiting
CHAT_COOLDOWN_SECONDS = 2.0

# Game action rate limiting
ACTION_COOLDOWN_SECONDS = 0.2

# Room creation limits
MAX_ROOMS = 100
ROOM_CREATE_COOLDOWN_SECONDS = 5.0

# Slots AFK timer constants
SLOTS_SPIN_TIMEOUT = 10  # seconds
SLOTS_ROUND_ADVANCE_DELAY = 3  # seconds


# --- Connection Manager ---


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
        # Fix #27: Collect failed player IDs to handle disconnection
        failed_pids = []
        for pid, player in room.players.items():
            if pid == exclude or not player.connected:
                continue
            ws = self.connections.get(pid)
            if ws:
                try:
                    await ws.send_text(msg_text)
                except Exception as e:
                    logger.warning("Failed to broadcast to player %s: %s", pid, e)
                    failed_pids.append(pid)
        # Schedule disconnect handling for failed sockets
        for pid in failed_pids:
            from blackjack_handlers import handle_disconnect
            asyncio.create_task(handle_disconnect(pid))

    def cancel_disconnect_task(self, player_id: str):
        task = self.disconnect_tasks.pop(player_id, None)
        if task and not task.done():
            task.cancel()


# --- Shared Mutable State ---

manager = ConnectionManager()

# Track which game type each player is in: player_id -> "blackjack" | "slots"
player_game_types: dict[str, str] = {}

# Quick chat rate limiting: player_id -> last send timestamp
chat_cooldowns: dict[str, float] = {}

# Game action rate limiting: player_id -> last action timestamp
action_cooldowns: dict[str, float] = {}

# Room creation limits
room_create_cooldowns: dict[str, float] = {}

# Turn timers: player_id -> asyncio.Task that auto-stands after TURN_TIMEOUT
turn_timers: dict[str, asyncio.Task] = {}

# Bet timers: room_code -> asyncio.Task that auto-skips AFK bettors after BET_TIMEOUT
bet_timers: dict[str, asyncio.Task] = {}

# Slots AFK spin timer: room_code -> asyncio.Task
slots_spin_timers: dict[str, asyncio.Task] = {}


# --- Background Tasks ---


async def room_cleanup_loop():
    """Periodically prune rooms where all players disconnected > 5 min ago."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        removed = cleanup_empty_rooms(max_age_seconds=300)
        if removed > 0:
            logger.info(f"Cleaned up {removed} empty room(s). Active rooms: {len(rooms)}")

        # Clean up empty slots rooms
        slots_to_remove = []
        now_utc = datetime.now(timezone.utc)
        for code, sroom in list(slots_rooms.items()):
            if not sroom.players:
                if (now_utc - sroom.created_at).total_seconds() > 300:
                    slots_to_remove.append(code)
                continue
            all_disconnected = all(not p.connected for p in sroom.players.values())
            if not all_disconnected:
                continue
            disconnect_times = [
                p.disconnected_at for p in sroom.players.values()
                if p.disconnected_at is not None
            ]
            if not disconnect_times:
                continue
            if (now_utc - max(disconnect_times)).total_seconds() > 300:
                slots_to_remove.append(code)
        for code in slots_to_remove:
            from slots_handlers import cancel_slots_spin_timer
            cancel_slots_spin_timer(code)
            del slots_rooms[code]
        if slots_to_remove:
            logger.info(f"Cleaned up {len(slots_to_remove)} empty slots room(s). Active: {len(slots_rooms)}")


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
            from blackjack_handlers import handle_disconnect
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

        # Fix #26: Purge stale room creation cooldown entries
        stale_room_cooldowns = [
            pid for pid, ts in room_create_cooldowns.items()
            if pid not in manager.connections and now - ts > ROOM_CREATE_COOLDOWN_SECONDS
        ]
        for pid in stale_room_cooldowns:
            del room_create_cooldowns[pid]
