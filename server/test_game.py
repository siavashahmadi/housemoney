"""Unit tests for card_engine and game_logic modules."""

import asyncio
import math
import unittest
from unittest.mock import patch

from card_engine import (
    card_value,
    create_deck,
    draw_cards,
    hand_value,
    is_blackjack,
    is_soft,
    shuffle_deck,
)
from constants import ASSETS, ASSET_MAP, MIN_BET, STARTING_BANKROLL, VIG_TIERS, get_vig_rate
from game_logic import GameEngine, create_hand_dict
from game_room import GameRoom, PlayerState, reset_round_state


def make_card(rank, suit="hearts", deck_idx=0):
    """Helper to create a card dict."""
    return {"rank": rank, "suit": suit, "id": f"{suit}-{rank}-{deck_idx}"}


def make_room_with_players(n=2):
    """Create a GameRoom with n players, ready for engine.start_game()."""
    room = GameRoom(code="TEST")
    for i in range(n):
        pid = f"player{i}"
        room.players[pid] = PlayerState(
            name=f"Player {i}",
            player_id=pid,
            is_host=(i == 0),
        )
    room.host_id = "player0"
    return room


# =============================================================================
# card_engine tests
# =============================================================================


class TestCardValue(unittest.TestCase):
    def test_ace(self):
        self.assertEqual(card_value(make_card("A")), 11)

    def test_king(self):
        self.assertEqual(card_value(make_card("K")), 10)

    def test_queen(self):
        self.assertEqual(card_value(make_card("Q")), 10)

    def test_jack(self):
        self.assertEqual(card_value(make_card("J")), 10)

    def test_number(self):
        self.assertEqual(card_value(make_card("7")), 7)
        self.assertEqual(card_value(make_card("2")), 2)
        self.assertEqual(card_value(make_card("10")), 10)


class TestCreateDeck(unittest.TestCase):
    def test_default_size(self):
        deck = create_deck()
        self.assertEqual(len(deck), 312)  # 6 decks * 52 cards

    def test_single_deck(self):
        deck = create_deck(1)
        self.assertEqual(len(deck), 52)

    def test_unique_ids(self):
        deck = create_deck()
        ids = [c["id"] for c in deck]
        self.assertEqual(len(ids), len(set(ids)))

    def test_suit_distribution(self):
        deck = create_deck(1)
        hearts = [c for c in deck if c["suit"] == "hearts"]
        self.assertEqual(len(hearts), 13)


class TestShuffleDeck(unittest.TestCase):
    def test_same_length(self):
        deck = create_deck(1)
        shuffled = shuffle_deck(deck)
        self.assertEqual(len(shuffled), 52)

    def test_same_cards(self):
        deck = create_deck(1)
        original_ids = sorted(c["id"] for c in deck)
        shuffle_deck(deck)
        shuffled_ids = sorted(c["id"] for c in deck)
        self.assertEqual(original_ids, shuffled_ids)


class TestHandValue(unittest.TestCase):
    def test_simple(self):
        hand = [make_card("10"), make_card("7")]
        self.assertEqual(hand_value(hand), 17)

    def test_soft_hand(self):
        hand = [make_card("A"), make_card("6")]
        self.assertEqual(hand_value(hand), 17)  # Soft 17

    def test_ace_reduces(self):
        hand = [make_card("A"), make_card("6"), make_card("10")]
        self.assertEqual(hand_value(hand), 17)  # A=1 + 6 + 10 = 17 (hard)

    def test_bust(self):
        hand = [make_card("10"), make_card("10"), make_card("5")]
        self.assertEqual(hand_value(hand), 25)

    def test_two_aces(self):
        hand = [make_card("A"), make_card("A")]
        self.assertEqual(hand_value(hand), 12)  # One A=11, one A=1

    def test_three_aces(self):
        hand = [make_card("A"), make_card("A"), make_card("A")]
        self.assertEqual(hand_value(hand), 13)  # One A=11, two A=1

    def test_two_aces_plus_nine(self):
        hand = [make_card("A"), make_card("A"), make_card("9")]
        self.assertEqual(hand_value(hand), 21)

    def test_blackjack(self):
        hand = [make_card("A"), make_card("K")]
        self.assertEqual(hand_value(hand), 21)


class TestIsSoft(unittest.TestCase):
    def test_ace_six_is_soft(self):
        hand = [make_card("A"), make_card("6")]
        self.assertTrue(is_soft(hand))

    def test_ace_six_ten_is_hard(self):
        hand = [make_card("A"), make_card("6"), make_card("10")]
        self.assertFalse(is_soft(hand))  # A+6+10=17 hard (ace reduced)

    def test_ten_seven_is_hard(self):
        hand = [make_card("10"), make_card("7")]
        self.assertFalse(is_soft(hand))

    def test_two_aces_is_soft(self):
        hand = [make_card("A"), make_card("A")]
        self.assertTrue(is_soft(hand))  # Soft 12 (one ace still 11)

    def test_ace_nine_is_soft(self):
        hand = [make_card("A"), make_card("9")]
        self.assertTrue(is_soft(hand))


class TestIsBlackjack(unittest.TestCase):
    def test_ace_king(self):
        hand = [make_card("A"), make_card("K")]
        self.assertTrue(is_blackjack(hand))

    def test_ace_ten(self):
        hand = [make_card("A"), make_card("10")]
        self.assertTrue(is_blackjack(hand))

    def test_three_card_21(self):
        hand = [make_card("7"), make_card("7"), make_card("7")]
        self.assertFalse(is_blackjack(hand))

    def test_ace_five_five(self):
        hand = [make_card("A"), make_card("5"), make_card("5")]
        self.assertFalse(is_blackjack(hand))


class TestDrawCards(unittest.TestCase):
    def test_draw(self):
        deck = create_deck(1)
        drawn, remaining = draw_cards(deck, 4)
        self.assertEqual(len(drawn), 4)
        self.assertEqual(len(remaining), 48)

    def test_draw_preserves_order(self):
        deck = [make_card("A"), make_card("K"), make_card("Q")]
        drawn, remaining = draw_cards(deck, 2)
        self.assertEqual(drawn[0]["rank"], "A")
        self.assertEqual(drawn[1]["rank"], "K")
        self.assertEqual(remaining[0]["rank"], "Q")


# =============================================================================
# GameEngine tests
# =============================================================================


class TestStartGame(unittest.TestCase):
    def test_start_game_initializes_deck_and_phase(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        events = eng.start_game(room)

        self.assertEqual(room.phase, "betting")
        self.assertEqual(len(room.deck), 312)
        self.assertEqual(room.round_number, 1)
        self.assertEqual(room.players["player0"].status, "betting")
        self.assertEqual(room.players["player1"].status, "betting")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "betting_phase")


class TestPlaceBet(unittest.TestCase):
    def setUp(self):
        self.room = make_room_with_players(2)
        self.eng = GameEngine()
        self.eng.start_game(self.room)

    def test_valid_bet(self):
        events = self.eng.place_bet(self.room, "player0", 100)
        self.assertEqual(self.room.players["player0"].bet, 100)
        self.assertEqual(self.room.players["player0"].status, "ready")
        self.assertTrue(any(e["type"] == "bet_placed" for e in events))

    def test_bet_below_minimum(self):
        with self.assertRaises(ValueError):
            self.eng.place_bet(self.room, "player0", 10)

    def test_already_bet(self):
        self.eng.place_bet(self.room, "player0", 100)
        with self.assertRaises(ValueError):
            self.eng.place_bet(self.room, "player0", 200)

    def test_wrong_phase(self):
        self.room.phase = "playing"
        with self.assertRaises(ValueError):
            self.eng.place_bet(self.room, "player0", 100)

    def test_all_bets_trigger_deal(self):
        self.eng.place_bet(self.room, "player0", 100)
        events = self.eng.place_bet(self.room, "player1", 200)
        # Should include cards_dealt event
        self.assertTrue(any(e["type"] == "cards_dealt" for e in events))
        # Players should have hand dicts
        self.assertEqual(len(self.room.players["player0"].hands), 1)
        self.assertEqual(len(self.room.players["player0"].hands[0]["cards"]), 2)
        self.assertEqual(len(self.room.players["player1"].hands), 1)
        self.assertEqual(len(self.room.players["player1"].hands[0]["cards"]), 2)
        self.assertEqual(len(self.room.dealer_hand), 2)

    def test_negative_bankroll_can_bet(self):
        """Core mechanic: players can bet even when broke/in debt mode."""
        self.room.players["player0"].bankroll = -50000
        self.room.players["player0"].in_debt_mode = True
        events = self.eng.place_bet(self.room, "player0", 100)
        self.assertEqual(self.room.players["player0"].bet, 100)


class TestBetAsset(unittest.TestCase):
    def setUp(self):
        self.room = make_room_with_players(2)
        self.eng = GameEngine()
        self.eng.start_game(self.room)

    def test_bet_asset_during_betting(self):
        # Set bankroll to threshold for watch (0)
        self.room.players["player0"].bankroll = 0
        events = self.eng.bet_asset(self.room, "player0", "watch")
        self.assertFalse(self.room.players["player0"].owned_assets["watch"])
        self.assertEqual(len(self.room.players["player0"].betted_assets), 1)

    def test_asset_not_unlocked(self):
        # Bankroll too high to bet watch (threshold is 0)
        self.room.players["player0"].bankroll = 1000
        with self.assertRaises(ValueError):
            self.eng.bet_asset(self.room, "player0", "watch")

    def test_asset_already_bet(self):
        self.room.players["player0"].bankroll = 0
        self.eng.bet_asset(self.room, "player0", "watch")
        with self.assertRaises(ValueError):
            self.eng.bet_asset(self.room, "player0", "watch")

    def test_asset_not_owned(self):
        self.room.players["player0"].bankroll = 0
        self.room.players["player0"].owned_assets["watch"] = False
        with self.assertRaises(ValueError):
            self.eng.bet_asset(self.room, "player0", "watch")


class TestHit(unittest.TestCase):
    def _setup_playing(self):
        """Set up a room where both players have bet and cards are dealt."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Stack the deck so we control what's dealt
        room.deck = [
            make_card("5"), make_card("6"),  # player0 card1, player1 card1
            make_card("7"),                   # dealer card1
            make_card("8"), make_card("9"),  # player0 card2, player1 card2
            make_card("10"),                  # dealer card2
            make_card("3"),                   # next card to draw on hit
            make_card("K"),                   # another card
        ] + [make_card("2")] * 50  # filler

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        return room, eng

    def test_hit_draws_card(self):
        room, eng = self._setup_playing()
        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        player = room.players[current_pid]
        hand = player.hands[player.active_hand_index]
        initial_count = len(hand["cards"])

        events = eng.hit(room, current_pid)
        self.assertEqual(len(hand["cards"]), initial_count + 1)
        self.assertTrue(any(e["type"] == "player_hit" for e in events))

    def test_hit_wrong_turn(self):
        room, eng = self._setup_playing()
        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        # Try to hit with the wrong player
        current_pid = room.turn_order[room.current_player_idx]
        other_pid = [p for p in room.turn_order if p != current_pid][0]

        with self.assertRaises(ValueError):
            eng.hit(room, other_pid)

    def test_hit_bust(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Stack deck: player0 gets 10+10 (20), hit gives K (bust at 30)
        room.deck = [
            make_card("10"), make_card("5"),  # p0 card1, p1 card1
            make_card("7"),                    # dealer card1
            make_card("10"), make_card("8"),  # p0 card2, p1 card2
            make_card("9"),                    # dealer card2
            make_card("K"),                    # hit card -> bust
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        # Deck: p0=10+10=20, p1=5+8=13, dealer=7+9=16 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        events = eng.hit(room, current_pid)
        player = room.players[current_pid]
        hand = player.hands[0]

        # p0 had 20, hitting K gives 30 — always busts
        self.assertEqual(hand["status"], "bust")
        self.assertEqual(hand["result"], "bust")


class TestStand(unittest.TestCase):
    def test_stand_advances_turn(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Give safe cards to avoid blackjacks
        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("8"), make_card("9"),
            make_card("10"),
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        first_pid = room.turn_order[room.current_player_idx]
        events = eng.stand(room, first_pid)
        self.assertEqual(room.players[first_pid].hands[0]["status"], "standing")

        # Turn should have advanced
        self.assertTrue(
            any(e["type"] == "your_turn" for e in events)
            or any(e["type"] == "dealer_turn_start" for e in events)
        )


class TestDoubleDown(unittest.TestCase):
    def test_double_down_doubles_bet(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("4"), make_card("9"),
            make_card("10"),
            make_card("3"),  # double down card
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        # Deck: p0=5+4=9, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        events = eng.double_down(room, current_pid)
        player = room.players[current_pid]
        hand = player.hands[0]

        self.assertEqual(hand["bet"], 200)  # Doubled
        self.assertEqual(len(hand["cards"]), 3)  # Got one more card
        self.assertTrue(hand["is_doubled_down"])
        self.assertIn(hand["status"], ("standing", "bust"))

    def test_double_down_requires_two_cards(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("4"), make_card("9"),
            make_card("10"),
            make_card("3"),  # hit card for p0 → 9+3=12, not bust
            make_card("2"),
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        # Deck: p0=5+4=9, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        # Hit first to get 3 cards (p0 has 9, hitting 3 → 12, not bust)
        eng.hit(room, current_pid)

        # p0 now has 3 cards (9+3=12), still playing — double down must be rejected
        self.assertEqual(room.players[current_pid].hands[0]["status"], "playing")

        with self.assertRaises(ValueError):
            eng.double_down(room, current_pid)


class TestDealerLogic(unittest.TestCase):
    def test_determine_hand_outcome_win(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("10"), make_card("9")], 100)  # 19
        hand["status"] = "standing"
        dealer_hand = [make_card("10"), make_card("7")]  # 17

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "win")

    def test_determine_hand_outcome_lose(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("10"), make_card("7")], 100)  # 17
        hand["status"] = "standing"
        dealer_hand = [make_card("10"), make_card("9")]  # 19

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "lose")

    def test_determine_hand_outcome_push(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("10"), make_card("8")], 100)  # 18
        hand["status"] = "standing"
        dealer_hand = [make_card("10"), make_card("8")]  # 18

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "push")

    def test_determine_hand_outcome_dealer_bust(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("10"), make_card("8")], 100)  # 18
        hand["status"] = "standing"
        dealer_hand = [make_card("10"), make_card("6"), make_card("K")]  # 26

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "dealerBust")

    def test_determine_hand_outcome_bust(self):
        eng = GameEngine()
        hand = create_hand_dict(
            [make_card("10"), make_card("10"), make_card("5")], 100
        )  # 25
        hand["status"] = "bust"

        result = eng._determine_hand_outcome(
            hand, [make_card("10"), make_card("7")], False
        )
        self.assertEqual(result, "bust")

    def test_determine_hand_outcome_blackjack(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("A"), make_card("K")], 100)
        hand["status"] = "done"
        dealer_hand = [make_card("10"), make_card("9")]

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "blackjack")

    def test_determine_hand_outcome_both_blackjack_push(self):
        eng = GameEngine()
        hand = create_hand_dict([make_card("A"), make_card("K")], 100)
        hand["status"] = "done"
        dealer_hand = [make_card("A"), make_card("Q")]

        result = eng._determine_hand_outcome(hand, dealer_hand, False)
        self.assertEqual(result, "push")

    def test_split_hand_21_not_blackjack(self):
        """Split hand with A+K should be 'win', not 'blackjack'."""
        eng = GameEngine()
        hand = create_hand_dict([make_card("A"), make_card("K")], 100)
        hand["status"] = "standing"
        dealer_hand = [make_card("10"), make_card("7")]

        result = eng._determine_hand_outcome(hand, dealer_hand, True)
        self.assertEqual(result, "win")  # NOT blackjack for split hands

    def test_aggregate_result_mixed(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["win", "bust"]), "mixed"
        )

    def test_aggregate_result_all_win(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["win", "win"]), "win"
        )
        # dealerBust is preferred over win when both present
        self.assertEqual(
            eng._determine_aggregate_result(["win", "dealerBust"]), "dealerBust"
        )

    def test_aggregate_result_all_bust(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["bust", "bust"]), "bust"
        )


class TestResolveHands(unittest.TestCase):
    def _setup_for_resolve(self, p0_cards, p1_cards, dealer_cards, p0_bet=100, p1_bet=100):
        """Helper: create room with players' hands set up for resolution."""
        eng = GameEngine()
        room = make_room_with_players(2)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hands = [create_hand_dict(p0_cards, p0_bet)]
        p0.hands[0]["status"] = "standing"
        p0.status = "standing"
        p0.bankroll = STARTING_BANKROLL

        p1 = room.players["player1"]
        p1.hands = [create_hand_dict(p1_cards, p1_bet)]
        p1.hands[0]["status"] = "standing"
        p1.status = "standing"

        room.dealer_hand = dealer_cards
        room.turn_order = ["player0", "player1"]
        room.phase = "dealer_turn"

        return room, eng, p0, p1

    def test_assets_returned_on_win(self):
        room, eng, p0, p1 = self._setup_for_resolve(
            [make_card("10"), make_card("9")],  # 19
            [make_card("10"), make_card("8")],  # 18
            [make_card("10"), make_card("7")],  # 17
        )

        p0.betted_assets = [dict(ASSET_MAP["watch"])]
        p0.owned_assets["watch"] = False
        p0.bankroll = 0

        events = eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "win")
        self.assertTrue(p0.owned_assets["watch"])  # Returned

    def test_assets_lost_on_loss(self):
        room, eng, p0, p1 = self._setup_for_resolve(
            [make_card("10"), make_card("6")],  # 16
            [make_card("10"), make_card("8")],  # 18
            [make_card("10"), make_card("9")],  # 19
        )

        p0.betted_assets = [dict(ASSET_MAP["watch"])]
        p0.owned_assets["watch"] = False

        events = eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "lose")
        self.assertFalse(p0.owned_assets["watch"])  # Lost

    def test_stats_updated(self):
        room, eng, p0, p1 = self._setup_for_resolve(
            [make_card("10"), make_card("9")],  # 19
            [make_card("10"), make_card("8")],  # 18
            [make_card("10"), make_card("7")],  # 17
        )

        eng.resolve_all_hands(room)

        self.assertEqual(p0.hands_played, 1)
        self.assertEqual(p0.win_streak, 1)
        self.assertEqual(p0.lose_streak, 0)
        self.assertEqual(p0.bankroll, STARTING_BANKROLL + 100)
        self.assertEqual(p0.peak_bankroll, STARTING_BANKROLL + 100)

    def test_split_hands_payout(self):
        """Split hands: one wins, one loses = mixed result."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hands = [
            create_hand_dict([make_card("10"), make_card("9")], 500),  # 19, wins
            create_hand_dict([make_card("10"), make_card("6")], 500),  # 16, loses
        ]
        p0.hands[0]["status"] = "standing"
        p0.hands[1]["status"] = "standing"
        p0.status = "standing"
        p0.bankroll = 10000

        room.dealer_hand = [make_card("10"), make_card("8")]  # 18
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "mixed")
        self.assertEqual(p0.hands[0]["payout"], 500)
        self.assertEqual(p0.hands[1]["payout"], -500)
        self.assertEqual(p0.bankroll, 10000)  # Net zero

    def test_split_assets_on_hand0(self):
        """Assets tied to hand[0]: returned if hand[0] wins."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hands = [
            create_hand_dict([make_card("10"), make_card("9")], 500),  # wins
            create_hand_dict([make_card("10"), make_card("6")], 500),  # loses
        ]
        p0.hands[0]["status"] = "standing"
        p0.hands[1]["status"] = "standing"
        p0.status = "standing"
        p0.bankroll = 5000
        p0.betted_assets = [{"id": "watch", "name": "Watch", "value": 500}]
        p0.owned_assets["watch"] = False

        room.dealer_hand = [make_card("10"), make_card("8")]
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        # Hand[0] won, so assets returned
        self.assertTrue(p0.owned_assets["watch"])
        # Hand[0] payout includes asset value: (500 + 500) = 1000
        self.assertEqual(p0.hands[0]["payout"], 1000)
        # Hand[1] payout is just cash: -500
        self.assertEqual(p0.hands[1]["payout"], -500)


class TestSplit(unittest.TestCase):
    def _setup_split(self, card1_rank="K", card2_rank="K"):
        """Set up a room with a splittable hand."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict(
            [make_card(card1_rank), make_card(card2_rank)],
            500,
        )]
        p.active_hand_index = 0
        p.bankroll = 10000

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        room.deck = shuffle_deck(create_deck())

        return room, eng, p

    def test_split_creates_two_hands(self):
        room, eng, p = self._setup_split("K", "K")
        events = eng.split(room, "player0")

        self.assertEqual(len(p.hands), 2)
        self.assertEqual(p.hands[0]["bet"], 500)
        self.assertEqual(p.hands[1]["bet"], 500)
        self.assertEqual(p.hands[0]["cards"][0]["rank"], "K")
        self.assertEqual(p.hands[1]["cards"][0]["rank"], "K")
        self.assertTrue(any(e["type"] == "player_split" for e in events))

    def test_split_aces_auto_stand(self):
        room, eng, p = self._setup_split("A", "A")
        eng.split(room, "player0")

        self.assertTrue(p.hands[0]["is_split_aces"])
        self.assertTrue(p.hands[1]["is_split_aces"])
        self.assertEqual(p.hands[0]["status"], "standing")
        self.assertEqual(p.hands[1]["status"], "standing")

    def test_cannot_resplit_aces(self):
        room, eng, p = self._setup_split("A", "A")
        eng.split(room, "player0")

        # Even if hand[0] got another ace, can't re-split
        p.hands[0]["cards"] = [make_card("A"), make_card("A")]
        p.hands[0]["status"] = "playing"
        p.status = "playing"
        p.active_hand_index = 0

        with self.assertRaises(ValueError):
            eng.split(room, "player0")

    def test_cannot_split_different_values(self):
        room, eng, p = self._setup_split("K", "9")
        with self.assertRaises(ValueError):
            eng.split(room, "player0")

    def test_max_split_hands(self):
        room, eng, p = self._setup_split("K", "K")

        # Fill up to 4 hands
        p.hands = [
            create_hand_dict([make_card("K"), make_card("K")], 500),
            create_hand_dict([make_card("10"), make_card("J")], 500),
            create_hand_dict([make_card("10"), make_card("K")], 500),
            create_hand_dict([make_card("10"), make_card("Q")], 500),
        ]

        with self.assertRaises(ValueError):
            eng.split(room, "player0")

    def test_split_no_bankroll_check(self):
        """Splitting never blocked by bankroll — casino extends infinite credit."""
        room, eng, p = self._setup_split("K", "K")
        p.bankroll = -100000

        events = eng.split(room, "player0")
        self.assertEqual(len(p.hands), 2)  # Split succeeded despite negative bankroll


class TestReshuffle(unittest.TestCase):
    def test_reshuffle_when_deck_low(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Drain the deck
        room.deck = [make_card("2")] * 10  # Below RESHUFFLE_THRESHOLD (20)
        room.phase = "result"

        events = eng.start_betting_phase(room)
        self.assertEqual(len(room.deck), 312)  # Reshuffled full deck


class TestGetRoomState(unittest.TestCase):
    def test_dealer_hole_card_hidden(self):
        eng = GameEngine()
        room = make_room_with_players(2)
        room.phase = "playing"
        room.dealer_hand = [make_card("A"), make_card("K")]

        state = eng.get_room_state(room, hide_dealer_hole=True)
        self.assertEqual(state["dealer_hand"][0]["rank"], "A")
        self.assertEqual(state["dealer_hand"][1]["rank"], "?")

    def test_dealer_hole_card_visible_during_result(self):
        eng = GameEngine()
        room = make_room_with_players(2)
        room.phase = "result"
        room.dealer_hand = [make_card("A"), make_card("K")]

        state = eng.get_room_state(room, hide_dealer_hole=True)
        self.assertEqual(state["dealer_hand"][0]["rank"], "A")
        self.assertEqual(state["dealer_hand"][1]["rank"], "K")

    def test_serialized_player_has_hands(self):
        eng = GameEngine()
        room = make_room_with_players(1)
        p = room.players["player0"]
        p.hands = [create_hand_dict([make_card("10"), make_card("K")], 500)]

        state = eng.get_room_state(room)
        p_state = state["players"]["player0"]
        self.assertIn("hands", p_state)
        self.assertEqual(len(p_state["hands"]), 1)
        self.assertEqual(p_state["hands"][0]["hand_value"], 20)
        self.assertIn("active_hand_index", p_state)


class TestHandlePlayerDeparture(unittest.TestCase):
    def _setup_playing_room(self):
        """Create a room in playing phase with controlled cards."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Stack deck with safe cards (no blackjacks)
        room.deck = [
            make_card("5"), make_card("6"),   # p0 card1, p1 card1
            make_card("7"),                    # dealer card1
            make_card("8"), make_card("9"),   # p0 card2, p1 card2
            make_card("10"),                   # dealer card2
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        return room, eng

    def test_departure_advances_turn_when_current(self):
        room, eng = self._setup_playing_room()
        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        other_pid = [p for p in room.turn_order if p != current_pid][0]

        # Mark current player as disconnected
        room.players[current_pid].connected = False
        events = eng.handle_player_departure(room, current_pid)

        # Turn should have advanced (your_turn for other player or dealer_turn_start)
        self.assertTrue(
            any(e["type"] == "your_turn" for e in events)
            or any(e["type"] == "dealer_turn_start" for e in events)
        )

    def test_departure_no_events_when_not_current(self):
        room, eng = self._setup_playing_room()
        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack possible.
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        other_pid = [p for p in room.turn_order if p != current_pid][0]

        # Mark non-current player as disconnected
        room.players[other_pid].connected = False
        events = eng.handle_player_departure(room, other_pid)

        self.assertEqual(events, [])

    def test_departure_during_betting_auto_deals(self):
        room = make_room_with_players(3)
        eng = GameEngine()
        eng.start_game(room)

        # Two players bet, third hasn't
        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)
        self.assertEqual(room.phase, "betting")  # Still waiting for player2

        # Player2 disconnects
        room.players["player2"].connected = False
        events = eng.handle_player_departure(room, "player2")

        # Should auto-deal since all remaining connected players are ready
        self.assertTrue(any(e["type"] == "cards_dealt" for e in events))

    def test_departure_during_betting_no_deal_if_not_all_ready(self):
        room = make_room_with_players(3)
        eng = GameEngine()
        eng.start_game(room)

        # Only one player has bet
        eng.place_bet(room, "player0", 100)

        # Player2 disconnects (player1 still hasn't bet)
        room.players["player2"].connected = False
        events = eng.handle_player_departure(room, "player2")

        self.assertEqual(events, [])
        self.assertEqual(room.phase, "betting")


# =============================================================================
# Audit fix tests
# =============================================================================


class TestDoubleDownVig(unittest.TestCase):
    """Fix #1/#2: vig is charged on double-down with committed-bet-aware bankroll."""

    def test_double_down_vig_when_borrowing(self):
        """Player with low bankroll doubles — vig charged on borrowed portion."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("5"), make_card("6")], 100)]
        p.hands[0]["status"] = "playing"
        p.active_hand_index = 0
        p.bankroll = 50  # Only $50, hand bet is $100 (already committed)
        p.in_debt_mode = True  # Must be in debt mode to double when bankroll < bet
        p.vig_amount = 0
        p.total_vig_paid = 0

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        room.deck = [make_card("3")] + [make_card("2")] * 50

        eng.double_down(room, "player0")

        # After Tier 1 fix: hand being doubled excluded from committed
        # Effective bankroll = max(0, 50 - 0) = 50, additional bet = 100
        # Borrowed = max(0, 100 - 50) = 50. Vig rate at $50 = 0.02
        # Vig = floor(50 * 0.02) = 1
        self.assertEqual(p.vig_amount, 1)
        self.assertEqual(p.total_vig_paid, 1)
        self.assertEqual(p.bankroll, 49)  # 50 - 1

    def test_double_down_no_vig_when_covered(self):
        """Player with enough bankroll doubles — no vig charged."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("5"), make_card("6")], 100)]
        p.hands[0]["status"] = "playing"
        p.active_hand_index = 0
        p.bankroll = 10000
        p.vig_amount = 0
        p.total_vig_paid = 0

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        room.deck = [make_card("3")] + [make_card("2")] * 50

        eng.double_down(room, "player0")

        # Effective bankroll = max(0, 10000 - 100) = 9900, additional bet = 100
        # Borrowed = max(0, 100 - 9900) = 0 → no vig
        self.assertEqual(p.vig_amount, 0)
        self.assertEqual(p.bankroll, 10000)


class TestSplitVigCommittedBets(unittest.TestCase):
    """Fix #2: split vig accounts for committed bets on existing hands."""

    def test_split_vig_accounts_for_committed_bet(self):
        """When bankroll exactly covers the split hand, no vig is charged.

        After Tier 1 fix: the hand being split is excluded from total_committed,
        so effective_bankroll = max(0, 500 - 0) = 500, which fully covers the
        new $500 split hand. Borrowed = 0, vig = 0.
        """
        room, eng, p = TestSplit._setup_split(TestSplit(), "K", "K")
        p.bankroll = 500  # Exactly covers hand 1's $500 bet
        p.vig_amount = 0
        p.total_vig_paid = 0

        eng.split(room, "player0")

        # Hand being split excluded from committed → effective_bankroll = 500
        # Borrowed = max(0, 500 - 500) = 0 → no vig
        self.assertEqual(p.vig_amount, 0)
        self.assertEqual(p.total_vig_paid, 0)
        self.assertEqual(p.bankroll, 500)

    def test_split_no_vig_when_bankroll_covers_both(self):
        """When bankroll covers both hands, no vig is charged."""
        room, eng, p = TestSplit._setup_split(TestSplit(), "K", "K")
        p.bankroll = 10000
        p.vig_amount = 0
        p.total_vig_paid = 0

        eng.split(room, "player0")

        # Effective bankroll = max(0, 10000 - 500) = 9500, split bet = 500
        # Borrowed = max(0, 500 - 9500) = 0 → no vig
        self.assertEqual(p.vig_amount, 0)
        self.assertEqual(p.bankroll, 10000)


class TestSplitAutoStandBothHands(unittest.TestCase):
    """Fix #9: both hands auto-stand on 21 after non-aces split."""

    def test_both_hands_21_auto_stand(self):
        """Split two Ks, both get A → both auto-stand at 21."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("K"), make_card("K")], 500)]
        p.hands[0]["status"] = "playing"
        p.active_hand_index = 0
        p.bankroll = 10000

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        # Both split hands get an Ace → 10+A = 21
        room.deck = [make_card("A"), make_card("A")] + [make_card("2")] * 50

        eng.split(room, "player0")

        self.assertEqual(len(p.hands), 2)
        self.assertEqual(p.hands[0]["status"], "standing")  # 21
        self.assertEqual(p.hands[1]["status"], "standing")  # 21
        self.assertEqual(hand_value(p.hands[0]["cards"]), 21)
        self.assertEqual(hand_value(p.hands[1]["cards"]), 21)

    def test_hand2_21_auto_stand_hand1_playing(self):
        """Split two Ks: hand1 gets 5 (playing), hand2 gets A (21, auto-stand)."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("K"), make_card("K")], 500)]
        p.hands[0]["status"] = "playing"
        p.active_hand_index = 0
        p.bankroll = 10000

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        # Hand1 gets 5 (K+5=15), hand2 gets A (K+A=21)
        room.deck = [make_card("5"), make_card("A")] + [make_card("2")] * 50

        eng.split(room, "player0")

        self.assertEqual(p.hands[0]["status"], "playing")   # 15, playable
        self.assertEqual(p.hands[1]["status"], "standing")   # 21, auto-stood
        self.assertEqual(p.active_hand_index, 0)  # Still on hand 0


class TestHandStatusValidation(unittest.TestCase):
    """Fix #8: _validate_player_turn checks hand-level status."""

    def test_cannot_act_on_standing_hand(self):
        """Server rejects action on a hand that's already standing."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("10"), make_card("9")], 100)]
        p.hands[0]["status"] = "standing"  # Already standing
        p.active_hand_index = 0

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        room.deck = [make_card("2")] * 50

        with self.assertRaises(ValueError, msg="Hand is not in playing state"):
            eng.hit(room, "player0")


class TestAggregateResultBust(unittest.TestCase):
    """Fix #5: 'bust' aggregate only when ALL hands bust."""

    def test_bust_and_lose_returns_lose(self):
        eng = GameEngine()
        result = eng._determine_aggregate_result(["bust", "lose"])
        self.assertEqual(result, "lose")

    def test_all_bust_returns_bust(self):
        eng = GameEngine()
        result = eng._determine_aggregate_result(["bust", "bust"])
        self.assertEqual(result, "bust")

    def test_bust_and_win_returns_mixed(self):
        eng = GameEngine()
        result = eng._determine_aggregate_result(["bust", "win"])
        self.assertEqual(result, "mixed")


class TestTotalWonLostDelta(unittest.TestCase):
    """Fix #6: total_won/total_lost use delta-based tracking."""

    def test_mixed_result_tracks_net_win(self):
        """Mixed split result with net positive delta → total_won updated."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p = room.players["player0"]
        p.hands = [
            create_hand_dict([make_card("10"), make_card("9")], 500),  # 19, wins vs 18
            create_hand_dict([make_card("10"), make_card("6")], 200),  # 16, loses vs 18
        ]
        p.hands[0]["status"] = "standing"
        p.hands[1]["status"] = "standing"
        p.status = "standing"
        p.bankroll = 10000
        p.total_won = 0
        p.total_lost = 0

        room.dealer_hand = [make_card("10"), make_card("8")]  # 18
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        # Net delta = +500 - 200 = +300
        self.assertEqual(p.result, "mixed")
        self.assertEqual(p.total_won, 300)
        self.assertEqual(p.total_lost, 0)

    def test_mixed_result_tracks_net_loss(self):
        """Mixed split result with net negative delta → total_lost updated."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p = room.players["player0"]
        p.hands = [
            create_hand_dict([make_card("10"), make_card("9")], 200),  # 19, wins vs 18
            create_hand_dict([make_card("10"), make_card("6")], 500),  # 16, loses vs 18
        ]
        p.hands[0]["status"] = "standing"
        p.hands[1]["status"] = "standing"
        p.status = "standing"
        p.bankroll = 10000
        p.total_won = 0
        p.total_lost = 0

        room.dealer_hand = [make_card("10"), make_card("8")]  # 18
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        # Net delta = +200 - 500 = -300
        self.assertEqual(p.result, "mixed")
        self.assertEqual(p.total_won, 0)
        self.assertEqual(p.total_lost, 300)


class TestReconnectSessionToken(unittest.TestCase):
    """Fix #4: PlayerState has session_token field."""

    def test_player_state_has_session_token(self):
        """New PlayerState gets a random session token."""
        p = PlayerState(name="Test", player_id="test-id")
        self.assertIsInstance(p.session_token, str)
        self.assertTrue(len(p.session_token) > 20)

    def test_different_players_different_tokens(self):
        """Two players get different tokens."""
        p1 = PlayerState(name="P1", player_id="id1")
        p2 = PlayerState(name="P2", player_id="id2")
        self.assertNotEqual(p1.session_token, p2.session_token)


# =============================================================================
# New tests: Problem 2 — Dealer turn
# =============================================================================


async def _noop_broadcast(event):
    """No-op async broadcast function for testing dealer turn."""
    pass


async def _mock_sleep(delay):
    """Instant replacement for asyncio.sleep in tests."""
    pass


def _run_dealer_turn(room, eng):
    """Run dealer turn synchronously with sleep patched out."""
    async def _inner():
        with patch("asyncio.sleep", side_effect=_mock_sleep):
            return await eng.run_dealer_turn(room, _noop_broadcast)
    return asyncio.run(_inner())


class TestDealerTurn(unittest.TestCase):
    """Tests for run_dealer_turn: hit-on-soft-17 rule and bust detection."""

    def _setup_dealer_turn(self, dealer_cards, deck_cards):
        """Set up a room ready for dealer turn with one standing player."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p = room.players["player0"]
        p.hands = [create_hand_dict([make_card("10"), make_card("9")], 100)]  # 19
        p.hands[0]["status"] = "standing"
        p.status = "standing"
        p.bankroll = STARTING_BANKROLL

        room.dealer_hand = dealer_cards
        room.deck = deck_cards + [make_card("2")] * 50
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        return room, eng

    def test_dealer_stands_on_hard_17(self):
        """Dealer with 10+7=17 (hard) should stand without drawing."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("10"), make_card("7")],
            deck_cards=[make_card("3")],
        )
        _run_dealer_turn(room, eng)

        self.assertEqual(len(room.dealer_hand), 2)
        self.assertEqual(hand_value(room.dealer_hand), 17)

    def test_dealer_hits_soft_17(self):
        """Dealer with A+6=17 (soft) must hit."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("A"), make_card("6")],
            deck_cards=[make_card("4")],  # A+6+4=21
        )
        _run_dealer_turn(room, eng)

        self.assertEqual(len(room.dealer_hand), 3)
        self.assertEqual(hand_value(room.dealer_hand), 21)

    def test_dealer_stands_on_soft_18(self):
        """Dealer with A+7=18 (soft) should stand without drawing."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("A"), make_card("7")],
            deck_cards=[make_card("3")],
        )
        _run_dealer_turn(room, eng)

        self.assertEqual(len(room.dealer_hand), 2)
        self.assertEqual(hand_value(room.dealer_hand), 18)

    def test_dealer_busts(self):
        """Dealer with 10+6=16 hits, gets K=26, busts."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("10"), make_card("6")],
            deck_cards=[make_card("K")],
        )
        _run_dealer_turn(room, eng)

        self.assertEqual(len(room.dealer_hand), 3)
        self.assertGreater(hand_value(room.dealer_hand), 21)

    def test_dealer_draws_multiple_cards(self):
        """Dealer with 2+3=5 draws until reaching >= 17."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("2"), make_card("3")],
            deck_cards=[make_card("4"), make_card("5"), make_card("6")],  # 5+4+5+6=20
        )
        _run_dealer_turn(room, eng)

        val = hand_value(room.dealer_hand)
        self.assertGreaterEqual(val, 17)
        self.assertGreater(len(room.dealer_hand), 2)

    def test_dealer_soft_17_becomes_hard(self):
        """Dealer with A+6 hits, gets 10 → A counts as 1, hard 17. Should stand."""
        room, eng = self._setup_dealer_turn(
            dealer_cards=[make_card("A"), make_card("6")],
            deck_cards=[make_card("10")],  # A+6+10=17 (hard, ace reduced to 1)
        )
        _run_dealer_turn(room, eng)

        self.assertEqual(len(room.dealer_hand), 3)
        self.assertEqual(hand_value(room.dealer_hand), 17)


# =============================================================================
# New tests: Problem 3 — Blackjack payout
# =============================================================================


class TestBlackjackPayout(unittest.TestCase):
    """Natural blackjack pays 3:2; split 21 and mutual BJ behave correctly."""

    def _setup_resolve(self, p0_cards, dealer_cards, p0_bet=100,
                       p0_status="standing", is_split=False):
        """Build a room ready for resolve_all_hands with a single player."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hands = [create_hand_dict(p0_cards, p0_bet)]
        p0.hands[0]["status"] = p0_status
        if is_split:
            # Mark as a split hand by adding a second dummy hand
            p0.hands.append(create_hand_dict([make_card("2"), make_card("3")], p0_bet))
            p0.hands[1]["status"] = "standing"
        p0.status = "standing"
        p0.bankroll = STARTING_BANKROLL

        room.dealer_hand = dealer_cards
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        return room, eng, p0

    def test_natural_blackjack_pays_3_to_2(self):
        """Natural blackjack (A+K) pays 1.5x the bet ($150 on $100)."""
        room, eng, p0 = self._setup_resolve(
            p0_cards=[make_card("A"), make_card("K")],
            dealer_cards=[make_card("10"), make_card("7")],  # 17
            p0_status="done",
        )
        # deal_initial_cards would mark BJ hand as "done"
        p0.hands[0]["result"] = None

        eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "blackjack")
        expected_payout = math.floor(1.5 * 100)  # 150
        self.assertEqual(p0.hands[0]["payout"], expected_payout)
        self.assertEqual(p0.bankroll, STARTING_BANKROLL + 150)

    def test_both_blackjack_pushes(self):
        """Both player and dealer have blackjack — push, bankroll unchanged."""
        room, eng, p0 = self._setup_resolve(
            p0_cards=[make_card("A"), make_card("K")],
            dealer_cards=[make_card("A"), make_card("Q")],
            p0_status="done",
        )
        p0.hands[0]["result"] = None

        eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "push")
        self.assertEqual(p0.hands[0]["payout"], 0)
        self.assertEqual(p0.bankroll, STARTING_BANKROLL)

    def test_split_21_not_blackjack_payout(self):
        """A+K on a split hand pays 1:1, not 3:2."""
        room, eng, p0 = self._setup_resolve(
            p0_cards=[make_card("A"), make_card("K")],
            dealer_cards=[make_card("10"), make_card("7")],  # 17
            p0_status="standing",
            is_split=True,
        )

        eng.resolve_all_hands(room)

        # Split hand 21 with 2 cards resolves as "win" not "blackjack"
        self.assertEqual(p0.hands[0]["result"], "win")
        self.assertEqual(p0.hands[0]["payout"], 100)  # 1:1, not 1.5:1


# =============================================================================
# New tests: Problem 4 — Vig on deal
# =============================================================================


class TestVigOnDeal(unittest.TestCase):
    """Vig is charged on the borrowed portion of a bet at deal time."""

    def test_vig_charged_when_borrowing(self):
        """Player in debt mode: vig charged on borrowed portion of bet."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = -50_000
        p.in_debt_mode = True

        # Set a stacked deck so dealing won't trigger a blackjack
        room.deck = [
            make_card("5"),   # p0 card1
            make_card("7"),   # dealer card1
            make_card("8"),   # p0 card2
            make_card("9"),   # dealer card2
        ] + [make_card("2")] * 50

        bankroll_before = p.bankroll
        eng.place_bet(room, "player0", 100)

        # Bankroll at -50000 → vig rate is 0.07 (tier: -10K to -50K)
        # Borrowed = max(0, 100 - max(0, -50000)) = 100
        # Vig = floor(100 * 0.07) = 7
        expected_rate = get_vig_rate(-50_000)
        self.assertEqual(expected_rate, 0.07)
        expected_vig = math.floor(100 * expected_rate)
        self.assertEqual(p.vig_amount, expected_vig)
        self.assertEqual(p.bankroll, bankroll_before - expected_vig)

    def test_no_vig_when_bankroll_covers_bet(self):
        """Player with enough bankroll: no vig charged."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 10_000

        room.deck = [
            make_card("5"),   # p0 card1
            make_card("7"),   # dealer card1
            make_card("8"),   # p0 card2
            make_card("9"),   # dealer card2
        ] + [make_card("2")] * 50

        bankroll_before = p.bankroll
        eng.place_bet(room, "player0", 100)

        # Bankroll=10000, bet=100 → borrowed=max(0, 100-10000)=0 → vig=0
        self.assertEqual(p.vig_amount, 0)
        self.assertEqual(p.bankroll, bankroll_before)

    def test_vig_only_on_borrowed_portion(self):
        """Player with partial bankroll: vig only on amount exceeding bankroll."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 50
        p.in_debt_mode = True  # bankroll <= 0 guard bypassed; bankroll is positive but small

        room.deck = [
            make_card("5"),   # p0 card1
            make_card("7"),   # dealer card1
            make_card("8"),   # p0 card2
            make_card("9"),   # dealer card2
        ] + [make_card("2")] * 50

        bankroll_before = p.bankroll
        eng.place_bet(room, "player0", 100)

        # Bankroll=50, bet=100 → borrowed=max(0, 100-50)=50
        # Vig rate at +50 bankroll = 0.02
        expected_rate = get_vig_rate(50)
        self.assertEqual(expected_rate, 0.02)
        expected_vig = math.floor(50 * expected_rate)  # floor(1.0) = 1
        self.assertEqual(p.vig_amount, expected_vig)
        self.assertEqual(p.bankroll, bankroll_before - expected_vig)


# =============================================================================
# New tests: Problem 5 — Debt mode lifecycle
# =============================================================================


class TestDebtModeLifecycle(unittest.TestCase):
    """Debt gate: asset betting, loan activation, and debt mode exit conditions."""

    def test_broke_player_can_bet_assets(self):
        """Player at $0 can bet a watch (unlock_threshold=0)."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 0  # exactly at threshold

        events = eng.bet_asset(room, "player0", "watch")

        self.assertFalse(p.owned_assets["watch"])
        self.assertEqual(len(p.betted_assets), 1)
        self.assertEqual(p.betted_assets[0]["id"], "watch")

    def test_take_loan_enables_debt_mode(self):
        """After losing everything, taking a loan enables debt mode."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 0
        # Remove all assets
        for asset_id in p.owned_assets:
            p.owned_assets[asset_id] = False

        events = eng.take_loan(room, "player0")

        self.assertTrue(p.in_debt_mode)
        self.assertTrue(any(e["type"] == "loan_taken" for e in events))

    def test_debt_mode_exits_on_recovery(self):
        """Debt mode exits when bankroll recovers to >= MIN_BET after resolution."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p = room.players["player0"]
        # Player in debt mode, hand wins and bankroll will reach exactly MIN_BET
        p.in_debt_mode = True
        p.bankroll = 0
        p.hands = [create_hand_dict([make_card("10"), make_card("9")], MIN_BET)]  # 19, wins
        p.hands[0]["status"] = "standing"
        p.status = "standing"

        room.dealer_hand = [make_card("10"), make_card("7")]  # 17, player wins
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        # Bankroll was 0, won MIN_BET → bankroll = MIN_BET
        self.assertEqual(p.bankroll, MIN_BET)
        self.assertFalse(p.in_debt_mode)

    def test_debt_mode_persists_below_min_bet(self):
        """Debt mode stays active when bankroll is positive but below MIN_BET."""
        eng = GameEngine()
        room = make_room_with_players(1)
        eng.start_game(room)

        p = room.players["player0"]
        # Bet is MIN_BET - 1 = 24 so bankroll after win = 24, below MIN_BET
        small_bet = MIN_BET - 1
        p.in_debt_mode = True
        p.bankroll = 0
        p.hands = [create_hand_dict([make_card("10"), make_card("9")], small_bet)]  # 19, wins
        p.hands[0]["status"] = "standing"
        p.status = "standing"

        room.dealer_hand = [make_card("10"), make_card("7")]  # 17, player wins
        room.turn_order = ["player0"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        # Bankroll = 0 + small_bet = small_bet < MIN_BET → debt mode persists
        self.assertEqual(p.bankroll, small_bet)
        self.assertTrue(p.in_debt_mode)


# =============================================================================
# New tests: Fix 2/3/4 — take_loan during playing, locked-asset gate, departure forfeiture
# =============================================================================


class TestTakeLoanDuringPlayingPhase(unittest.TestCase):
    """Fix 2: take_loan is allowed during the playing phase for the active player."""

    def test_take_loan_during_playing_phase(self):
        """Player at bankroll <= 0, in playing phase on their turn, can take a loan."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        # Set up mid-hand state: bankroll at 0, no assets, playing phase
        p.bankroll = 0
        for asset_id in p.owned_assets:
            p.owned_assets[asset_id] = False
        p.status = "playing"
        p.hands = [create_hand_dict([make_card("5"), make_card("6")], 100)]
        p.hands[0]["status"] = "playing"
        p.active_hand_index = 0

        room.turn_order = ["player0"]
        room.phase = "playing"
        room.current_player_idx = 0
        room.deck = [make_card("2")] * 50

        events = eng.take_loan(room, "player0")

        self.assertTrue(p.in_debt_mode)
        self.assertTrue(any(e["type"] == "loan_taken" for e in events))

    def test_take_loan_playing_phase_not_your_turn_rejected(self):
        """take_loan during playing phase is rejected if it is not the player's turn."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        p1 = room.players["player1"]
        p1.bankroll = 0
        for asset_id in p1.owned_assets:
            p1.owned_assets[asset_id] = False

        # player0 is taking their turn
        room.turn_order = ["player0", "player1"]
        room.phase = "playing"
        room.current_player_idx = 0

        with self.assertRaises(ValueError):
            eng.take_loan(room, "player1")


class TestTakeLoanLockedAssetGate(unittest.TestCase):
    """Fix 3: take_loan is allowed when the only remaining owned assets are locked."""

    def test_take_loan_allowed_with_only_locked_assets(self):
        """Player at $0 owns kidney (unlock_threshold=-10000). Kidney is locked at $0
        so it does not count as a bettable asset — loan should be granted."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 0
        # Remove all assets except kidney, which unlocks at -10000 (not yet unlocked)
        for asset_id in p.owned_assets:
            p.owned_assets[asset_id] = False
        p.owned_assets["kidney"] = True  # owned but NOT yet unlocked at bankroll=0

        events = eng.take_loan(room, "player0")

        self.assertTrue(p.in_debt_mode)
        self.assertTrue(any(e["type"] == "loan_taken" for e in events))

    def test_take_loan_blocked_with_unlocked_asset(self):
        """Player at $0 owns watch (unlock_threshold=0). Watch IS unlocked — loan blocked."""
        room = make_room_with_players(1)
        eng = GameEngine()
        eng.start_game(room)

        p = room.players["player0"]
        p.bankroll = 0
        # Remove all assets except watch, which unlocks at exactly 0
        for asset_id in p.owned_assets:
            p.owned_assets[asset_id] = False
        p.owned_assets["watch"] = True  # owned and unlocked at bankroll=0

        with self.assertRaises(ValueError):
            eng.take_loan(room, "player0")


class TestPlayerDepartureForfeits(unittest.TestCase):
    """Fix 4: departing player's active/standing hands are forfeited (bet debited)."""

    def _setup_playing_room_with_bets(self):
        """Two-player room in playing phase with controlled non-blackjack cards."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("8"), make_card("9"),
            make_card("10"),
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)
        # Deck: p0=5+8=13, p1=6+9=15, dealer=7+10=17 — no blackjack
        return room, eng

    def test_departure_debits_bet_from_bankroll(self):
        """When a player departs mid-round their bet is deducted from their bankroll."""
        room, eng = self._setup_playing_room_with_bets()
        self.assertEqual(room.phase, "playing")

        # Identify the player who is NOT currently taking their turn
        current_pid = room.turn_order[room.current_player_idx]
        departing_pid = [p for p in room.turn_order if p != current_pid][0]

        departing_player = room.players[departing_pid]
        bankroll_before = departing_player.bankroll
        bet = departing_player.hands[0]["bet"]

        departing_player.connected = False
        eng.handle_player_departure(room, departing_pid)

        # Bankroll should have been reduced by the bet amount
        self.assertEqual(departing_player.bankroll, bankroll_before - bet)
        self.assertEqual(departing_player.hands[0]["status"], "bust")
        self.assertEqual(departing_player.status, "bust")

    def test_current_player_departure_debits_bet(self):
        """When the current-turn player departs their bet is also debited."""
        room, eng = self._setup_playing_room_with_bets()
        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        current_player = room.players[current_pid]
        bankroll_before = current_player.bankroll
        bet = current_player.hands[0]["bet"]

        current_player.connected = False
        eng.handle_player_departure(room, current_pid)

        self.assertEqual(current_player.bankroll, bankroll_before - bet)
        self.assertEqual(current_player.hands[0]["status"], "bust")
        self.assertEqual(current_player.status, "bust")


class TestAggregateResultWinAndPush(unittest.TestCase):
    def test_aggregate_result_win_and_push_is_mixed(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["win", "push"]), "mixed"
        )

    def test_aggregate_result_loss_and_push_is_mixed(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["lose", "push"]), "mixed"
        )

    def test_aggregate_result_dealer_bust_and_push_is_mixed(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["dealerBust", "push"]), "mixed"
        )

    def test_aggregate_result_bust_and_push_is_mixed(self):
        eng = GameEngine()
        self.assertEqual(
            eng._determine_aggregate_result(["bust", "push"]), "mixed"
        )


class TestAutoStandOn21SingleHand(unittest.TestCase):
    def test_auto_stand_on_21_single_hand(self):
        """Hitting to 21 on a single (non-split) hand auto-stands."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # p0 gets 10+8=18, p1 gets 5+6=11, dealer gets 7+9=16
        # hit card for p0 is 3 → 10+8+3=21 → auto-stand
        room.deck = [
            make_card("10"), make_card("5"),
            make_card("7"),
            make_card("8"), make_card("6"),
            make_card("9"),
            make_card("3"),   # hit card → 21
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        self.assertEqual(room.phase, "playing")
        self.assertEqual(len(room.players["player0"].hands), 1)

        current_pid = room.turn_order[room.current_player_idx]
        # Ensure p0 is the current player
        self.assertEqual(current_pid, "player0")

        eng.hit(room, current_pid)

        hand = room.players[current_pid].hands[0]
        from card_engine import hand_value
        self.assertEqual(hand_value(hand["cards"]), 21)
        self.assertEqual(hand["status"], "standing")


class TestDoubleDownZeroBetBlocked(unittest.TestCase):
    def test_double_down_zero_bet_blocked(self):
        """Double down is rejected when the hand bet is 0."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("4"), make_card("9"),
            make_card("10"),
            make_card("3"),
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        # Force the bet to 0 on the active hand
        room.players[current_pid].hands[0]["bet"] = 0

        with self.assertRaises(ValueError):
            eng.double_down(room, current_pid)


class TestSplitZeroBetBlocked(unittest.TestCase):
    def test_split_zero_bet_blocked(self):
        """Split is rejected when the hand bet is 0."""
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        # Give p0 a pair of 8s, p1 safe cards, dealer safe cards
        room.deck = [
            make_card("8"), make_card("5"),
            make_card("7"),
            make_card("8"), make_card("6"),
            make_card("9"),
            make_card("2"), make_card("3"),  # split draw cards
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        self.assertEqual(room.phase, "playing")

        current_pid = room.turn_order[room.current_player_idx]
        self.assertEqual(current_pid, "player0")
        # Confirm p0 holds a pair of 8s
        hand = room.players[current_pid].hands[0]
        self.assertEqual(hand["cards"][0]["rank"], hand["cards"][1]["rank"])

        # Force the bet to 0
        hand["bet"] = 0

        with self.assertRaises(ValueError):
            eng.split(room, current_pid)


class TestRemoveAsset(unittest.TestCase):
    def setUp(self):
        self.room = make_room_with_players(2)
        self.eng = GameEngine()
        self.eng.start_game(self.room)

    def test_remove_asset(self):
        """Bet an asset then remove it; asset returns to owned_assets."""
        player = self.room.players["player0"]
        player.bankroll = 0  # watch unlocks at bankroll <= 0

        self.eng.bet_asset(self.room, "player0", "watch")
        self.assertFalse(player.owned_assets["watch"])
        self.assertEqual(len(player.betted_assets), 1)

        events = self.eng.remove_asset(self.room, "player0", "watch")

        self.assertTrue(player.owned_assets["watch"])
        self.assertEqual(len(player.betted_assets), 0)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "asset_removed")
        self.assertEqual(events[0]["asset_id"], "watch")

    def test_remove_asset_not_bet(self):
        """Removing an asset that was never bet raises ValueError."""
        with self.assertRaises(ValueError):
            self.eng.remove_asset(self.room, "player0", "watch")

    def test_remove_asset_wrong_phase(self):
        """Cannot remove an asset during dealer_turn or result phase."""
        player = self.room.players["player0"]
        player.bankroll = 0
        self.eng.bet_asset(self.room, "player0", "watch")

        self.room.phase = "dealer_turn"
        with self.assertRaises(ValueError):
            self.eng.remove_asset(self.room, "player0", "watch")


if __name__ == "__main__":
    unittest.main()
