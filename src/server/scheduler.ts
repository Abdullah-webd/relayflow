import cron from "node-cron";
import { scheduledTasks, users, type ScheduledTask } from "./db";
import { streamRun } from "./agent/agent";
import { sendToTargets, type SendTarget } from "./connectors/manager";
import { sendEmail } from "./lib/email";
import { runDueMonitors } from "./monitors";
import { runAutoReplyTick } from "./knowledge/autoReplyPoller";
import { userHasAccessById, withinQuota } from "./billing/access";
import { isLeader } from "./runtime/leader";
import { pollSlack } from "./connectors/slack";

async function runTask(task: ScheduledTask): Promise<void> {
  // Paywall guardrail: no trial/subscription means the agent does no work for this account.
  // Plan guardrail: after a downgrade to Starter only the oldest 5 active tasks run.
  const access = await userHasAccessById(task.userId);
  const inQuota = access && (await withinQuota(task.userId, "scheduledTasks", task._id));
  if (!access || !inQuota) {
    const reason = access ? "Paused: over the Starter plan limit (upgrade to Pro for unlimited)" : "Paused: subscription required";
    const paused: Record<string, unknown> = { lastResult: reason, updatedAt: new Date() };
    if (task.schedule === "once") {
      paused.runAt = new Date(Date.now() + 60 * 60 * 1000); // keep it pending; retry hourly
    } else {
      const next = new Date((task.runAt ?? new Date()).getTime()); // skip this run, keep the usual time
      next.setUTCDate(next.getUTCDate() + (task.schedule === "weekly" ? 7 : 1));
      paused.runAt = next;
    }
    await scheduledTasks().updateOne({ _id: task._id }, { $set: paused });
    return;
  }
  const user = await users().findOne({ _id: task.userId });
  const tz = task.timezone || "UTC";

  // Run the instruction through the agent headlessly.
  let finalText = "";
  const toolResults: any[] = [];
  try {
    for await (const ev of streamRun(task.userId, task.instruction, [], tz)) {
      if (ev.type === "final") {
        finalText = ev.text;
        toolResults.push(...(ev.toolResults as any[]));
      }
    }
  } catch (error) {
    finalText = `Task failed: ${(error as Error).message}`;
  }

  // A scheduled task is pre-approved by the user, so auto-execute any prepared sends.
  const sendSummaries: string[] = [];
  for (const tr of toolResults) {
    if (tr?.name === "prepare_send" && tr?.result?.targets?.length && tr?.result?.content) {
      const results = await sendToTargets(task.userId, tr.result.targets as SendTarget[], tr.result.content);
      results.forEach((r) => sendSummaries.push(`${r.destinationName}: ${r.ok ? "sent" : `failed (${r.error})`}`));
    }
  }

  const body =
    (finalText || "Your scheduled task ran.") +
    (sendSummaries.length ? `\n\nSends: ${sendSummaries.join(", ")}` : "");
  if (user?.email) {
    try {
      await sendEmail(user.email, `RelayFlow: ${task.title}`, body);
    } catch (error) {
      console.error(`[scheduler] email failed for task ${task._id}: ${(error as Error).message}`);
    }
  }

  // Advance or deactivate.
  const patch: Record<string, unknown> = { lastRunAt: new Date(), lastResult: body.slice(0, 500), updatedAt: new Date() };
  if (task.schedule === "once") {
    patch.active = false;
  } else {
    const next = new Date((task.runAt ?? new Date()).getTime());
    next.setUTCDate(next.getUTCDate() + (task.schedule === "weekly" ? 7 : 1));
    patch.runAt = next;
  }
  await scheduledTasks().updateOne({ _id: task._id }, { $set: patch });
}

let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function stopScheduler(): void {
  cronTask?.stop();
  cronTask = null;
}

export function startScheduler(): void {
  if (cronTask) return;
  // Tick once a minute; run everything that is due (lock holder only — see runtime/leader.ts).
  cronTask = cron.schedule("* * * * *", async () => {
    if (!isLeader()) return;
    const now = new Date();
    const due = await scheduledTasks().find({ active: true, runAt: { $lte: now } }).limit(25).toArray();
    for (const task of due) {
      runTask(task).catch((error) => console.error(`[scheduler] task ${task._id} failed`, error));
    }
    // Interval-based channel monitors (checks only those whose interval is due).
    runDueMonitors().catch((error) => console.error("[monitors] tick failed", error));
    // Auto-reply: answer new inbound messages on enabled channels from the knowledge base.
    runAutoReplyTick().catch((error) => console.error("[auto-reply] tick failed", error));
    // Slack safety net: poll every 2 minutes when Slack's live events aren't arriving.
    pollSlack().catch((error) => console.error("[slack] poll failed", error));
  });
  console.log("[scheduler] started (1-minute tick)");
}
