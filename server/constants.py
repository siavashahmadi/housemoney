"""Game constants for multiplayer blackjack server."""

# Card constants
SUITS = ["hearts", "diamonds", "clubs", "spades"]
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

# Game config
STARTING_BANKROLL = 10_000
MIN_BET = 25
MAX_BET = 10_000_000_000
DECK_COUNT = 6
RESHUFFLE_THRESHOLD = 75
BLACKJACK_PAYOUT = 1.5

# Timing (seconds) — used for async dealer turn pacing
DEALER_HIT_DELAY = 0.6
DEALER_STAND_DELAY = 0.4
NEW_ROUND_DELAY = 5.0

# Assets — unlockThreshold is the bankroll level at which the asset becomes bettable
ASSETS = [
    {"id": "watch", "name": "Your Watch", "emoji": "\u231a", "value": 500, "unlock_threshold": 0},
    {"id": "jewelry", "name": "Your Jewelry", "emoji": "\U0001f48d", "value": 2_000, "unlock_threshold": -500},
    {"id": "car", "name": "Your Tesla Model 3", "emoji": "\U0001f697", "value": 35_000, "unlock_threshold": -2_000},
    {"id": "kidney", "name": "A Kidney", "emoji": "\U0001fad8", "value": 50_000, "unlock_threshold": -10_000},
    {"id": "house", "name": "Your House", "emoji": "\U0001f3e0", "value": 250_000, "unlock_threshold": -30_000},
    {"id": "soul", "name": "Your Immortal Soul", "emoji": "\U0001f47b", "value": 666_666, "unlock_threshold": -200_000},
]

ASSET_MAP = {a["id"]: a for a in ASSETS}

DEFAULT_OWNED_ASSETS = {a["id"]: True for a in ASSETS}

# Vig (interest) tiers for borrowed bets
VIG_TIERS = [
    {"min_bankroll": 0, "rate": 0.02},            # >= $0: 2%
    {"min_bankroll": -10_000, "rate": 0.04},       # $0 to -$10K: 4%
    {"min_bankroll": -50_000, "rate": 0.07},       # -$10K to -$50K: 7%
    {"min_bankroll": -250_000, "rate": 0.10},      # -$50K to -$250K: 10%
    {"min_bankroll": -500_000, "rate": 0.15},      # -$250K to -$500K: 15%
    {"min_bankroll": -1_000_000, "rate": 0.20},    # -$500K to -$1M: 20%
    {"min_bankroll": -5_000_000, "rate": 0.275},   # -$1M to -$5M: 27.5%
    {"min_bankroll": float("-inf"), "rate": 0.40},  # Below -$5M: 40%
]


def get_vig_rate(bankroll: int) -> float:
    """Return the vig rate for a given bankroll level."""
    for tier in VIG_TIERS:
        if bankroll >= tier["min_bankroll"]:
            return tier["rate"]
    return VIG_TIERS[-1]["rate"]

# Chip denominations (server validates total bet, not individual chips)
# Client-side chips: 25, 100, 500, 1K, 5K, 25K, 100K, 500K, 1M

# Quick chat messages — predefined messages players can send in multiplayer
QUICK_CHAT_MESSAGES = {
    "nice_hand": "Nice hand!",
    "rip": "RIP",
    "youre_insane": "You're insane",
    "all_in_baby": "ALL IN BABY",
    "ouch": "Ouch...",
    "lets_go": "LET'S GO!",
    "one_more": "One more hand...",
    "gg": "GG",
}
