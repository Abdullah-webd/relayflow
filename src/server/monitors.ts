import { monitors, users, type Monitor, type Platform } from "./db";
import { getRecentMessages } from "./connectors/manager";
import { judgeMonitor } from "./agent/monitorJudge";
import { sendEmail } from "./lib/email";
import { env } from "./env";
import { tryConsumeCredits } from "./billing/stripe";
import { CREDITS_PER_MESSAGE } from "./billing/plans";

export const MIN_INTERVAL_MINUTES = 15;
export const DEFAULT_INTERVAL_MINUTES = 30;

const PLATFORM_LABEL: Record<Platform, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };

function target(m: Monitor): string {
  return `${PLATFORM_LABEL[m.platform]}${m.group ? ` · ${m.group}` : ""}`;
}

async function notify(m: Monitor, subject: string, body: string): Promise<void> {
  const user = await users().findOne({ _id: m.userId });
  if (!user?.email) return;
  await sendEmail(user.email, subject, body).catch((e) => console.error(`[monitor] email failed: ${(e as Error).message}`));
}

async function runMonitor(m: Monitor): Promise<void> {
  const now = new Date();

  // Read a recent slice for the target (reuses the same fetch the agent uses; works for
  // all 4 channels). Only consider messages strictly newer than our watermark, and never
  // our own outbound sends.
  const recent = await getRecentMessages(m.userId, { platform: m.platform, group: m.group, limit: 30 });
  const fresh = recent
    .filter((r) => r.occurredAt.getTime() > m.lastSeenAt.getTime())
    .filter((r) => r.senderName !== "You (via RelayFlow)")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const newestSeen = recent.reduce((mx, r) => Math.max(mx, r.occurredAt.getTime()), m.lastSeenAt.getTime());
  const patch: Partial<Monitor> = { lastCheckedAt: now, updatedAt: now, lastSeenAt: new Date(newestSeen) };

  // Cheap-and-safe optimization: if nothing new arrived, don't spend an LLM call.
  let judged = { matched: false, summary: "" };
  if (fresh.length > 0) {
    if (env.stripe.enabled) {
      const paid = await tryConsumeCredits(m.userId, CREDITS_PER_MESSAGE);
      if (!paid) {
        // Out of credits: don't advance the watermark, so these messages get judged once
        // the user tops up. Just note it and wait for the next interval.
        await monitors().updateOne({ _id: m._id }, { $set: { lastCheckedAt: now, updatedAt: now, lastResult: "Skipped — out of AI credits" } });
        return;
      }
    }
    judged = await judgeMonitor(
      m.condition,
      fresh.map((f) => ({ from: f.senderName, text: f.text, channel: f.destinationName, at: f.occurredAt.toISOString() })),
    );
  }

  if (m.mode === "match") {
    if (judged.matched) {
      await notify(
        m,
        `RelayFlow monitor: ${m.title}`,
        `Your monitor "${m.title}" matched.\n\n${judged.summary}\n\nWatching: ${target(m)}\nCondition: ${m.condition}\n\n— RelayFlow`,
      );
      patch.lastResult = `Matched: ${judged.summary}`.slice(0, 500);
    } else {
      patch.lastResult = fresh.length ? "Checked — no match" : "Checked — nothing new";
    }
  } else {
    // absence mode: the user is waiting for `condition` to happen.
    if (judged.matched) {
      await notify(
        m,
        `RelayFlow: "${m.title}" — it arrived`,
        `Good news — what you were waiting for showed up.\n\nMonitor: "${m.title}"\n${judged.summary}\n\nWatching: ${target(m)}\n\n— RelayFlow`,
      );
      patch.active = false; // goal met
      patch.lastResult = `Arrived: ${judged.summary}`.slice(0, 500);
    } else if (m.absenceDeadline && now.getTime() >= m.absenceDeadline.getTime()) {
      await notify(
        m,
        `RelayFlow: "${m.title}" — still nothing`,
        `Heads up — you asked me to watch for:\n"${m.condition}"\n\nI checked ${target(m)} and did not see it by ${m.absenceDeadline.toLocaleString()}.\n\n— RelayFlow`,
      );
      patch.active = false;
      patch.lastResult = "Absence alert sent";
    } else {
      patch.lastResult = "Checked — not yet";
    }
  }

  if (m.expiresAt && now.getTime() >= m.expiresAt.getTime()) patch.active = false;
  await monitors().updateOne({ _id: m._id }, { $set: patch });
}

/** Called on every scheduler tick: run every active monitor whose interval is due. */
export async function runDueMonitors(): Promise<void> {
  const now = new Date();
  const active = await monitors().find({ active: true }).limit(100).toArray();
  const due = active.filter((m) => {
    const every = Math.max(MIN_INTERVAL_MINUTES, m.intervalMinutes) * 60_000;
    return !m.lastCheckedAt || now.getTime() - m.lastCheckedAt.getTime() >= every;
  });
  for (const m of due) {
    await runMonitor(m).catch((e) => console.error(`[monitor] ${m._id} failed: ${(e as Error).message}`));
  }
}
