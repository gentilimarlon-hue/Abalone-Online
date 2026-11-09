import { createClient } from "npm:@supabase/supabase-js@2";
import { applyAuthoritativeMove, type MoveCommand, type SerializedState } from "../_shared/abalone-engine.ts";

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
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) {
      console.error("Missing Supabase environment configuration");
      return json({ error: "Game service is not configured" }, 503);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);
    if (!bearerMatch) return json({ error: "Authentication required" }, 401);
    const jwt = bearerMatch[1];

    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
    const userId = authData.user.id;

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const declaredLength = Number(req.headers.get("Content-Length") || "0");
    if (declaredLength > 16_384) return json({ error: "Request body too large" }, 413);

    let body: Record<string, unknown>;
    try {
      const rawBody = await req.text();
      if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
        return json({ error: "Request body too large" }, 413);
      }
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "Invalid request body" }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const roomCode = String(body.room_code || "").trim().toUpperCase();
    const playerToken = String(body.player_token || "");
    const rawMove = body.move;
    if (!rawMove || typeof rawMove !== "object" || Array.isArray(rawMove)) {
      return json({ error: "Invalid move command" }, 400);
    }
    const move = rawMove as Record<string, unknown>;
    if (!Array.isArray(move.keys) || move.keys.length < 1 || move.keys.length > 3 ||
        !move.keys.every((key): key is string => typeof key === "string" && key.length <= 16) ||
        !Number.isInteger(move.dq) || !Number.isInteger(move.dr) ||
        Math.abs(move.dq as number) > 1 || Math.abs(move.dr as number) > 1) {
      return json({ error: "Invalid move command" }, 400);
    }
    const command: MoveCommand = {
      keys: move.keys,
      dq: move.dq as number,
      dr: move.dr as number,
    };
    if (!/^[A-F0-9]{6}$/.test(roomCode) || playerToken.length < 32) return json({ error: "Invalid room credentials" }, 400);

    const { data: room, error: roomError } = await admin.from("game_rooms")
      .select("id,room_code,status,state,current_turn,host_token_hash,guest_token_hash,host_player_id,guest_player_id,updated_at")
      .eq("room_code", roomCode).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (roomError) {
      console.error("Room lookup failed", roomError);
      return json({ error: "Could not load game room" }, 500);
    }
    if (!room) return json({ error: "Room not found" }, 404);
    if (room.status !== "playing") return json({ error: "Game is not active" }, 409);

    const tokenBytes = new TextEncoder().encode(playerToken);
    const digest = await crypto.subtle.digest("SHA-256", tokenBytes);
    const tokenHash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,"0")).join("");
    let color: "b" | "w";
    let playerId: string | null;
    if (tokenHash === room.host_token_hash) { color = "b"; playerId = room.host_player_id; }
    else if (tokenHash === room.guest_token_hash) { color = "w"; playerId = room.guest_player_id; }
    else return json({ error: "Invalid room token" }, 403);

    const { data: profile, error: profileError } = await admin.from("players")
      .select("id").eq("auth_user_id", userId).maybeSingle();
    if (profileError) {
      console.error("Player profile lookup failed", profileError);
      return json({ error: "Could not verify player account" }, 500);
    }
    if (playerId && profile?.id !== playerId) return json({ error: "This room belongs to another account" }, 403);
    if (!playerId && profile?.id) return json({ error: "Account was not bound to this room; create a new room" }, 403);
    if (room.current_turn !== color) return json({ error: "Not your turn" }, 409);

    let result: ReturnType<typeof applyAuthoritativeMove>;
    try {
      result = applyAuthoritativeMove(room.state as SerializedState, command);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid move" }, 400);
    }
    const { data: commit, error: commitError } = await admin.rpc("abalone_commit_server_move", {
      p_room_id: room.id,
      p_expected_updated_at: room.updated_at,
      p_state: result.state,
      p_winner: result.winner,
    });
    if (commitError) {
      const message = commitError.message || "Could not commit move";
      if (message.includes("changed") || message.includes("not active")) {
        return json({ error: message }, 409);
      }
      if (/invalid|inconsistent|only trusted/i.test(message)) {
        return json({ error: message }, 400);
      }
      console.error("Move commit failed", commitError);
      return json({ error: "Could not save move" }, 500);
    }

    const rating = commit?.rating || null;
    return json({ ok: true, state: result.state, winner: result.winner, rating });
  } catch (error) {
    console.error("abalone-move failed", error);
    return json({ error: "Internal game server error" }, 500);
  }
});
