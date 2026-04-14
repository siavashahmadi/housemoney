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
DEALER_REVEAL_DELAY = 1.2  # Pause after revealing the hole card before drawing/resolving
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
# Dealer trash talk lines — ported from src/constants/dealerLines.js for multiplayer
# Dynamic lines use {placeholder} format strings. Static lines are plain strings.
DEALER_LINES = {
    "greeting": [
        "Welcome to the table. Your wallet won't be leaving.",
        "Ah, fresh meat. I mean... welcome, valued guest.",
        "Take a seat. Stay a while. Stay forever, actually.",
        "The house always wins. But hey, prove me wrong.",
        "Another brave soul. Let's see how long this lasts.",
        "Welcome! The exit is behind you. You won't be using it.",
        "Pull up a chair. This is going to be fun. For me.",
        "New player? Don't worry, we'll take good care of your money.",
        "The odds are in your favor. Just kidding. They never are.",
        "Let's play. I've got all night. Do you have all your savings?",
    ],
    "playerLose": [
        "Tough break. Well, not really. I saw that coming.",
        "You know what they say — the house always wins. They say it because it's true.",
        "Better luck next time. Or not. I don't really care.",
        "That's unfortunate. For you. I'm doing great.",
        "Ouch. Want a tissue? I'm fresh out, but I can offer you more debt.",
        "The math was never in your favor. Neither was the luck.",
        "I'd say 'nice try' but... was it?",
        "Another one bites the dust. Music to my ears.",
        "You're really committed to losing, aren't you? I respect the dedication.",
        "That hand was doomed from the start. Kind of like your bankroll.",
    ],
    "playerBust": [
        "21 was the goal. Not 25. But who's counting? Oh wait, I am.",
        "You went over. Way over. Like, impressively over.",
        "BUST! The most beautiful word in the English language.",
        "Hit me, you said. Hit me again, you said. Look where that got you.",
        "Greed is a funny thing. Funny for me, expensive for you.",
        "The card gods giveth, and then they busteth.",
        "Pro tip: stop hitting before you explode. Revolutionary, I know.",
        "You know what 22 gets you? Nothing. Absolutely nothing.",
        "Bold strategy, going over 21. Innovative. Wrong, but innovative.",
        "I admire your optimism. Not your math skills, but your optimism.",
    ],
    "playerBroke": [
        "Zero dollars. But don't worry — we have a very generous credit program.",
        "Bankrupt! But the night is young. And our interest rates are... flexible.",
        "Congratulations, you're officially broke! Want to keep going? Of course you do.",
        "Rock bottom? Nah, we can go deeper. Much deeper.",
        "$0. A fresh start! ...With borrowed money, but still.",
        "You've hit zero. Most people leave now. You're not most people, are you?",
        "Empty pockets, full spirit. I like it. The casino likes it even more.",
        "Broke already? That's almost a record. Almost.",
    ],
    "playerDebt": [
        "You owe us money and you're still here? Bold move.",
        "Playing with borrowed money. The casino's favorite kind of player.",
        "Negative bankroll, positive attitude. That's the spirit!",
        "Every hand you play digs a little deeper. Keep digging.",
        "The debt keeps growing. Like a plant, but sadder.",
        "You're in the red. Way in the red. The reddest red.",
        "Most people stop when they're broke. You? You're built different.",
        "The deeper you go, the harder it is to climb out. Just saying.",
        "At this point, you're basically playing with imaginary money. Our favorite kind.",
        "Your debt called. It wants to know if you're bringing friends.",
    ],
    "assetBet": [
        "You're betting your {asset_name}. This is the content I signed up for.",
        "Your {asset_name}? On a card game? I love this place.",
        "The {asset_name} is on the table. This just got interesting.",
        "Putting up the {asset_name}. You've either got nerves of steel or no brain cells.",
        "Your {asset_name}! Bold. Reckless. Beautiful.",
        "I can't believe you're betting your {asset_name}. Actually, yes I can.",
        "The {asset_name}. Wow. You're really all in on this, huh?",
        "Betting the {asset_name}? I'm grabbing popcorn for this one.",
        "Your {asset_name} against the house. History says this ends badly.",
        "The {asset_name} is in play. No takebacks. Well, unless you win. Which... probably not.",
    ],
    "playerWin": [
        "Fine. Take it. See if I care.",
        "You got lucky. Emphasis on 'lucky.' Don't get used to it.",
        "A win! Mark it on the calendar. Frame it. It won't happen often.",
        "Congratulations. The house will recover. You might not.",
        "Well played. I'm contractually obligated to say that.",
        "Enjoy it while it lasts. And it won't last.",
        "The universe made an error. It'll correct itself soon.",
        "Winner winner. Don't spend it all in one place. Like here.",
        "You won? Huh. Even a stopped clock is right twice a day.",
        "Take your chips. I'll be taking them back shortly.",
    ],
    "playerBlackjack": [
        "Blackjack. Even a broken clock... no, that's actually impressive.",
        "A natural 21! The odds were 4.8%. Don't expect a repeat.",
        "BLACKJACK! Savor this moment. Screenshot it. It's rare.",
        "21 on the deal. I'm not mad, I'm just... no, I'm mad.",
        "Natural blackjack. The casino gods smile upon you. Temporarily.",
        "Well well well. Look at you. The golden child. For now.",
        "Blackjack! 3:2 payout. Enjoy every penny. You earned exactly this one.",
        "A natural. Beautiful. Disgusting, but beautiful.",
    ],
    "bigBet": [
        "${bet_amount:,} on the table! Now we're talking.",
        "A ${bet_amount:,} bet! Ladies and gentlemen, we have a high roller!",
        "${bet_amount:,}? You've got guts. Let's see if you've got luck.",
        "Big money, big money! The pit boss is watching now.",
        "Now THAT'S a bet. I can feel the adrenaline from here.",
        "Going big! The casino thanks you in advance.",
        "High roller alert! Someone get this player a cocktail.",
        "That's a fat stack. Let's see if it gets fatter or disappears.",
        "${bet_amount:,} on the line. My kind of player.",
        "Whale alert! The floor manager just perked up.",
    ],
    "doubleDownLoss": [
        "Doubled down and doubled your regret. Classic.",
        "You doubled the bet AND lost. Two mistakes for the price of... well, double.",
        "Double down? More like double ouch.",
        "Brave enough to double down. Not lucky enough to win. Tragic.",
        "You doubled your bet and your disappointment. Efficiency!",
        "The double down: twice the risk, twice the pain, zero the gain.",
        "Doubled and crumbled. A tale as old as time.",
        "You really committed to losing that one. Double or nothing became double AND nothing.",
    ],
    "winStreak": [
        "{win_streak} wins in a row? This is getting uncomfortable.",
        "Another win? The pit boss is giving me the look.",
        "You're on fire! Someone call security. I mean, the fire department.",
        "A streak! Enjoy it. The math will catch up. It always does.",
        "{win_streak} straight wins. Statistically, you're due for a crash.",
        "Keep winning like this and I'll be the one in debt.",
        "Hot streak! The cameras are definitely zooming in on you now.",
        "You're winning too much. This isn't how this is supposed to go.",
        "I'm starting to sweat. Not because of you. It's... warm in here.",
        "The streak continues. The house does NOT like streaks.",
    ],
    "loseStreak": [
        "{lose_streak} losses in a row. But who's counting? Oh right, the casino is.",
        "Another loss? I'm so sorry. Just kidding, I'm not.",
        "The losing continues! Consistency is key, they say.",
        "You're on a streak! ...The wrong kind, but still.",
        "{lose_streak} in a row. That's commitment to a bit.",
        "Keep going. I'm sure the next one will be different. It won't, but sure.",
        "The losing streak is alive and well. Just like my entertainment.",
        "At this point, losing is your brand. Own it.",
        "Have you considered... winning? Just a thought.",
        "L after L after L. You're collecting them like stamps.",
    ],
    "assetLost": [
        "And the {asset_name} is gone. Just like that. Poof.",
        "Say goodbye to your {asset_name}. It belongs to the house now.",
        "Your {asset_name}... I'll take good care of it. Actually no, I'll sell it.",
        "The {asset_name} is ours now. Thank you for your generous donation.",
        "Lost your {asset_name}. The look on your face? Priceless.",
        "Gone. Your {asset_name} is gone. How does that feel? Don't answer, I can see it.",
        "The {asset_name} has left the building. Along with your dignity.",
        "Your {asset_name}. Our {asset_name}. That's how this works.",
        "And just like that, no more {asset_name}. The house sends its regards.",
        "Oh no... your {asset_name}... anyway, next hand?",
    ],
    "deepDebt": [
        "You're ${abs_debt:,} in debt. At what point do we call this an addiction?",
        "You've passed the point of no return about fifty hands ago.",
        "The debt is so deep I can't even see the bottom anymore.",
        "You owe more than some countries' GDP. Impressive, in a horrifying way.",
        "At this level of debt, it's not gambling anymore. It's performance art.",
        "${abs_debt:,} in the hole. The loan sharks are circling.",
        "You know this is fake money, right? ...It is fake, right?",
        "The accountants are going to need a bigger spreadsheet for your tab.",
        "Rock bottom has a basement, and you found the sub-basement.",
        "Your debt has its own zip code at this point.",
    ],
    "playerSplit": [
        "Splitting, huh? Twice the hands, twice the ways to lose.",
        "Oh good, you want to lose FASTER.",
        "Two hands means double the bet. I love your ambition.",
        "More hands, more chances for me. I mean you. Definitely you.",
        "Splitting pairs? Bold move. Let's see how this plays out.",
        "The only thing you're doubling here is my entertainment.",
        "Split Aces? That's the smartest thing you've done all night. Don't get used to it.",
        "Four hands?! Someone call the pit boss, we've got a maniac over here.",
    ],
    "debtActivated": [
        "Welcome to our lending program. The terms are... flexible.",
        "Sign here, here, and here. Just kidding, we don't do paperwork.",
        "Tony will be in touch about the repayment schedule.",
        "Smart choice. Well, not 'smart' exactly, but a choice.",
        "The house always extends credit. The house always collects.",
        "You're officially playing with money that doesn't exist. My favorite kind.",
    ],
    # Multiplayer-specific lines referencing player names
    "multiplayerTaunt": [
        "{player_name} just bet ${bet_amount:,} with a negative bankroll. That's called 'denial.'",
        "And {player_name} goes down. Next!",
        "{player_name} is splitting? Bold move with an audience.",
        "Everyone say goodbye to {player_name}'s money.",
        "{player_name} just went all in. I love this table.",
        "Ladies and gentlemen, {player_name} is officially broke. Again.",
        "{player_name} thinks they can turn this around. Adorable.",
        "Two players splitting in the same round? The casino loves this.",
    ],
}

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
