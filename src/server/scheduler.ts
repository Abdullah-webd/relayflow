import cron from "node-cron";
import { scheduledTasks, users, type ScheduledTask } from "./db";
import { streamRun } from "./agent/agent";
import { sendToTargets, type SendTarget } from "./connectors/manager";
import { sendEmail } from "./lib/email";

async function runTask(task: ScheduledTask): Promise<void> {
  const user = await users().findOne({ _id: task.userId });
  const tz = task.timezone || "UTC";

  // Run the instruction through the agent headlessly.
  let finalText = "";
  const toolResults: any[] = [];
  try {
    for await (const ev of streamRun(task.userId, task.instruction, null, tz)) {
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

export function startScheduler(): void {
  // Tick once a minute; run everything that is due.
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const due = await scheduledTasks().find({ active: true, runAt: { $lte: now } }).limit(25).toArray();
    for (const task of due) {
      runTask(task).catch((error) => console.error(`[scheduler] task ${task._id} failed`, error));
    }
  });
  console.log("[scheduler] started (1-minute tick)");
}
