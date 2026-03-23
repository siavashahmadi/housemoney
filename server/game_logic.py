"""Server-side game engine for multiplayer blackjack.

The GameEngine operates on GameRoom/PlayerState instances, mutating them in place.
Each method returns a list of event dicts for the WebSocket layer to broadcast.
"""

import asyncio
import math

from card_engine import (
    create_deck,
    draw_cards,
    hand_value,
    is_blackjack,
    is_soft,
    shuffle_deck,
)
from constants import (
    ASSET_MAP,
    BLACKJACK_PAYOUT,
    DEALER_HIT_DELAY,
    DEALER_STAND_DELAY,
    MAX_BET,
    MIN_BET,
    NEW_ROUND_DELAY,
    RESHUFFLE_THRESHOLD,
)
from game_room import GameRoom, PlayerState, get_active_players, reset_round_state


class GameEngine:
    """Server-side blackjack game logic."""

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

        # Check unlock threshold
        if player.bankroll > asset["unlock_threshold"]:
            raise ValueError("Asset not available at your current bankroll")

        player.owned_assets[asset_id] = False
        player.betted_assets.append(dict(asset))

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

    # --- Dealing ---

    def deal_initial_cards(self, room: GameRoom) -> list[dict]:
        """Deal 2 cards to each player + dealer. Check for blackjacks."""
        active_pids = [pid for pid, p in room.players.items() if p.connected]
        room.turn_order = active_pids
        num_players = len(active_pids)

        # Deal: player1-card1, player2-card1, ..., dealer-card1,
        #        player1-card2, player2-card2, ..., dealer-card2
        total_cards_needed = (num_players + 1) * 2
        drawn, room.deck = draw_cards(room.deck, total_cards_needed)

        # Distribute cards
        for i, pid in enumerate(active_pids):
            room.players[pid].hand = [drawn[i], drawn[num_players + 1 + i]]
            room.players[pid].status = "playing"

        room.dealer_hand = [drawn[num_players], drawn[num_players * 2 + 1]]

        # Check for blackjacks
        dealer_bj = is_blackjack(room.dealer_hand)
        events = []

        for pid in active_pids:
            player = room.players[pid]
            player_bj = is_blackjack(player.hand)

            if player_bj and dealer_bj:
                player.status = "done"
                player.result = "push"
            elif player_bj:
                player.status = "done"
                player.result = "blackjack"
            elif dealer_bj:
                player.status = "done"
                player.result = "lose"

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
        """Draw a card for the player. Check for bust."""
        player = self._validate_player_turn(room, player_id)

        if player.is_doubled_down:
            raise ValueError("Cannot hit after doubling down")

        drawn, room.deck = draw_cards(room.deck, 1)
        player.hand.append(drawn[0])

        events = []

        if hand_value(player.hand) > 21:
            player.status = "bust"
            player.result = "bust"
            events.append(
                {
                    "type": "player_hit",
                    "player_id": player_id,
                    "card": drawn[0],
                    "hand_value": hand_value(player.hand),
                    "bust": True,
                    "state": self.get_room_state(room),
                }
            )
            events.extend(self._advance_turn(room))
        else:
            events.append(
                {
                    "type": "player_hit",
                    "player_id": player_id,
                    "card": drawn[0],
                    "hand_value": hand_value(player.hand),
                    "bust": False,
                    "state": self.get_room_state(room),
                }
            )

        return events

    def stand(self, room: GameRoom, player_id: str) -> list[dict]:
        """Player stands. Advance to next player or dealer turn."""
        player = self._validate_player_turn(room, player_id)

        player.status = "standing"

        events = [
            {
                "type": "player_stand",
                "player_id": player_id,
                "state": self.get_room_state(room),
            }
        ]
        events.extend(self._advance_turn(room))

        return events

    def double_down(self, room: GameRoom, player_id: str) -> list[dict]:
        """Double bet, draw one card, auto-stand."""
        player = self._validate_player_turn(room, player_id)

        if len(player.hand) != 2:
            raise ValueError("Can only double down on first two cards")

        player.bet *= 2
        player.is_doubled_down = True

        drawn, room.deck = draw_cards(room.deck, 1)
        player.hand.append(drawn[0])

        events = []

        if hand_value(player.hand) > 21:
            player.status = "bust"
            player.result = "bust"
            events.append(
                {
                    "type": "player_double_down",
                    "player_id": player_id,
                    "card": drawn[0],
                    "new_bet": player.bet,
                    "hand_value": hand_value(player.hand),
                    "bust": True,
                    "state": self.get_room_state(room),
                }
            )
        else:
            player.status = "standing"
            events.append(
                {
                    "type": "player_double_down",
                    "player_id": player_id,
                    "card": drawn[0],
                    "new_bet": player.bet,
                    "hand_value": hand_value(player.hand),
                    "bust": False,
                    "state": self.get_room_state(room),
                }
            )

        events.extend(self._advance_turn(room))
        return events

    # --- Mid-Game Departure ---

    def handle_player_departure(self, room: GameRoom, player_id: str) -> list[dict]:
        """Handle a player disconnecting or leaving during an active game.

        Returns events to broadcast. The caller is responsible for marking
        the player as disconnected/removing them BEFORE calling this.
        """
        if room.phase == "playing":
            current_pid = self._get_current_player_id(room)
            if current_pid == player_id:
                # It was this player's turn — advance to next player
                return self._advance_turn(room)
            # Not their turn — _skip_done_players will skip them naturally
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

    async def run_dealer_turn(self, room: GameRoom, broadcast_fn) -> list[dict]:
        """Run the dealer's turn with async delays for animation pacing.

        broadcast_fn(event_dict) is called after each dealer draw to push
        real-time updates to clients.
        """
        events = []

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
        """Compare each player's hand to dealer. Calculate payouts. Update stats."""
        dealer_val = hand_value(room.dealer_hand)
        dealer_bust = dealer_val > 21
        results = {}

        for pid in room.turn_order:
            if pid not in room.players:
                continue
            player = room.players[pid]

            # Determine outcome (may already be set for blackjack/bust)
            if player.result is None:
                player.result = self._determine_outcome(player, room.dealer_hand)

            outcome = player.result
            delta = self._calculate_payout(player, outcome)

            # Update bankroll
            player.bankroll += delta

            # Track asset stats before handling
            player.total_assets_bet += len(player.betted_assets)

            # Handle assets
            is_win_outcome = outcome in ("win", "dealerBust", "blackjack", "push")
            if not is_win_outcome:
                player.total_assets_lost += len(player.betted_assets)
            if is_win_outcome:
                # Return betted assets
                for asset in player.betted_assets:
                    player.owned_assets[asset["id"]] = True
            # On loss: assets stay lost (owned_assets already set to False)

            # Update stats
            is_win = outcome in ("win", "dealerBust", "blackjack")
            is_loss = outcome in ("lose", "bust")

            player.hands_played += 1
            if is_win:
                player.win_streak += 1
                player.lose_streak = 0
                player.total_won += delta
            elif is_loss:
                player.lose_streak += 1
                player.win_streak = 0
                player.total_lost += abs(delta)
            else:
                # Push — don't reset streaks
                pass

            player.peak_bankroll = max(player.peak_bankroll, player.bankroll)
            player.lowest_bankroll = min(player.lowest_bankroll, player.bankroll)
            player.best_win_streak = max(player.best_win_streak, player.win_streak)

            player.status = "done"

            results[pid] = {
                "player_id": pid,
                "player_name": player.name,
                "outcome": outcome,
                "delta": delta,
                "bankroll": player.bankroll,
                "hand_value": hand_value(player.hand),
                "is_doubled_down": player.is_doubled_down,
            }

        room.phase = "result"

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

    def _determine_outcome(self, player: PlayerState, dealer_hand: list) -> str:
        """Return the outcome for a single player vs the dealer."""
        if player.status == "bust":
            return "bust"

        player_val = hand_value(player.hand)
        player_bj = is_blackjack(player.hand)
        dealer_val = hand_value(dealer_hand)
        dealer_bj = is_blackjack(dealer_hand)

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

    def _calculate_payout(self, player: PlayerState, outcome: str) -> int:
        """Return the bankroll delta for a given outcome."""
        asset_value = sum(a["value"] for a in player.betted_assets)
        total_bet = player.bet + asset_value

        if outcome == "blackjack":
            return math.floor(BLACKJACK_PAYOUT * total_bet)
        elif outcome in ("win", "dealerBust"):
            return total_bet
        elif outcome == "push":
            return 0
        else:  # lose, bust
            return -total_bet

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
            "hand": player.hand,
            "hand_value": hand_value(player.hand) if player.hand else 0,
            "bet": player.bet,
            "betted_assets": player.betted_assets,
            "owned_assets": player.owned_assets,
            "status": player.status,
            "is_host": player.is_host,
            "connected": player.connected,
            "is_doubled_down": player.is_doubled_down,
            "result": player.result,
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
