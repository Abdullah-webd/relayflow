import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Clock, Trash2, Plus, Eye } from "lucide-react";

interface Task {
  id: string;
  title: string;
  instruction: string;
  schedule: string;
  runAt: string;
  active: boolean;
  lastRunAt: string | null;
}

interface Monitor {
  id: string;
  title: string;
  platform: string;
  group: string | null;
  condition: string;
  mode: "match" | "absence";
  intervalMinutes: number;
  active: boolean;
  lastCheckedAt: string | null;
  lastResult: string | null;
}

const PLATFORM_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", instruction: "", schedule: "daily", runAt: "" });
  const [err, setErr] = useState<string | null>(null);

  const load = async () => setTasks((await api<{ tasks: Task[] }>("/tasks")).tasks);
  const loadMonitors = async () => setMonitors((await api<{ monitors: Monitor[] }>("/monitors")).monitors);
  useEffect(() => {
    load();
    loadMonitors();
  }, []);

  async function toggleMonitor(m: Monitor) {
    await api(`/monitors/${m.id}`, { method: "PATCH", body: JSON.stringify({ active: !m.active }) });
    loadMonitors();
  }
  async function removeMonitor(id: string) {
    await api(`/monitors/${id}`, { method: "DELETE" });
    loadMonitors();
  }

  async function create() {
    setErr(null);
    if (!form.title || !form.instruction || !form.runAt) return setErr("Fill in every field.");
    try {
      await api("/tasks", { method: "POST", body: JSON.stringify({ ...form, runAt: new Date(form.runAt).toISOString() }) });
      setShowForm(false);
      setForm({ title: "", instruction: "", schedule: "daily", runAt: "" });
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function toggle(t: Task) {
    await api(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ active: !t.active }) });
    load();
  }
  async function remove(id: string) {
    await api(`/tasks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Scheduled tasks</h1>
            <p className="mt-1 text-ink-500">Have the agent run something on a schedule and email you the result.</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary h-10 px-4">
            <Plus size={16} /> New task
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-brand-50 text-brand-700 text-sm px-4 py-3">
          Tip: you can also just tell the agent — “every morning at 9, send a good-morning to all my channels.”
        </div>

        {showForm && (
          <div className="mt-5 card p-5 space-y-3">
            <div>
              <label className="label">Title</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Morning summary" />
            </div>
            <div>
              <label className="label">What should the agent do?</label>
              <textarea className="input h-24 py-2" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Summarize overnight WhatsApp messages and email it to me." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Repeat</label>
                <select className="input" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}>
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label className="label">First run</label>
                <input className="input" type="datetime-local" value={form.runAt} onChange={(e) => setForm({ ...form, runAt: e.target.value })} />
              </div>
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <button onClick={create} className="btn-primary">Create task</button>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {tasks.length === 0 && <p className="text-ink-400 py-8 text-center">No scheduled tasks yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} className="card p-4 flex items-center gap-4">
              <span className="grid place-items-center h-10 w-10 rounded-xl bg-brand-50 text-brand-600 shrink-0">
                <Clock size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 truncate">{t.title}</div>
                <div className="text-sm text-ink-500 truncate">{t.instruction}</div>
                <div className="text-xs text-ink-400 mt-0.5">
                  {t.schedule} · next {new Date(t.runAt).toLocaleString()}
                  {t.lastRunAt && ` · last ran ${new Date(t.lastRunAt).toLocaleString()}`}
                </div>
              </div>
              <button onClick={() => toggle(t)} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${t.active ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"}`}>
                {t.active ? "Active" : "Paused"}
              </button>
              <button onClick={() => remove(t.id)} className="text-ink-400 hover:text-red-500">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>

        {/* Monitors */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-ink-900">Monitors</h2>
          <p className="mt-1 text-ink-500">
            Ask the agent to “let me know when someone asks about X on WhatsApp” — it checks on an interval and emails you only when it matches.
          </p>
          <div className="mt-4 space-y-3">
            {monitors.length === 0 && <p className="text-ink-400 py-6 text-center">No monitors yet. Set one up from chat.</p>}
            {monitors.map((m) => (
              <div key={m.id} className="card p-4 flex items-center gap-4">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-accent-400/10 text-accent-600 shrink-0">
                  <Eye size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-900 truncate">{m.title}</div>
                  <div className="text-sm text-ink-500 truncate">
                    {PLATFORM_LABEL[m.platform] || m.platform}
                    {m.group ? ` · ${m.group}` : ""} — “{m.condition}”
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    {m.mode === "absence" ? "Absence alert" : "Notify on match"} · every {m.intervalMinutes} min
                    {m.lastCheckedAt && ` · last checked ${new Date(m.lastCheckedAt).toLocaleString()}`}
                    {m.lastResult && ` · ${m.lastResult}`}
                  </div>
                </div>
                <button
                  onClick={() => toggleMonitor(m)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.active ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"}`}
                >
                  {m.active ? "Active" : "Paused"}
                </button>
                <button onClick={() => removeMonitor(m.id)} className="text-ink-400 hover:text-red-500">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
