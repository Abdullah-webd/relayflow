import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { useStickyState } from "../../lib/sticky";
import { Rise, Dialog } from "../../components/motion";
import { Page, PageHeader, Badge, Switch, EmptyState, Confirm, Segmented, useToast, when, ago } from "../../components/ui";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  instruction: string;
  schedule: string;
  runAt: string;
  active: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
}

const REPEAT: Record<string, string> = { once: "Once", daily: "Every day", weekly: "Every week" };
const EXAMPLES = [
  { title: "Morning summary", instruction: "Summarize overnight messages across all my channels and email it to me." },
  { title: "Weekly customer questions", instruction: "List the questions customers asked this week on WhatsApp and email me the list." },
];

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">, tomorrow 9am by default. */
function defaultRunAt() {
  const d = new Date(Date.now() + 864e5);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Schedules() {
  const toast = useToast();
  const [tasks, setTasks, cached] = useStickyState<Task[] | null>("tasks", null);
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (v: boolean) => setParams(v ? { new: "1" } : {}, { replace: true });
  const [del, setDel] = useState<Task | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => setTasks((await api<{ tasks: Task[] }>("/tasks")).tasks);
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function toggle(t: Task, active: boolean) {
    setNotice(null);
    setTasks((xs) => xs?.map((x) => (x.id === t.id ? { ...x, active } : x)) ?? xs);
    try {
      await api(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      toast(active ? "Schedule resumed" : "Schedule paused");
    } catch (e) {
      setNotice((e as Error).message);
    }
    load();
  }

  return (
    <Page width="max-w-[960px]">
      <PageHeader
        title="Schedules"
        description="Have RelayFlow run something on a schedule, like a morning summary of every chat, and email you the result. You can also ask for one in Chat."
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} /> New schedule
          </button>
        }
      />

      {notice && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
          <span>{notice}</span>
          {/Pro/.test(notice) && (
            <Link to="/pricing" className="font-medium text-brand-700 underline underline-offset-2">
              See plans
            </Link>
          )}
        </div>
      )}

      {!tasks ? (
        <div aria-hidden className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <section className="rounded-2xl border border-line">
          <EmptyState
            title="Nothing scheduled yet"
            art={<CalendarClock size={28} className="mx-auto mb-3 text-brand-600" />}
            action={
              <button onClick={() => setCreating(true)} className="btn-primary">
                <Plus size={16} /> New schedule
              </button>
            }
          >
            For example: every morning at 9, summarize overnight messages and email them to me.
          </EmptyState>
        </section>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <AnimatePresence initial={!cached}>
            {tasks.map((t, i) => (
              <Rise key={t.id} index={i} stagger={!cached} className="flex items-start gap-4 bg-white px-5 py-4">
                <div className="w-[92px] shrink-0 pt-0.5">
                  <div className="text-[12px] font-medium text-ink-500">{REPEAT[t.schedule] || t.schedule}</div>
                  <div className="mt-0.5 text-[13px] tabular-nums text-ink-900">{t.active ? when(t.runAt).replace(", ", " ") : "Paused"}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-ink-900">{t.title}</span>
                    {!t.active && <Badge>Paused</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[13.5px] text-ink-600">{t.instruction}</p>
                  {t.lastRunAt && (
                    <p className="mt-1 line-clamp-1 text-[12.5px] text-ink-500">
                      Last ran {ago(t.lastRunAt)}
                      {t.lastResult ? `: ${t.lastResult}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={t.active} onChange={(v) => toggle(t, v)} label={`${t.title} active`} />
                  <button onClick={() => setDel(t)} className="ml-2 grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${t.title}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </Rise>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <CreateSchedule open={creating} onClose={() => setCreating(false)} onCreated={load} />
      <Confirm
        open={!!del}
        title={`Delete “${del?.title}”?`}
        body="It won't run again."
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const t = del!;
          setDel(null);
          setTasks((xs) => xs?.filter((x) => x.id !== t.id) ?? xs);
          await api(`/tasks/${t.id}`, { method: "DELETE" }).catch(() => undefined);
          toast("Schedule deleted");
          load();
        }}
      />
    </Page>
  );
}

function CreateSchedule({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", instruction: "", schedule: "daily", runAt: defaultRunAt() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setForm({ title: "", instruction: "", schedule: "daily", runAt: defaultRunAt() });
      setErr("");
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.title.trim() || !form.instruction.trim()) return setErr("Give it a name and say what it should do.");
    if (!form.runAt) return setErr("Pick when it should first run.");
    setBusy(true);
    try {
      await api("/tasks", { method: "POST", body: JSON.stringify({ ...form, runAt: new Date(form.runAt).toISOString() }) });
      toast("Scheduled");
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
        <h3 className="font-display text-[19px] font-semibold text-navy">New schedule</h3>
        {!form.instruction && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <button type="button" key={x.title} onClick={() => setForm((f) => ({ ...f, ...x }))} className="h-7 rounded-full border border-line px-2.5 text-[12.5px] text-ink-600 hover:bg-surface">
                {x.title}
              </button>
            ))}
          </div>
        )}
        <label className="label mt-4" htmlFor="sc-title">Name</label>
        <input id="sc-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Morning summary" maxLength={120} />
        <label className="label mt-4" htmlFor="sc-what">What should RelayFlow do?</label>
        <textarea id="sc-what" className="input h-24 resize-none py-2.5" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Summarize overnight WhatsApp messages and email it to me." maxLength={2000} />
        <div className="label mt-4">Repeat</div>
        <Segmented id="sc-repeat" value={form.schedule} onChange={(schedule) => setForm({ ...form, schedule })} options={Object.entries(REPEAT).map(([value, label]) => ({ value, label }))} />
        <label className="label mt-4" htmlFor="sc-when">{form.schedule === "once" ? "Run at" : "First run"}</label>
        <input id="sc-when" className="input" type="datetime-local" value={form.runAt} onChange={(e) => setForm({ ...form, runAt: e.target.value })} />
        {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Schedule"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
