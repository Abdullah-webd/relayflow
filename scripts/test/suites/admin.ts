import { users, reports, usageDaily, type User } from "../../../src/server/db";
import { createSession } from "../../../src/server/auth/session";
import { adminLogin, hashAdminPassword, verifyAdminPassword } from "../../../src/server/admin/auth";
import { TEST_ADMIN } from "../env";
import { suite, check, api } from "../kit";

let n = 0;
async function mkUser(over: Partial<User> = {}) {
  const now = new Date();
  const u: User = { _id: `adm-${Date.now()}-${n++}`, email: `adm${Date.now()}${n}@example.invalid`, name: "Ada Obi", passwordHash: "x", emailVerified: true, timezone: "UTC", subscriptionStatus: "trialing", trialSource: "app", trialEndsAt: new Date(Date.now() + 864e5), createdAt: now, updatedAt: now, ...over };
  await users().insertOne(u);
  return { u, token: await createSession(u._id) };
}
const json = (b: unknown) => JSON.stringify(b);
// 1×1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export default async function admin() {
  suite("Report a problem (users)");
  const { u, token } = await mkUser();
  const { u: other, token: otherToken } = await mkUser();
  check("reporting needs sign-in", (await api("/api/reports", { method: "POST", body: json({}) })).status === 401);
  let r = await api("/api/reports", { method: "POST", token, body: json({ category: "bug", title: "x", description: "short" }) });
  check("a too-short report gets a clear message", r.status === 400 && /title/i.test(r.body.detail));
  r = await api("/api/reports", { method: "POST", token, body: json({ category: "connection", title: "WhatsApp keeps disconnecting", description: "It disconnects every evening around 8pm.", page: "connections", screenshot: PNG, viewport: "1440x900" }) });
  check("report saved with its screenshot", r.status === 200 && r.body.report?.status === "open" && r.body.report?.hasScreenshot === true);
  const reportId = r.body.report?.id;
  check("a non-image 'screenshot' is refused", (await api("/api/reports", { method: "POST", token, body: json({ category: "bug", title: "Bad file", description: "attaching a script file", screenshot: "data:text/html;base64,PHNjcmlwdD4=" }) })).status === 400);
  const { token: expiredToken } = await mkUser({ trialEndsAt: new Date(Date.now() - 1000) });
  check("users whose trial ended can still report", (await api("/api/reports", { method: "POST", token: expiredToken, body: json({ category: "billing", title: "Can't pay", description: "The checkout page won't load for me." }) })).status === 200);
  check("users only see their own reports", (await api("/api/reports", { token })).body.reports?.length === 1 && (await api("/api/reports", { token: otherToken })).body.reports?.length === 0);

  suite("Usage tracking");
  check("unknown tab rejected", (await api("/api/track", { method: "POST", token, body: json({ section: "secret", seconds: 0 }) })).status === 400);
  await api("/api/track", { method: "POST", token, body: json({ section: "chat", seconds: 0 }) });
  await api("/api/track", { method: "POST", token, body: json({ section: "chat", seconds: 30 }) });
  await api("/api/track", { method: "POST", token, body: json({ section: "chat", seconds: 30 }) });
  const today = new Date().toISOString().slice(0, 10);
  const row = await usageDaily().findOne({ _id: `${u._id}|${today}|chat` });
  check("a tab visit and its time are recorded", row?.views === 1 && row?.seconds === 60, `${row?.views} views, ${row?.seconds}s`);
  check("last seen + current tab recorded", (await users().findOne({ _id: u._id }))?.lastSection === "chat");

  suite("Admin console: sign-in security");
  const h = hashAdminPassword("correct horse");
  check("password hashes verify only the right password", (await verifyAdminPassword("correct horse", h)) && !(await verifyAdminPassword("correct horsE", h)) && !h.includes("correct"));
  check("admin data needs an admin sign-in", (await api("/api/admin/overview")).status === 401);
  check("a normal user session is not an admin session", (await api("/api/admin/overview", { token })).status === 401 && (await api("/api/admin/overview", { headers: { cookie: `rf_admin=${token}` } })).status === 401);
  check("wrong password refused", (await api("/api/admin/login", { method: "POST", body: json({ email: TEST_ADMIN.email, password: "wrong" }) })).status === 401);
  check("wrong email refused", (await api("/api/admin/login", { method: "POST", body: json({ email: "someone@else.test", password: TEST_ADMIN.password }) })).status === 401);
  const login = await api("/api/admin/login", { method: "POST", body: json({ email: TEST_ADMIN.email.toUpperCase(), password: TEST_ADMIN.password }) });
  const setCookie = login.headers.get("set-cookie") || "";
  const adminToken = /rf_admin=([^;]+)/.exec(setCookie)?.[1] || "";
  check("correct email + password signs in", login.status === 200 && adminToken.length > 40);
  check("admin cookie is HttpOnly, SameSite=Strict, limited to /api/admin", /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Path=\/api\/admin/i.test(setCookie));
  const A = { headers: { cookie: `rf_admin=${adminToken}` } };
  const lockIp = `203.0.113.${Math.floor(Math.random() * 200)}`;
  for (let i = 0; i < 8; i++) await adminLogin(TEST_ADMIN.email, "guess", lockIp);
  check("8 wrong passwords lock that network out, even with the right password", (await adminLogin(TEST_ADMIN.email, TEST_ADMIN.password, lockIp)).ok === false);
  check("…without locking the owner out elsewhere", (await adminLogin(TEST_ADMIN.email, TEST_ADMIN.password, "198.51.100.7")).ok === true);

  suite("Admin console: live data");
  const ov = await api("/api/admin/overview", A);
  check("overview: users, online now, open reports", ov.status === 200 && ov.body.kpis.users >= 3 && ov.body.online.some((o: any) => o.id === u._id && o.section === "chat") && ov.body.kpis.openReports >= 2);
  check("overview: 30-day signups and daily-active charts", ov.body.series.days.length === 30 && ov.body.series.dau[29] >= 1);
  check("admin responses are never cached", ov.headers.get("cache-control") === "no-store");
  const list = await api(`/api/admin/users?q=${encodeURIComponent(u.email)}`, A);
  check("users: search finds the user, never exposes password hashes", list.body.users?.length === 1 && list.body.users[0].openReports === 1 && !JSON.stringify(list.body).includes("passwordHash"));
  const detail = await api(`/api/admin/users/${u._id}`, A);
  check("user detail: tabs used and their reports", detail.body.usage?.[0]?.section === "chat" && detail.body.reports?.length === 1);
  const usage = await api("/api/admin/usage?days=7", A);
  check("usage: most-used tabs and time per active user", usage.body.sections?.[0]?.section === "chat" && usage.body.avgSecondsPerActiveDay > 0 && usage.body.days.length === 7);
  check("channels and revenue load", (await api("/api/admin/channels", A)).status === 200 && typeof (await api("/api/admin/revenue", A)).body.mrr === "number");

  suite("Admin console: reports");
  const rl = await api("/api/admin/reports", A);
  check("all reports listed (screenshots kept out of the list)", rl.body.reports?.some((x: any) => x.id === reportId) && !JSON.stringify(rl.body).includes("base64"));
  const rd = await api(`/api/admin/reports/${reportId}`, A);
  check("report detail has the screenshot and context", rd.body.report?.screenshot === PNG && rd.body.report?.context?.viewport === "1440x900");
  const upd = await api(`/api/admin/reports/${reportId}`, { ...A, method: "PATCH", body: json({ status: "resolved", adminReply: "Fixed: reconnect once and it will stay connected." }) });
  check("admin resolves and replies", upd.status === 200 && upd.body.report?.status === "resolved");
  const mine = (await api("/api/reports", { token })).body.reports?.[0];
  check("the user sees the status and the reply", mine?.status === "resolved" && /Fixed/.test(mine?.adminReply || ""));
  check("users can't change reports", (await api(`/api/admin/reports/${reportId}`, { token, method: "PATCH", body: json({ status: "open" }) })).status === 401);

  await api("/api/admin/logout", { ...A, method: "POST" });
  check("signing out ends the admin session", (await api("/api/admin/overview", A)).status === 401);
  await reports().deleteMany({ userId: { $in: [u._id, other._id] } });
}
