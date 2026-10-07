import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { AnimatePresence, motion } from "motion/react";
import { Rise, EASE_OUT } from "../../components/motion";
import { useStickyState } from "../../lib/sticky";
import { Page, PageHeader, Badge, ChannelIcon, Confirm, useToast, type Tone } from "../../components/ui";
import { Check, X, RefreshCw, Plug, ListChecks, Search } from "lucide-react";

interface ConnView {
  id: string;
  platform: string;
  status: string;
  displayName: string;
  lastError: string | null;
  selectedCount: number;
}
interface Dest {
  id: string;
  name: string;
  kind: string;
  selected: boolean;
}

const PLATFORMS = [
  { key: "whatsapp", name: "WhatsApp", copy: "Link with a QR code, like WhatsApp Web. Works with your groups only, never private chats." },
  { key: "telegram", name: "Telegram", copy: "Sign in with your phone number. Works with your groups and channels, never private chats." },
  { key: "slack", name: "Slack", copy: "Authorize with Slack. Works with your channels, never direct messages." },
];

const STATUS: Record<string, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "live" },
  connecting: { label: "Connecting", tone: "warn" },
  qr: { label: "Waiting for QR scan", tone: "warn" },
  pending: { label: "Finish sign-in", tone: "warn" },
  disconnected: { label: "Disconnected", tone: "idle" },
  error: { label: "Needs reconnecting", tone: "bad" },
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-white shadow-pop"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export default function Connections() {
  const toast = useToast();
  const [conns, setConns, connsCached] = useStickyState<ConnView[]>("connections", []);
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<ReactNode>(null);
  const [confirm, setConfirm] = useState<ConnView | null>(null);

  const load = async () => {
    const { connections } = await api<{ connections: ConnView[] }>("/connections");
    setConns(connections);
  };
  useEffect(() => {
    load();
  }, []);

  const banner = params.get("connected")
    ? { ok: true, text: `${PLATFORMS.find((p) => p.key === params.get("connected"))?.name || "Channel"} connected. Your chats are syncing now.` }
    : params.get("error")
    ? { ok: false, text: `${PLATFORMS.find((p) => p.key === params.get("error"))?.name || "That channel"} didn't connect. Please try again.` }
    : null;

  const byPlatform = (key: string) => conns.find((c) => c.platform === key);

  async function connect(key: string) {
    if (key === "whatsapp") return setModal(<WhatsAppModal onClose={() => { setModal(null); load(); }} />);
    if (key === "telegram") return setModal(<TelegramModal onClose={() => { setModal(null); load(); }} />);
    const { url } = await api<{ url: string }>(`/connections/${key}/start`);
    window.location.href = url;
  }

  async function disconnect(c: ConnView) {
    setConfirm(null);
    await api(`/connections/${c.id}`, { method: "DELETE" });
    toast("Disconnected");
    load();
  }

  return (
    <Page width="max-w-[960px]">
      <PageHeader title="Connections" description="Connect each channel once. RelayFlow works with your groups and channels only (never private chats). It reads recent messages in the groups you choose, and only sends when you approve, or when an auto-reply you turned on answers." />

      <AnimatePresence>
        {banner && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className={`mb-5 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-[14px] font-medium ${banner.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            <span className="inline-flex items-center gap-2">{banner.ok ? <Check size={16} /> : <X size={16} />}{banner.text}</span>
            <button className="grid h-7 w-7 place-items-center rounded-lg opacity-70 hover:opacity-100" onClick={() => setParams({})} aria-label="Dismiss">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {PLATFORMS.map((p, i) => {
          const conn = byPlatform(p.key);
          const status = conn ? STATUS[conn.status] || { label: conn.status, tone: "idle" as Tone } : null;
          const isConnected = conn?.status === "connected";
          const needsReconnect = conn && (conn.status === "disconnected" || conn.status === "error");
          return (
            <Rise key={p.key} index={i} stagger={!connsCached} className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-white px-5 py-5">
              <ChannelIcon platform={p.key} size={40} />
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink-900">{p.name}</span>
                  {status && <Badge tone={status.tone} dot>{status.label}</Badge>}
                </div>
                <p className="mt-0.5 text-[13.5px] text-ink-500">
                  {isConnected ? `${conn!.displayName}, ${conn!.selectedCount} group${conn!.selectedCount === 1 ? "" : "s"} chosen` : conn?.status === "error" && conn.lastError ? conn.lastError : p.copy}
                </p>
              </div>
              <div className="flex gap-2">
                {!conn || needsReconnect ? (
                  <button onClick={() => connect(p.key)} className="btn-primary h-9">
                    <Plug size={15} /> {needsReconnect ? "Reconnect" : "Connect"}
                  </button>
                ) : isConnected ? (
                  <>
                    <button onClick={() => setModal(<DestinationsModal conn={conn!} onClose={() => { setModal(null); load(); }} />)} className="btn-ghost h-9">
                      <ListChecks size={15} /> Choose groups
                    </button>
                    <button onClick={() => setConfirm(conn!)} className="btn-danger h-9">Disconnect</button>
                  </>
                ) : (
                  <button onClick={() => connect(p.key)} className="btn-ghost h-9">
                    <RefreshCw size={15} /> Continue setup
                  </button>
                )}
              </div>
            </Rise>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] text-ink-500">Credentials are encrypted. Disconnecting removes RelayFlow's access straight away.</p>
      {modal}
      <Confirm
        open={!!confirm}
        title={`Disconnect ${PLATFORMS.find((p) => p.key === confirm?.platform)?.name}?`}
        body="Auto-replies and monitors on this channel stop until you reconnect."
        confirmLabel="Disconnect"
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && disconnect(confirm)}
      />
    </Page>
  );
}

function WhatsAppModal({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting"); // connecting | qr | linking | connected
  const [everHadQr, setEverHadQr] = useState(false);
  const [linkSecs, setLinkSecs] = useState(0);

  useEffect(() => {
    let stop = false;
    let id = "";
    (async () => {
      const res = await api<{ id: string }>("/connections/whatsapp", { method: "POST" });
      id = res.id;
      const poll = async () => {
        if (stop) return;
        try {
          const s = await api<{ status: string; qr: string | null }>(`/connections/whatsapp/${id}/qr`);
          setStatus(s.status);
          if (s.qr) {
            setQr(s.qr);
            setEverHadQr(true);
          } else if (s.status !== "qr") {
            setQr(null);
          }
          if (s.status === "connected") {
            setTimeout(onClose, 1100);
            return;
          }
        } catch {
          /* keep polling */
        }
        setTimeout(poll, 2000);
      };
      poll();
    })();
    return () => {
      stop = true;
    };
  }, []);

  // Once the QR is scanned (or gone), count up so the wait shows visible progress.
  const isLinking = status === "linking" || (everHadQr && !qr && status !== "connected");
  useEffect(() => {
    if (!isLinking) return;
    const t = setInterval(() => setLinkSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isLinking]);

  return (
    <Modal title="Connect WhatsApp" onClose={onClose}>
      {status === "connected" ? (
        <div className="grid place-items-center h-64">
          <div className="text-center text-emerald-600">
            <div className="mx-auto grid place-items-center h-16 w-16 rounded-full bg-emerald-50">
              <Check size={34} />
            </div>
            <p className="mt-3 font-semibold text-ink-900">WhatsApp connected!</p>
            <p className="text-sm text-ink-500">Syncing your groups now…</p>
          </div>
        </div>
      ) : isLinking ? (
        <div className="grid place-items-center h-64 text-center px-4">
          <div>
            <span className="mx-auto block h-12 w-12 rounded-full border-[3px] border-brand-500 border-t-transparent animate-spin" />
            <p className="mt-4 font-semibold text-ink-900">Linking your WhatsApp…</p>
            <p className="mt-1 text-sm text-ink-500">
              Scan detected — WhatsApp is pairing this device. This can take up to a minute, so please keep this open.
            </p>
            <p className="mt-3 text-xs font-semibold text-ink-400">Connecting… {linkSecs}s</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-600">
            Open WhatsApp → <b>Linked devices</b> → <b>Link a device</b>, then scan this code.
          </p>
          <div className="mt-4 grid place-items-center h-56">
            {qr ? (
              <img src={qr} alt="WhatsApp QR" className="h-56 w-56 rounded-xl border border-line" />
            ) : (
              <div className="text-ink-400 flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /> Generating code…
              </div>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-2 text-center">RelayFlow only reads your groups, never private chats. Keep this open until it connects.</p>
        </>
      )}
    </Modal>
  );
}

function TelegramModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<"phone" | "code" | "2fa">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [id, setId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      if (stage === "phone") {
        const res = await api<{ id: string }>("/connections/telegram", { method: "POST", body: JSON.stringify({ phone }) });
        setId(res.id);
        setStage("code");
      } else if (stage === "code") {
        const res = await api<{ status: string }>(`/connections/telegram/${id}/code`, { method: "POST", body: JSON.stringify({ code }) });
        if (res.status === "needs_2fa") setStage("2fa");
        else onClose();
      } else {
        await api(`/connections/telegram/${id}/2fa`, { method: "POST", body: JSON.stringify({ password }) });
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Connect Telegram" onClose={onClose}>
      {stage === "phone" && (
        <>
          <label className="label">Phone number (with country code)</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2348012345678" autoFocus />
        </>
      )}
      {stage === "code" && (
        <>
          <label className="label">Login code (from Telegram)</label>
          <input className="input text-center tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" autoFocus />
        </>
      )}
      {stage === "2fa" && (
        <>
          <label className="label">Two-step password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </>
      )}
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      <button onClick={submit} disabled={busy} className="btn-primary w-full mt-4">
        {busy ? "Please wait…" : stage === "phone" ? "Send code" : stage === "code" ? "Verify" : "Confirm"}
      </button>
    </Modal>
  );
}

function DestinationsModal({ conn, onClose }: { conn: ConnView; onClose: () => void }) {
  const [dests, setDests] = useState<Dest[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ destinations: Dest[] }>(`/connections/${conn.id}/destinations`).then(({ destinations }) => setDests(destinations));
  }, [conn.id]);

  async function save() {
    setBusy(true);
    await api(`/connections/${conn.id}/destinations`, {
      method: "PATCH",
      body: JSON.stringify({ selectedIds: dests.filter((d) => d.selected).map((d) => d.id) }),
    });
    onClose();
  }

  return (
    <Modal title={`Groups RelayFlow reads (${conn.displayName})`} onClose={onClose}>
      <p className="mb-3 text-[13.5px] text-ink-500">Pick which groups RelayFlow should read. Unticked groups are ignored completely. Private chats are never read.</p>
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" className="input h-9 pl-9" aria-label="Search groups" />
      </div>
      <div className="max-h-72 overflow-y-auto space-y-0.5">
        {dests.length === 0 && <p className="text-sm text-ink-400 py-4">No channels found yet. They appear shortly after connecting.</p>}
        {dests.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase())).map((d) => (
          <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={d.selected}
              onChange={(e) => setDests((prev) => prev.map((x) => (x.id === d.id ? { ...x, selected: e.target.checked } : x)))}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="flex-1 text-[15px] text-ink-800 truncate">{d.name}</span>
            <span className="text-xs text-ink-400">{d.kind === "channel" ? "Channel" : "Group"}</span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="btn-primary w-full mt-4">{busy ? "Saving…" : "Save groups"}</button>
    </Modal>
  );
}
