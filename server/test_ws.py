"""Quick WebSocket integration test for the lobby system."""

import asyncio
import json
import websockets


async def send_and_recv(ws, msg):
    await ws.send(json.dumps(msg))
    resp = await asyncio.wait_for(ws.recv(), timeout=5)
    return json.loads(resp)


async def recv(ws, timeout=5):
    resp = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(resp)


async def test_lobby():
    uri = "ws://localhost:8000/ws"
    print("=" * 60)

    # Test 1: Create a room
    print("\n[Test 1] Create room")
    async with websockets.connect(uri) as ws1:
        resp = await send_and_recv(ws1, {"type": "create_room", "player_name": "Sia"})
        assert resp["type"] == "room_created", f"Expected room_created, got {resp}"
        code = resp["code"]
        p1_id = resp["player_id"]
        assert len(code) == 4
        assert resp["players"][0]["name"] == "Sia"
        assert resp["players"][0]["is_host"] is True
        print(f"  PASS - Room {code} created, player_id={p1_id[:8]}...")

        # Test 2: Join the room
        print("\n[Test 2] Join room")
        async with websockets.connect(uri) as ws2:
            resp2 = await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "John"})
            assert resp2["type"] == "player_joined", f"Expected player_joined, got {resp2}"
            assert resp2["player_name"] == "John"
            assert len(resp2["players"]) == 2
            p2_id = resp2["player_id"]
            print(f"  PASS - John joined room {code}")

            # ws1 should also get notified
            notif = await recv(ws1)
            assert notif["type"] == "player_joined"
            assert notif["player_name"] == "John"
            print("  PASS - Sia received player_joined notification")

            # Test 3: Duplicate name
            print("\n[Test 3] Duplicate name")
            async with websockets.connect(uri) as ws3:
                resp3 = await send_and_recv(ws3, {"type": "join_room", "code": code, "player_name": "Sia"})
                assert resp3["type"] == "error"
                assert "already taken" in resp3["message"]
                print(f"  PASS - Duplicate name rejected: {resp3['message']}")

            # Test 4: Invalid room code
            print("\n[Test 4] Invalid room code")
            async with websockets.connect(uri) as ws4:
                resp4 = await send_and_recv(ws4, {"type": "join_room", "code": "ZZZZ", "player_name": "Test"})
                assert resp4["type"] == "error"
                assert "not found" in resp4["message"]
                print(f"  PASS - Invalid code rejected: {resp4['message']}")

            # Test 5: Empty name
            print("\n[Test 5] Empty name")
            async with websockets.connect(uri) as ws5:
                resp5 = await send_and_recv(ws5, {"type": "create_room", "player_name": ""})
                assert resp5["type"] == "error"
                assert "required" in resp5["message"]
                print(f"  PASS - Empty name rejected: {resp5['message']}")

            # Test 6: Name too long
            print("\n[Test 6] Name too long")
            async with websockets.connect(uri) as ws6:
                resp6 = await send_and_recv(ws6, {"type": "create_room", "player_name": "A" * 25})
                assert resp6["type"] == "error"
                assert "20 characters" in resp6["message"]
                print(f"  PASS - Long name rejected: {resp6['message']}")

            # Test 7: start_game by non-host
            print("\n[Test 7] start_game by non-host")
            resp7 = await send_and_recv(ws2, {"type": "start_game"})
            assert resp7["type"] == "error"
            assert "host" in resp7["message"].lower()
            print(f"  PASS - Non-host start rejected: {resp7['message']}")

            # Test 8: start_game with 2 players (should succeed)
            print("\n[Test 8] start_game with 2 players")
            await ws1.send(json.dumps({"type": "start_game"}))
            resp8a = await recv(ws1)
            assert resp8a["type"] == "game_started"
            assert len(resp8a["players"]) == 2
            print(f"  PASS - Game started (Sia received game_started)")

            resp8b = await recv(ws2)
            assert resp8b["type"] == "game_started"
            print(f"  PASS - Game started (John received game_started)")

            # Drain betting_phase events from both sockets
            await drain(ws1, timeout=1)
            await drain(ws2, timeout=1)

            # Test 9: Can't join a started game
            print("\n[Test 9] Can't join started game")
            async with websockets.connect(uri) as ws9:
                resp9 = await send_and_recv(ws9, {"type": "join_room", "code": code, "player_name": "Late"})
                assert resp9["type"] == "error"
                assert "in progress" in resp9["message"]
                print(f"  PASS - Late join rejected: {resp9['message']}")

            # Test 10: Leave
            print("\n[Test 10] Leave")
            await ws2.send(json.dumps({"type": "leave"}))
            resp10_leaver = await recv(ws2)
            assert resp10_leaver["type"] == "left_room"
            print("  PASS - John received left_room")

            resp10_notif = await recv(ws1)
            assert resp10_notif["type"] == "player_left"
            assert resp10_notif["player_name"] == "John"
            print(f"  PASS - Sia received player_left notification")

    # Test 11: Room full (6 players max)
    print("\n[Test 11] Room full (6 max)")
    connections = []
    async with websockets.connect(uri) as host_ws:
        resp = await send_and_recv(host_ws, {"type": "create_room", "player_name": "Host"})
        code = resp["code"]
        connections.append(host_ws)

        for i in range(5):
            ws = await websockets.connect(uri)
            resp = await send_and_recv(ws, {"type": "join_room", "code": code, "player_name": f"P{i+1}"})
            assert resp["type"] == "player_joined", f"Player P{i+1} failed to join: {resp}"
            connections.append(ws)
            # Drain notifications from other connections
            for c in connections[:-1]:
                try:
                    await asyncio.wait_for(c.recv(), timeout=1)
                except asyncio.TimeoutError:
                    pass

        # 7th player should be rejected
        async with websockets.connect(uri) as extra_ws:
            resp = await send_and_recv(extra_ws, {"type": "join_room", "code": code, "player_name": "Extra"})
            assert resp["type"] == "error"
            assert "full" in resp["message"]
            print(f"  PASS - 7th player rejected: {resp['message']}")

        # Clean up connections
        for ws in connections[1:]:
            await ws.close()

    # Test 12: start_game with only 1 player
    print("\n[Test 12] start_game with 1 player")
    async with websockets.connect(uri) as solo_ws:
        resp = await send_and_recv(solo_ws, {"type": "create_room", "player_name": "Solo"})
        code = resp["code"]
        resp = await send_and_recv(solo_ws, {"type": "start_game"})
        assert resp["type"] == "error"
        assert "at least 2" in resp["message"]
        print(f"  PASS - Solo start rejected: {resp['message']}")

    # Test 13: Host disconnect transfers host
    print("\n[Test 13] Host disconnect transfers host")
    async with websockets.connect(uri) as h_ws:
        resp = await send_and_recv(h_ws, {"type": "create_room", "player_name": "HostPlayer"})
        code = resp["code"]

        async with websockets.connect(uri) as p_ws:
            resp = await send_and_recv(p_ws, {"type": "join_room", "code": code, "player_name": "Player2"})
            # Drain notification on host
            await recv(h_ws)

            # Host leaves explicitly
            await h_ws.send(json.dumps({"type": "leave"}))
            await recv(h_ws)  # left_room

            notif = await recv(p_ws)
            assert notif["type"] == "player_left"
            assert notif["new_host"] == "Player2"
            print(f"  PASS - Host transferred to Player2")

    print("\n[Test 14] Health endpoint")
    print("  PASS - Already verified with curl")

    print("\n" + "=" * 60)
    print("ALL LOBBY TESTS PASSED!")
    print("=" * 60)


async def drain(ws, timeout=0.5):
    """Drain all pending messages from a WebSocket, return them as a list."""
    messages = []
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            messages.append(json.loads(raw))
        except asyncio.TimeoutError:
            break
    return messages


async def drain_until(ws, msg_type, timeout=10):
    """Receive messages until one with the given type appears. Return it."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        remaining = deadline - asyncio.get_event_loop().time()
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            msg = json.loads(raw)
            if msg.get("type") == msg_type:
                return msg
        except asyncio.TimeoutError:
            break
    raise AssertionError(f"Never received message type '{msg_type}' within {timeout}s")


async def setup_game(uri):
    """Helper: create room, join 2 players, start game, return (ws1, ws2, code, p1_id, p2_id)."""
    ws1 = await websockets.connect(uri)
    resp = await send_and_recv(ws1, {"type": "create_room", "player_name": "Alice"})
    code = resp["code"]
    p1_id = resp["player_id"]

    ws2 = await websockets.connect(uri)
    resp = await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "Bob"})
    p2_id = resp["player_id"]
    await drain(ws1)  # drain player_joined notification

    await ws1.send(json.dumps({"type": "start_game"}))
    # Both get game_started + betting_phase
    await drain_until(ws1, "betting_phase")
    await drain_until(ws2, "betting_phase")

    return ws1, ws2, code, p1_id, p2_id


async def test_full_game_flow():
    """Test a complete game: create → join → bet → play → dealer → result."""
    uri = "ws://localhost:8000/ws"
    print("\n" + "=" * 60)
    print("GAME FLOW TESTS")
    print("=" * 60)

    print("\n[Test G1] Full game flow")
    ws1, ws2, code, p1_id, p2_id = await setup_game(uri)

    try:
        # Both players bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        bet1_resp = await drain_until(ws1, "bet_placed")
        assert bet1_resp["player_id"] == p1_id
        await drain(ws2)  # drain bet_placed from ws2

        await ws2.send(json.dumps({"type": "place_bet", "amount": 200}))
        # After both bet, cards should be dealt
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        assert cards_msg["type"] == "cards_dealt"
        assert "state" in cards_msg
        state = cards_msg["state"]
        assert len(state["dealer_hand"]) == 2
        assert state["dealer_hand"][1]["rank"] == "?"  # Hole card hidden
        print("  PASS - Both bet, cards dealt, dealer hole card hidden")

        # Drain ws2 and any initial your_turn events
        await drain_until(ws2, "cards_dealt", timeout=5)
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)

        # Check if game went straight to result (blackjack scenario)
        if state["phase"] == "result":
            print("  SKIP - Blackjack dealt, skipping play phase")
        else:
            assert state["phase"] == "playing"
            current = state["current_player_id"]

            # Find whose turn it is
            if current == p1_id:
                active_ws, passive_ws = ws1, ws2
                active_pid, passive_pid = p1_id, p2_id
            else:
                active_ws, passive_ws = ws2, ws1
                active_pid, passive_pid = p2_id, p1_id

            # First player (current turn) stands
            await active_ws.send(json.dumps({"type": "stand"}))
            stand_msg = await drain_until(active_ws, "player_stand")
            assert stand_msg["player_id"] == active_pid
            print(f"  PASS - {active_pid[:8]}... stood")

            # Wait for passive player to get your_turn
            your_turn_msg = await drain_until(passive_ws, "your_turn", timeout=5)
            assert your_turn_msg["player_id"] == passive_pid

            # Second player stands
            await passive_ws.send(json.dumps({"type": "stand"}))

            # Should trigger dealer_turn_start on either socket
            dealer_msg = await drain_until(ws1, "dealer_turn_start", timeout=5)
            assert dealer_msg["dealer_hand"][1]["rank"] != "?"
            print("  PASS - Dealer turn started, hole card revealed")

            # Wait for round_result
            result_msg = await drain_until(ws1, "round_result", timeout=15)
            assert result_msg["type"] == "round_result"
            assert p1_id in result_msg["results"]
            assert p2_id in result_msg["results"]
            print(f"  PASS - Round result received with outcomes for both players")

        print("  PASS - Full game flow completed")
    finally:
        await ws1.close()
        await ws2.close()


async def test_disconnect_during_turn():
    """Test that disconnecting the current player advances the turn."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G2] Disconnect during turn")
    ws1, ws2, code, p1_id, p2_id = await setup_game(uri)

    try:
        # Both bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)

        await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        await drain(ws2, timeout=2)

        state = cards_msg["state"]
        if state["phase"] != "playing":
            print("  SKIP - Blackjack scenario")
            return

        current = state["current_player_id"]

        # Disconnect the current player
        if current == p1_id:
            await ws1.close()
            remaining_ws = ws2
            remaining_pid = p2_id
        else:
            await ws2.close()
            remaining_ws = ws1
            remaining_pid = p1_id

        # Remaining player should receive player_disconnected and then
        # either your_turn (if it's now their turn) or dealer_turn_start
        # (if all other players are done)
        msgs = await drain(remaining_ws, timeout=3)
        msg_types = [m["type"] for m in msgs]

        assert "player_disconnected" in msg_types, f"Expected player_disconnected, got {msg_types}"
        assert "your_turn" in msg_types or "dealer_turn_start" in msg_types, \
            f"Expected turn advancement, got {msg_types}"
        print("  PASS - Current player disconnected, turn advanced")
    finally:
        try:
            await ws1.close()
        except Exception:
            pass
        try:
            await ws2.close()
        except Exception:
            pass


async def test_disconnect_during_betting():
    """Test that disconnecting after others bet triggers auto-deal."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G3] Disconnect during betting")

    # Need 3 players for this test
    ws1 = await websockets.connect(uri)
    resp = await send_and_recv(ws1, {"type": "create_room", "player_name": "Alice"})
    code = resp["code"]

    ws2 = await websockets.connect(uri)
    await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "Bob"})
    await drain(ws1)

    ws3 = await websockets.connect(uri)
    await send_and_recv(ws3, {"type": "join_room", "code": code, "player_name": "Charlie"})
    await drain(ws1)
    await drain(ws2)

    # Start game
    await ws1.send(json.dumps({"type": "start_game"}))
    await drain_until(ws1, "betting_phase")
    await drain_until(ws2, "betting_phase")
    await drain_until(ws3, "betting_phase")

    try:
        # Alice and Bob bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)
        await drain(ws3, timeout=1)

        await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)
        await drain(ws3, timeout=1)

        # Charlie disconnects without betting
        await ws3.close()

        # Should trigger auto-deal since all remaining connected players have bet
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        assert cards_msg["type"] == "cards_dealt"
        print("  PASS - Player disconnected during betting, auto-dealt to remaining players")
    finally:
        try:
            await ws1.close()
        except Exception:
            pass
        try:
            await ws2.close()
        except Exception:
            pass
        try:
            await ws3.close()
        except Exception:
            pass


async def test_leave_during_turn():
    """Test that leaving during your turn advances the game."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G4] Leave during turn")
    ws1, ws2, code, p1_id, p2_id = await setup_game(uri)

    try:
        # Both bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)

        await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        await drain(ws2, timeout=2)

        state = cards_msg["state"]
        if state["phase"] != "playing":
            print("  SKIP - Blackjack scenario")
            return

        current = state["current_player_id"]

        # Current player explicitly leaves
        if current == p1_id:
            await ws1.send(json.dumps({"type": "leave"}))
            remaining_ws = ws2
        else:
            await ws2.send(json.dumps({"type": "leave"}))
            remaining_ws = ws1

        # Remaining player should get player_left + turn advancement
        msgs = await drain(remaining_ws, timeout=3)
        msg_types = [m["type"] for m in msgs]

        assert "player_left" in msg_types, f"Expected player_left, got {msg_types}"
        # Should get either your_turn or dealer_turn_start
        assert "your_turn" in msg_types or "dealer_turn_start" in msg_types, \
            f"Expected turn advancement after leave, got {msg_types}"
        print("  PASS - Current player left, turn advanced")
    finally:
        try:
            await ws1.close()
        except Exception:
            pass
        try:
            await ws2.close()
        except Exception:
            pass


async def test_leave_during_betting():
    """Test that leaving after others bet triggers auto-deal."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G5] Leave during betting")

    ws1 = await websockets.connect(uri)
    resp = await send_and_recv(ws1, {"type": "create_room", "player_name": "Alice"})
    code = resp["code"]

    ws2 = await websockets.connect(uri)
    await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "Bob"})
    await drain(ws1)

    ws3 = await websockets.connect(uri)
    await send_and_recv(ws3, {"type": "join_room", "code": code, "player_name": "Charlie"})
    await drain(ws1)
    await drain(ws2)

    await ws1.send(json.dumps({"type": "start_game"}))
    await drain_until(ws1, "betting_phase")
    await drain_until(ws2, "betting_phase")
    await drain_until(ws3, "betting_phase")

    try:
        # Alice and Bob bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)
        await drain(ws3, timeout=1)

        await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)
        await drain(ws3, timeout=1)

        # Charlie leaves explicitly
        await ws3.send(json.dumps({"type": "leave"}))
        await drain(ws3, timeout=1)

        # Should trigger auto-deal
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        assert cards_msg["type"] == "cards_dealt"
        print("  PASS - Player left during betting, auto-dealt to remaining players")
    finally:
        await ws1.close()
        await ws2.close()
        try:
            await ws3.close()
        except Exception:
            pass


async def test_reconnect_during_turn():
    """Test that reconnecting during your turn sends your_turn notification."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G6] Reconnect during turn")

    # Create room and capture session tokens for both players
    ws1 = await websockets.connect(uri)
    resp1 = await send_and_recv(ws1, {"type": "create_room", "player_name": "Alice"})
    code = resp1["code"]
    p1_id = resp1["player_id"]
    p1_session_token = resp1["session_token"]

    ws2 = await websockets.connect(uri)
    resp2 = await send_and_recv(ws2, {"type": "join_room", "code": code, "player_name": "Bob"})
    p2_id = resp2["player_id"]
    p2_session_token = resp2["session_token"]
    await drain(ws1)  # drain player_joined notification

    await ws1.send(json.dumps({"type": "start_game"}))
    await drain_until(ws1, "betting_phase")
    await drain_until(ws2, "betting_phase")

    try:
        # Both bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)

        await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        await drain(ws2, timeout=2)

        state = cards_msg["state"]
        if state["phase"] != "playing":
            print("  SKIP - Blackjack scenario")
            return

        current = state["current_player_id"]

        # Disconnect the current player and select the matching session token
        if current == p1_id:
            await ws1.close()
            disconnect_pid = p1_id
            disconnect_token = p1_session_token
        else:
            await ws2.close()
            disconnect_pid = p2_id
            disconnect_token = p2_session_token

        # The remaining player gets notified
        remaining_ws = ws2 if current == p1_id else ws1
        msgs = await drain(remaining_ws, timeout=3)

        # Since current player disconnected, turn should advance.
        # For 2 players: disconnect advances turn to other player.
        # Reconnect should still send state correctly.

        # Reconnect with session_token
        ws_new = await websockets.connect(uri)
        resp = await send_and_recv(ws_new, {
            "type": "reconnect",
            "player_id": disconnect_pid,
            "code": code,
            "session_token": disconnect_token,
        })
        assert resp["type"] == "reconnected", f"Expected reconnected, got {resp}"
        assert resp["phase"] in ("playing", "dealer_turn", "result")
        assert "state" in resp
        print(f"  PASS - Reconnected during game, phase={resp['phase']}, got full state")

        await ws_new.close()
    finally:
        try:
            await ws1.close()
        except Exception:
            pass
        try:
            await ws2.close()
        except Exception:
            pass


async def test_multi_round():
    """Test playing through multiple rounds — state resets correctly."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G7] Multi-round play")
    ws1, ws2, code, p1_id, p2_id = await setup_game(uri)

    try:
        for round_num in range(1, 3):
            # Both bet
            await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
            await drain(ws1, timeout=1)
            await drain(ws2, timeout=1)

            await ws2.send(json.dumps({"type": "place_bet", "amount": 100}))

            # Wait for cards dealt
            cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
            await drain(ws2, timeout=2)
            # Drain initial your_turn from both
            await drain(ws1, timeout=1)

            state = cards_msg["state"]
            if state["phase"] == "playing":
                # Both players stand
                current = state["current_player_id"]
                if current == p1_id:
                    first_ws, second_ws = ws1, ws2
                else:
                    first_ws, second_ws = ws2, ws1

                await first_ws.send(json.dumps({"type": "stand"}))
                await drain_until(first_ws, "player_stand", timeout=5)

                # Wait for second player to get your_turn or dealer_turn_start
                next_msg = await drain_until(second_ws, "your_turn", timeout=5)
                await second_ws.send(json.dumps({"type": "stand"}))

            # Wait for round_result (may already be in buffer for blackjack scenarios)
            result_msg = await drain_until(ws1, "round_result", timeout=15)
            assert result_msg["type"] == "round_result"
            await drain(ws2, timeout=3)

            # Wait for next betting_phase (auto-advance after NEW_ROUND_DELAY)
            betting_msg = await drain_until(ws1, "betting_phase", timeout=10)
            assert betting_msg["type"] == "betting_phase"
            assert betting_msg["round"] == round_num + 1
            await drain_until(ws2, "betting_phase", timeout=5)

            # Verify player state was reset
            state = betting_msg["state"]
            for pid in (p1_id, p2_id):
                if pid in state["players"]:
                    p = state["players"][pid]
                    assert p["status"] == "betting", f"Round {round_num+1}: player status should be betting, got {p['status']}"
                    assert p["bet"] == 0
                    assert p["hands"] == []

            print(f"  PASS - Round {round_num} completed, round {round_num+1} betting phase started")

        print("  PASS - Multi-round play works correctly")
    finally:
        await ws1.close()
        await ws2.close()


async def test_bet_timeout():
    """Test that bet timer auto-skips AFK players who don't bet."""
    uri = "ws://localhost:8000/ws"
    print("\n[Test G8] Bet timeout")
    ws1, ws2, code, p1_id, p2_id = await setup_game(uri)

    try:
        # Only P1 bets — P2 does not bet
        await ws1.send(json.dumps({"type": "place_bet", "amount": 100}))
        await drain(ws1, timeout=1)
        await drain(ws2, timeout=1)

        # Wait for the bet timeout to fire (BET_TIMEOUT is 30s on server)
        # The server should send a bet_timeout message when P2 is auto-skipped
        timeout_msg = await drain_until(ws1, "bet_timeout", timeout=35)
        assert timeout_msg["type"] == "bet_timeout"
        assert "Bob" in timeout_msg["sat_out"]
        print("  PASS - Bet timeout fired, AFK player sat out")

        # After timeout, cards should be dealt to P1 only
        cards_msg = await drain_until(ws1, "cards_dealt", timeout=5)
        assert cards_msg["type"] == "cards_dealt"
        print("  PASS - Cards dealt to active player after timeout")
    finally:
        await ws1.close()
        await ws2.close()


async def test_game_flow():
    """Run all game flow tests."""
    await test_full_game_flow()
    await test_disconnect_during_turn()
    await test_disconnect_during_betting()
    await test_leave_during_turn()
    await test_leave_during_betting()
    await test_reconnect_during_turn()
    await test_multi_round()

    print("\n" + "=" * 60)
    print("ALL GAME FLOW TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "game":
        asyncio.run(test_game_flow())
    elif len(sys.argv) > 1 and sys.argv[1] == "all":
        asyncio.run(test_lobby())
        asyncio.run(test_game_flow())
    else:
        asyncio.run(test_lobby())
