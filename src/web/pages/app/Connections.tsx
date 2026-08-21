import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Check, X, RefreshCw, Plug } from "lucide-react";

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
  { key: "whatsapp", name: "WhatsApp", color: "#25D366", copy: "Scan a QR from WhatsApp → Linked devices. Reads your group messages." },
  { key: "telegram", name: "Telegram", color: "#229ED9", copy: "Sign in with your phone number. Groups and channels." },
  { key: "slack", name: "Slack", color: "#611f69", copy: "Authorize with Slack. Your channels and messages." },
  { key: "gmail", name: "Gmail", color: "#EA4335", copy: "Authorize Gmail. Recent inbox for analysis and sending." },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-emerald-50 text-emerald-700" },
  connecting: { label: "Connecting…", cls: "bg-amber-50 text-amber-700" },
  qr: { label: "Scan QR", cls: "bg-amber-50 text-amber-700" },
  pending: { label: "Finish sign-in", cls: "bg-amber-50 text-amber-700" },
  disconnected: { label: "Disconnected", cls: "bg-ink-100 text-ink-600" },
  error: { label: "Error", cls: "bg-red-50 text-red-600" },
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function Connections() {
  const [conns, setConns] = useState<ConnView[]>([]);
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<ReactNode>(null);

  const load = async () => {
    const { connections } = await api<{ connections: ConnView[] }>("/connections");
    setConns(connections);
  };
  useEffect(() => {
    load();
  }, []);

  const banner = params.get("connected")
    ? { ok: true, text: `${PLATFORMS.find((p) => p.key === params.get("connected"))?.name || "Channel"} connected.` }
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

  async function disconnect(id: string) {
    if (!confirm("Disconnect this channel?")) return;
    await api(`/connections/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Connections</h1>
        <p className="mt-1 text-ink-500">Connect your channels once. Your agent sees the recent messages and can send on your behalf.</p>

        {banner && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-[15px] font-medium ${banner.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {banner.text}
            <button className="ml-2 underline opacity-70" onClick={() => setParams({})}>dismiss</button>
          </div>
        )}

        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {PLATFORMS.map((p) => {
            const conn = byPlatform(p.key);
            const status = conn ? STATUS[conn.status] || { label: conn.status, cls: "bg-ink-100 text-ink-600" } : null;
            const isConnected = conn?.status === "connected";
            const needsReconnect = conn && (conn.status === "disconnected" || conn.status === "error");
            return (
              <div key={p.key} className="card p-5 flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="h-11 w-11 rounded-xl grid place-items-center text-white font-bold" style={{ background: p.color }}>
                    {p.name.slice(0, 2)}
                  </span>
                  <div className="flex-1">
                    <div className="font-bold text-ink-900">{p.name}</div>
                    <div className="text-sm text-ink-500 truncate">{conn?.displayName && isConnected ? conn.displayName : "Not connected"}</div>
                  </div>
                  {status && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{status.label}</span>}
                </div>
                <p className="mt-3 text-sm text-ink-600 leading-relaxed">{p.copy}</p>
                {isConnected && (
                  <div className="mt-2 text-sm text-ink-500">{conn!.selectedCount} channel{conn!.selectedCount === 1 ? "" : "s"} in scope</div>
                )}
                <div className="mt-4 flex gap-2">
                  {!conn || needsReconnect ? (
                    <button onClick={() => connect(p.key)} className="btn-primary h-10 px-4">
                      <Plug size={16} /> {needsReconnect ? "Reconnect" : "Connect"}
                    </button>
                  ) : isConnected ? (
                    <>
                      <button onClick={() => setModal(<DestinationsModal conn={conn!} onClose={() => { setModal(null); load(); }} />)} className="btn-ghost h-10 px-4">
                        Choose channels
                      </button>
                      <button onClick={() => disconnect(conn!.id)} className="btn-danger h-10 px-4">Disconnect</button>
                    </>
                  ) : (
                    <button onClick={() => connect(p.key)} className="btn-ghost h-10 px-4">
                      <RefreshCw size={16} /> Continue
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {modal}
    </div>
  );
}

function WhatsAppModal({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");

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
          if (s.qr) setQr(s.qr);
          if (s.status === "connected") {
            setTimeout(onClose, 900);
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

  return (
    <Modal title="Connect WhatsApp" onClose={onClose}>
      <p className="text-sm text-ink-600">Open WhatsApp → <b>Linked devices</b> → <b>Link a device</b>, then scan this code.</p>
      <div className="mt-4 grid place-items-center h-64">
        {status === "connected" ? (
          <div className="text-center text-emerald-600"><Check size={40} className="mx-auto" /><p className="mt-2 font-semibold">Connected!</p></div>
        ) : qr ? (
          <img src={qr} alt="WhatsApp QR" className="h-56 w-56 rounded-xl border border-line" />
        ) : (
          <div className="text-ink-400 flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /> Generating code…</div>
        )}
      </div>
      <p className="text-xs text-ink-400 mt-2 text-center">Keep this open until it connects. Only your group messages are read.</p>
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
    <Modal title={`${conn.displayName} — channels in scope`} onClose={onClose}>
      <p className="text-sm text-ink-500 mb-3">Pick which conversations the agent should include.</p>
      <div className="max-h-72 overflow-y-auto space-y-1">
        {dests.length === 0 && <p className="text-sm text-ink-400 py-4">No channels found yet. They appear shortly after connecting.</p>}
        {dests.map((d) => (
          <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={d.selected}
              onChange={(e) => setDests((prev) => prev.map((x) => (x.id === d.id ? { ...x, selected: e.target.checked } : x)))}
              className="h-4 w-4 accent-brand-600"
            />
            <span className="flex-1 text-[15px] text-ink-800 truncate">{d.name}</span>
            <span className="text-xs text-ink-400">{d.kind}</span>
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="btn-primary w-full mt-4">{busy ? "Saving…" : "Save"}</button>
    </Modal>
  );
}
