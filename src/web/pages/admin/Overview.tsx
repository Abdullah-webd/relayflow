import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { UserPlus, LifeBuoy } from "lucide-react";
import { Panel, Segmented, ago } from "../../components/ui";
import { EASE_OUT } from "../../components/motion";
import { useAdminLive, Stat, DayBars, Loading, usd, SECTION_LABEL } from "./kit";
import UserDrawer from "./UserDrawer";

interface Data {
  kpis: { users: number; verified: number; newToday: number; new7d: number; onlineNow: number; activeToday: number; active7d: number; trials: number; paying: number; mrr: number; openReports: number; connected: number; needsReconnect: number };
  online: { id: string; name: string; email: string; section: string | null; lastSeenAt: string }[];
  series: { days: string[]; signups: number[]; dau: number[] };
  feed: { id: string; kind: "signup" | "report"; title: string; detail: string; userId: string; reportId?: string; at: string }[];
}

export default function AdminOverview() {
  const { data } = useAdminLive<Data>("/overview", 8_000);
  const [chart, setChart] = useState<"dau" | "signups">("dau");
  const [userId, setUserId] = useState<string | null>(null);
  if (!data) return <Loading />;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={k.users} sub={`+${k.new7d} this week, ${k.newToday} today`} />
        <Stat label="Online now" value={k.onlineNow} sub="Active in the last 2 minutes" />
        <Stat label="Active today" value={k.activeToday} sub={`${k.active7d} in the last 7 days`} />
        <Stat label="Monthly revenue" value={k.mrr} format={usd} sub={`${k.paying} paying, ${k.trials} on trial`} />
        <Stat label="Open reports" value={k.openReports} tone="warn" sub={<Link to="/admin/reports" className="hover:text-brand-700">Go to reports</Link>} />
        <Stat label="Channels connected" value={k.connected} sub={k.needsReconnect ? `${k.needsReconnect} need reconnecting` : "None need reconnecting"} tone={undefined} />
        <Stat label="Verified accounts" value={k.verified} sub={`${k.users - k.verified} not verified yet`} />
        <Stat label="Paying customers" value={k.paying} sub={<Link to="/admin/revenue" className="hover:text-brand-700">See revenue</Link>} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title={chart === "dau" ? "Daily active users" : "Sign-ups per day"}
          description="Last 30 days"
          action={<Segmented id="ov-chart" value={chart} onChange={setChart} options={[{ value: "dau", label: "Active" }, { value: "signups", label: "Sign-ups" }]} />}
        >
          <DayBars key={chart} days={data.series.days} values={chart === "dau" ? data.series.dau : data.series.signups} label={chart === "dau" ? "Daily active users" : "Sign-ups per day"} height={190} />
        </Panel>

        <Panel title="Online now" description="Who is in the dashboard, and on which tab" bodyClass="p-2">
          {data.online.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13.5px] text-ink-500">Nobody is online right now.</p>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {data.online.map((o) => (
                  <motion.li key={o.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, transition: { duration: 0.15 } }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                    <button onClick={() => setUserId(o.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-[12.5px] font-semibold text-white">
                        {o.name[0]?.toUpperCase()}
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink-900">{o.name}</span>
                        <span className="block truncate text-[12px] text-ink-500">
                          On {o.section ? SECTION_LABEL[o.section] ?? o.section : "the dashboard"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink-400">{ago(o.lastSeenAt)}</span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Latest activity" description="New sign-ups and reports, as they happen" bodyClass="p-2">
        {data.feed.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13.5px] text-ink-500">Nothing yet.</p>
        ) : (
          <ul className="grid gap-x-4 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {data.feed.map((f) => (
                <motion.li key={f.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                  {f.kind === "report" ? (
                    <Link to={`/admin/reports?open=${f.reportId}`} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface">
                      <FeedIcon kind={f.kind} />
                      <FeedText f={f} />
                    </Link>
                  ) : (
                    <button onClick={() => setUserId(f.userId)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                      <FeedIcon kind={f.kind} />
                      <FeedText f={f} />
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <UserDrawer userId={userId} onClose={() => setUserId(null)} />
    </div>
  );
}

function FeedIcon({ kind }: { kind: "signup" | "report" }) {
  return kind === "signup" ? (
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
      <UserPlus size={14} />
    </span>
  ) : (
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700">
      <LifeBuoy size={14} />
    </span>
  );
}

function FeedText({ f }: { f: Data["feed"][number] }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[13.5px] font-medium text-ink-900">{f.kind === "report" ? `Report: ${f.title}` : f.title}</span>
        <span className="shrink-0 text-[11.5px] text-ink-400">{ago(f.at)}</span>
      </span>
      <span className="block truncate text-[12.5px] text-ink-500">{f.detail}</span>
    </span>
  );
}
