import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ChannelIcon, PLATFORM_LABEL, ago, when, type Tone } from "../../components/ui";
import { adminApi, AdminAuthError, Drawer, RankBars, duration, SECTION_LABEL, useAdmin } from "./kit";
import { STATUS } from "../app/Reports";

interface Detail {
  user: { id: string; email: string; name: string | null; verified: boolean; plan: { label: string; tone: Tone }; timezone: string; createdAt: string; lastSeenAt: string | null; lastSection: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  connections: { id: string; platform: string; status: string; displayName: string; lastError: string | null; updatedAt: string }[];
  usage: { section: string; seconds: number; views: number }[];
  counts: { autoReplies: number; monitors: number; schedules: number; chats: number; questionsAsked: number; autoRepliesSent: number };
  reports: { id: string; title: string; status: keyof typeof STATUS; createdAt: string }[];
}

const CONN_TONE: Record<string, Tone> = { connected: "live", error: "bad", disconnected: "idle" };

export default function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { signedOut } = useAdmin();
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    setD(null);
    if (!userId) return;
    const load = () => adminApi<Detail>(`/users/${userId}`).then(setD).catch((e) => e instanceof AdminAuthError && signedOut());
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(t);
  }, [userId]);

  const online = d?.user.lastSeenAt && Date.now() - new Date(d.user.lastSeenAt).getTime() < 120_000;
  return (
    <Drawer
      open={!!userId}
      onClose={onClose}
      title={
        d ? (
          <div>
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-[19px] font-semibold text-navy">{d.user.name || d.user.email}</h2>
              <Badge tone={d.user.plan.tone}>{d.user.plan.label}</Badge>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-ink-500">{d.user.email}</p>
          </div>
        ) : (
          <div className="h-10 w-56 animate-pulse rounded-lg bg-surface" />
        )
      }
    >
      {!d ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="space-y-7">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px]">
            <Info label="Last seen">{online ? <span className="text-emerald-700">Online now{d.user.lastSection ? `, on ${SECTION_LABEL[d.user.lastSection] ?? d.user.lastSection}` : ""}</span> : ago(d.user.lastSeenAt)}</Info>
            <Info label="Joined">{when(d.user.createdAt)}</Info>
            <Info label="Email verified">{d.user.verified ? "Yes" : "Not yet"}</Info>
            <Info label="Timezone">{d.user.timezone}</Info>
            {d.user.trialEndsAt && <Info label="Trial ends">{when(d.user.trialEndsAt)}</Info>}
            {d.user.currentPeriodEnd && <Info label={d.user.cancelAtPeriodEnd ? "Cancels on" : "Renews"}>{when(d.user.currentPeriodEnd)}</Info>}
          </dl>

          <section>
            <h3 className="text-[13px] font-semibold text-ink-900">Channels</h3>
            {d.connections.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-500">No channels connected.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {d.connections.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <ChannelIcon platform={c.platform} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink-900">{PLATFORM_LABEL[c.platform]} <span className="text-ink-500">{c.displayName}</span></span>
                      {c.lastError && <span className="block truncate text-[12px] text-red-600">{c.lastError}</span>}
                    </span>
                    <Badge tone={CONN_TONE[c.status] ?? "warn"} dot>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink-900">What they've set up</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ["Auto-replies", d.counts.autoReplies],
                ["Monitors", d.counts.monitors],
                ["Schedules", d.counts.schedules],
                ["Chats", d.counts.chats],
                ["Questions asked", d.counts.questionsAsked],
                ["Auto-answers sent", d.counts.autoRepliesSent],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-xl border border-line px-3 py-2.5">
                  <div className="text-[11.5px] text-ink-500">{l}</div>
                  <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-ink-900">{(v as number).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink-900">Time spent per tab (30 days)</h3>
            <div className="mt-3">
              <RankBars items={d.usage.map((u) => ({ key: u.section, label: SECTION_LABEL[u.section] ?? u.section, value: u.seconds, sub: `${u.views} visits` }))} format={duration} />
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink-900">Reports</h3>
            {d.reports.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-500">No reports.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {d.reports.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/reports?open=${r.id}`} onClick={onClose} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-900">{r.title}</span>
                      <span className="text-[12px] text-ink-400">{ago(r.createdAt)}</span>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-ink-900">{children}</dd>
    </div>
  );
}
