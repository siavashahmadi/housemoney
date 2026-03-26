"""Pure card logic for blackjack — deck creation, shuffling, hand evaluation."""

import random

from constants import DECK_COUNT, RANKS, SUITS


def card_value(card: dict) -> int:
    """Return the numeric value of a single card. A=11, J/Q/K=10, else face value."""
    rank = card["rank"]
    if rank == "A":
        return 11
    if rank in ("K", "Q", "J"):
        return 10
    return int(rank)


def create_deck(deck_count: int = DECK_COUNT) -> list[dict]:
    """Create a multi-deck shoe. Each card: {"rank", "suit", "id"}."""
    deck = []
    for d in range(deck_count):
        for suit in SUITS:
            for rank in RANKS:
                deck.append({"rank": rank, "suit": suit, "id": f"{suit}-{rank}-{d}"})
    return deck


def shuffle_deck(deck: list[dict]) -> list[dict]:
    """Fisher-Yates in-place shuffle. Returns the same list."""
    random.shuffle(deck)
    return deck


def hand_value(hand: list[dict]) -> int:
    """Calculate the best hand value. Aces count as 11 unless that would bust."""
    total = 0
    aces = 0
    for card in hand:
        val = card_value(card)
        total += val
        if card["rank"] == "A":
            aces += 1
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    return total


def is_soft(hand: list[dict]) -> bool:
    """Return True if the hand contains an ace still counted as 11."""
    total = 0
    aces = 0
    for card in hand:
        total += card_value(card)
        if card["rank"] == "A":
            aces += 1
    reduced = 0
    while total > 21 and reduced < aces:
        total -= 10
        reduced += 1
    return reduced < aces


def is_blackjack(hand: list[dict]) -> bool:
    """Return True if the hand is a natural blackjack (exactly 2 cards, value 21)."""
    return len(hand) == 2 and hand_value(hand) == 21


def draw_cards(deck: list[dict], count: int) -> tuple[list[dict], list[dict]]:
    """Draw count cards from the top of the deck.

    Returns (drawn_cards, remaining_deck).
    Raises ValueError if insufficient cards remain.
    """
    if count > len(deck):
        raise ValueError(
            f"Cannot draw {count} cards from deck with {len(deck)} remaining"
        )
    return deck[:count], deck[count:]
