"""Game room and player state management for multiplayer blackjack."""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
import secrets

from constants import ASSETS, DEFAULT_OWNED_ASSETS, STARTING_BANKROLL

# Excludes ambiguous characters (I/1/O/0) for mobile entry ease
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

MAX_PLAYERS = 6
MIN_PLAYERS = 2


@dataclass
class PlayerState:
    name: str
    player_id: str
    connected: bool = True
    is_host: bool = False
    disconnected_at: datetime | None = None
    session_token: str = field(default_factory=lambda: secrets.token_urlsafe(32))

    # Game state
    bankroll: int = STARTING_BANKROLL
    hands: list = field(default_factory=list)  # list of hand dicts
    active_hand_index: int = 0
    bet: int = 0  # initial bet (betting phase only, moved to hand dict on deal)
    betted_assets: list = field(default_factory=list)
    owned_assets: dict = field(default_factory=lambda: dict(DEFAULT_OWNED_ASSETS))
    status: str = "idle"  # idle|betting|ready|playing|standing|bust|done
    result: str | None = None  # per-player aggregate outcome

    # Debt gate
    in_debt_mode: bool = False

    # Vig tracking
    vig_amount: int = 0
    vig_rate: float = 0.0
    total_vig_paid: int = 0

    # Stats (per-session)
    hands_played: int = 0
    win_streak: int = 0
    lose_streak: int = 0
    total_won: int = 0
    total_lost: int = 0
    peak_bankroll: int = STARTING_BANKROLL
    lowest_bankroll: int = STARTING_BANKROLL
    total_assets_bet: int = 0
    total_assets_lost: int = 0
    best_win_streak: int = 0


@dataclass
class GameRoom:
    code: str
    players: dict[str, PlayerState] = field(default_factory=dict)
    phase: str = "lobby"  # lobby|betting|playing|dealer_turn|result
    host_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Game state
    dealer_hand: list = field(default_factory=list)
    deck: list = field(default_factory=list)
    current_player_idx: int = 0
    turn_order: list = field(default_factory=list)  # ordered player_ids
    round_number: int = 0
    dealer_turn_task: object | None = field(default=None, repr=False)
    _lock: object = field(default_factory=asyncio.Lock, repr=False)


# Global in-memory registry: room_code -> GameRoom
rooms: dict[str, GameRoom] = {}


def generate_room_code(length: int = 4) -> str:
    """Generate a unique 4-character room code."""
    for _ in range(100):
        code = "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length))
        if code not in rooms:
            return code
    # Extremely unlikely fallback: extend to 5 characters
    return "".join(secrets.choice(ROOM_CODE_CHARS) for _ in range(length + 1))


def get_room(code: str) -> GameRoom | None:
    """Look up a room by code (case-insensitive)."""
    return rooms.get(code.upper())


def create_room(player_name: str, player_id: str) -> GameRoom:
    """Create a new room and add the creator as host."""
    code = generate_room_code()
    player = PlayerState(name=player_name, player_id=player_id, is_host=True)
    room = GameRoom(code=code, players={player_id: player}, host_id=player_id)
    rooms[code] = room
    return room


def validate_player_name(name: str | None) -> str:
    """Validate and clean a player name. Returns cleaned name or raises ValueError."""
    if not name or not name.strip():
        raise ValueError("Player name is required")
    cleaned = name.strip().replace('<', '').replace('>', '')
    if not cleaned:
        raise ValueError("Player name is required")
    if len(cleaned) > 20:
        raise ValueError("Player name must be 20 characters or less")
    return cleaned


def add_player_to_room(room: GameRoom, player_name: str, player_id: str) -> PlayerState:
    """Add a player to an existing room. Raises ValueError on validation failures."""
    if len(room.players) >= MAX_PLAYERS:
        raise ValueError(f"Room is full (max {MAX_PLAYERS} players)")

    if room.phase != "lobby":
        raise ValueError("Cannot join, game already in progress")

    # Case-insensitive duplicate name check
    lower_name = player_name.lower()
    for p in room.players.values():
        if p.name.lower() == lower_name:
            raise ValueError("Name already taken in this room")

    player = PlayerState(name=player_name, player_id=player_id)
    room.players[player_id] = player
    return player


def remove_player_from_room(room: GameRoom, player_id: str) -> str | None:
    """Remove a player from a room. Transfers host if needed.

    Returns the new host's player_id if host was transferred, None otherwise.
    Deletes the room from registry if empty after removal.
    """
    if player_id not in room.players:
        return None

    was_host = room.players[player_id].is_host
    del room.players[player_id]

    new_host_id = None

    if was_host and room.players:
        # Transfer host to first connected player
        for pid, player in room.players.items():
            if player.connected:
                player.is_host = True
                room.host_id = pid
                new_host_id = pid
                break
        # If no connected players, assign to first player anyway
        if new_host_id is None:
            first_pid = next(iter(room.players))
            room.players[first_pid].is_host = True
            room.host_id = first_pid
            new_host_id = first_pid

    if not room.players:
        # Room is empty — remove from registry
        rooms.pop(room.code, None)

    return new_host_id


def get_player_list(room: GameRoom) -> list[dict]:
    """Return serializable list of players for broadcasting."""
    return [
        {
            "name": p.name,
            "player_id": p.player_id,
            "is_host": p.is_host,
            "connected": p.connected,
        }
        for p in room.players.values()
    ]


def get_active_players(room: GameRoom) -> list[PlayerState]:
    """Return connected players in turn order."""
    if room.turn_order:
        return [room.players[pid] for pid in room.turn_order if pid in room.players and room.players[pid].connected]
    return [p for p in room.players.values() if p.connected]


def get_current_player(room: GameRoom) -> PlayerState | None:
    """Return the player whose turn it is, or None."""
    if not room.turn_order or room.current_player_idx >= len(room.turn_order):
        return None
    pid = room.turn_order[room.current_player_idx]
    return room.players.get(pid)


def reset_round_state(player: PlayerState):
    """Reset per-round state for a new round. Keeps bankroll, assets, stats."""
    player.hands = []
    player.active_hand_index = 0
    player.bet = 0
    player.betted_assets = []
    player.status = "betting"
    player.result = None
    player.vig_amount = 0
    player.vig_rate = 0.0


def cleanup_empty_rooms(max_age_seconds: int = 300) -> int:
    """Remove rooms where all players disconnected > max_age_seconds ago.

    Returns the count of rooms removed.
    """
    now = datetime.now(timezone.utc)
    to_remove = []

    for code, room in rooms.items():
        if not room.players:
            # No players at all — check room age
            if (now - room.created_at).total_seconds() > max_age_seconds:
                to_remove.append(code)
            continue

        # All players disconnected?
        all_disconnected = all(not p.connected for p in room.players.values())
        if not all_disconnected:
            continue

        # Find the most recent disconnect time
        disconnect_times = [
            p.disconnected_at
            for p in room.players.values()
            if p.disconnected_at is not None
        ]
        if not disconnect_times:
            continue

        latest_disconnect = max(disconnect_times)
        if (now - latest_disconnect).total_seconds() > max_age_seconds:
            to_remove.append(code)

    for code in to_remove:
        del rooms[code]

    return len(to_remove)
