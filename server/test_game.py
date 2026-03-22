"""Unit tests for card_engine and game_logic modules."""

import unittest

from card_engine import (
    card_value,
    create_deck,
    draw_cards,
    hand_value,
    is_blackjack,
    is_soft,
    shuffle_deck,
)
from constants import ASSETS, ASSET_MAP, MIN_BET, STARTING_BANKROLL
from game_logic import GameEngine
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
        # Players should have hands
        self.assertEqual(len(self.room.players["player0"].hand), 2)
        self.assertEqual(len(self.room.players["player1"].hand), 2)
        self.assertEqual(len(self.room.dealer_hand), 2)

    def test_negative_bankroll_can_bet(self):
        """Core mechanic: players can bet even when broke/in debt."""
        self.room.players["player0"].bankroll = -50000
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
        if room.phase != "playing":
            return  # Blackjack was dealt, skip test

        current_pid = room.turn_order[room.current_player_idx]
        player = room.players[current_pid]
        initial_count = len(player.hand)

        events = eng.hit(room, current_pid)
        self.assertEqual(len(player.hand), initial_count + 1)
        self.assertTrue(any(e["type"] == "player_hit" for e in events))

    def test_hit_wrong_turn(self):
        room, eng = self._setup_playing()
        if room.phase != "playing":
            return

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

        if room.phase != "playing":
            return

        current_pid = room.turn_order[room.current_player_idx]
        events = eng.hit(room, current_pid)
        player = room.players[current_pid]

        if hand_value(player.hand) > 21:
            self.assertEqual(player.status, "bust")
            self.assertEqual(player.result, "bust")


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

        if room.phase != "playing":
            return

        first_pid = room.turn_order[room.current_player_idx]
        events = eng.stand(room, first_pid)
        self.assertEqual(room.players[first_pid].status, "standing")

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

        if room.phase != "playing":
            return

        current_pid = room.turn_order[room.current_player_idx]
        events = eng.double_down(room, current_pid)
        player = room.players[current_pid]

        self.assertEqual(player.bet, 200)  # Doubled
        self.assertEqual(len(player.hand), 3)  # Got one more card
        self.assertTrue(player.is_doubled_down)
        self.assertIn(player.status, ("standing", "bust"))

    def test_double_down_requires_two_cards(self):
        room = make_room_with_players(2)
        eng = GameEngine()
        eng.start_game(room)

        room.deck = [
            make_card("5"), make_card("6"),
            make_card("7"),
            make_card("4"), make_card("9"),
            make_card("10"),
            make_card("3"),
            make_card("2"),
        ] + [make_card("2")] * 50

        eng.place_bet(room, "player0", 100)
        eng.place_bet(room, "player1", 100)

        if room.phase != "playing":
            return

        current_pid = room.turn_order[room.current_player_idx]
        # Hit first to get 3 cards
        eng.hit(room, current_pid)

        if room.players[current_pid].status == "bust":
            return

        with self.assertRaises(ValueError):
            eng.double_down(room, current_pid)


class TestDealerLogic(unittest.TestCase):
    def test_determine_outcome_win(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("10"), make_card("9")]  # 19
        player.status = "standing"
        dealer_hand = [make_card("10"), make_card("7")]  # 17

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "win")

    def test_determine_outcome_lose(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("10"), make_card("7")]  # 17
        player.status = "standing"
        dealer_hand = [make_card("10"), make_card("9")]  # 19

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "lose")

    def test_determine_outcome_push(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("10"), make_card("8")]  # 18
        player.status = "standing"
        dealer_hand = [make_card("10"), make_card("8")]  # 18

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "push")

    def test_determine_outcome_dealer_bust(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("10"), make_card("8")]  # 18
        player.status = "standing"
        dealer_hand = [make_card("10"), make_card("6"), make_card("K")]  # 26

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "dealerBust")

    def test_determine_outcome_bust(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("10"), make_card("10"), make_card("5")]  # 25
        player.status = "bust"

        result = eng._determine_outcome(player, [make_card("10"), make_card("7")])
        self.assertEqual(result, "bust")

    def test_determine_outcome_blackjack(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("A"), make_card("K")]
        player.status = "done"
        dealer_hand = [make_card("10"), make_card("9")]

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "blackjack")

    def test_determine_outcome_both_blackjack_push(self):
        eng = GameEngine()
        player = PlayerState(name="Test", player_id="p1")
        player.hand = [make_card("A"), make_card("K")]
        player.status = "done"
        dealer_hand = [make_card("A"), make_card("Q")]

        result = eng._determine_outcome(player, dealer_hand)
        self.assertEqual(result, "push")


class TestPayout(unittest.TestCase):
    def setUp(self):
        self.eng = GameEngine()

    def test_blackjack_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "blackjack")
        self.assertEqual(delta, 150)  # 1.5x

    def test_win_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "win")
        self.assertEqual(delta, 100)

    def test_dealer_bust_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "dealerBust")
        self.assertEqual(delta, 100)

    def test_push_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "push")
        self.assertEqual(delta, 0)

    def test_lose_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "lose")
        self.assertEqual(delta, -100)

    def test_bust_payout(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        delta = self.eng._calculate_payout(player, "bust")
        self.assertEqual(delta, -100)

    def test_payout_with_asset(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        player.betted_assets = [ASSET_MAP["watch"]]  # value=500
        delta = self.eng._calculate_payout(player, "win")
        self.assertEqual(delta, 600)  # 100 + 500

    def test_blackjack_payout_with_asset(self):
        player = PlayerState(name="Test", player_id="p1")
        player.bet = 100
        player.betted_assets = [ASSET_MAP["watch"]]  # value=500
        delta = self.eng._calculate_payout(player, "blackjack")
        self.assertEqual(delta, 900)  # floor(1.5 * 600)


class TestResolveHands(unittest.TestCase):
    def test_assets_returned_on_win(self):
        eng = GameEngine()
        room = make_room_with_players(2)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hand = [make_card("10"), make_card("9")]  # 19
        p0.status = "standing"
        p0.bet = 100
        p0.betted_assets = [dict(ASSET_MAP["watch"])]
        p0.owned_assets["watch"] = False
        p0.bankroll = 0

        p1 = room.players["player1"]
        p1.hand = [make_card("10"), make_card("8")]  # 18
        p1.status = "standing"
        p1.bet = 100

        room.dealer_hand = [make_card("10"), make_card("7")]  # 17
        room.turn_order = ["player0", "player1"]
        room.phase = "dealer_turn"

        events = eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "win")
        self.assertTrue(p0.owned_assets["watch"])  # Returned

    def test_assets_lost_on_loss(self):
        eng = GameEngine()
        room = make_room_with_players(2)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hand = [make_card("10"), make_card("6")]  # 16
        p0.status = "standing"
        p0.bet = 100
        p0.betted_assets = [dict(ASSET_MAP["watch"])]
        p0.owned_assets["watch"] = False

        p1 = room.players["player1"]
        p1.hand = [make_card("10"), make_card("8")]
        p1.status = "standing"
        p1.bet = 100

        room.dealer_hand = [make_card("10"), make_card("9")]  # 19
        room.turn_order = ["player0", "player1"]
        room.phase = "dealer_turn"

        events = eng.resolve_all_hands(room)

        self.assertEqual(p0.result, "lose")
        self.assertFalse(p0.owned_assets["watch"])  # Lost

    def test_stats_updated(self):
        eng = GameEngine()
        room = make_room_with_players(2)
        eng.start_game(room)

        p0 = room.players["player0"]
        p0.hand = [make_card("10"), make_card("9")]
        p0.status = "standing"
        p0.bet = 100
        p0.bankroll = STARTING_BANKROLL

        p1 = room.players["player1"]
        p1.hand = [make_card("10"), make_card("8")]
        p1.status = "standing"
        p1.bet = 100

        room.dealer_hand = [make_card("10"), make_card("7")]
        room.turn_order = ["player0", "player1"]
        room.phase = "dealer_turn"

        eng.resolve_all_hands(room)

        self.assertEqual(p0.hands_played, 1)
        self.assertEqual(p0.win_streak, 1)
        self.assertEqual(p0.lose_streak, 0)
        self.assertEqual(p0.bankroll, STARTING_BANKROLL + 100)
        self.assertEqual(p0.peak_bankroll, STARTING_BANKROLL + 100)


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
        if room.phase != "playing":
            return

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
        if room.phase != "playing":
            return

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


if __name__ == "__main__":
    unittest.main()
