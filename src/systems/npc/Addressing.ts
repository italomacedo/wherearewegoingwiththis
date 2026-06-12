/**
 * Pure addressing resolver for the global chat (T). When the player speaks "into
 * the world", this decides WHO should answer — BEFORE any Claude call, so we
 * never fan a request out to every NPC (cost safeguard).
 *
 * Order:
 *  1) tone sets the reach — normal speech = short radius; a shout emote
 *     (written "shout" or "grito" in asterisks) reaches the whole scene.
 *  2) within reach: a named NPC the player already knows (name in the message) →
 *     that NPC; else the NPC the player is facing (aim) → that NPC; else → the
 *     surroundings (ambient reaction, no specific NPC).
 *
 * All pure + unit-tested; the scene supplies candidates + the player's facing.
 */

export type Tone = 'normal' | 'shout';

export interface Vec2 {
  x: number;
  z: number;
}

export interface AddressCandidate {
  id: string;
  name: string;
  position: Vec2;
}

export type AddressResolution =
  | { kind: 'npc'; id: string; tone: Tone }
  | { kind: 'ambient'; tone: Tone };

/** A shout marker the player can type: *shout* or *grito* (reuses the *emote* parser). */
export const SHOUT_RE = /\*\s*(shout|grito)\s*\*/i;

/** Reach of normal (non-shouted) speech, in metres. */
export const NORMAL_SPEAK_RANGE = 18;

/** Half-angle (radians) of the "facing" cone for aim-based addressing (~70°). */
export const FACE_CONE = (70 * Math.PI) / 180;

export function detectTone(message: string): Tone {
  return SHOUT_RE.test(message) ? 'shout' : 'normal';
}

/**
 * Remove the shout marker from a message — it's a tone directive (sets reach),
 * not a spoken word or an action emote, so it must not leak into the displayed
 * line, the NPC prompt, or the emote-intent classifier.
 */
export function stripShout(message: string): string {
  return message.replace(/\*\s*(shout|grito)\s*\*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Smallest signed difference between two angles, in (-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

function mentionsName(message: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(message);
}

/**
 * Resolve who the player is addressing. `player.facingYaw` uses the world facing
 * convention (atan2(dx, dz)); the NPC's direction is computed the same way.
 */
export function resolveAddressee(
  message: string,
  player: { x: number; z: number; facingYaw: number },
  candidates: AddressCandidate[],
  opts: { normalRange?: number; faceCone?: number } = {}
): AddressResolution {
  const tone = detectTone(message);
  const range = tone === 'shout' ? Infinity : (opts.normalRange ?? NORMAL_SPEAK_RANGE);
  const cone = opts.faceCone ?? FACE_CONE;
  const inReach = candidates.filter((c) => dist(player, c.position) <= range);

  // 1) name match — names are always visible (anti-metagaming reverted, ADR-0033).
  const named = inReach.find((c) => mentionsName(message, c.name));
  if (named) return { kind: 'npc', id: named.id, tone };

  // 2) aim — the in-reach NPC closest to the player's facing direction (within the cone),
  //    tie-broken by distance.
  let faced: AddressCandidate | null = null;
  let bestErr = cone;
  let bestDist = Infinity;
  for (const c of inReach) {
    const toNpc = Math.atan2(c.position.x - player.x, c.position.z - player.z);
    const err = Math.abs(angleDelta(toNpc, player.facingYaw));
    const d = dist(player, c.position);
    if (err <= cone && (err < bestErr - 1e-9 || (Math.abs(err - bestErr) <= 1e-9 && d < bestDist))) {
      faced = c;
      bestErr = err;
      bestDist = d;
    }
  }
  if (faced) return { kind: 'npc', id: faced.id, tone };

  // 3) nobody addressed → react to the surroundings.
  return { kind: 'ambient', tone };
}
