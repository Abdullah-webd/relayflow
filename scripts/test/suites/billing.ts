import { users, monitors, type User } from "../../../src/server/db";
import { createSession } from "../../../src/server/auth/session";
import { limitsForUser, withinQuota } from "../../../src/server/billing/access";
import { toolByName } from "../../../src/server/agent/tools";
import { suite, check, api, sleep } from "../kit";

let n = 0;
async function mkUser(over: Partial<User>) {
  const now = new Date();
  const u: User = { _id: `bill-${Date.now()}-${n++}`, email: `bill${Date.now()}${n}@example.invalid`, passwordHash: "x", emailVerified: true, timezone: "UTC", createdAt: now, updatedAt: now, ...over };
  await users().insertOne(u);
  return { u, token: await createSession(u._id) };
}
const monitorBody = (i: number, platform = "whatsapp") => JSON.stringify({ title: `M${i}`, platform, group: null, condition: "someone asks about price", mode: "match", intervalMinutes: 30 });
const taskBody = (i: number) => JSON.stringify({ title: `T${i}`, instruction: "say hi", schedule: "daily", runAt: new Date(Date.now() + 864e5).toISOString() });

export default async function billing() {
  suite("Plans, paywall & limits");
  const plans = (await api("/api/billing/plans")).body;
  check("two plans: Starter $15, Pro $30", plans.plans?.map((p: any) => `${p.key}:${p.priceUsd}`).join(",") === "starter:15,pro:30");

  // Trial = Pro; expiry blocks everything.
  const { u: trial, token: tt } = await mkUser({ subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(Date.now() + 864e5) });
  check("trial gets the smarter model", limitsForUser(trial).model === "advanced");
  check("trial user can use the app", (await api("/api/chats", { token: tt })).status === 200);
  await users().updateOne({ _id: trial._id }, { $set: { trialEndsAt: new Date(Date.now() - 1000) } });
  const blocked = await api("/api/chats", { token: tt });
  check("expired trial is blocked (402)", blocked.status === 402 && /trial has ended/.test(blocked.body.detail));
  const me = await api("/api/auth/me", { token: tt });
  check("profile shows trial_expired, no access", me.body.user?.subscriptionStatus === "trial_expired" && me.body.user?.hasAccess === false);
  check("no session → 401", (await api("/api/chats", { token: "nope" })).status === 401);

  // Starter limits.
  const { u: st, token: stt } = await mkUser({ subscriptionStatus: "active", plan: "starter", stripeSubscriptionId: "sub_dummy" });
  check("Starter uses the standard model", limitsForUser(st).model === "standard");
  for (let i = 1; i <= 3; i++) await api("/api/monitors", { method: "POST", token: stt, body: monitorBody(i) });
  let r = await api("/api/monitors", { method: "POST", token: stt, body: monitorBody(4) });
  check("Starter: 4th monitor blocked", r.status === 403 && r.body.error === "plan_limit");
  for (let i = 1; i <= 5; i++) await api("/api/tasks", { method: "POST", token: stt, body: taskBody(i) });
  check("Starter: 6th scheduled task blocked", (await api("/api/tasks", { method: "POST", token: stt, body: taskBody(6) })).status === 403);
  const mine = (await api("/api/monitors", { token: stt })).body.monitors;
  await api(`/api/monitors/${mine[0].id}`, { method: "PATCH", token: stt, body: JSON.stringify({ active: false }) });
  await api("/api/monitors", { method: "POST", token: stt, body: monitorBody(5) });
  r = await api(`/api/monitors/${mine[0].id}`, { method: "PATCH", token: stt, body: JSON.stringify({ active: true }) });
  check("Starter: re-activating over the limit blocked", r.status === 403);
  const tool: any = await toolByName.get("prepare_monitor")!.handler(st._id, { title: "x", platform: "whatsapp", group: null, condition: "y", mode: "match", interval_minutes: 30, absence_hours: null });
  check("agent explains the Starter limit", tool.error === "plan_limit");
  check("Starter: knowledge base is Pro-only", (await api("/api/knowledge/docs", { method: "POST", token: stt, body: JSON.stringify({ title: "FAQ", source: "text", text: "hi" }) })).status === 403);
  const state = (await api("/api/billing/state", { token: stt })).body;
  check("Settings shows usage 3 of 3", state.limits?.monitors === 3 && state.usage?.monitors === 3);

  // Downgrade pauses the newest items over the limit.
  const { u: down, token: dt } = await mkUser({ subscriptionStatus: "active", plan: "pro", stripeSubscriptionId: "sub_dummy2" });
  for (let i = 1; i <= 4; i++) { await api("/api/monitors", { method: "POST", token: dt, body: monitorBody(i) }); await sleep(15); }
  await users().updateOne({ _id: down._id }, { $set: { plan: "starter" } });
  const ms = await monitors().find({ userId: down._id }).sort({ createdAt: 1 }).toArray();
  const runs = await Promise.all(ms.map((m) => withinQuota(down._id, "monitors", m._id)));
  check("downgrade: oldest 3 run, newest pauses", runs.join(",") === "true,true,true,false");

  // Billing guards (no Stripe calls).
  check("checkout requires a plan", (await api("/api/billing/checkout", { method: "POST", token: dt, body: "{}" })).status === 400);
  check("already-subscribed can't check out twice", (await api("/api/billing/checkout", { method: "POST", token: dt, body: JSON.stringify({ plan: "pro" }) })).status === 409);
  check("switching to the same plan rejected", (await api("/api/billing/change-plan", { method: "POST", token: stt, body: JSON.stringify({ plan: "starter" }) })).status === 400);
  check("Gmail stays disabled", (await api("/api/connections/gmail/start", { token: dt })).status === 410);
  check("Gmail monitors rejected", (await api("/api/monitors", { method: "POST", token: dt, body: monitorBody(9, "gmail") })).status === 400);
}
