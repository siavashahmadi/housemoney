"""Server-side game engine for multiplayer blackjack.

The GameEngine operates on GameRoom/PlayerState instances, mutating them in place.
Each method returns a list of event dicts for the WebSocket layer to broadcast.
"""

import asyncio
import math
import random

from card_engine import (
    card_value,
    create_deck,
    draw_cards,
    hand_value,
    is_blackjack,
    is_soft,
    shuffle_deck,
)
from constants import (
    ASSET_MAP,
    ASSETS,
    BLACKJACK_PAYOUT,
    DEALER_HIT_DELAY,
    DEALER_LINES,
    DEALER_STAND_DELAY,
    MAX_BET,
    MIN_BET,
    RESHUFFLE_THRESHOLD,
    get_vig_rate,
)
from game_room import GameRoom, PlayerState, get_active_players, reset_round_state

MAX_SPLIT_HANDS = 4


# --- Dealer Trash Talk ---


def _select_dealer_message(category: str, shown_lines: dict, context: dict | None = None) -> tuple[str, dict]:
    """Pick a dealer line from category, avoiding repeats until all shown."""
    lines = DEALER_LINES.get(category, [])
    if not lines:
        return "", shown_lines

    shown = shown_lines.get(category, [])
    if len(shown) >= len(lines):
        available = list(range(len(lines)))
        shown = []
    else:
        available = [i for i in range(len(lines)) if i not in shown]

    idx = random.choice(available)
    shown = [*shown, idx]

    line = lines[idx]
    if context:
        try:
            line = line.format(**context)
        except (KeyError, IndexError, ValueError):
            pass  # fallback to raw string if context keys missing

    return line, {**shown_lines, category: shown}


def _determine_dealer_category(
    player: "PlayerState", trigger: str, prev_bankroll: int | None = None
) -> tuple[str | None, dict]:
    """Determine which dealer line category to use based on game event."""
    if trigger == "resolve":
        result = player.result
        any_doubled = any(h.get("is_doubled_down") for h in player.hands)
        is_loss = result in ("lose", "bust")
        is_win = result in ("win", "dealerBust", "blackjack")

        if result == "bust" and any_doubled:
            return "doubleDownLoss", {}
        if result == "bust":
            return "playerBust", {}
        if result == "blackjack":
            return "playerBlackjack", {}
        if is_loss and player.betted_assets:
            return "assetLost", {"asset_name": player.betted_assets[0]["name"]}
        if is_loss and any_doubled:
            return "doubleDownLoss", {}
        if is_loss and player.bankroll <= 0 and (prev_bankroll or 0) > 0:
            return "playerBroke", {}
        if is_loss and player.bankroll < -100_000:
            return "deepDebt", {"abs_debt": abs(player.bankroll)}
        if is_win and player.win_streak >= 3:
            return "winStreak", {"win_streak": player.win_streak}
        if is_loss and player.lose_streak >= 3:
            return "loseStreak", {"lose_streak": player.lose_streak}
        if is_win:
            return "playerWin", {}
        if is_loss:
            return "playerLose", {}
        return None, {}

    if trigger == "deal":
        if player.bankroll < 0:
            return "playerDebt", {}
        total_bet = sum(h["bet"] for h in player.hands) if player.hands else player.bet
        if total_bet > 5000 and player.bankroll >= 0:
            return "bigBet", {"bet_amount": total_bet}
        return None, {}

    if trigger == "split":
        return "playerSplit", {}

    if trigger == "betAsset":
        if player.betted_assets:
            return "assetBet", {"asset_name": player.betted_assets[-1]["name"]}
        return None, {}

    if trigger == "debtActivated":
        return "debtActivated", {}

    return None, {}


def _pick_commentary_target(
    room: "GameRoom", prev_bankrolls: dict | None = None
) -> tuple["PlayerState | None", int | None]:
    """Select the most interesting player for dealer to comment on.

    Returns (player, prev_bankroll) or (None, None).
    Priority: bust+doubled > bust > blackjack > asset loss > first broke > deep debt
              > streaks > generic win/loss.
    """
    active_pids = [pid for pid in room.turn_order if pid in room.players]
    if not active_pids:
        return None, None

    # Score each player by how interesting their result is
    best_player = None
    best_score = -1
    best_prev = None

    for pid in active_pids:
        player = room.players[pid]
        prev = (prev_bankrolls or {}).get(pid, 0)
        score = 0
        result = player.result

        if result == "bust" and any(h.get("is_doubled_down") for h in player.hands):
            score = 10
        elif result == "bust":
            score = 9
        elif result == "blackjack":
            score = 8
        elif result in ("lose", "bust") and player.betted_assets:
            score = 7
        elif result in ("lose", "bust") and player.bankroll <= 0 and prev > 0:
            score = 6
        elif result in ("lose", "bust") and player.bankroll < -100_000:
            score = 5
        elif player.win_streak >= 3 or player.lose_streak >= 3:
            score = 4
        elif result in ("win", "dealerBust"):
            score = 2
        elif result in ("lose", "bust"):
            score = 1

        if score > best_score:
            best_score = score
            best_player = player
            best_prev = prev

    return best_player, best_prev


def create_hand_dict(cards=None, bet=0):
    """Create a new hand dict with default values."""
    return {
        "cards": cards if cards is not None else [],
        "bet": bet,
        "is_doubled_down": False,
        "is_split_aces": False,
        "status": "playing",
        "result": None,
        "payout": 0,
    }


class GameEngine:
    """Server-side blackjack game logic."""

    # --- Vig Helper ---

    def _apply_vig(self, player: "PlayerState", additional_bet: int, other_committed: int = 0) -> "PlayerState":
        """Compute and deduct vig on the borrowed portion of an additional bet.

        other_committed: sum of bets already placed on other hands (for split/double)
        that reduce the available bankroll for this new bet.
        """
        effective_bankroll = max(0, player.bankroll - other_committed)
        borrowed = max(0, additional_bet - effective_bankroll)
        if borrowed > 0:
            rate = get_vig_rate(player.bankroll)
            vig = math.floor(borrowed * rate)
            if vig > 0:
                player.bankroll -= vig
                player.vig_amount += vig
                player.vig_rate = rate
                player.total_vig_paid += vig
        return player

    # --- Phase Transitions ---

    def start_game(self, room: GameRoom) -> list[dict]:
        """Transition from lobby to first betting phase. Initialize deck."""
        room.deck = shuffle_deck(create_deck())
        room.round_number = 0
        return self.start_betting_phase(room)

    def start_betting_phase(self, room: GameRoom) -> list[dict]:
        """Begin a new betting round. Reset per-round state."""
        room.round_number += 1
        room.dealer_hand = []
        room.current_player_idx = 0
        room.turn_order = []

        # Reshuffle if deck is low
        if len(room.deck) < RESHUFFLE_THRESHOLD:
            room.deck = shuffle_deck(create_deck())

        # Reset each connected player for the new round
        for player in room.players.values():
            if player.connected:
                reset_round_state(player)

        room.phase = "betting"

        return [
            {
                "type": "betting_phase",
                "round": room.round_number,
                "state": self.get_room_state(room),
            }
        ]

    # --- Betting ---

    # DEBT GATE FLOW: Cash bets blocked when bankroll <= 0 and not in_debt_mode.
    # Player must bet assets (which push bankroll negative) or take a loan first.
    # Sequence: cash → $0 → asset gate → bet assets → lose → loan gate → debt mode.
    # See client gameReducer.js for full flow documentation.

    def place_bet(self, room: GameRoom, player_id: str, amount: int) -> list[dict]:
        """Validate and record a player's bet. Auto-deals when all bets are in."""
        player = self._validate_betting(room, player_id)

        if not isinstance(amount, int) or amount < 0:
            raise ValueError("Invalid bet amount")
        if amount > MAX_BET:
            raise ValueError(f"Maximum bet is ${MAX_BET:,}")
        if amount < MIN_BET and amount > 0:
            raise ValueError(f"Bet must be at least ${MIN_BET}")
        if amount == 0 and not player.betted_assets:
            raise ValueError(f"Bet must be at least ${MIN_BET}")
        # Debt gate: block cash bets when broke and not in debt mode
        if player.bankroll <= 0 and amount > 0 and not player.in_debt_mode:
            has_assets = any(player.owned_assets.values())
            if has_assets:
                raise ValueError("You're broke. Bet an asset to continue.")
            else:
                raise ValueError("Take a loan to continue playing.")
        # Cap bet at bankroll when not in debt mode
        if amount > player.bankroll and not player.in_debt_mode:
            raise ValueError("Bet cannot exceed your bankroll")

        player.bet = amount
        player.status = "ready"

        events = [
            {
                "type": "bet_placed",
                "player_id": player_id,
                "player_name": player.name,
                "amount": amount,
                "state": self.get_room_state(room),
            }
        ]

        # Check if all connected players have bet
        active = [p for p in room.players.values() if p.connected]
        if all(p.status == "ready" for p in active):
            events.extend(self.deal_initial_cards(room))

        return events

    def bet_asset(self, room: GameRoom, player_id: str, asset_id: str) -> list[dict]:
        """Bet an asset. Valid during betting OR playing phase (per spec Section 3.4)."""
        if room.phase not in ("betting", "playing"):
            raise ValueError("Cannot bet assets in this phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        # During playing phase, must be this player's turn
        if room.phase == "playing":
            current = self._get_current_player_id(room)
            if current != player_id:
                raise ValueError("Not your turn")

        if asset_id not in ASSET_MAP:
            raise ValueError("Unknown asset")

        asset = ASSET_MAP[asset_id]

        if not player.owned_assets.get(asset_id):
            raise ValueError("You don't own this asset")

        if any(a["id"] == asset_id for a in player.betted_assets):
            raise ValueError("Asset already bet")

        # Assets unlock when bankroll drops TO or BELOW the threshold
        # (desperation betting). Thresholds are negative, e.g. car unlocks
        # at -$2,000. If bankroll is ABOVE the threshold, the player isn't
        # desperate enough yet.
        if player.bankroll > asset["unlock_threshold"]:
            raise ValueError(
                f"'{asset['name']}' unlocks when your bankroll drops to "
                f"${asset['unlock_threshold']:,} or below"
            )

        player.owned_assets[asset_id] = False
        player.betted_assets.append(dict(asset))

        # Dealer trash talk on asset bet
        cat, ctx = _determine_dealer_category(player, "betAsset")
        if cat:
            ctx["player_name"] = player.name
            room.dealer_message, room.shown_dealer_lines = _select_dealer_message(
                cat, room.shown_dealer_lines, ctx
            )

        return [
            {
                "type": "asset_bet",
                "player_id": player_id,
                "player_name": player.name,
                "asset_id": asset_id,
                "asset_name": asset["name"],
                "state": self.get_room_state(room),
            }
        ]

    def take_loan(self, room: GameRoom, player_id: str) -> list[dict]:
        """Activate debt mode for a player who is broke with no assets."""
        if room.phase not in ("betting", "playing"):
            raise ValueError("Cannot take a loan in this phase")

        if room.phase == "playing":
            current_pid = room.turn_order[room.current_player_idx] if room.turn_order else None
            if current_pid != player_id:
                raise ValueError("Not your turn")

        player = room.players.get(player_id)
        if not player or not player.connected:
            raise ValueError("Player not found")
        if player.bankroll > 0:
            raise ValueError("You still have money")
        if player.in_debt_mode:
            raise ValueError("Already in debt mode")

        # During the playing phase the asset gate does not apply — the player
        # may need a loan mid-hand to cover a double-down or split.
        if room.phase == "betting":
            has_unlocked_assets = any(
                player.owned_assets.get(a["id"], False)
                and player.bankroll <= a["unlock_threshold"]
                and a["id"] not in [ba["id"] for ba in player.betted_assets]
                for a in ASSETS
            )
            if has_unlocked_assets:
                raise ValueError("You still have assets to bet")

        player.in_debt_mode = True

        # Dealer trash talk on debt activation
        cat, ctx = _determine_dealer_category(player, "debtActivated")
        if cat:
            ctx["player_name"] = player.name
            room.dealer_message, room.shown_dealer_lines = _select_dealer_message(
                cat, room.shown_dealer_lines, ctx
            )

        return [
            {
                "type": "loan_taken",
                "player_id": player_id,
                "player_name": player.name,
                "state": self.get_room_state(room),
            }
        ]

    # --- Dealing ---

    def deal_initial_cards(self, room: GameRoom) -> list[dict]:
        """Deal 2 cards to each player + dealer. Check for blackjacks."""
        active_pids = [pid for pid, p in room.players.items() if p.connected and p.status == "ready"]

        if not active_pids:
            # No one bet — restart betting phase
            return self.start_betting_phase(room)

        room.turn_order = active_pids
        num_players = len(active_pids)

        # Deal: player1-card1, player2-card1, ..., dealer-card1,
        #        player1-card2, player2-card2, ..., dealer-card2
        total_cards_needed = (num_players + 1) * 2
        drawn, room.deck = draw_cards(room.deck, total_cards_needed)

        # Distribute cards — create hand dicts
        for i, pid in enumerate(active_pids):
            player = room.players[pid]
            cards = [drawn[i], drawn[num_players + 1 + i]]
            player.hands = [create_hand_dict(cards, player.bet)]
            player.active_hand_index = 0
            player.status = "playing"

        room.dealer_hand = [drawn[num_players], drawn[num_players * 2 + 1]]

        # Calculate and apply vig for each player's borrowed portion
        for pid in active_pids:
            player = room.players[pid]
            hand = player.hands[0]
            self._apply_vig(player, hand["bet"])

        # Dealer trash talk on deal — pick the most interesting bettor
        deal_target = None
        deal_best_score = -1
        for pid in active_pids:
            p = room.players[pid]
            cat, _ = _determine_dealer_category(p, "deal")
            score = 2 if cat == "playerDebt" else (1 if cat == "bigBet" else 0)
            if score > deal_best_score:
                deal_best_score = score
                deal_target = p
        if deal_target:
            cat, ctx = _determine_dealer_category(deal_target, "deal")
            if cat:
                ctx["player_name"] = deal_target.name
                room.dealer_message, room.shown_dealer_lines = _select_dealer_message(
                    cat, room.shown_dealer_lines, ctx
                )

        # Check for blackjacks
        dealer_bj = is_blackjack(room.dealer_hand)
        events = []

        for pid in active_pids:
            player = room.players[pid]
            hand = player.hands[0]
            player_bj = is_blackjack(hand["cards"])

            if player_bj and dealer_bj:
                player.status = "done"
                player.result = "push"
                hand["status"] = "done"
                hand["result"] = "push"
            elif player_bj:
                player.status = "done"
                player.result = "blackjack"
                hand["status"] = "done"
                hand["result"] = "blackjack"
            elif dealer_bj:
                player.status = "done"
                player.result = "lose"
                hand["status"] = "done"
                hand["result"] = "lose"

        # If dealer has blackjack or all players are done, skip to resolution
        all_done = all(room.players[pid].status == "done" for pid in active_pids)

        if all_done:
            room.phase = "result"
            events.append(
                {
                    "type": "cards_dealt",
                    "state": self.get_room_state(room, hide_dealer_hole=False),
                }
            )
            events.extend(self.resolve_all_hands(room))
        else:
            room.phase = "playing"
            # Find first active player
            room.current_player_idx = 0
            self._skip_done_players(room)

            events.append(
                {
                    "type": "cards_dealt",
                    "state": self.get_room_state(room),
                }
            )
            current_pid = self._get_current_player_id(room)
            if current_pid:
                events.append({"type": "your_turn", "player_id": current_pid})

        return events

    # --- Player Actions ---

    def hit(self, room: GameRoom, player_id: str) -> list[dict]:
        """Draw a card for the active hand. Check for bust / auto-stand on 21."""
        player = self._validate_player_turn(room, player_id)
        hand_index = player.active_hand_index
        hand = player.hands[hand_index]

        if hand["is_doubled_down"]:
            raise ValueError("Cannot hit after doubling down")
        if hand["is_split_aces"]:
            raise ValueError("Cannot hit split aces")

        drawn, room.deck = draw_cards(room.deck, 1)
        hand["cards"].append(drawn[0])

        events = []
        val = hand_value(hand["cards"])

        if val > 21:
            hand["status"] = "bust"
            hand["result"] = "bust"
            has_more = self._advance_hand(player)
            events.append(
                {
                    "type": "player_hit",
                    "player_id": player_id,
                    "card": drawn[0],
                    "hand_index": hand_index,
                    "hand_value": val,
                    "bust": True,
                    "state": self.get_room_state(room),
                }
            )
            if has_more:
                events.append({"type": "your_turn", "player_id": player_id})
            else:
                events.extend(self._advance_turn(room))
        elif val == 21:
            # Auto-stand on 21
            hand["status"] = "standing"
            has_more = self._advance_hand(player)
            events.append(
                {
                    "type": "player_hit",
                    "player_id": player_id,
                    "card": drawn[0],
                    "hand_index": hand_index,
                    "hand_value": val,
                    "bust": False,
                    "state": self.get_room_state(room),
                }
            )
            if has_more:
                events.append({"type": "your_turn", "player_id": player_id})
            else:
                events.extend(self._advance_turn(room))
        else:
            events.append(
                {
                    "type": "player_hit",
                    "player_id": player_id,
                    "card": drawn[0],
                    "hand_index": hand_index,
                    "hand_value": val,
                    "bust": False,
                    "state": self.get_room_state(room),
                }
            )

        return events

    def stand(self, room: GameRoom, player_id: str) -> list[dict]:
        """Player stands on the active hand. Advance to next hand or next player."""
        player = self._validate_player_turn(room, player_id)
        hand_index = player.active_hand_index
        hand = player.hands[hand_index]

        hand["status"] = "standing"
        has_more = self._advance_hand(player)

        events = [
            {
                "type": "player_stand",
                "player_id": player_id,
                "hand_index": hand_index,
                "state": self.get_room_state(room),
            }
        ]
        if has_more:
            events.append({"type": "your_turn", "player_id": player_id})
        else:
            events.extend(self._advance_turn(room))

        return events

    def double_down(self, room: GameRoom, player_id: str) -> list[dict]:
        """Double bet on the active hand, draw one card, auto-stand."""
        player = self._validate_player_turn(room, player_id)
        hand_index = player.active_hand_index
        hand = player.hands[hand_index]

        if len(hand["cards"]) != 2:
            raise ValueError("Can only double down on first two cards")
        if hand["is_split_aces"]:
            raise ValueError("Cannot double down on split aces")
        if hand["bet"] == 0:
            raise ValueError("Cannot double down on a zero bet")
        if player.bankroll - hand["bet"] < 0 and not player.in_debt_mode:
            raise ValueError("Cannot double down — insufficient funds")

        # Calculate vig on the additional bet (doubling the existing bet)
        additional_bet = hand["bet"]
        total_committed = sum(h["bet"] for i, h in enumerate(player.hands) if i != hand_index)
        self._apply_vig(player, additional_bet, other_committed=total_committed)

        hand["bet"] *= 2
        hand["is_doubled_down"] = True

        drawn, room.deck = draw_cards(room.deck, 1)
        hand["cards"].append(drawn[0])

        val = hand_value(hand["cards"])

        if val > 21:
            hand["status"] = "bust"
            hand["result"] = "bust"
        else:
            hand["status"] = "standing"

        has_more = self._advance_hand(player)

        events = [
            {
                "type": "player_double_down",
                "player_id": player_id,
                "card": drawn[0],
                "hand_index": hand_index,
                "new_bet": hand["bet"],
                "hand_value": val,
                "bust": val > 21,
                "state": self.get_room_state(room),
            }
        ]
        if has_more:
            events.append({"type": "your_turn", "player_id": player_id})
        else:
            events.extend(self._advance_turn(room))

        return events

    def split(self, room: GameRoom, player_id: str) -> list[dict]:
        """Split the active hand into two hands."""
        player = self._validate_player_turn(room, player_id)

        if len(player.hands) >= MAX_SPLIT_HANDS:
            raise ValueError("Maximum split hands reached")

        hand_index = player.active_hand_index
        hand = player.hands[hand_index]

        if len(hand["cards"]) != 2:
            raise ValueError("Can only split with exactly two cards")
        if hand["is_split_aces"]:
            raise ValueError("Cannot re-split aces")
        if hand["cards"][0]["rank"] != hand["cards"][1]["rank"]:
            raise ValueError("Can only split cards of equal rank")
        if hand["bet"] == 0:
            raise ValueError("Cannot split a zero bet")

        drawn, room.deck = draw_cards(room.deck, 2)
        is_aces = hand["cards"][0]["rank"] == "A"
        original_bet = hand["bet"]

        # Calculate vig on the new hand's bet (borrowed portion)
        total_committed = sum(h["bet"] for i, h in enumerate(player.hands) if i != hand_index)
        self._apply_vig(player, original_bet, other_committed=total_committed)

        # Create two new hands from the split
        card1 = hand["cards"][0]
        card2 = hand["cards"][1]

        new_hand1 = create_hand_dict([card1, drawn[0]], original_bet)
        new_hand2 = create_hand_dict([card2, drawn[1]], original_bet)

        if is_aces:
            new_hand1["is_split_aces"] = True
            new_hand2["is_split_aces"] = True
            new_hand1["status"] = "standing"
            new_hand2["status"] = "standing"

        # Replace current hand and insert new hand after it
        player.hands[hand_index] = new_hand1
        player.hands.insert(hand_index + 1, new_hand2)

        events = []

        if is_aces:
            # Both hands auto-stand, advance past them
            has_more = self._advance_hand(player)
            if has_more:
                events.append({"type": "your_turn", "player_id": player_id})
            else:
                events.extend(self._advance_turn(room))
        else:
            if hand_value(new_hand1["cards"]) == 21:
                new_hand1["status"] = "standing"
            if hand_value(new_hand2["cards"]) == 21:
                new_hand2["status"] = "standing"
            # Advance past any auto-stood hands
            if player.hands[player.active_hand_index]["status"] != "playing":
                has_more = self._advance_hand(player)
                if has_more:
                    events.append({"type": "your_turn", "player_id": player_id})
                else:
                    events.extend(self._advance_turn(room))

        # Dealer trash talk on split
        cat, ctx = _determine_dealer_category(player, "split")
        if cat:
            ctx["player_name"] = player.name
            room.dealer_message, room.shown_dealer_lines = _select_dealer_message(
                cat, room.shown_dealer_lines, ctx
            )

        events.insert(0, {
            "type": "player_split",
            "player_id": player_id,
            "hand_index": hand_index,
            "active_hand_index": player.active_hand_index,
            "state": self.get_room_state(room),
        })

        return events

    # --- Hand Advancement ---

    def _advance_hand(self, player: PlayerState) -> bool:
        """Advance to the next playable hand for this player.

        Returns True if the player has more hands to play, False if all hands are done.
        """
        next_idx = player.active_hand_index + 1
        while next_idx < len(player.hands):
            if player.hands[next_idx]["status"] == "playing":
                player.active_hand_index = next_idx
                return True
            next_idx += 1

        # All hands done
        all_bust = all(h["status"] == "bust" for h in player.hands)
        if all_bust:
            player.status = "bust"
            player.result = "bust"
        else:
            player.status = "standing"
        return False

    # --- Mid-Game Departure ---

    def handle_player_departure(self, room: GameRoom, player_id: str) -> list[dict]:
        """Handle a player disconnecting or leaving during an active game.

        Returns events to broadcast. The caller is responsible for marking
        the player as disconnected/removing them BEFORE calling this.
        """
        if room.phase == "playing":
            current_pid = self._get_current_player_id(room)
            if current_pid == player_id:
                # It was this player's turn — forfeit bets then advance
                player = room.players.get(player_id)
                if player and player.status not in ("done", "bust"):
                    for i, hand in enumerate(player.hands):
                        if hand["status"] in ("playing", "standing"):
                            hand["status"] = "bust"
                            hand["result"] = "bust"
                            asset_value = sum(a["value"] for a in player.betted_assets) if i == 0 else 0
                            hand["payout"] = -(hand["bet"] + asset_value)
                            player.bankroll += hand["payout"]
                    player.status = "bust"
                    player.result = "bust"
                    player.betted_assets = []
                return self._advance_turn(room)
            # Not their turn — forfeit bets and remove from turn_order to avoid dead entries
            if player_id in room.turn_order:
                player = room.players.get(player_id)
                if player and player.status not in ("done", "bust"):
                    for i, hand in enumerate(player.hands):
                        if hand["status"] in ("playing", "standing"):
                            hand["status"] = "bust"
                            hand["result"] = "bust"
                            asset_value = sum(a["value"] for a in player.betted_assets) if i == 0 else 0
                            hand["payout"] = -(hand["bet"] + asset_value)
                            player.bankroll += hand["payout"]
                    player.status = "bust"
                    player.result = "bust"
                    player.betted_assets = []
                departed_idx = room.turn_order.index(player_id)
                room.turn_order.remove(player_id)
                if departed_idx < room.current_player_idx:
                    room.current_player_idx -= 1
            # If nobody left to play, go straight to dealer
            if not room.turn_order or room.current_player_idx >= len(room.turn_order):
                room.phase = "dealer_turn"
                return [
                    {
                        "type": "dealer_turn_start",
                        "dealer_hand": room.dealer_hand,
                        "dealer_value": hand_value(room.dealer_hand),
                        "state": self.get_room_state(room, hide_dealer_hole=False),
                    }
                ]
            return []

        if room.phase == "betting":
            # Check if all remaining connected players have bet
            connected = [p for p in room.players.values() if p.connected]
            if connected and all(p.status == "ready" for p in connected):
                return self.deal_initial_cards(room)
            return []

        return []

    # --- Turn Management ---

    def _advance_turn(self, room: GameRoom) -> list[dict]:
        """Move to next active player, or to dealer_turn if all done."""
        room.current_player_idx += 1
        self._skip_done_players(room)

        if room.current_player_idx >= len(room.turn_order):
            # All players done — transition to dealer turn
            room.phase = "dealer_turn"
            return [
                {
                    "type": "dealer_turn_start",
                    "dealer_hand": room.dealer_hand,
                    "dealer_value": hand_value(room.dealer_hand),
                    "state": self.get_room_state(room, hide_dealer_hole=False),
                }
            ]
        else:
            current_pid = self._get_current_player_id(room)
            return [{"type": "your_turn", "player_id": current_pid}]

    def _skip_done_players(self, room: GameRoom):
        """Advance current_player_idx past players who are bust/done/standing/disconnected."""
        while room.current_player_idx < len(room.turn_order):
            pid = room.turn_order[room.current_player_idx]
            player = room.players.get(pid)
            if player and player.connected and player.status == "playing":
                break
            room.current_player_idx += 1

    # --- Dealer Turn ---

    def dealer_draw_one(self, room: "GameRoom") -> tuple[bool, list[dict]]:
        """Draw one dealer card if the dealer should still hit.

        Returns (should_continue, events):
          - (True, [dealer_card event]) if a card was drawn and dealer may need more
          - (False, []) if the dealer stands (hand >= 17 hard, or all players busted)
        """
        if room.phase != "dealer_turn":
            return False, []

        active_pids = [pid for pid in room.turn_order if pid in room.players]
        all_busted = all(room.players[pid].status == "bust" for pid in active_pids)
        if all_busted:
            return False, []

        dv = hand_value(room.dealer_hand)
        dealer_should_hit = dv < 17 or (dv == 17 and is_soft(room.dealer_hand))
        if not dealer_should_hit:
            return False, []

        try:
            drawn, room.deck = draw_cards(room.deck, 1)
        except ValueError:
            room.deck = create_deck()
            shuffle_deck(room.deck)
            drawn, room.deck = draw_cards(room.deck, 1)

        room.dealer_hand.append(drawn[0])

        new_dv = hand_value(room.dealer_hand)
        should_continue = new_dv < 17 or (new_dv == 17 and is_soft(room.dealer_hand))

        event = {
            "type": "dealer_card",
            "card": drawn[0],
            "dealer_hand": room.dealer_hand,
            "dealer_value": new_dv,
            "state": self.get_room_state(room, hide_dealer_hole=False),
        }
        return should_continue, [event]

    async def run_dealer_turn(self, room: GameRoom, broadcast_fn) -> list[dict]:
        """Run the dealer's turn with async delays for animation pacing.

        broadcast_fn(event_dict) is called after each dealer draw to push
        real-time updates to clients.
        """
        events = []

        if room.phase != "dealer_turn":
            return events

        # Check if all active players busted — dealer doesn't need to draw
        active_pids = [pid for pid in room.turn_order if pid in room.players]
        all_busted = all(room.players[pid].status == "bust" for pid in active_pids)

        if not all_busted:
            # Dealer draws per standard rules: hit on soft 17, stand on hard 17+
            while hand_value(room.dealer_hand) < 17 or (
                hand_value(room.dealer_hand) == 17 and is_soft(room.dealer_hand)
            ):
                # Check room is still valid
                if room.phase != "dealer_turn":
                    return events

                await asyncio.sleep(DEALER_HIT_DELAY)

                drawn, room.deck = draw_cards(room.deck, 1)
                room.dealer_hand.append(drawn[0])

                event = {
                    "type": "dealer_card",
                    "card": drawn[0],
                    "dealer_hand": room.dealer_hand,
                    "dealer_value": hand_value(room.dealer_hand),
                    "state": self.get_room_state(room, hide_dealer_hole=False),
                }
                events.append(event)
                await broadcast_fn(event)

        await asyncio.sleep(DEALER_STAND_DELAY)

        # Resolve all hands
        resolve_events = self.resolve_all_hands(room)
        events.extend(resolve_events)
        for event in resolve_events:
            await broadcast_fn(event)

        return events

    # --- Resolution ---

    def resolve_all_hands(self, room: GameRoom) -> list[dict]:
        """Compare each player's hands to dealer. Calculate payouts. Update stats."""
        dealer_val = hand_value(room.dealer_hand)
        dealer_bust = dealer_val > 21
        results = {}

        # Snapshot bankrolls before resolution for "first time broke" detection
        prev_bankrolls = {pid: room.players[pid].bankroll for pid in room.turn_order if pid in room.players}

        for pid in room.turn_order:
            if pid not in room.players:
                continue
            player = room.players[pid]

            total_delta = 0
            outcomes = []
            is_split = len(player.hands) > 1

            for i, hand in enumerate(player.hands):
                # Determine per-hand outcome
                if hand["result"] is None:
                    hand["result"] = self._determine_hand_outcome(
                        hand, room.dealer_hand, is_split
                    )

                outcome = hand["result"]
                outcomes.append(outcome)

                # Per-hand payout — assets apply to hand[0] only
                asset_value = (
                    sum(a["value"] for a in player.betted_assets) if i == 0 else 0
                )
                total_bet = hand["bet"] + asset_value

                if outcome == "blackjack":
                    hand["payout"] = math.floor(BLACKJACK_PAYOUT * total_bet)
                elif outcome in ("win", "dealerBust"):
                    hand["payout"] = total_bet
                elif outcome == "push":
                    hand["payout"] = 0
                else:  # lose, bust
                    hand["payout"] = -total_bet

                total_delta += hand["payout"]

            # Update bankroll
            player.bankroll += total_delta

            # Aggregate result
            player.result = self._determine_aggregate_result(outcomes)

            # Asset handling — based on hand[0]'s result (assets tied to first hand)
            player.total_assets_bet += len(player.betted_assets)
            if player.hands:
                hand0_result = player.hands[0]["result"]
                hand0_win = hand0_result in ("win", "dealerBust", "blackjack", "push")
                if hand0_win:
                    # Return betted assets
                    for asset in player.betted_assets:
                        player.owned_assets[asset["id"]] = True
                else:
                    player.total_assets_lost += len(player.betted_assets)
                # On loss: assets stay lost (owned_assets already set to False)

            # Update stats
            is_win = player.result in ("win", "dealerBust", "blackjack")
            is_loss = player.result in ("lose", "bust")

            player.hands_played += 1
            if is_win:
                player.win_streak += 1
                player.lose_streak = 0
            elif is_loss:
                player.lose_streak += 1
                player.win_streak = 0

            # Track money flow based on actual delta, not aggregate label
            if total_delta > 0:
                player.total_won += total_delta
            elif total_delta < 0:
                player.total_lost += abs(total_delta)

            player.peak_bankroll = max(player.peak_bankroll, player.bankroll)
            player.lowest_bankroll = min(player.lowest_bankroll, player.bankroll)
            player.best_win_streak = max(player.best_win_streak, player.win_streak)

            # Exit debt mode if bankroll recovered to at least MIN_BET
            if player.in_debt_mode and player.bankroll >= MIN_BET:
                player.in_debt_mode = False

            player.status = "done"

            results[pid] = {
                "player_id": pid,
                "player_name": player.name,
                "outcome": player.result,
                "delta": total_delta,
                "bankroll": player.bankroll,
                "hands": [
                    {
                        "cards": h["cards"],
                        "hand_value": hand_value(h["cards"]),
                        "result": h["result"],
                        "payout": h["payout"],
                        "bet": h["bet"],
                        "is_doubled_down": h["is_doubled_down"],
                    }
                    for h in player.hands
                ],
            }

        room.phase = "result"

        # Dealer trash talk on resolve — pick the most interesting outcome
        target, prev_br = _pick_commentary_target(room, prev_bankrolls)
        if target:
            cat, ctx = _determine_dealer_category(target, "resolve", prev_br)
            if cat:
                ctx["player_name"] = target.name
                room.dealer_message, room.shown_dealer_lines = _select_dealer_message(
                    cat, room.shown_dealer_lines, ctx
                )

        return [
            {
                "type": "round_result",
                "round": room.round_number,
                "dealer_hand": room.dealer_hand,
                "dealer_value": dealer_val,
                "dealer_bust": dealer_bust,
                "results": results,
                "state": self.get_room_state(room, hide_dealer_hole=False),
            }
        ]

    def _determine_hand_outcome(
        self, hand: dict, dealer_hand: list, is_split: bool
    ) -> str:
        """Return the outcome for a single hand vs the dealer."""
        if hand["status"] == "bust":
            return "bust"

        player_val = hand_value(hand["cards"])
        dealer_val = hand_value(dealer_hand)
        dealer_bj = is_blackjack(dealer_hand)

        # Split hand 21 with 2 cards is NOT a natural blackjack — pays 1:1
        player_bj = is_blackjack(hand["cards"]) and not is_split

        if player_bj and dealer_bj:
            return "push"
        if player_bj:
            return "blackjack"
        if dealer_bj:
            return "lose"
        if dealer_val > 21:
            return "dealerBust"
        if dealer_val > player_val:
            return "lose"
        if player_val > dealer_val:
            return "win"
        return "push"

    def remove_asset(self, room: GameRoom, player_id: str, asset_id: str) -> list[dict]:
        """Remove a betted asset (undo). Valid during betting or playing phase."""
        if room.phase not in ("betting", "playing"):
            raise ValueError("Cannot remove assets in this phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        if room.phase == "playing":
            current_pid = room.turn_order[room.current_player_idx] if room.turn_order else None
            if current_pid != player_id:
                raise ValueError("Not your turn")

        asset = next((a for a in player.betted_assets if a["id"] == asset_id), None)
        if not asset:
            raise ValueError("Asset not currently bet")

        player.betted_assets = [a for a in player.betted_assets if a["id"] != asset_id]
        player.owned_assets[asset_id] = True

        return [
            {
                "type": "asset_removed",
                "player_id": player_id,
                "asset_id": asset_id,
                "state": self.get_room_state(room),
            }
        ]

    def _determine_aggregate_result(self, outcomes: list[str]) -> str:
        """Determine the overall result from multiple hand outcomes."""
        if len(outcomes) == 1:
            return outcomes[0]
        if "blackjack" in outcomes:
            return "blackjack"
        has_win = any(o in ("win", "dealerBust") for o in outcomes)
        has_loss = any(o in ("lose", "bust") for o in outcomes)
        has_push = any(o == "push" for o in outcomes)
        if has_win and has_loss:
            return "mixed"
        if has_win and has_push:
            return "mixed"
        if has_win:
            return "dealerBust" if "dealerBust" in outcomes else "win"
        if all(o == "push" for o in outcomes):
            return "push"
        if has_loss and has_push:
            return "mixed"
        if has_loss:
            return "bust" if all(o == "bust" for o in outcomes) else "lose"
        return "mixed"

    # --- State Serialization ---

    def get_room_state(self, room: GameRoom, hide_dealer_hole: bool = True) -> dict:
        """Serialize full room state for broadcast.

        Hides dealer's hole card (2nd card) during playing phase.
        """
        should_hide = hide_dealer_hole and room.phase in ("playing", "betting")

        dealer_hand_visible = []
        for i, card in enumerate(room.dealer_hand):
            if i == 1 and should_hide:
                dealer_hand_visible.append({"rank": "?", "suit": "?", "id": "hidden"})
            else:
                dealer_hand_visible.append(card)

        current_pid = self._get_current_player_id(room)

        return {
            "phase": room.phase,
            "round": room.round_number,
            "dealer_hand": dealer_hand_visible,
            "dealer_value": hand_value(room.dealer_hand) if not should_hide else None,
            "current_player_id": current_pid,
            "dealer_message": room.dealer_message,
            "players": {
                pid: self._serialize_player(p)
                for pid, p in room.players.items()
            },
        }

    def _serialize_player(self, player: PlayerState) -> dict:
        """Serialize one player's state for broadcast."""
        return {
            "name": player.name,
            "player_id": player.player_id,
            "bankroll": player.bankroll,
            "hands": [
                {
                    "cards": h["cards"],
                    "bet": h["bet"],
                    "is_doubled_down": h["is_doubled_down"],
                    "is_split_aces": h["is_split_aces"],
                    "status": h["status"],
                    "result": h["result"],
                    "payout": h["payout"],
                    "hand_value": hand_value(h["cards"]) if h["cards"] else 0,
                }
                for h in player.hands
            ],
            "active_hand_index": player.active_hand_index,
            "bet": player.bet,
            "betted_assets": player.betted_assets,
            "owned_assets": player.owned_assets,
            "in_debt_mode": player.in_debt_mode,
            "status": player.status,
            "is_host": player.is_host,
            "connected": player.connected,
            "result": player.result,
            "vig_amount": player.vig_amount,
            "vig_rate": player.vig_rate,
            "stats": {
                "hands_played": player.hands_played,
                "win_streak": player.win_streak,
                "lose_streak": player.lose_streak,
                "total_won": player.total_won,
                "total_lost": player.total_lost,
                "peak_bankroll": player.peak_bankroll,
                "lowest_bankroll": player.lowest_bankroll,
                "total_assets_bet": player.total_assets_bet,
                "total_assets_lost": player.total_assets_lost,
                "best_win_streak": player.best_win_streak,
                "total_vig_paid": player.total_vig_paid,
            },
        }

    # --- Validation Helpers ---

    def _validate_player_turn(self, room: GameRoom, player_id: str) -> PlayerState:
        """Validate it's this player's turn during the playing phase."""
        if room.phase != "playing":
            raise ValueError("Not in playing phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        current_pid = self._get_current_player_id(room)
        if current_pid != player_id:
            raise ValueError("Not your turn")

        if player.status != "playing":
            raise ValueError("You cannot act right now")

        hand = player.hands[player.active_hand_index]
        if hand["status"] != "playing":
            raise ValueError("Hand is not in playing state")

        return player

    def _validate_betting(self, room: GameRoom, player_id: str) -> PlayerState:
        """Validate a player can place a bet."""
        if room.phase != "betting":
            raise ValueError("Not in betting phase")

        player = room.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        if player.status == "ready":
            raise ValueError("You already placed a bet")

        if player.status != "betting":
            raise ValueError("Cannot bet right now")

        return player

    def _get_current_player_id(self, room: GameRoom) -> str | None:
        """Return the player_id of whoever's turn it is."""
        if not room.turn_order or room.current_player_idx >= len(room.turn_order):
            return None
        return room.turn_order[room.current_player_idx]
