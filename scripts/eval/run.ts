/**
 * RelayFlow offline eval. Measures the REAL agent + monitor-judge code against a fixed
 * golden set on seeded, deterministic data. Reports accuracy + latency + token cost, and
 * is model-agnostic: point OPENAI_MODEL / OPENAI_BASE_URL at any provider and re-run to
 * compare (e.g. OpenAI vs DeepSeek).
 *
 *   npm run eval
 */
import { env } from "../../src/server/env";
import { connectDb, connections, destinations, channelMessages, type Platform } from "../../src/server/db";
import { streamRun } from "../../src/server/agent/agent";
import { judgeMonitor } from "../../src/server/agent/monitorJudge";
import { MONITOR_CASES, AGENT_CASES } from "./datasets";

const USER = "eval-user-fixed";

async function seed() {
  // Clean any prior eval data, then seed a deterministic workspace.
  await connections().deleteMany({ userId: USER });
  await destinations().deleteMany({ userId: USER });
  await channelMessages().deleteMany({ userId: USER });

  const now = new Date();
  const conn = (id: string, platform: Platform) => ({
    _id: id, userId: USER, platform, status: "connected" as const, displayName: platform,
    externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: now, createdAt: now, updatedAt: now,
  });
  await connections().insertMany([conn("eval-wa", "whatsapp"), conn("eval-tg", "telegram")]);

  const dest = (connectionId: string, platform: Platform, externalId: string, name: string) => ({
    _id: `d-${externalId}`, userId: USER, connectionId, platform, externalId, name, kind: "group", selected: true, createdAt: now, updatedAt: now,
  });
  await destinations().insertMany([
    dest("eval-wa", "whatsapp", "wa-study", "Study Master"),
    dest("eval-wa", "whatsapp", "wa-squad", "Squad Hackathon 3.0"),
    dest("eval-wa", "whatsapp", "wa-family", "Family Group"),
    dest("eval-tg", "telegram", "tg-dev", "Dev Syndicate"),
  ]);

  const msg = (i: number, sender: string, text: string) => ({
    _id: `m-${i}`, userId: USER, connectionId: "eval-wa", platform: "whatsapp" as Platform, destinationId: "wa-study",
    destinationName: "Study Master", externalId: `wa-study:${i}`, senderName: sender, direction: "inbound" as const,
    text, occurredAt: new Date(now.getTime() - i * 60_000), createdAt: now,
  });
  await channelMessages().insertMany([
    msg(1, "Ada", "Please share the notes from yesterday"),
    msg(2, "Tunde", "What time is the study session today?"),
    msg(3, "Grace", "Thanks everyone, see you at 6"),
  ]);
}

async function cleanup() {
  await connections().deleteMany({ userId: USER });
  await destinations().deleteMany({ userId: USER });
  await channelMessages().deleteMany({ userId: USER });
}

async function runAgentCase(input: string) {
  const startedAt = Date.now();
  let text = "";
  let tools: any[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };
  for await (const ev of streamRun(USER, input, null, "Africa/Lagos")) {
    if (ev.type === "final") {
      text = ev.text;
      tools = (ev.toolResults as any[]) || [];
      usage = ev.usage || usage;
    }
  }
  return { text, tools, usage, ms: Date.now() - startedAt };
}

async function main() {
  await connectDb();
  await seed();

  console.log(`\n=== RelayFlow eval · model=${env.openaiModel}${env.openaiBaseUrl ? ` @ ${env.openaiBaseUrl}` : " (OpenAI)"} ===\n`);

  // ---------- Monitor judge ----------
  let tp = 0, fp = 0, tn = 0, fn = 0, mMs = 0, mIn = 0, mOut = 0;
  const mistakes: string[] = [];
  // small concurrency to speed it up
  const batch = 5;
  const results: boolean[] = [];
  for (let i = 0; i < MONITOR_CASES.length; i += batch) {
    const slice = MONITOR_CASES.slice(i, i + batch);
    const out = await Promise.all(slice.map((c) => judgeMonitor(c.condition, [{ from: "User", text: c.message, channel: "Test", at: new Date().toISOString() }])));
    out.forEach((r, j) => {
      const c = slice[j];
      results.push(r.matched);
      mMs += r.ms || 0;
      mIn += r.usage?.inputTokens || 0;
      mOut += r.usage?.outputTokens || 0;
      if (r.matched && c.shouldMatch) tp++;
      else if (r.matched && !c.shouldMatch) { fp++; mistakes.push(`  FALSE POSITIVE — "${c.condition}" ⇐ "${c.message}"`); }
      else if (!r.matched && !c.shouldMatch) tn++;
      else { fn++; mistakes.push(`  MISSED (false negative) — "${c.condition}" ⇐ "${c.message}"`); }
    });
    process.stdout.write(`  monitor judged ${Math.min(i + batch, MONITOR_CASES.length)}/${MONITOR_CASES.length}\r`);
  }
  const total = MONITOR_CASES.length;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / total;
  console.log(`\n── Monitor judge (${total} cases) ──`);
  console.log(`  accuracy ${(accuracy * 100).toFixed(1)}%  precision ${(precision * 100).toFixed(1)}%  recall ${(recall * 100).toFixed(1)}%  F1 ${(f1 * 100).toFixed(1)}%`);
  console.log(`  confusion: TP=${tp} FP=${fp} TN=${tn} FN=${fn}`);
  console.log(`  avg latency ${(mMs / total).toFixed(0)}ms/call  ·  tokens in=${mIn} out=${mOut} (avg ${((mIn + mOut) / total).toFixed(0)}/call)`);
  if (mistakes.length) {
    console.log(`  misclassified:`);
    mistakes.forEach((m) => console.log(m));
  }

  // ---------- Agent golden cases ----------
  console.log(`\n── Agent behavior (${AGENT_CASES.length} cases) ──`);
  let pass = 0, aMs = 0, aIn = 0, aOut = 0;
  const failures: string[] = [];
  for (const c of AGENT_CASES) {
    const r = await runAgentCase(c.input);
    aMs += r.ms; aIn += r.usage.inputTokens; aOut += r.usage.outputTokens;
    const verdict = c.check(r.text, r.tools);
    if (verdict.pass) { pass++; console.log(`  ✅ ${c.name}  (${(r.ms / 1000).toFixed(1)}s)`); }
    else { failures.push(`  ❌ ${c.name} — ${verdict.detail}`); console.log(`  ❌ ${c.name}  (${(r.ms / 1000).toFixed(1)}s)`); }
  }
  console.log(`\n  passed ${pass}/${AGENT_CASES.length}`);
  console.log(`  avg latency ${(aMs / AGENT_CASES.length / 1000).toFixed(1)}s/turn  ·  tokens in=${aIn} out=${aOut} (avg ${((aIn + aOut) / AGENT_CASES.length).toFixed(0)}/turn)`);
  if (failures.length) { console.log(`  failures:`); failures.forEach((f) => console.log(f)); }

  console.log(`\n=== SUMMARY (${env.openaiModel}) ===`);
  console.log(`  Monitor: acc ${(accuracy * 100).toFixed(1)}% · P ${(precision * 100).toFixed(1)}% · R ${(recall * 100).toFixed(1)}% · ${(mMs / total).toFixed(0)}ms · ${((mIn + mOut) / total).toFixed(0)} tok/call`);
  console.log(`  Agent:   ${pass}/${AGENT_CASES.length} passed · ${(aMs / AGENT_CASES.length / 1000).toFixed(1)}s/turn · ${((aIn + aOut) / AGENT_CASES.length).toFixed(0)} tok/turn`);
  console.log(`  Total LLM tokens this run: ${mIn + mOut + aIn + aOut}\n`);

  await cleanup();
  process.exit(failures.length || mistakes.length > total * 0.15 ? 1 : 0);
}

main().catch((e) => {
  console.error("eval failed:", e);
  process.exit(1);
});
