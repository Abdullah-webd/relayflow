import { randomUUID } from "node:crypto";
import { locks } from "../db";

/**
 * Single-runner lock for background work (WhatsApp/Telegram sessions, Slack sync, scheduler,
 * monitors). During a deploy Railway briefly runs the old and new server side by side; if both
 * log into WhatsApp/Telegram with the same session, WhatsApp kicks one off (code 440) and
 * Telegram permanently revokes the session (AUTH_KEY_DUPLICATED). Only the lock holder may
 * open channel sessions. The old server releases the lock on SIGTERM; the new one takes over.
 */
const LOCK_ID = "background-runner";
const TTL_MS = 30_000;
const RENEW_MS = 10_000;
export const instanceId = randomUUID();

let leader = false;
let renewTimer: ReturnType<typeof setInterval> | null = null;

export function isLeader(): boolean {
  return leader;
}

/** Take or renew a lock. Exported for tests (use a separate lock id there). */
export async function acquireLock(lockId: string, holder: string, ttlMs = TTL_MS): Promise<boolean> {
  const now = new Date();
  try {
    const res = await locks().findOneAndUpdate(
      { _id: lockId, $or: [{ holder }, { expiresAt: { $lt: now } }] },
      { $set: { holder, expiresAt: new Date(now.getTime() + ttlMs) } },
      { upsert: true, returnDocument: "after" },
    );
    return res?.holder === holder;
  } catch {
    // Duplicate-key on upsert = someone else holds a live lock.
    return false;
  }
}
const tryAcquire = () => acquireLock(LOCK_ID, instanceId);

/** Wait until this instance holds the lock, then call `onAcquire`. Keeps renewing it. */
export async function runAsLeader(onAcquire: () => void, onLost: () => void): Promise<void> {
  while (!(await tryAcquire())) {
    await new Promise((r) => setTimeout(r, 3_000));
  }
  leader = true;
  console.info(`[leader] this instance now runs channel connections (${instanceId.slice(0, 8)})`);
  onAcquire();
  renewTimer = setInterval(async () => {
    if (!(await tryAcquire())) {
      console.warn("[leader] lost the background lock; stopping channel connections");
      leader = false;
      if (renewTimer) clearInterval(renewTimer);
      onLost();
    }
  }, RENEW_MS);
  renewTimer.unref?.();
}

/** Give up the lock (on shutdown) so the next instance can start immediately. */
export async function releaseLeadership(): Promise<void> {
  if (renewTimer) clearInterval(renewTimer);
  if (!leader) return;
  leader = false;
  await locks().deleteOne({ _id: LOCK_ID, holder: instanceId }).catch(() => undefined);
}
