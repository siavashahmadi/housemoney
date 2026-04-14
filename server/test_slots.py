"""Unit tests for slots_constants module."""

import unittest
from unittest.mock import patch

from slots_constants import (
    SLOT_SYMBOLS,
    TOTAL_WEIGHT,
    TRIPLE_MULTIPLIERS,
    PAIR_MULTIPLIERS,
    calculate_payout,
    generate_spin,
    pick_symbol,
    score_reels,
)

# Shortcuts
CHERRY = SLOT_SYMBOLS[0]
LEMON = SLOT_SYMBOLS[1]
ORANGE = SLOT_SYMBOLS[2]
BELL = SLOT_SYMBOLS[3]
DIAMOND = SLOT_SYMBOLS[4]
SEVEN = SLOT_SYMBOLS[5]
JACKPOT = SLOT_SYMBOLS[6]


class TestWeights(unittest.TestCase):
    """Verify symbol weight configuration."""

    def test_weights_sum_to_total(self):
        total = sum(s["weight"] for s in SLOT_SYMBOLS)
        self.assertEqual(total, TOTAL_WEIGHT)

    def test_seven_symbols(self):
        self.assertEqual(len(SLOT_SYMBOLS), 7)


class TestPickSymbol(unittest.TestCase):
    """Verify weighted random symbol selection."""

    # Cumulative boundaries: Cherry 0-30, Lemon 30-55, Orange 55-75,
    # Bell 75-87, Diamond 87-94, Seven 94-98, Jackpot 98-100

    def test_zero_returns_cherry(self):
        self.assertEqual(pick_symbol(0.0), CHERRY)

    def test_just_under_cherry_boundary(self):
        self.assertEqual(pick_symbol(0.29), CHERRY)

    def test_exact_cherry_boundary_returns_lemon(self):
        self.assertEqual(pick_symbol(0.30), LEMON)

    def test_just_under_lemon_boundary(self):
        self.assertEqual(pick_symbol(0.549), LEMON)

    def test_exact_lemon_boundary_returns_orange(self):
        self.assertEqual(pick_symbol(0.55), ORANGE)

    def test_bell_at_075(self):
        self.assertEqual(pick_symbol(0.75), BELL)

    def test_diamond_at_087(self):
        self.assertEqual(pick_symbol(0.87), DIAMOND)

    def test_seven_at_094(self):
        self.assertEqual(pick_symbol(0.94), SEVEN)

    def test_jackpot_at_098(self):
        self.assertEqual(pick_symbol(0.98), JACKPOT)

    def test_jackpot_at_high_end(self):
        self.assertEqual(pick_symbol(0.99), JACKPOT)

    def test_fallback_for_one(self):
        self.assertEqual(pick_symbol(1.0), JACKPOT)


class TestScoreReels(unittest.TestCase):
    """Verify multiplier-based scoring for triples, pairs, and no-match."""

    def test_cherry_triple(self):
        result = score_reels([CHERRY, CHERRY, CHERRY])
        self.assertEqual(result["multiplier"], 3)
        self.assertEqual(result["match_type"], "triple")
        self.assertEqual(result["matched_symbol"], CHERRY)

    def test_jackpot_triple(self):
        result = score_reels([JACKPOT, JACKPOT, JACKPOT])
        self.assertEqual(result["multiplier"], 250)
        self.assertEqual(result["match_type"], "triple")

    def test_seven_triple(self):
        result = score_reels([SEVEN, SEVEN, SEVEN])
        self.assertEqual(result["multiplier"], 75)
        self.assertEqual(result["match_type"], "triple")

    def test_pair_at_01(self):
        result = score_reels([BELL, BELL, CHERRY])
        self.assertEqual(result["multiplier"], 2.5)
        self.assertEqual(result["match_type"], "pair")
        self.assertEqual(result["matched_symbol"], BELL)

    def test_pair_at_12(self):
        result = score_reels([CHERRY, BELL, BELL])
        self.assertEqual(result["multiplier"], 2.5)
        self.assertEqual(result["match_type"], "pair")
        self.assertEqual(result["matched_symbol"], BELL)

    def test_pair_at_02(self):
        result = score_reels([BELL, CHERRY, BELL])
        self.assertEqual(result["multiplier"], 2.5)
        self.assertEqual(result["match_type"], "pair")
        self.assertEqual(result["matched_symbol"], BELL)

    def test_diamond_pair(self):
        result = score_reels([DIAMOND, DIAMOND, CHERRY])
        self.assertEqual(result["multiplier"], 5)
        self.assertEqual(result["match_type"], "pair")

    def test_no_match_returns_zero_multiplier(self):
        result = score_reels([CHERRY, ORANGE, BELL])
        self.assertEqual(result["multiplier"], 0)
        self.assertEqual(result["match_type"], "none")
        self.assertIsNone(result["matched_symbol"])

    def test_no_match_high_value_symbols(self):
        result = score_reels([DIAMOND, SEVEN, JACKPOT])
        self.assertEqual(result["multiplier"], 0)
        self.assertEqual(result["match_type"], "none")

    def test_all_triple_multipliers_defined(self):
        for symbol in SLOT_SYMBOLS:
            self.assertIn(symbol["name"], TRIPLE_MULTIPLIERS)

    def test_all_pair_multipliers_defined(self):
        for symbol in SLOT_SYMBOLS:
            self.assertIn(symbol["name"], PAIR_MULTIPLIERS)


class TestGenerateSpin(unittest.TestCase):
    """Verify server-side spin generation with mocked randomness."""

    @patch("slots_constants.random.random")
    def test_returns_three_symbols(self, mock_random):
        mock_random.side_effect = [0.0, 0.0, 0.0]
        result = generate_spin()
        self.assertEqual(len(result), 3)

    @patch("slots_constants.random.random")
    def test_all_cherries(self, mock_random):
        mock_random.side_effect = [0.0, 0.0, 0.0]
        result = generate_spin()
        self.assertEqual(result, [CHERRY, CHERRY, CHERRY])

    @patch("slots_constants.random.random")
    def test_varied_symbols(self, mock_random):
        mock_random.side_effect = [0.0, 0.55, 0.99]
        result = generate_spin()
        self.assertEqual(result, [CHERRY, ORANGE, JACKPOT])


class TestCalculatePayout(unittest.TestCase):
    """Verify payout calculation with multiplier system."""

    def test_break_even_1x(self):
        self.assertEqual(calculate_payout(1, 100), 100)

    def test_cherry_pair_half_back(self):
        self.assertEqual(calculate_payout(0.5, 100), 50)

    def test_diamond_pair_5x(self):
        self.assertEqual(calculate_payout(5, 100), 500)

    def test_floors_fractional(self):
        self.assertEqual(calculate_payout(2.5, 25), 62)  # int(62.5)

    def test_zero_multiplier(self):
        self.assertEqual(calculate_payout(0, 100), 0)

    def test_jackpot_triple_250x(self):
        self.assertEqual(calculate_payout(250, 25), 6250)

    def test_seven_triple_75x(self):
        self.assertEqual(calculate_payout(75, 100), 7500)


if __name__ == "__main__":
    unittest.main()
