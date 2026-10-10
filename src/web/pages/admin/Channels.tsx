import { useState } from "react";
import { Badge, ChannelIcon, Panel, PLATFORM_COLOR, PLATFORM_LABEL, ago } from "../../components/ui";
import { useAdminLive, Stat, DayBars, Loading, pct } from "./kit";
import UserDrawer from "./UserDrawer";

interface Data {
  byPlatform: Record<string, Record<string, number>>;
  needsAttention: { id: string; platform: string; email: string; userId: string; lastError: string | null; updatedAt: string }[];
  messages: { days: string[]; whatsapp: number[]; telegram: number[]; slack: number[] };
  autoReplies: { sent: number; silent: number; live: number };
  monitors: { active: number; recentAlerts: { id: string; title: string; email: string; at: string }[] };
  sends: { sent: number; failed: number };
}
const PLATFORMS = ["whatsapp", "telegram", "slack"] as const;

export default function AdminChannels() {
  const { data } = useAdminLive<Data>("/channels", 15_000);
  const [userId, setUserId] = useState<string | null>(null);
  if (!data) return <Loading />;
  const sentTotal = data.sends.sent + data.sends.failed;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Channels</h1>
        <p className="text-[13px] text-ink-500">Connection health and what flows through it. Message contents are never shown here.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {PLATFORMS.map((p) => {
          const s = data.byPlatform[p] ?? {};
          return (
            <div key={p} className="flex items-center gap-4 rounded-2xl border border-line px-4 py-3.5">
              <ChannelIcon platform={p} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink-900">{PLATFORM_LABEL[p]}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="live" dot>{s.connected ?? 0} connected</Badge>
                  {(s.error ?? 0) > 0 && <Badge tone="bad" dot>{s.error} broken</Badge>}
                  {(s.disconnected ?? 0) > 0 && <Badge>{s.disconnected} disconnected</Badge>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Live auto-replies" value={data.autoReplies.live} sub="across all accounts" />
        <Stat label="Auto-answers sent" value={data.autoReplies.sent} sub={`${data.autoReplies.silent} left for the owner (30 days)`} />
        <Stat label="Active monitors" value={data.monitors.active} sub={`${data.monitors.recentAlerts.length} recent alert${data.monitors.recentAlerts.length === 1 ? "" : "s"}`} />
        <Stat label="Messages sent for users" value={data.sends.sent} sub={sentTotal ? `${pct(data.sends.failed, sentTotal)} failed (30 days)` : "last 30 days"} />
      </div>

      <Panel title="Needs attention" description="Connections that broke and need the user to reconnect" bodyClass="p-2">
        {data.needsAttention.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13.5px] text-ink-500">Every connection is healthy.</p>
        ) : (
          <ul>
            {data.needsAttention.map((c) => (
              <li key={c.id}>
                <button onClick={() => setUserId(c.userId)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                  <ChannelIcon platform={c.platform} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink-900">{c.email}</span>
                    <span className="block truncate text-[12.5px] text-red-600">{c.lastError || "Disconnected"}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-400">{ago(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-3">
        {PLATFORMS.map((p) => (
          <Panel key={p} title={`${PLATFORM_LABEL[p]} messages received`} description="Per day, last 14 days">
            <DayBars days={data.messages.days} values={data.messages[p]} color={PLATFORM_COLOR[p]} height={120} label={`${PLATFORM_LABEL[p]} messages per day`} />
          </Panel>
        ))}
      </div>

      <Panel title="Recent monitor alerts" bodyClass="p-2">
        {data.monitors.recentAlerts.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13.5px] text-ink-500">No alerts yet.</p>
        ) : (
          <ul>
            {data.monitors.recentAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink-900">{a.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-500">{a.email}</span>
                </span>
                <span className="shrink-0 text-[12px] text-ink-400">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <UserDrawer userId={userId} onClose={() => setUserId(null)} />
    </div>
  );
}
