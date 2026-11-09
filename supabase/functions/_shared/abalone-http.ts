import type { MoveCommand } from "./abalone-engine.ts";

export function parseBearerToken(header: string | null): string | null {
  const match = (header || "").match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export function parseMoveCommand(value: unknown): MoveCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const move = value as Record<string, unknown>;
  if (!Array.isArray(move.keys) || move.keys.length < 1 || move.keys.length > 3 ||
      !move.keys.every((key): key is string => typeof key === "string" && key.length <= 16) ||
      !Number.isInteger(move.dq) || !Number.isInteger(move.dr) ||
      Math.abs(move.dq as number) > 1 || Math.abs(move.dr as number) > 1) return null;
  return { keys: move.keys, dq: move.dq as number, dr: move.dr as number };
}

export async function readLimitedJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const declaredLength = Number(req.headers.get("Content-Length") || "0");
  if (declaredLength > maxBytes) throw new RangeError("Request body too large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RangeError("Request body too large");
  }
  return JSON.parse(raw);
}
