import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { TEST_ADMIN } from "../scripts/test/admin-creds";

// Critical flows, clicked through like a real user. Tests marked "seeded" need the local test
// database (accounts from scripts/test/e2e-seed.ts) and are skipped against the live site.
const LIVE = Boolean(process.env.BASE_URL);
const auth = (): Record<string, string> => (LIVE ? {} : JSON.parse(fs.readFileSync("e2e/.auth.json", "utf8")));

async function signInAs(page: Page, who: "trial" | "expired" | "starter") {
  const base = new URL(test.info().project.use.baseURL as string);
  await page.context().addCookies([{ name: "rf_session", value: auth()[who], domain: base.hostname, path: "/" }]);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("public site", () => {
  test("home page explains the product and offers the trial", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/RelayFlow — AI agent/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Every business chat");
    await expect(page.getByRole("link", { name: "Start free trial" }).first()).toBeVisible();
    await expect(page.locator('img[alt="RelayFlow"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("pricing shows Starter $15 and Pro $30", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("$15", { exact: true })).toBeVisible();
    await expect(page.getByText("$30", { exact: true })).toBeVisible();
    await expect(page.getByText("Most popular")).toBeVisible();
  });

  test("legal pages and a real 404", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy Policy");
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of Service");
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("This page doesn’t exist")).toBeVisible();
  });
});

test.describe("sign-up and sign-in", () => {
  test("sign-up requires agreeing to the Terms and Privacy Policy", async ({ page }) => {
    test.skip(LIVE, "creates an account");
    await page.goto("/signup");
    await page.locator("#email").fill(`e2e-${Date.now()}@example.invalid`);
    await page.locator("#password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert")).toContainText("Please agree to the Terms of Service");
    await expect(page).toHaveURL(/\/signup$/);
    await page.locator("#accept-terms").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify/);
  });

  test("wrong password shows a clear error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("nobody@example.invalid");
    await page.locator('input[type="password"]').fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("dashboard (seeded accounts)", () => {
  test.skip(LIVE, "needs seeded test accounts");

  test("trial user: chats, motion, and instant return to the chat list", async ({ page }) => {
    const errors = collectErrors(page);
    await signInAs(page, "trial");
    await page.goto("/app/chat");
    await expect(page.getByText(/Free trial/).first()).toBeVisible();
    const chatRow = page.getByText("Morning check-in");
    await expect(chatRow).toBeVisible();

    // Tab switch: the page animates in and the sidebar highlight moves.
    await page.getByRole("link", { name: "Connections" }).first().click();
    await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
    await expect(page.locator('nav a[href="/app/connections"] span.absolute')).toHaveCount(1);

    // Back to Chat: the list is there immediately (cached), not blank-then-pop.
    await page.getByRole("link", { name: "Chat" }).first().click();
    await expect(chatRow).toBeVisible({ timeout: 300 });
    expect(errors).toEqual([]);
  });

  test("overview: home screen with the 7-day chart and setup checklist", async ({ page }) => {
    const errors = collectErrors(page);
    await signInAs(page, "trial");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await expect(page.getByRole("heading", { name: "Messages received" })).toBeVisible();
    await expect(page.getByText("Get RelayFlow working for you")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("auto-reply: create one with its own groups, knowledge and rules, then go live", async ({ page }) => {
    const errors = collectErrors(page);
    await signInAs(page, "trial");
    await page.goto("/app/auto-replies");
    await page.getByRole("button", { name: "New auto-reply" }).first().click();
    await page.locator("#ar-name").fill("Shop FAQs");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/app\/auto-replies\/.+/);
    await expect(page.getByText("To go live:")).toBeVisible();

    // Can't go live yet: it says why.
    await page.getByRole("switch", { name: "Live" }).click();
    await expect(page.getByText(/Choose at least one group/)).toBeVisible();

    await page.getByRole("checkbox").first().check();
    await expect(page.getByText(/Answers in “/)).toBeVisible();
    await page.getByLabel("Knowledge title").fill("Delivery");
    await page.getByLabel("Knowledge text").fill("Delivery to Lekki costs N2,500.");
    await page.getByRole("button", { name: "Add knowledge" }).click();
    await expect(page.getByText("Delivery", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Never promise delivery dates/ }).click();
    await page.getByRole("button", { name: "Save rules" }).click();
    await expect(page.getByText("Rules saved")).toBeVisible();

    await page.getByRole("switch", { name: "Live" }).click();
    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("To go live:")).toBeHidden();

    // Back on the list it shows as its own live auto-reply.
    await page.getByRole("link", { name: "All auto-replies" }).click();
    await expect(page.getByText("Shop FAQs")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("report a problem, then the admin replies and resolves it, and the user sees it", async ({ page, browser }) => {
    const errors = collectErrors(page);
    await signInAs(page, "trial");
    await page.goto("/app/reports");
    await page.getByRole("radio", { name: "Channel connection" }).click();
    await page.getByLabel("Short summary").fill("Telegram code never arrives");
    await page.getByLabel("What happened?").fill("I enter my number but the login code never comes.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Thanks, we've got your report")).toBeVisible();
    await expect(page.getByRole("button", { name: /Telegram code never arrives/ })).toBeVisible();

    // Admin, in a separate browser session.
    const admin = await (await browser.newContext()).newPage();
    await admin.goto("/admin");
    await admin.getByLabel("Email").fill(TEST_ADMIN.email);
    await admin.getByLabel("Password", { exact: true }).fill("not-the-password");
    await admin.getByRole("button", { name: "Sign in" }).click();
    await expect(admin.getByRole("alert")).toContainText("don't match");
    await admin.getByLabel("Password", { exact: true }).fill(TEST_ADMIN.password);
    await admin.getByRole("button", { name: "Sign in" }).click();
    await expect(admin).toHaveURL(/\/admin\/overview$/, { timeout: 15_000 }); // the test DB is remote: sign-in can take a few seconds
    await expect(admin.getByText("Open reports")).toBeVisible();
    await admin.getByRole("link", { name: /Reports/ }).click();
    await admin.getByRole("button", { name: /Telegram code never arrives/ }).click();
    await admin.getByLabel(/Reply to/).fill("Fixed: codes now arrive within a minute.");
    await admin.getByRole("button", { name: "Reply and resolve" }).click();
    await expect(admin.getByText("Replied and marked resolved")).toBeVisible();

    // The user's tab picks it up on its own (polls every 20s); reload to check now.
    await page.reload();
    await page.getByRole("button", { name: /Telegram code never arrives/ }).click();
    await expect(page.getByText("Resolved").first()).toBeVisible();
    await expect(page.getByText("Fixed: codes now arrive within a minute.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("admin console: users can't get in without the admin password", async ({ page }) => {
    await signInAs(page, "trial");
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Sign in to the console" })).toBeVisible();
    const res = await page.request.get("/api/admin/users");
    expect(res.status()).toBe(401);
  });

  test("expired trial is sent to the paywall", async ({ page }) => {
    await signInAs(page, "expired");
    await page.goto("/app/chat");
    await expect(page).toHaveURL(/\/pricing/);
    await expect(page.getByText("Your free trial has ended.")).toBeVisible();
  });

  test("Starter plan: knowledge base shows the Pro upgrade", async ({ page }) => {
    await signInAs(page, "starter");
    await page.goto("/app/knowledge"); // old address redirects to Auto-replies
    await expect(page.getByText("Pro feature")).toBeVisible();
    await expect(page.getByRole("link", { name: /Upgrade to Pro/ })).toBeVisible();
  });
});
