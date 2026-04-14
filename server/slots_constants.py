"""Slot machine constants and pure game logic for server-side spin validation."""

import random

SLOT_SYMBOLS = [
    {"index": 0, "emoji": "\U0001f352", "name": "Cherry", "value": 5, "weight": 30},
    {"index": 1, "emoji": "\U0001f34b", "name": "Lemon", "value": 10, "weight": 25},
    {"index": 2, "emoji": "\U0001f34a", "name": "Orange", "value": 15, "weight": 20},
    {"index": 3, "emoji": "\U0001f514", "name": "Bell", "value": 25, "weight": 12},
    {"index": 4, "emoji": "\U0001f48e", "name": "Diamond", "value": 50, "weight": 7},
    {"index": 5, "emoji": "7\ufe0f\u20e3", "name": "Seven", "value": 100, "weight": 4},
    {"index": 6, "emoji": "\U0001f4b0", "name": "Jackpot", "value": 250, "weight": 2},
]

TOTAL_WEIGHT = 100

HOUSE_EDGE = 0.08

TRIPLE_MULTIPLIERS = {
    "Cherry": 3, "Lemon": 5, "Orange": 8, "Bell": 15,
    "Diamond": 30, "Seven": 75, "Jackpot": 250,
}

PAIR_MULTIPLIERS = {
    "Cherry": 0.5, "Lemon": 1, "Orange": 1.5, "Bell": 2.5,
    "Diamond": 5, "Seven": 10, "Jackpot": 25,
}

ROUND_OPTIONS = [5, 10, 15]

SLOTS_STARTING_BANKROLL = 10_000


def pick_symbol(random_float: float) -> dict:
    """Pick a symbol by walking cumulative weights.

    Args:
        random_float: A value in [0, 1) (e.g., from random.random()).

    Returns:
        The selected symbol dict from SLOT_SYMBOLS.
    """
    target = random_float * TOTAL_WEIGHT
    cumulative = 0
    for symbol in SLOT_SYMBOLS:
        cumulative += symbol["weight"]
        if target < cumulative:
            return symbol
    return SLOT_SYMBOLS[-1]


def score_reels(symbols: list[dict]) -> dict:
    """Score a set of 3 reel symbols. Returns a payout multiplier.

    Triple (all 3 match): big multiplier (3x-250x bet).
    Pair (any 2 match): small multiplier (0.5x-25x bet).
    No match: 0 (lose the bet).

    Args:
        symbols: List of exactly 3 symbol dicts.

    Returns:
        Dict with keys: multiplier, match_type, matched_symbol.
    """
    a, b, c = symbols

    # Triple
    if a["index"] == b["index"] == c["index"]:
        return {
            "multiplier": TRIPLE_MULTIPLIERS[a["name"]],
            "match_type": "triple",
            "matched_symbol": a,
        }

    # Pair — check in specified order
    if a["index"] == b["index"]:
        return {
            "multiplier": PAIR_MULTIPLIERS[a["name"]],
            "match_type": "pair",
            "matched_symbol": a,
        }
    if b["index"] == c["index"]:
        return {
            "multiplier": PAIR_MULTIPLIERS[b["name"]],
            "match_type": "pair",
            "matched_symbol": b,
        }
    if a["index"] == c["index"]:
        return {
            "multiplier": PAIR_MULTIPLIERS[a["name"]],
            "match_type": "pair",
            "matched_symbol": a,
        }

    # No match — lose the bet
    return {"multiplier": 0, "match_type": "none", "matched_symbol": None}


def generate_spin() -> list[dict]:
    """Generate a random spin of 3 symbols using server-side randomness.

    Returns:
        List of 3 symbol dicts.
    """
    return [pick_symbol(random.random()) for _ in range(3)]


def calculate_payout(multiplier: float, bet: int) -> int:
    """Calculate the payout for a given multiplier and bet amount.

    Args:
        multiplier: The multiplier from score_reels().
        bet: The bet amount in credits.

    Returns:
        The payout amount (floored to integer).
    """
    return int(multiplier * bet)
