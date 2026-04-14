# server/test_slots_engine.py
"""Unit tests for slots_engine module."""

import unittest
from unittest.mock import patch

from slots_constants import SLOT_SYMBOLS, score_reels
from slots_room import (
    SlotsRoom,
    SlotsPlayerState,
    add_player_to_slots_room,
    create_slots_room,
    reset_slots_round_state,
    slots_rooms,
)
from slots_engine import SlotsEngine

CHERRY = SLOT_SYMBOLS[0]
LEMON = SLOT_SYMBOLS[1]
BELL = SLOT_SYMBOLS[3]
JACKPOT = SLOT_SYMBOLS[6]


def make_slots_room(n=2, total_rounds=3, bet_per_round=100):
    """Create a SlotsRoom with n players ready for start_game."""
    room = SlotsRoom(code="TEST", total_rounds=total_rounds, bet_per_round=bet_per_round)
    for i in range(n):
        pid = f"p{i}"
        room.players[pid] = SlotsPlayerState(
            name=f"Player {i}",
            player_id=pid,
            is_host=(i == 0),
        )
    room.host_id = "p0"
    return room


class TestStartGame(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    def test_transitions_to_spinning(self):
        room = make_slots_room(2)
        events = self.engine.start_game(room)
        self.assertEqual(room.phase, "spinning")
        self.assertEqual(room.current_round, 1)

    def test_returns_game_started_event(self):
        room = make_slots_room(2)
        events = self.engine.start_game(room)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "slots_game_started")
        self.assertEqual(events[0]["total_rounds"], room.total_rounds)
        self.assertEqual(events[0]["bet_per_round"], room.bet_per_round)
        self.assertEqual(events[0]["current_round"], 1)

    def test_resets_player_round_state(self):
        room = make_slots_room(2)
        room.players["p0"].has_spun = True
        room.players["p0"].round_score = 99
        self.engine.start_game(room)
        self.assertFalse(room.players["p0"].has_spun)
        self.assertEqual(room.players["p0"].round_score, 0)

    def test_rejects_less_than_two_players(self):
        room = make_slots_room(1)
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_rejects_more_than_four_players(self):
        room = make_slots_room(2)
        for i in range(3):
            room.players[f"extra{i}"] = SlotsPlayerState(
                name=f"Extra {i}", player_id=f"extra{i}"
            )
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_rejects_if_not_in_lobby(self):
        room = make_slots_room(2)
        room.phase = "spinning"
        with self.assertRaises(ValueError):
            self.engine.start_game(room)

    def test_calculates_buy_in_and_pot(self):
        room = make_slots_room(2, total_rounds=5, bet_per_round=500)
        events = self.engine.start_game(room)
        self.assertEqual(events[0]["buy_in"], 2500)
        self.assertEqual(events[0]["pot"], 5000)


class TestHandleSpin(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()
        self.room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(self.room)

    @patch("slots_engine.generate_spin")
    def test_records_spin_result(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        events = self.engine.handle_spin(self.room, "p0")
        self.assertTrue(self.room.players["p0"].has_spun)
        self.assertEqual(self.room.players["p0"].current_spin, [CHERRY, CHERRY, CHERRY])
        mult = score_reels([CHERRY, CHERRY, CHERRY])["multiplier"]  # 3
        self.assertEqual(self.room.players["p0"].round_score, mult)
        self.assertEqual(self.room.players["p0"].total_score, mult)

    @patch("slots_engine.generate_spin")
    def test_returns_spin_result_event(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        events = self.engine.handle_spin(self.room, "p0")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "slots_spin_result")
        self.assertEqual(events[0]["player_id"], "p0")
        self.assertEqual(events[0]["reels"], [CHERRY, LEMON, BELL])

    @patch("slots_engine.generate_spin")
    def test_rejects_double_spin(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(self.room, "p0")
        with self.assertRaises(ValueError):
            self.engine.handle_spin(self.room, "p0")

    @patch("slots_engine.generate_spin")
    def test_rejects_spin_in_wrong_phase(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.room.phase = "lobby"
        with self.assertRaises(ValueError):
            self.engine.handle_spin(self.room, "p0")

    @patch("slots_engine.generate_spin")
    def test_auto_resolves_when_all_spun(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        events = self.engine.handle_spin(self.room, "p1")
        types = [e["type"] for e in events]
        self.assertIn("slots_spin_result", types)
        self.assertIn("slots_round_result", types)

    @patch("slots_engine.generate_spin")
    def test_disconnected_player_skipped_for_auto_resolve(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.room.players["p1"].connected = False
        events = self.engine.handle_spin(self.room, "p0")
        types = [e["type"] for e in events]
        self.assertIn("slots_round_result", types)


class TestAdvanceRound(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()
        self.room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(self.room)

    @patch("slots_engine.generate_spin")
    def test_advance_increments_round(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        events = self.engine.advance_round(self.room)
        self.assertEqual(self.room.current_round, 2)
        self.assertEqual(self.room.phase, "spinning")

    @patch("slots_engine.generate_spin")
    def test_advance_resets_round_state(self, mock_spin):
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]  # triple, multiplier=3
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        self.engine.advance_round(self.room)
        for p in self.room.players.values():
            self.assertFalse(p.has_spun)
            self.assertIsNone(p.current_spin)
            self.assertEqual(p.round_score, 0)
            self.assertGreater(p.total_score, 0)

    @patch("slots_engine.generate_spin")
    def test_advance_returns_round_started_event(self, mock_spin):
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(self.room, "p0")
        self.engine.handle_spin(self.room, "p1")
        events = self.engine.advance_round(self.room)
        self.assertEqual(events[0]["type"], "slots_round_started")
        self.assertEqual(events[0]["current_round"], 2)

    def test_advance_rejects_wrong_phase(self):
        with self.assertRaises(ValueError):
            self.engine.advance_round(self.room)


class TestEndGame(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    @patch("slots_engine.generate_spin")
    def test_winner_gets_pot_minus_house_edge(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [JACKPOT, JACKPOT, JACKPOT]
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        events = self.engine.handle_spin(room, "p1")
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        self.assertEqual(len(game_ended), 1)
        end_evt = game_ended[0]
        self.assertEqual(end_evt["pot"], 200)
        self.assertEqual(end_evt["winner_payout"], 184)
        self.assertEqual(end_evt["winner_id"], "p0")
        self.assertEqual(end_evt["payout_type"], "winner")
        self.assertFalse(end_evt["is_tie"])

    @patch("slots_engine.generate_spin")
    def test_tie_refunds_buy_in(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        events = self.engine.handle_spin(room, "p1")
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        end_evt = game_ended[0]
        self.assertTrue(end_evt["is_tie"])
        self.assertEqual(end_evt["payout_type"], "refund")
        self.assertIsNone(end_evt["winner_id"])

    @patch("slots_engine.generate_spin")
    def test_final_standings_sorted(self, mock_spin):
        room = make_slots_room(3, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        mock_spin.return_value = [JACKPOT, JACKPOT, JACKPOT]
        self.engine.handle_spin(room, "p1")
        mock_spin.return_value = [BELL, BELL, BELL]
        events = self.engine.handle_spin(room, "p2")
        game_ended = [e for e in events if e["type"] == "slots_game_ended"]
        standings = game_ended[0]["final_standings"]
        scores = [s["total_score"] for s in standings]
        self.assertEqual(scores, sorted(scores, reverse=True))

    @patch("slots_engine.generate_spin")
    def test_phase_is_final_result(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        self.assertEqual(room.phase, "final_result")


class TestReturnToLobby(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    @patch("slots_engine.generate_spin")
    def test_resets_to_lobby(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        events = self.engine.return_to_lobby(room)
        self.assertEqual(room.phase, "lobby")
        self.assertEqual(room.current_round, 0)
        self.assertEqual(events[0]["type"], "slots_returned_to_lobby")

    @patch("slots_engine.generate_spin")
    def test_resets_player_scores(self, mock_spin):
        room = make_slots_room(2, total_rounds=1, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, LEMON, BELL]
        self.engine.handle_spin(room, "p0")
        self.engine.handle_spin(room, "p1")
        self.engine.return_to_lobby(room)
        for p in room.players.values():
            self.assertEqual(p.total_score, 0)
            self.assertFalse(p.has_spun)


class TestGetRoomState(unittest.TestCase):
    def setUp(self):
        self.engine = SlotsEngine()

    def test_lobby_state(self):
        room = make_slots_room(2)
        state = self.engine.get_room_state(room)
        self.assertEqual(state["phase"], "lobby")
        self.assertIn("p0", state["player_states"])
        self.assertIn("p1", state["player_states"])

    @patch("slots_engine.generate_spin")
    def test_spinning_state_includes_spin_data(self, mock_spin):
        room = make_slots_room(2, total_rounds=3, bet_per_round=100)
        self.engine.start_game(room)
        mock_spin.return_value = [CHERRY, CHERRY, CHERRY]
        self.engine.handle_spin(room, "p0")
        state = self.engine.get_room_state(room)
        self.assertTrue(state["player_states"]["p0"]["has_spun"])
        self.assertFalse(state["player_states"]["p1"]["has_spun"])
        self.assertEqual(state["current_round"], 1)
