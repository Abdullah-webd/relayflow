import { users, authCodes } from "../../../src/server/db";
import { startTrialIfEligible } from "../../../src/server/billing/access";
import { suite, check, api } from "../kit";

export default async function auth() {
  suite("Sign-up, consent & free trial");
  const email = `signup+${Date.now()}@example.invalid`;
  let r = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "password123" }) });
  check("sign-up without accepting the terms is rejected", r.status === 400 && /Terms of Service/.test(r.body.detail));
  r = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "password123", acceptTerms: true }) });
  check("sign-up with consent succeeds", r.status === 200 && r.body.status === "otp_sent");
  const u = await users().findOne({ email });
  check("consent version + time stored", Boolean(u?.termsAcceptedAt) && /^\d{4}-\d{2}-\d{2}$/.test(String(u?.termsVersion)));
  check("no trial before email verification", !u?.subscriptionStatus || u.subscriptionStatus === "none");
  const trial = await startTrialIfEligible(u!);
  const hrs = trial?.trialEndsAt ? (trial.trialEndsAt.getTime() - Date.now()) / 3.6e6 : 0;
  check("verification starts a 1-day no-card trial", trial?.subscriptionStatus === "trialing" && hrs > 23.9 && hrs <= 24);
  await users().updateOne({ _id: u!._id }, { $set: { emailVerified: true } });
  check("an account only ever gets one trial", (await startTrialIfEligible((await users().findOne({ _id: u!._id }))!)) === null);
  await authCodes().deleteMany({ userId: u!._id });
}
