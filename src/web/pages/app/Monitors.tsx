import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { useStickyState } from "../../lib/sticky";
import { Rise, Dialog } from "../../components/motion";
import { Page, PageHeader, Badge, Switch, ChannelIcon, EmptyState, Confirm, Segmented, useToast, PLATFORM_LABEL, ago } from "../../components/ui";
import { Loader2, Plus, Radar, Trash2 } from "lucide-react";

interface Monitor {
  id: string;
  title: string;
  platform: string;
  group: string | null;
  condition: string;
  mode: "match" | "absence";
  active: boolean;
  lastCheckedAt: string | null;
  lastResult: string | null;
  absenceDeadline: string | null;
}
interface Channel { connectionId: string; platform: string; displayName: string; destinations: { id: string; name: string; kind: string }[] }

const EXAMPLES = ["someone asks about prices or a quote", "a customer complains or sounds upset", "someone mentions a refund"];

function resultTone(r: string | null): "live" | "warn" | "idle" {
  if (!r) return "idle";
  if (/^(Matched|Arrived|Absence alert)/.test(r)) return "live";
  if (/^Paused/.test(r)) return "warn";
  return "idle";
}

export default function Monitors() {
  const toast = useToast();
  const [monitors, setMonitors, cached] = useStickyState<Monitor[] | null>("monitors", null);
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (v: boolean) => setParams(v ? { new: "1" } : {}, { replace: true });
  const [del, setDel] = useState<Monitor | null>(null);

  const load = async () => setMonitors((await api<{ monitors: Monitor[] }>("/monitors")).monitors);
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function toggle(m: Monitor, active: boolean) {
    setMonitors((xs) => xs?.map((x) => (x.id === m.id ? { ...x, active } : x)) ?? xs);
    try {
      await api(`/monitors/${m.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      toast(active ? "Monitor resumed" : "Monitor paused");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    load();
  }

  return (
    <Page width="max-w-[960px]">
      <PageHeader
        title="Monitors"
        description="Watch your chats for something specific. RelayFlow checks each new message as it arrives and emails you within seconds when it matches."
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} /> New monitor
          </button>
        }
      />

      {!monitors ? (
        <div aria-hidden className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      ) : monitors.length === 0 ? (
        <section className="rounded-2xl border border-line">
          <EmptyState
            title="No monitors yet"
            art={<Radar size={28} className="mx-auto mb-3 text-brand-600" />}
            action={
              <button onClick={() => setCreating(true)} className="btn-primary">
                <Plus size={16} /> New monitor
              </button>
            }
          >
            For example: email me when someone in “Wholesale buyers” asks for a quote. You can also ask for one in Chat.
          </EmptyState>
        </section>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <AnimatePresence initial={!cached}>
            {monitors.map((m, i) => (
              <Rise key={m.id} index={i} stagger={!cached} className="flex items-start gap-4 bg-white px-5 py-4">
                <ChannelIcon platform={m.platform} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink-900">{m.title}</span>
                    {!m.active && <Badge>Paused</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13.5px] text-ink-600">
                    {m.mode === "absence" ? "Alert if this hasn't happened" : "Alert when"}: “{m.condition}”
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
                    <span>{m.group ? `${PLATFORM_LABEL[m.platform]}, ${m.group}` : `All chosen ${PLATFORM_LABEL[m.platform]} chats`}</span>
                    {m.lastResult && (
                      <Badge tone={resultTone(m.lastResult)}>
                        <span className="max-w-[320px] truncate">{m.lastResult}</span>
                      </Badge>
                    )}
                    {m.lastCheckedAt && <span>checked {ago(m.lastCheckedAt)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={m.active} onChange={(v) => toggle(m, v)} label={`${m.title} active`} />
                  <button onClick={() => setDel(m)} className="ml-2 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${m.title}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </Rise>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <CreateMonitor open={creating} onClose={() => setCreating(false)} onCreated={load} />
      <Confirm
        open={!!del}
        title={`Delete “${del?.title}”?`}
        body="You'll stop getting alerts for it."
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const m = del!;
          setDel(null);
          setMonitors((xs) => xs?.filter((x) => x.id !== m.id) ?? xs);
          await api(`/monitors/${m.id}`, { method: "DELETE" }).catch(() => undefined);
          toast("Monitor deleted");
          load();
        }}
      />
    </Page>
  );
}

function CreateMonitor({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [platform, setPlatform] = useState("");
  const [group, setGroup] = useState("");
  const [condition, setCondition] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"match" | "absence">("match");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setGroup("");
    setCondition("");
    setTitle("");
    setMode("match");
    setErr("");
    setBusy(false);
    api<{ channels: Channel[] }>("/channels")
      .then(({ channels }) => {
        setChannels(channels);
        setPlatform((p) => p || channels[0]?.platform || "");
      })
      .catch(() => setChannels([]));
  }, [open]);

  const dests = channels?.find((c) => c.platform === platform)?.destinations ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!platform) return setErr("Connect a channel first.");
    if (!condition.trim()) return setErr("Describe what to watch for.");
    setBusy(true);
    try {
      await api("/monitors", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || condition.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 120),
          platform,
          group: group || null,
          condition: condition.trim(),
          mode,
          absenceHours: mode === "absence" ? hours : null,
        }),
      });
      toast("Monitor started. You'll get an email when it matches.");
      await onCreated();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={submit} className="w-[min(92vw,500px)] rounded-2xl border border-line bg-white p-6 shadow-pop">
        <h3 className="font-display text-[19px] font-semibold text-navy">New monitor</h3>
        {channels && channels.length === 0 ? (
          <div className="mt-4 rounded-xl bg-surface p-4 text-[14px] text-ink-600">
            Connect a channel first, then come back to watch it.{" "}
            <Link to="/app/connections" className="font-medium text-brand-700 hover:underline">
              Go to Connections
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <Segmented id="mon-mode" value={mode} onChange={setMode} options={[{ value: "match", label: "When it happens" }, { value: "absence", label: "If it doesn't happen" }]} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="mon-platform">Channel</label>
                <select id="mon-platform" className="input" value={platform} onChange={(e) => (setPlatform(e.target.value), setGroup(""))}>
                  {(channels ?? []).map((c) => (
                    <option key={c.connectionId} value={c.platform}>
                      {PLATFORM_LABEL[c.platform]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="mon-group">Chat</label>
                <select id="mon-group" className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">All chosen chats</option>
                  {dests.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="label mt-4" htmlFor="mon-cond">{mode === "match" ? "Email me when…" : "Email me if this hasn't happened…"}</label>
            <textarea id="mon-cond" className="input h-20 resize-none py-2.5" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={mode === "match" ? "someone asks about prices or a quote" : "the supplier confirms today's delivery"} maxLength={1000} />
            {mode === "match" && !condition && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button type="button" key={x} onClick={() => setCondition(x)} className="h-7 rounded-full border border-line px-2.5 text-[12.5px] text-ink-600 hover:bg-surface">
                    {x}
                  </button>
                ))}
              </div>
            )}
            {mode === "absence" && (
              <div className="mt-3 flex items-center gap-2 text-[14px] text-ink-700">
                within
                <input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))} className="input h-9 w-20" aria-label="Hours" />
                hours
              </div>
            )}
            <label className="label mt-4" htmlFor="mon-title">Name <span className="font-normal text-ink-400">(optional)</span></label>
            <input id="mon-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Quote requests" maxLength={120} />
          </>
        )}
        {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy || !channels?.length} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Start monitoring"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
