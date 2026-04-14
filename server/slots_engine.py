# server/slots_engine.py
"""Server-side game engine for multiplayer slots.

The SlotsEngine operates on SlotsRoom/SlotsPlayerState instances, mutating them
in place. Each method returns a list of event dicts for the WebSocket layer to
broadcast.
"""

import math

from slots_constants import HOUSE_EDGE, generate_spin, score_reels
from slots_room import (
    SLOTS_MAX_PLAYERS,
    SLOTS_MIN_PLAYERS,
    SlotsRoom,
    reset_slots_round_state,
)


class SlotsEngine:
    """Server-side slots game logic."""

    def start_game(self, room: SlotsRoom) -> list[dict]:
        """Validate and transition from lobby to first spinning round."""
        if room.phase != "lobby":
            raise ValueError("Game already in progress")

        connected = [p for p in room.players.values() if p.connected]
        if len(connected) < SLOTS_MIN_PLAYERS:
            raise ValueError(f"Need at least {SLOTS_MIN_PLAYERS} players to start")
        if len(connected) > SLOTS_MAX_PLAYERS:
            raise ValueError(f"Maximum {SLOTS_MAX_PLAYERS} players")

        room.current_round = 1
        room.phase = "spinning"

        for player in room.players.values():
            reset_slots_round_state(player)
            player.total_score = 0

        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)

        return [
            {
                "type": "slots_game_started",
                "total_rounds": room.total_rounds,
                "bet_per_round": room.bet_per_round,
                "current_round": room.current_round,
                "buy_in": buy_in,
                "pot": pot,
                "state": self.get_room_state(room),
            }
        ]

    def handle_spin(self, room: SlotsRoom, player_id: str) -> list[dict]:
        """Generate a spin for a player. Auto-resolves round if all connected have spun."""
        if room.phase != "spinning":
            raise ValueError("Not in spinning phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")
        if player.has_spun:
            raise ValueError("Already spun this round")

        reels = generate_spin()
        result = score_reels(reels)

        player.current_spin = reels
        player.round_score = result["multiplier"]
        player.total_score += result["multiplier"]
        player.has_spun = True

        events = [
            {
                "type": "slots_spin_result",
                "player_id": player_id,
                "reels": reels,
                "multiplier": result["multiplier"],
                "match_type": result["match_type"],
                "matched_symbol": result["matched_symbol"],
                "total_score": player.total_score,
            }
        ]

        # Check if all connected players have spun
        connected = [p for p in room.players.values() if p.connected]
        if all(p.has_spun for p in connected):
            events.extend(self.resolve_round(room))

        return events

    def auto_spin(self, room: SlotsRoom, player_id: str) -> list[dict]:
        """Same as handle_spin but tags result with auto: true (for AFK)."""
        events = self.handle_spin(room, player_id)
        for event in events:
            if event["type"] == "slots_spin_result" and event["player_id"] == player_id:
                event["auto"] = True
        return events

    def resolve_round(self, room: SlotsRoom) -> list[dict]:
        """Broadcast all player results sorted by total score.

        If final round, calls end_game. Otherwise stays in round_result phase.
        """
        room.phase = "round_result"

        standings = sorted(
            [
                {
                    "player_id": pid,
                    "name": p.name,
                    "round_score": p.round_score,
                    "total_score": p.total_score,
                    "reels": p.current_spin,
                    "match_type": score_reels(p.current_spin)["match_type"] if p.current_spin else "none",
                }
                for pid, p in room.players.items()
                if p.connected
            ],
            key=lambda x: x["total_score"],
            reverse=True,
        )

        events = [
            {
                "type": "slots_round_result",
                "current_round": room.current_round,
                "total_rounds": room.total_rounds,
                "standings": standings,
                "state": self.get_room_state(room),
            }
        ]

        if room.current_round >= room.total_rounds:
            events.extend(self.end_game(room))

        return events

    def end_game(self, room: SlotsRoom) -> list[dict]:
        """Determine winner, calculate pot and payout, handle ties."""
        room.phase = "final_result"
        connected = [p for p in room.players.values() if p.connected]
        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)
        sorted_players = sorted(connected, key=lambda p: p.total_score, reverse=True)
        final_standings = [
            {"player_id": p.player_id, "name": p.name, "total_score": p.total_score}
            for p in sorted_players
        ]
        if not sorted_players:
            return [
                {
                    "type": "slots_game_ended",
                    "final_standings": [],
                    "pot": pot,
                    "buy_in": buy_in,
                    "is_tie": True,
                    "payout_type": "refund",
                    "winner_id": None,
                    "winner_payout": buy_in,
                    "house_cut": 0,
                    "state": self.get_room_state(room),
                }
            ]
        top_score = sorted_players[0].total_score
        tied_at_top = [p for p in sorted_players if p.total_score == top_score]

        if len(tied_at_top) > 1:
            return [
                {
                    "type": "slots_game_ended",
                    "final_standings": final_standings,
                    "pot": pot,
                    "buy_in": buy_in,
                    "is_tie": True,
                    "payout_type": "refund",
                    "winner_id": None,
                    "winner_payout": buy_in,
                    "house_cut": 0,
                    "state": self.get_room_state(room),
                }
            ]

        winner = sorted_players[0]
        winner_payout = math.floor(pot * (1 - HOUSE_EDGE))
        house_cut = pot - winner_payout

        return [
            {
                "type": "slots_game_ended",
                "final_standings": final_standings,
                "pot": pot,
                "buy_in": buy_in,
                "is_tie": False,
                "payout_type": "winner",
                "winner_id": winner.player_id,
                "winner_payout": winner_payout,
                "house_cut": house_cut,
                "state": self.get_room_state(room),
            }
        ]

    def advance_round(self, room: SlotsRoom) -> list[dict]:
        """Increment round counter, reset per-round state, transition to spinning."""
        if room.phase != "round_result":
            raise ValueError("Can only advance from round_result phase")

        room.current_round += 1
        room.phase = "spinning"

        for player in room.players.values():
            if player.connected:
                reset_slots_round_state(player)

        return [
            {
                "type": "slots_round_started",
                "current_round": room.current_round,
                "total_rounds": room.total_rounds,
                "state": self.get_room_state(room),
            }
        ]

    def return_to_lobby(self, room: SlotsRoom) -> list[dict]:
        """Reset all game state and return to lobby for rematch."""
        room.phase = "lobby"
        room.current_round = 0

        for player in room.players.values():
            player.total_score = 0
            reset_slots_round_state(player)

        return [
            {
                "type": "slots_returned_to_lobby",
                "state": self.get_room_state(room),
            }
        ]

    def get_room_state(self, room: SlotsRoom) -> dict:
        """Serialize full room state for broadcast/reconnection."""
        connected = [p for p in room.players.values() if p.connected]
        buy_in = room.total_rounds * room.bet_per_round
        pot = buy_in * len(connected)

        return {
            "phase": room.phase,
            "current_round": room.current_round,
            "total_rounds": room.total_rounds,
            "bet_per_round": room.bet_per_round,
            "buy_in": buy_in,
            "pot": pot,
            "player_states": {
                pid: {
                    "name": p.name,
                    "player_id": p.player_id,
                    "total_score": p.total_score,
                    "has_spun": p.has_spun,
                    "round_score": p.round_score,
                    "reels": p.current_spin,
                    "match_type": score_reels(p.current_spin)["match_type"] if p.current_spin else None,
                    "connected": p.connected,
                    "is_host": p.is_host,
                }
                for pid, p in room.players.items()
            },
        }
