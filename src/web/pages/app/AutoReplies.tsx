import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useStickyState } from "../../lib/sticky";
import { PRICES } from "../../lib/pricing";
import { Rise, Dialog, Pop, EASE_OUT } from "../../components/motion";
import { Page, PageHeader, Panel, Badge, Switch, ChannelIcon, EmptyState, Confirm, Segmented, useToast, useDismiss, PLATFORM_LABEL, ago } from "../../components/ui";
import { ArrowLeft, Bot, Check, FileText, Loader2, MoreHorizontal, Plus, Search, Send, Trash2, Upload, Type, MessageCircleQuestion, Circle } from "lucide-react";

interface Doc { id: string; title: string; source: "text" | "pdf"; chars: number; createdAt: string }
interface Responder {
  id: string;
  name: string;
  active: boolean;
  instructions: string;
  destinationIds: string[];
  docs: Doc[];
  stats: { sent7d: number; silent7d: number; lastReplyAt: string | null };
}
interface Dest { id: string; name: string; kind: string }
interface Channel { connectionId: string; platform: string; displayName: string; destinations: Dest[] }
interface ReplyLog { id: string; responderId: string | null; responderName: string | null; platform: string; destination: string; from: string; incoming: string; replied: boolean; replyText: string | null; reason: string | null; at: string }
interface Data { responders: Responder[]; channels: Channel[]; recent: ReplyLog[] }

const TEMPLATES = [
  {
    name: "Customer questions",
    blurb: "Prices, opening hours, location, how to order.",
    instructions:
      "Answer questions about our products, prices, opening hours, delivery and location.\nKeep replies short and friendly.\nNever discuss refunds or complaints. Leave those for me.\nNever promise delivery dates.",
  },
  {
    name: "Orders & delivery",
    blurb: "Delivery areas, fees, payment methods.",
    instructions:
      "Answer questions about how to order, delivery areas, delivery fees and payment methods.\nIf someone asks about the status of a specific order, don't guess. Leave it for me.",
  },
  {
    name: "Group info & rules",
    blurb: "Meeting times, links, rules for members.",
    instructions: "Answer questions about the group's rules, meeting times and links.\nDon't reply to chit-chat or greetings.\nNever take sides in disagreements.",
  },
];

const RULE_SNIPPETS = ["Keep replies short and friendly.", "Never discuss refunds or complaints.", "Never promise delivery dates.", "Don't reply to greetings or chit-chat.", "Reply in the customer's language."];

const kindLabel = (k: string) => (k === "dm" ? "Private chat" : k === "channel" ? "Channel" : "Group");

function status(r: Responder): { tone: "live" | "idle" | "warn"; label: string } {
  if (r.active && r.destinationIds.length && r.docs.length) return { tone: "live", label: "Live" };
  if (r.active) return { tone: "warn", label: r.destinationIds.length ? "No knowledge" : "No groups" };
  return { tone: "idle", label: "Paused" };
}

// Auto-replies are a Pro feature. Starter users see what it does and how to get it.
export default function AutoReplies() {
  const { user } = useAuth();
  if (user?.plan === "starter" && !user?.paywallDisabled) return <Locked />;
  return <AutoRepliesInner />;
}

function AutoRepliesInner() {
  const { id } = useParams();
  const [data, setData, cached] = useStickyState<Data | null>("autoReplies", null);
  const load = async () => setData(await api<Data>("/auto-replies"));
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={id ? "detail" : "list"} className="h-full" initial={{ opacity: 0, x: id ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.22, ease: EASE_OUT }}>
        {id ? <Detail id={id} data={data} setData={setData} reload={load} /> : <List data={data} reload={load} cached={cached} />}
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- list

function List({ data, reload, cached }: { data: Data | null; reload: () => Promise<void>; cached: boolean }) {
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (v: boolean) => setParams(v ? { new: "1" } : {}, { replace: true });
  const [filter, setFilter] = useState<"all" | "replied" | "silent">("all");

  const groupNames = useMemo(() => {
    const m = new Map<string, { name: string; platform: string }>();
    for (const c of data?.channels ?? []) for (const d of c.destinations) m.set(d.id, { name: d.name, platform: c.platform });
    return m;
  }, [data]);

  const recent = (data?.recent ?? []).filter((r) => filter === "all" || (filter === "replied" ? r.replied : !r.replied));

  return (
    <Page>
      <PageHeader
        title="Auto-replies"
        description="Each auto-reply answers customers in the groups you pick, using only the knowledge and rules you give it. When it isn't sure, it stays silent and leaves the question for you."
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus size={16} /> New auto-reply
          </button>
        }
      />

      {!data ? (
        <div aria-hidden className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      ) : data.responders.length === 0 ? (
        <section className="rounded-2xl border border-line">
          <EmptyState title="Create your first auto-reply" art={<Bot size={28} className="mx-auto mb-3 text-brand-600" />}>
            Start from a template or from scratch. You'll choose its groups, give it your facts and set its rules on the next screen.
          </EmptyState>
          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.name} t={t} onCreated={reload} />
            ))}
          </div>
        </section>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <AnimatePresence initial={!cached}>
            {data.responders.map((r, i) => (
              <Rise key={r.id} index={i} stagger={!cached}>
                <ResponderRow r={r} groupNames={groupNames} reload={reload} />
              </Rise>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {data && data.recent.length > 0 && (
        <Panel className="mt-8" title="Recent replies" description="What your auto-replies answered, and what they left for you" action={<Segmented id="ar-filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "replied", label: "Answered" }, { value: "silent", label: "Left for you" }]} />} bodyClass="p-2">
          <ReplyList items={recent} showResponder />
        </Panel>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </Page>
  );
}

function ResponderRow({ r, groupNames, reload }: { r: Responder; groupNames: Map<string, { name: string; platform: string }>; reload: () => Promise<void> }) {
  const nav = useNavigate();
  const toast = useToast();
  const st = status(r);
  const groups = r.destinationIds.map((id) => groupNames.get(id)).filter(Boolean) as { name: string; platform: string }[];
  const platforms = [...new Set(groups.map((g) => g.platform))];

  async function toggle(active: boolean) {
    try {
      await api(`/auto-replies/${r.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      toast(active ? `${r.name} is live` : `${r.name} paused`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
      nav(`/app/auto-replies/${r.id}`);
    }
  }

  return (
    <li>
      <div role="link" tabIndex={0} onClick={() => nav(`/app/auto-replies/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/app/auto-replies/${r.id}`)} className="group flex cursor-pointer items-center gap-4 bg-white px-5 py-4 transition-colors hover:bg-surface/70">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-[15px] font-semibold text-ink-900">{r.name}</span>
            <Badge tone={st.tone} dot>{st.label}</Badge>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-ink-500">
            {platforms.length > 0 && (
              <span className="flex shrink-0 -space-x-1">
                {platforms.map((p) => (
                  <span key={p} className="rounded-[9px] ring-2 ring-white">
                    <ChannelIcon platform={p} size={18} />
                  </span>
                ))}
              </span>
            )}
            <span className="truncate">
              {groups.length === 0 ? "No groups chosen yet" : `${groups.slice(0, 2).map((g) => g.name).join(", ")}${groups.length > 2 ? ` and ${groups.length - 2} more` : ""}`}
            </span>
          </div>
        </div>
        <div className="hidden w-28 text-right sm:block">
          <div className="text-[14px] font-medium tabular-nums text-ink-900">{r.docs.length}</div>
          <div className="text-[12px] text-ink-500">{r.docs.length === 1 ? "source" : "sources"}</div>
        </div>
        <div className="hidden w-28 text-right md:block">
          <div className="text-[14px] font-medium tabular-nums text-ink-900">{r.stats.sent7d}</div>
          <div className="text-[12px] text-ink-500">answered this week</div>
        </div>
        <Switch checked={r.active} onChange={toggle} label={`${r.name} live`} />
      </div>
    </li>
  );
}

function TemplateCard({ t, onCreated }: { t: (typeof TEMPLATES)[number]; onCreated: () => Promise<void> }) {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const { responder } = await api<{ responder: { id: string } }>("/auto-replies", { method: "POST", body: JSON.stringify({ name: t.name, instructions: t.instructions }) });
      await onCreated();
      nav(`/app/auto-replies/${responder.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <button onClick={create} disabled={busy} className="group rounded-xl border border-line p-4 text-left transition-[border-color,background-color] hover:border-brand-200 hover:bg-brand-50/40 disabled:opacity-60">
      <div className="flex items-center justify-between text-[14px] font-semibold text-ink-900">
        {t.name}
        {busy ? <Loader2 size={15} className="animate-spin text-brand-600" /> : <Plus size={15} className="text-ink-300 transition-colors group-hover:text-brand-600" />}
      </div>
      <p className="mt-1 text-[13px] text-ink-500">{t.blurb}</p>
    </button>
  );
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setTpl(null);
      setErr("");
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Give it a name you'll recognise, like “Shop FAQs”.");
    setBusy(true);
    try {
      const { responder } = await api<{ responder: { id: string } }>("/auto-replies", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), instructions: tpl === null ? "" : TEMPLATES[tpl].instructions }),
      });
      await onCreated();
      onClose();
      nav(`/app/auto-replies/${responder.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={submit} className="w-[min(92vw,480px)] rounded-2xl border border-line bg-white p-6 shadow-pop">
        <h3 className="font-display text-[19px] font-semibold text-navy">New auto-reply</h3>
        <p className="mt-1 text-[13.5px] text-ink-500">You'll pick its groups and add its knowledge next.</p>
        <label className="label mt-5" htmlFor="ar-name">Name</label>
        <input id="ar-name" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop FAQs" maxLength={80} />
        <div className="label mt-4">Start from</div>
        <div className="grid gap-2">
          {[{ name: "Blank", blurb: "Write your own rules." }, ...TEMPLATES].map((t, i) => {
            const idx = i - 1;
            const on = tpl === (idx < 0 ? null : idx);
            return (
              <button
                type="button"
                key={t.name}
                onClick={() => {
                  setTpl(idx < 0 ? null : idx);
                  if (idx >= 0 && !name.trim()) setName(t.name);
                }}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${on ? "border-brand-500 bg-brand-50/60" : "border-line hover:bg-surface"}`}
              >
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-brand-600" : "border-ink-300"}`}>{on && <span className="h-2 w-2 rounded-full bg-brand-600" />}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink-900">{t.name}</span>
                  <span className="block text-[12.5px] text-ink-500">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : "Create"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- detail

function Detail({ id, data, setData, reload }: { id: string; data: Data | null; setData: (fn: (d: Data | null) => Data | null) => void; reload: () => Promise<void> }) {
  const nav = useNavigate();
  const toast = useToast();
  const r = data?.responders.find((x) => x.id === id);
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss(menu, () => setMenu(false));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patchLocal = (fn: (r: Responder) => Responder) => setData((d) => (d ? { ...d, responders: d.responders.map((x) => (x.id === id ? fn(x) : x)) } : d));

  async function patch(body: Partial<Pick<Responder, "name" | "instructions" | "active" | "destinationIds">>, ok?: string) {
    try {
      await api(`/auto-replies/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (ok) toast(ok);
      await reload();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      await reload();
      return false;
    }
  }

  if (!data) return <Page width="max-w-[1180px]"><div className="h-8 w-64 animate-pulse rounded-lg bg-surface" /></Page>;
  if (!r)
    return (
      <Page>
        <EmptyState title="This auto-reply doesn't exist any more" action={<Link to="/app/auto-replies" className="btn-ghost">Back to auto-replies</Link>} />
      </Page>
    );

  const st = status(r);
  const needs = [
    { done: r.destinationIds.length > 0, label: "Choose groups", href: "#where" },
    { done: r.docs.length > 0, label: "Add knowledge", href: "#knows" },
  ];
  const ready = needs.every((n) => n.done);

  return (
    <Page width="max-w-[1180px]">
      <PageHeader
        back={
          <Link to="/app/auto-replies" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-ink-800">
            <ArrowLeft size={14} /> All auto-replies
          </Link>
        }
        title={<NameField value={r.name} onSave={(name) => patch({ name }, "Renamed")} />}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {r.stats.lastReplyAt ? `Last answered ${ago(r.stats.lastReplyAt)}` : "Hasn't answered anyone yet"}
          </span>
        }
        actions={
          <>
            <label className="flex h-10 items-center gap-2.5 rounded-lg border border-line px-3 text-[14px] font-medium text-ink-800">
              Live
              <Switch
                checked={r.active}
                label="Live"
                onChange={async (active) => {
                  patchLocal((x) => ({ ...x, active }));
                  await patch({ active }, active ? "Live. It will answer new messages from now on." : "Paused");
                }}
              />
            </label>
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenu((m) => !m)} className="btn-ghost h-10 w-10 !px-0" aria-label="More actions">
                <MoreHorizontal size={18} />
              </button>
              <Pop open={menu} className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-line bg-white p-1 shadow-pop">
                <button
                  onClick={() => {
                    setMenu(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} /> Delete auto-reply
                </button>
              </Pop>
            </div>
          </>
        }
      />

      <AnimatePresence initial={false}>
        {!ready && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="overflow-hidden">
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-[13.5px] text-brand-900">
              <span className="font-medium">To go live:</span>
              {needs.map((n) => (
                <a key={n.label} href={n.href} className={`inline-flex items-center gap-1.5 ${n.done ? "text-ink-500 line-through decoration-ink-300" : "font-medium hover:underline"}`}>
                  {n.done ? <Check size={14} className="text-emerald-600" /> : <Circle size={12} className="text-brand-400" />}
                  {n.label}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <GroupsPanel r={r} data={data} onChange={(destinationIds, msg) => {
            patchLocal((x) => ({ ...x, destinationIds }));
            return patch({ destinationIds }, msg);
          }} />
          <KnowledgePanel r={r} reload={reload} patchLocal={patchLocal} />
          <RulesPanel r={r} onSave={(instructions) => patch({ instructions }, "Rules saved")} />
        </div>
        <div className="min-w-0 space-y-5 lg:sticky lg:top-4">
          <TryPanel r={r} />
          <Panel title="Recent replies" bodyClass="p-2">
            <ReplyList items={data.recent.filter((x) => x.responderId === r.id).slice(0, 8)} compact />
          </Panel>
        </div>
      </div>

      <Confirm
        open={confirmDelete}
        title={`Delete “${r.name}”?`}
        body="Its knowledge and rules are deleted, and it stops answering in its groups."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await api(`/auto-replies/${r.id}`, { method: "DELETE" }).catch(() => undefined);
          toast("Auto-reply deleted");
          await reload();
          nav("/app/auto-replies");
        }}
      />
    </Page>
  );
}

function NameField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (!t) return setV(value);
    if (t !== value) onSave(t);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") (setV(value), (e.target as HTMLInputElement).blur());
      }}
      maxLength={80}
      aria-label="Auto-reply name"
      className="-mx-1.5 w-full max-w-[560px] rounded-lg bg-transparent px-1.5 font-display text-[26px] font-semibold tracking-[-0.02em] text-navy outline-none transition-colors hover:bg-surface focus:bg-surface"
    />
  );
}

function GroupsPanel({ r, data, onChange }: { r: Responder; data: Data; onChange: (ids: string[], msg?: string) => Promise<boolean> }) {
  const platforms = data.channels.map((c) => c.platform);
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const selected = new Set(r.destinationIds);
  const owner = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of data.responders) if (x.id !== r.id) for (const d of x.destinationIds) m.set(d, x.name);
    return m;
  }, [data, r.id]);

  const rows = data.channels
    .filter((c) => tab === "all" || c.platform === tab)
    .flatMap((c) => c.destinations.map((d) => ({ ...d, platform: c.platform })))
    .filter((d) => (!q || d.name.toLowerCase().includes(q.toLowerCase())) && (!onlySelected || selected.has(d.id)))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || Number(a.kind === "dm") - Number(b.kind === "dm") || a.name.localeCompare(b.name));

  function toggle(d: Dest) {
    const on = !selected.has(d.id);
    const next = on ? [...r.destinationIds, d.id] : r.destinationIds.filter((x) => x !== d.id);
    const from = owner.get(d.id);
    onChange(next, on ? (from ? `Moved “${d.name}” here from ${from}` : `Answers in “${d.name}”`) : `Removed “${d.name}”`);
  }

  return (
    <Panel
      title={<span id="where">Where it answers</span>}
      description={`It reads new messages in these chats and replies when its knowledge covers the question. ${selected.size} chosen.`}
      bodyClass="p-0"
    >
      {data.channels.length === 0 ? (
        <EmptyState title="No channels connected" action={<Link to="/app/connections" className="btn-primary h-9">Connect a channel</Link>}>
          Connect WhatsApp, Telegram or Slack first, then choose the groups this auto-reply should answer in.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {platforms.length > 1 && (
              <Segmented
                id={`grp-${r.id}`}
                value={tab}
                onChange={setTab}
                options={[{ value: "all", label: "All" }, ...data.channels.map((c) => ({ value: c.platform, label: <><ChannelIcon platform={c.platform} size={14} /> {PLATFORM_LABEL[c.platform]}</> }))]}
              />
            )}
            <div className="relative min-w-[160px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="input h-9 pl-9" aria-label="Search chats" />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-[13px] text-ink-600">
              <Switch size="sm" checked={onlySelected} onChange={setOnlySelected} label="Show chosen only" /> Chosen only
            </label>
          </div>
          <ul className="max-h-[360px] overflow-y-auto p-2">
            {rows.length === 0 && <li className="px-3 py-8 text-center text-[13.5px] text-ink-500">{q ? `No chats match “${q}”.` : onlySelected ? "None chosen yet." : "No chats found yet. They appear shortly after connecting."}</li>}
            {rows.map((d) => {
              const on = selected.has(d.id);
              const other = owner.get(d.id);
              return (
                <li key={d.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${on ? "bg-brand-50/70" : "hover:bg-surface"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(d)} className="h-4 w-4 shrink-0 accent-brand-600" />
                    <ChannelIcon platform={d.platform} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] ${on ? "font-medium text-ink-900" : "text-ink-800"}`}>{d.name}</span>
                      <span className="block text-[12px] text-ink-500">{kindLabel(d.kind)}</span>
                    </span>
                    {other && !on && <span className="shrink-0 truncate text-[12px] text-ink-400">Answered by {other}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function KnowledgePanel({ r, reload, patchLocal }: { r: Responder; reload: () => Promise<void>; patchLocal: (fn: (r: Responder) => Responder) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"text" | "pdf">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [del, setDel] = useState<Doc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addText() {
    setErr("");
    if (!title.trim() || !text.trim()) return setErr("Give it a title and paste in some facts.");
    setBusy(true);
    try {
      await api(`/auto-replies/${r.id}/docs`, { method: "POST", body: JSON.stringify({ title: title.trim(), source: "text", text }) });
      setTitle("");
      setText("");
      toast("Knowledge added");
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setErr("");
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = () => reject(new Error("Couldn't read that file."));
        fr.readAsDataURL(file);
      });
      await api(`/auto-replies/${r.id}/docs`, { method: "POST", body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, ""), source: "pdf", dataBase64: base64 }) });
      toast(`Added ${file.name}`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Panel title={<span id="knows">What it knows</span>} description="Its only source of truth: products, prices, hours, policies. It never answers beyond these." bodyClass="p-0">
      <ul className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {r.docs.map((d) => (
            <Rise key={d.id} stagger={false} className="flex items-center gap-3 px-5 py-3">
              <FileText size={17} className="shrink-0 text-ink-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium text-ink-900">{d.title}</div>
                <div className="text-[12px] text-ink-500">
                  {d.source === "pdf" ? "PDF" : "Text"}, {d.chars.toLocaleString()} characters, added {ago(d.createdAt)}
                </div>
              </div>
              <button onClick={() => setDel(d)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${d.title}`}>
                <Trash2 size={15} />
              </button>
            </Rise>
          ))}
        </AnimatePresence>
      </ul>
      <div className={`p-5 ${r.docs.length ? "border-t border-line" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-ink-700">{r.docs.length ? "Add more" : "Add its first source"}</span>
          <Segmented id={`kn-${r.id}`} value={mode} onChange={setMode} options={[{ value: "text", label: <><Type size={14} /> Write</> }, { value: "pdf", label: <><Upload size={14} /> PDF</> }]} />
        </div>
        {mode === "text" ? (
          <div className="mt-3 grid gap-2.5">
            <input className="input" placeholder="Title, e.g. Price list (October)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-label="Knowledge title" />
            <textarea className="input h-32 resize-y py-2.5 leading-relaxed" placeholder={"Paste the facts, e.g.\nDelivery to Lekki: ₦2,500, same day if ordered before 1pm.\nOpen Mon–Sat, 9am–6pm."} value={text} onChange={(e) => setText(e.target.value)} aria-label="Knowledge text" />
            <div>
              <button onClick={addText} disabled={busy} className="btn-primary h-9">
                {busy ? <Loader2 size={16} className="animate-spin" /> : "Add knowledge"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[13.5px] text-ink-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
            >
              {busy ? <Loader2 size={20} className="animate-spin text-brand-600" /> : <Upload size={20} />}
              {busy ? "Reading the PDF…" : "Drop a PDF here, or click to choose one"}
            </button>
          </div>
        )}
        {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
      </div>
      <Confirm
        open={!!del}
        title={`Remove “${del?.title}”?`}
        body="This auto-reply will no longer know these facts."
        confirmLabel="Remove"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const d = del!;
          setDel(null);
          patchLocal((x) => ({ ...x, docs: x.docs.filter((y) => y.id !== d.id) }));
          await api(`/auto-replies/${r.id}/docs/${d.id}`, { method: "DELETE" }).catch(() => undefined);
          await reload();
        }}
      />
    </Panel>
  );
}

function RulesPanel({ r, onSave }: { r: Responder; onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(r.instructions);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(r.instructions), [r.id, r.instructions]);
  const dirty = v !== r.instructions;
  const add = (line: string) => setV((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")}\n${line}` : line));
  return (
    <Panel title="Rules" description="Plain English. What it may answer, what it must never do, and how it should sound.">
      <textarea
        className="input h-36 resize-y py-2.5 leading-relaxed"
        value={v}
        onChange={(e) => setV(e.target.value)}
        maxLength={5000}
        placeholder={"e.g. Answer questions about our products, prices and opening hours.\nNever discuss refunds. Never promise delivery dates."}
        aria-label="Rules"
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {RULE_SNIPPETS.filter((s) => !v.includes(s)).map((s) => (
          <button key={s} onClick={() => add(s)} className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12.5px] text-ink-600 transition-[background-color,transform] hover:bg-surface active:scale-[0.97]">
            <Plus size={12} /> {s}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={async () => {
            setBusy(true);
            await onSave(v);
            setBusy(false);
          }}
          disabled={!dirty || busy}
          className="btn-primary h-9"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Save rules"}
        </button>
        {dirty && (
          <button onClick={() => setV(r.instructions)} className="text-[13px] font-medium text-ink-500 hover:text-ink-800">
            Discard changes
          </button>
        )}
      </div>
    </Panel>
  );
}

/** Dry run: type what a customer might say and see exactly what this auto-reply would do. */
function TryPanel({ r }: { r: Responder }) {
  const [msg, setMsg] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ reply: boolean; answer: string; reason: string } | null>(null);
  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || busy) return;
    setBusy(true);
    setRes(null);
    setAsked(msg.trim());
    try {
      setRes(await api(`/auto-replies/${r.id}/try`, { method: "POST", body: JSON.stringify({ message: msg.trim() }) }));
      setMsg("");
    } catch (e) {
      setRes({ reply: false, answer: "", reason: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Try it" description="Nothing is sent. See how it would answer a customer.">
      <div className="min-h-[120px] space-y-2.5">
        {!asked && <p className="pt-6 text-center text-[13px] text-ink-400">Type a question a customer might ask.</p>}
        <AnimatePresence mode="popLayout">
          {asked && (
            <motion.div key={`q-${asked}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface px-3.5 py-2 text-[14px] text-ink-800">
              {asked}
            </motion.div>
          )}
          {busy && (
            <motion.div key="thinking" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md border border-line px-3.5 py-3" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </motion.div>
          )}
          {res && !busy && (
            <motion.div key={`a-${asked}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
              {res.reply ? (
                <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-brand-600 px-3.5 py-2 text-[14px] leading-relaxed text-white">{res.answer}</div>
              ) : (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  <MessageCircleQuestion size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">Would stay silent</span> and leave it for you. {res.reason}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <form onSubmit={run} className="mt-4 flex items-center gap-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. How much is delivery to Lekki?" className="input h-10" aria-label="Customer message to try" maxLength={1000} />
        <button type="submit" disabled={!msg.trim() || busy} className="btn-primary h-10 w-10 shrink-0 !px-0" aria-label="Try">
          <Send size={16} />
        </button>
      </form>
    </Panel>
  );
}

function ReplyList({ items, showResponder, compact }: { items: ReplyLog[]; showResponder?: boolean; compact?: boolean }) {
  if (items.length === 0) return <p className="px-3 py-6 text-center text-[13.5px] text-ink-500">No replies yet. They show up here once it starts answering.</p>;
  return (
    <ul>
      {items.map((r) => (
        <li key={r.id} className="rounded-xl px-3 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
            <ChannelIcon platform={r.platform} size={16} />
            <span className="truncate">
              {r.destination}, from {r.from}
            </span>
            <span className="ml-auto shrink-0">{ago(r.at)}</span>
          </div>
          <p className={`mt-1.5 text-[14px] text-ink-900 ${compact ? "line-clamp-2" : ""}`}>{r.incoming}</p>
          {r.replied ? (
            <p className={`mt-1 border-l-2 border-brand-500 pl-2.5 text-[13.5px] text-ink-600 ${compact ? "line-clamp-2" : ""}`}>{r.replyText}</p>
          ) : (
            <p className="mt-1 text-[13px] text-amber-800">Left for you{r.reason ? `: ${r.reason}` : ""}</p>
          )}
          {showResponder && r.responderName && <p className="mt-1 text-[12px] text-ink-400">{r.responderName}</p>}
        </li>
      ))}
    </ul>
  );
}

function Locked() {
  return (
    <Page width="max-w-3xl">
      <PageHeader title="Auto-replies" />
      <section className="rounded-2xl border border-line p-8">
        <Badge tone="brand">Pro feature</Badge>
        <h2 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Let RelayFlow answer customers for you</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
          Create separate auto-replies for different groups, each with its own facts and rules. RelayFlow answers from your facts, and stays silent when they don&rsquo;t clearly cover the question.
        </p>
        <ul className="mt-5 space-y-2 text-[14px] text-ink-700">
          {["One auto-reply per purpose: shop FAQs, orders, community rules", "Choose exactly which groups each one answers in", "Answers only from your own facts, never guesses"].map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-600" />
              {f}
            </li>
          ))}
        </ul>
        <Link to="/pricing" className="btn-primary mt-7 h-10 px-4">
          Upgrade to Pro, ${PRICES.pro}/month
        </Link>
      </section>
    </Page>
  );
}
