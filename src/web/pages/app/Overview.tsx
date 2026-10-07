import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useStickyState } from "../../lib/sticky";
import { Rise, EASE_OUT } from "../../components/motion";
import { Page, PageHeader, Panel, Badge, ChannelIcon, EmptyState, PLATFORM_COLOR, PLATFORM_LABEL, ago, when } from "../../components/ui";
import { ArrowRight, ArrowUp, Bot, CalendarClock, Check, MessageCircleQuestion, Plug, Radar, X } from "lucide-react";

interface OverviewData {
  channels: { id: string; platform: string; status: string; displayName: string; groups: number; messages24h: number; lastMessageAt: string | null }[];
  volume: { day: string; whatsapp: number; telegram: number; slack: number }[];
  autoReplies: { live: number; total: number; sent7d: number; silent7d: number };
  monitors: { active: number; total: number };
  upcoming: { id: string; title: string; schedule: string; runAt: string }[];
  activity: { id: string; kind: "replied" | "silent" | "alert" | "task"; title: string; detail: string | null; where: string | null; platform: string | null; source: string | null; at: string }[];
  setup: { connected: boolean; autoReply: boolean; monitor: boolean; schedule: boolean };
}

const SERIES = ["whatsapp", "telegram", "slack"] as const;

function greeting(name?: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

export default function Overview() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData, cached] = useStickyState<OverviewData | null>("overview", null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    api<OverviewData>("/overview").then(setData).catch(() => undefined);
  }, []);

  function submitAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!ask.trim()) return;
    nav("/app/chat", { state: { ask: ask.trim() } });
  }

  return (
    <Page>
      <PageHeader title={greeting(user?.name)} description="What came in across your channels, and what RelayFlow did about it." />

      {/* Ask bar: the fastest way into the assistant from anywhere on the home screen. */}
      <form onSubmit={submitAsk} className="group mb-6 flex items-center gap-2 rounded-2xl border border-line-strong bg-white p-1.5 pl-4 shadow-xs transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgb(var(--brand-500)/0.15)]">
        <MessageCircleQuestion size={18} className="shrink-0 text-ink-400" />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask about your channels…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
          aria-label="Ask RelayFlow"
        />
        <button type="submit" disabled={!ask.trim()} className="btn-primary h-10 w-10 !px-0" aria-label="Ask">
          <ArrowUp size={18} />
        </button>
      </form>

      {!data ? (
        <OverviewSkeleton />
      ) : (
        <div className="space-y-5">
          <SetupChecklist setup={data.setup} />
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Messages received" description="Last 7 days, by channel">
              <VolumeChart volume={data.volume} animate={!cached} />
            </Panel>
            <Panel title="Channels" action={<Link to="/app/connections" className="text-[13px] font-medium text-brand-700 hover:text-brand-800">Manage</Link>} bodyClass="p-2">
              {data.channels.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-[14px] text-ink-500">No channels connected yet.</p>
                  <Link to="/app/connections" className="btn-primary mt-3 h-9">
                    <Plug size={15} /> Connect a channel
                  </Link>
                </div>
              ) : (
                <ul>
                  {data.channels.map((c, i) => (
                    <Rise key={c.id} index={i} stagger={!cached}>
                      <Link to="/app/connections" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface">
                        <ChannelIcon platform={c.platform} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-ink-900">{PLATFORM_LABEL[c.platform] || c.platform}</span>
                            {c.status !== "connected" && <Badge tone={c.status === "error" ? "bad" : "warn"}>{c.status === "error" ? "Needs reconnecting" : "Finishing setup"}</Badge>}
                          </div>
                          <div className="truncate text-[12.5px] text-ink-500">
                            {c.groups} chats, last message {ago(c.lastMessageAt)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[15px] font-semibold tabular-nums text-ink-900">{c.messages24h}</div>
                          <div className="text-[11.5px] text-ink-400">today</div>
                        </div>
                      </Link>
                    </Rise>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Activity" description="What RelayFlow did for you" bodyClass="p-2">
              {data.activity.length === 0 ? (
                <EmptyState title="Nothing yet">Auto-replies, monitor alerts and scheduled runs will show up here as they happen.</EmptyState>
              ) : (
                <ul>
                  {data.activity.map((a, i) => (
                    <Rise key={a.id} index={i} stagger={!cached}>
                      <ActivityRow a={a} />
                    </Rise>
                  ))}
                </ul>
              )}
            </Panel>
            <div className="space-y-5">
              <Panel title="Automations" bodyClass="p-2">
                <AutomationRow to="/app/auto-replies" icon={Bot} label="Auto-replies" value={`${data.autoReplies.live} live`} sub={data.autoReplies.total ? `${data.autoReplies.sent7d} answered, ${data.autoReplies.silent7d} left for you this week` : "Answer customers from your own facts"} />
                <AutomationRow to="/app/monitors" icon={Radar} label="Monitors" value={`${data.monitors.active} active`} sub={data.monitors.total ? "Email you the moment something matches" : "Get alerted when something is said"} />
              </Panel>
              <Panel title="Coming up" action={<Link to="/app/schedules" className="text-[13px] font-medium text-brand-700 hover:text-brand-800">All schedules</Link>} bodyClass="p-2">
                {data.upcoming.length === 0 ? (
                  <p className="px-3 py-4 text-[13.5px] text-ink-500">
                    Nothing scheduled. <Link to="/app/schedules?new=1" className="font-medium text-brand-700 hover:underline">Schedule a task</Link>
                  </p>
                ) : (
                  <ul>
                    {data.upcoming.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <CalendarClock size={16} className="shrink-0 text-ink-400" />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-800">{t.title}</span>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-ink-500">{when(t.runAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

function AutomationRow({ to, icon: Icon, label, value, sub }: { to: string; icon: typeof Bot; label: string; value: string; sub: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface">
      <Icon size={18} strokeWidth={1.8} className="shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-medium text-ink-900">{label}</span>
          <span className="text-[13px] font-medium tabular-nums text-ink-700">{value}</span>
        </div>
        <div className="truncate text-[12.5px] text-ink-500">{sub}</div>
      </div>
      <ArrowRight size={15} className="shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink-500" />
    </Link>
  );
}

const KIND = {
  replied: { icon: Bot, cls: "text-brand-600 bg-brand-50" },
  silent: { icon: MessageCircleQuestion, cls: "text-amber-700 bg-amber-50" },
  alert: { icon: Radar, cls: "text-ink-700 bg-surface" },
  task: { icon: CalendarClock, cls: "text-ink-700 bg-surface" },
};

function ActivityRow({ a }: { a: OverviewData["activity"][number] }) {
  const k = KIND[a.kind];
  return (
    <div className="flex gap-3 rounded-xl px-3 py-3">
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${k.cls}`}>
        <k.icon size={14} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-medium text-ink-900">{a.title}</span>
          <span className="shrink-0 text-[12px] text-ink-400">{ago(a.at)}</span>
        </div>
        {a.detail && <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-ink-600">{a.detail}</p>}
        {(a.where || a.source) && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-500">
            {a.platform && <ChannelIcon platform={a.platform} size={16} />}
            {a.where && <span className="truncate">{a.where}</span>}
            {a.where && a.source && <span className="text-ink-300">/</span>}
            {a.source && <span className="truncate">{a.source}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** First-run checklist. Disappears once everything is set up (or when dismissed). */
function SetupChecklist({ setup }: { setup: OverviewData["setup"] }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("rf_setup_hidden") === "1";
    } catch {
      return false;
    }
  });
  const steps = [
    { done: setup.connected, label: "Connect a channel", to: "/app/connections" },
    { done: setup.autoReply, label: "Turn on an auto-reply", to: "/app/auto-replies?new=1" },
    { done: setup.monitor, label: "Set up a monitor", to: "/app/monitors?new=1" },
    { done: setup.schedule, label: "Schedule a task", to: "/app/schedules?new=1" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14.5px] font-semibold text-ink-900">Get RelayFlow working for you</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">{done} of {steps.length} done</p>
        </div>
        <button
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem("rf_setup_hidden", "1");
            } catch {
              /* ignore */
            }
          }}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-700"
          aria-label="Hide setup checklist"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface">
        <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className={`flex h-11 items-center gap-2.5 rounded-xl border px-3 text-[13.5px] transition-colors ${s.done ? "border-transparent bg-surface text-ink-500" : "border-line text-ink-800 hover:border-brand-200 hover:bg-brand-50/50"}`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${s.done ? "bg-emerald-500 text-white" : "border border-ink-300 text-ink-500"}`}>
                {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={s.done ? "line-through decoration-ink-300" : "font-medium"}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Stacked bars, one per day; hover a day for exact numbers. A hidden table carries the same data. */
function VolumeChart({ volume, animate }: { volume: OverviewData["volume"]; animate: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = volume.map((d) => SERIES.reduce((s, k) => s + d[k], 0));
  const week = totals.reduce((a, b) => a + b, 0);
  const max = Math.max(...totals, 1);
  // Round the axis up to a "nice" number whose half is also a whole number.
  const top = useMemo(() => {
    for (let p = 1; ; p *= 10) for (const m of [2, 4, 6, 8, 10]) if (m * p >= max) return m * p;
  }, [max]);
  const present = SERIES.filter((k) => volume.some((d) => d[k] > 0));
  const shown = present.length ? present : SERIES;
  const label = (day: string, i: number) => (i === volume.length - 1 ? "Today" : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }));
  const H = 168;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[13.5px] text-ink-600">
          <span className="font-display text-[22px] font-semibold tabular-nums tracking-[-0.01em] text-navy">{week.toLocaleString()}</span> this week,{" "}
          <span className="tabular-nums">{totals[totals.length - 1].toLocaleString()}</span> today
        </p>
        <ul className="flex flex-wrap gap-3 text-[12.5px] text-ink-600" aria-label="Legend">
          {shown.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PLATFORM_COLOR[k] }} />
              {PLATFORM_LABEL[k]}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-5 flex gap-3" aria-hidden>
        {/* y axis */}
        <div className="flex w-7 flex-col justify-between text-right text-[11px] tabular-nums text-ink-400" style={{ height: H }}>
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-line-strong" />
          </div>
          <div className="relative flex items-end gap-2 sm:gap-4" style={{ height: H }}>
            {volume.map((d, i) => {
              const segs = SERIES.filter((k) => d[k] > 0);
              return (
                <div key={d.day} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {hover === i && <div className="absolute inset-y-0 -inset-x-1 rounded-lg bg-brand-50/60" />}
                  <div className={`relative flex w-full max-w-[44px] flex-col-reverse gap-[2px] ${animate ? "rf-bar" : ""}`} style={{ height: `${(totals[i] / top) * 100}%`, ["--i" as any]: i }}>
                    {segs.map((k, si) => (
                      <div key={k} className={si === segs.length - 1 ? "rounded-t-[4px]" : ""} style={{ flexGrow: d[k], flexBasis: 0, minHeight: 3, background: PLATFORM_COLOR[k] }} />
                    ))}
                  </div>
                  {hover === i && (
                    <div className={`absolute bottom-full z-10 mb-2 w-40 rounded-xl border border-line bg-white p-3 text-[12.5px] shadow-pop ${i > 4 ? "right-0" : i < 2 ? "left-0" : ""}`}>
                      <div className="font-medium text-ink-900">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</div>
                      <ul className="mt-1.5 space-y-1">
                        {SERIES.map((k) => (
                          <li key={k} className="flex items-center gap-2 text-ink-600">
                            <span className="h-2 w-2 rounded-[2px]" style={{ background: PLATFORM_COLOR[k] }} />
                            <span className="flex-1">{PLATFORM_LABEL[k]}</span>
                            <span className="tabular-nums text-ink-900">{d[k]}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-medium text-ink-900">
                        <span>Total</span>
                        <span className="tabular-nums">{totals[i]}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 sm:gap-4">
            {volume.map((d, i) => (
              <div key={d.day} className={`flex-1 text-center text-[11.5px] ${i === volume.length - 1 ? "font-medium text-ink-800" : "text-ink-400"}`}>
                {label(d.day, i)}
              </div>
            ))}
          </div>
        </div>
      </div>
      {week === 0 && <p className="mt-3 text-center text-[13px] text-ink-500">No messages in the last 7 days. New messages on connected channels show up here.</p>}

      <table className="sr-only">
        <caption>Messages received per day, by channel</caption>
        <thead>
          <tr>
            <th>Day</th>
            {SERIES.map((k) => (
              <th key={k}>{PLATFORM_LABEL[k]}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {volume.map((d, i) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              {SERIES.map((k) => (
                <td key={k}>{d[k]}</td>
              ))}
              <td>{totals[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-[300px] animate-pulse rounded-2xl bg-surface lg:col-span-2" />
        <div className="h-[300px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: "90ms" }} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-[260px] animate-pulse rounded-2xl bg-surface lg:col-span-2" style={{ animationDelay: "180ms" }} />
        <div className="h-[260px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: "270ms" }} />
      </div>
    </div>
  );
}
