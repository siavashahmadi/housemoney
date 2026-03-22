"""Game constants for multiplayer blackjack server."""

# Card constants
SUITS = ["hearts", "diamonds", "clubs", "spades"]
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

# Game config
STARTING_BANKROLL = 10_000
MIN_BET = 25
DECK_COUNT = 6
RESHUFFLE_THRESHOLD = 20
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
