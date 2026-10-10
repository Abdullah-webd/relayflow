import { useState } from "react";
import { Badge, Panel, when } from "../../components/ui";
import { useAdminLive, Stat, RankBars, Loading, usd, pct } from "./kit";
import UserDrawer from "./UserDrawer";

interface Data {
  mrr: number;
  plans: { pro: number; starter: number; comp: number; trial: number; trialEnded: number; pastDue: number; canceled: number; none: number };
  prices: { starter: number; pro: number };
  conversion: { trialsStarted: number; converted: number };
  cancelling: { id: string; email: string; plan: string; until: string | null }[];
  trialsEndingSoon: { id: string; email: string; endsAt: string }[];
  subscribers: { id: string; email: string; plan: string; renews: string | null; cancelling: boolean }[];
}

export default function AdminRevenue() {
  const { data } = useAdminLive<Data>("/revenue", 20_000);
  const [userId, setUserId] = useState<string | null>(null);
  if (!data) return <Loading />;
  const p = data.plans;
  const paying = p.pro + p.starter;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Revenue</h1>
        <p className="text-[13px] text-ink-500">From active Stripe subscriptions (Starter ${data.prices.starter}, Pro ${data.prices.pro} a month). Free comp accounts are not counted.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Monthly recurring revenue" value={data.mrr} format={usd} sub={`${usd(data.mrr * 12)} a year at this rate`} />
        <Stat label="Paying customers" value={paying} sub={`${p.pro} Pro, ${p.starter} Starter`} />
        <Stat label="Trial to paid" value={data.conversion.converted} sub={`${pct(data.conversion.converted, data.conversion.trialsStarted)} of ${data.conversion.trialsStarted} trials started`} />
        <Stat label="On trial now" value={p.trial} sub={`${data.trialsEndingSoon.length} ending in the next 24 hours`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Panel title="Accounts by plan">
          <RankBars
            items={[
              { key: "pro", label: "Pro (paying)", value: p.pro },
              { key: "starter", label: "Starter (paying)", value: p.starter },
              { key: "trial", label: "On free trial", value: p.trial },
              { key: "ended", label: "Trial ended, not paying", value: p.trialEnded },
              { key: "comp", label: "Comp (free Pro)", value: p.comp },
              { key: "pastDue", label: "Payment due", value: p.pastDue },
              { key: "canceled", label: "Canceled", value: p.canceled },
              { key: "none", label: "Never started", value: p.none },
            ]}
          />
        </Panel>
        <div className="space-y-5">
          <Panel title="Trials ending in the next 24 hours" bodyClass="p-2">
            {data.trialsEndingSoon.length === 0 ? (
              <p className="px-3 py-5 text-center text-[13.5px] text-ink-500">None.</p>
            ) : (
              <ul>
                {data.trialsEndingSoon.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setUserId(t.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-900">{t.email}</span>
                      <span className="shrink-0 text-[12.5px] text-ink-500">ends {when(t.endsAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Cancelling at the end of their period" bodyClass="p-2">
            {data.cancelling.length === 0 ? (
              <p className="px-3 py-5 text-center text-[13.5px] text-ink-500">Nobody is cancelling.</p>
            ) : (
              <ul>
                {data.cancelling.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setUserId(c.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-900">{c.email}</span>
                      <span className="shrink-0 text-[12.5px] text-ink-500">until {when(c.until)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Subscribers" description={`${paying} paying`} bodyClass="p-0">
        {data.subscribers.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-ink-500">No paying subscribers yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.subscribers.map((s) => (
              <li key={s.id}>
                <button onClick={() => setUserId(s.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface/70">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-900">{s.email}</span>
                  <Badge tone={s.plan === "Pro" ? "brand" : "idle"}>{s.plan}</Badge>
                  <span className="w-40 shrink-0 text-right text-[12.5px] text-ink-500">{s.cancelling ? "Cancelling" : s.renews ? `Renews ${when(s.renews)}` : "Active"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <UserDrawer userId={userId} onClose={() => setUserId(null)} />
    </div>
  );
}
