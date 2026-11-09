import { createClient } from "npm:@supabase/supabase-js@2";
import { applyAuthoritativeMove, type SerializedState } from "../_shared/abalone-engine.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Authentication required" }, 401);

    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    const userId = authData.user.id;

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    const roomCode = String(body.room_code || "").trim().toUpperCase();
    const playerToken = String(body.player_token || "");
    const command = body.move;
    if (!/^[A-F0-9]{6}$/.test(roomCode) || playerToken.length < 32) return json({ error: "Invalid room credentials" }, 400);

    const { data: room, error: roomError } = await admin.from("game_rooms")
      .select("id,room_code,status,state,current_turn,host_token_hash,guest_token_hash,host_player_id,guest_player_id,updated_at")
      .eq("room_code", roomCode).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (roomError || !room) return json({ error: "Room not found" }, 404);
    if (room.status !== "playing") return json({ error: "Game is not active" }, 409);

    const tokenBytes = new TextEncoder().encode(playerToken);
    const digest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,"0")).join("");
    let color: "b" | "w";
    let playerId: string | null;
    if (tokenHash === room.host_token_hash) { color = "b"; playerId = room.host_player_id; }
    else if (tokenHash === room.guest_token_hash) { color = "w"; playerId = room.guest_player_id; }
    else return json({ error: "Invalid room token" }, 403);

    const { data: profile } = await admin.from("players").select("id").eq("auth_user_id", userId).maybeSingle();
    if (playerId && profile?.id !== playerId) return json({ error: "This room belongs to another account" }, 403);
    if (!playerId && profile?.id) return json({ error: "Account was not bound to this room; create a new room" }, 403);
    if (room.current_turn !== color) return json({ error: "Not your turn" }, 409);

    const result = applyAuthoritativeMove(room.state as SerializedState, command);
    const { data: commit, error: commitError } = await admin.rpc("abalone_commit_server_move", {
      p_room_id: room.id,
      p_expected_updated_at: room.updated_at,
      p_state: result.state,
      p_winner: result.winner,
    });
    if (commitError) {
      const status = commitError.message.includes("changed") ? 409 : 400;
      return json({ error: commitError.message }, status);
    }

    let rating = null;
    if (result.winner && room.host_player_id && room.guest_player_id) {
      const { data, error } = await admin.rpc("abalone_settle_validated_match", {
        p_room_id: room.id,
        p_black_player_id: room.host_player_id,
        p_white_player_id: room.guest_player_id,
        p_winner_color: result.winner,
      });
      if (error) throw error;
      rating = data;
    }
    return json({ ok: true, state: result.state, winner: result.winner, rating });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 400);
  }
});
