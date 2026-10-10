import { useState } from "react";
import { Panel, Segmented } from "../../components/ui";
import { useAdminLive, Stat, DayBars, RankBars, Loading, duration, pct, SECTION_LABEL } from "./kit";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Data {
  days: string[];
  sections: { section: string; views: number; seconds: number; users: number }[];
  dau: number[];
  questions: number[];
  activeUsers: number;
  avgSecondsPerActiveDay: number;
  avgViewsPerActiveDay: number;
  adoption: { base: number; connected: number; autoReply: number; monitor: number; schedule: number; chat: number };
}

export default function AdminUsage() {
  const [days, setDays] = useState<"7" | "30">("30");
  const { data } = useAdminLive<Data>(`/usage?days=${days}`, 20_000);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Usage</h1>
          <p className="text-[13px] text-ink-500">Which tabs people use, and how long they stay. Measured while the dashboard is open and visible.</p>
        </div>
        <div className="ml-auto">
          <Segmented id="usage-days" value={days} onChange={setDays} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
        </div>
      </div>

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active users" value={data.activeUsers} sub={`in the last ${days} days`} />
            <Stat label="Time per active user" value={data.avgSecondsPerActiveDay} format={duration} sub="average per day they visit" />
            <Stat label="Tab visits per active day" value={data.avgViewsPerActiveDay} format={(n) => n.toFixed(1)} sub="pages opened per visit day" />
            <Stat label="Questions asked in Chat" value={data.questions.reduce((a, b) => a + b, 0)} sub={`in the last ${days} days`} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <Panel title="Most-used tabs" description="Ranked by time spent; visits and people on the right">
              <RankBars
                items={data.sections.map((s) => ({ key: s.section, label: SECTION_LABEL[s.section] ?? s.section, value: s.seconds, sub: `${plural(s.views, "visit")}, ${s.users} ${s.users === 1 ? "person" : "people"}` }))}
                format={duration}
              />
            </Panel>
            <Panel title="Feature adoption" description={`Share of the ${data.adoption.base} verified accounts that use each feature`}>
              <RankBars
                format={(n) => pct(n, data.adoption.base)}
                of={data.adoption.base}
                items={[
                  { key: "connected", label: "Connected a channel", value: data.adoption.connected, sub: plural(data.adoption.connected, "account") },
                  { key: "chat", label: "Used Chat", value: data.adoption.chat, sub: plural(data.adoption.chat, "account") },
                  { key: "monitor", label: "Created a monitor", value: data.adoption.monitor, sub: plural(data.adoption.monitor, "account") },
                  { key: "schedule", label: "Scheduled a task", value: data.adoption.schedule, sub: plural(data.adoption.schedule, "account") },
                  { key: "autoReply", label: "Has a live auto-reply", value: data.adoption.autoReply, sub: plural(data.adoption.autoReply, "account") },
                ]}
              />
            </Panel>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <Panel title="Daily active users" description={`Last ${days} days`}>
              <DayBars days={data.days} values={data.dau} label="Daily active users" />
            </Panel>
            <Panel title="Questions asked in Chat per day" description={`Last ${days} days`}>
              <DayBars days={data.days} values={data.questions} label="Questions asked per day" color="rgb(var(--navy))" />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
