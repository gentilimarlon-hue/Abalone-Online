import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseBearerToken, parseMoveCommand, readLimitedJson } from "./abalone-http.ts";

Deno.test("accepts a correctly formatted bearer token", () => {
  assertEquals(parseBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assertEquals(parseBearerToken("bearer token"), "token");
});
Deno.test("rejects missing or malformed authorization headers", () => {
  for (const value of [null, "", "Basic abc", "Bearer", "Bearer two tokens", "Bearer token ", "Bearer  "]) {
    assertEquals(parseBearerToken(value), null);
  }
});
Deno.test("accepts only bounded move command shapes", () => {
  assertEquals(parseMoveCommand({ keys: ["0,0"], dq: 1, dr: 0 }), { keys: ["0,0"], dq: 1, dr: 0 });
  for (const value of [
    null, [], {}, { keys: [], dq: 1, dr: 0 },
    { keys: ["0,0", "1,0", "2,0", "3,0"], dq: 1, dr: 0 },
    { keys: ["0,0", 4], dq: 1, dr: 0 },
    { keys: ["a".repeat(17)], dq: 1, dr: 0 },
    { keys: ["0,0"], dq: 2, dr: 0 },
    { keys: ["0,0"], dq: 1, dr: -2 },
    { keys: ["0,0"], dq: 0.5, dr: 0 },
  ]) assertEquals(parseMoveCommand(value), null);
});
Deno.test("reads valid JSON and rejects oversized bodies", async () => {
  const parsed = await readLimitedJson(new Request("https://local.test", {
    method: "POST", body: JSON.stringify({ ok: true }),
  }));
  assertEquals(parsed, { ok: true });
  let rejected = false;
  try {
    await readLimitedJson(new Request("https://local.test", {
      method: "POST", body: "x".repeat(20), headers: { "Content-Type": "text/plain" },
    }), 10);
  } catch (error) {
    rejected = error instanceof RangeError;
  }
  assertEquals(rejected, true);
});
