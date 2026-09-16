import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { BookOpen, FileText, Upload, Trash2, Check, Loader2, Bot, ShieldCheck } from "lucide-react";

interface Doc { id: string; title: string; source: "text" | "pdf"; chars: number; createdAt: string }
interface AutoDest { id: string; externalId: string; name: string; kind: string; autoReplyEnabled: boolean }
interface Channel { connectionId: string; platform: string; displayName: string; destinations: AutoDest[] }
interface ReplyLog { id: string; platform: string; destination: string; from: string; incoming: string; replied: boolean; replyText: string | null; reason: string | null; at: string }
interface KnowledgeData { guardrails: string; docs: Doc[]; channels: Channel[]; recent: ReplyLog[] }

const PLATFORM_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };

export default function Knowledge() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [guardrails, setGuardrails] = useState("");
  const [savingGuard, setSavingGuard] = useState(false);
  const [guardSaved, setGuardSaved] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const d = await api<KnowledgeData>("/knowledge");
    setData(d);
    setGuardrails(d.guardrails);
  };
  useEffect(() => { load(); }, []);

  async function saveGuardrails() {
    setSavingGuard(true); setGuardSaved(false);
    try {
      await api("/knowledge/guardrails", { method: "PUT", body: JSON.stringify({ guardrails }) });
      setGuardSaved(true); setTimeout(() => setGuardSaved(false), 2500);
    } finally { setSavingGuard(false); }
  }

  async function addText() {
    setErr("");
    if (!docTitle.trim() || !docText.trim()) return setErr("Give the document a title and some text.");
    setAddingText(true);
    try {
      await api("/knowledge/docs", { method: "POST", body: JSON.stringify({ title: docTitle.trim(), source: "text", text: docText }) });
      setDocTitle(""); setDocText(""); await load();
    } catch (e: any) { setErr(e?.data?.detail || e?.message || "Couldn't add."); }
    finally { setAddingText(false); }
  }

  async function uploadPdf(file: File) {
    setErr(""); setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      await api("/knowledge/docs", { method: "POST", body: JSON.stringify({ title: file.name.replace(/\.pdf$/i, ""), source: "pdf", dataBase64: base64 }) });
      await load();
    } catch (e: any) { setErr(e?.data?.detail || e?.message || "Couldn't read that PDF."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function removeDoc(id: string) {
    setData((d) => (d ? { ...d, docs: d.docs.filter((x) => x.id !== id) } : d));
    await api(`/knowledge/docs/${id}`, { method: "DELETE" }).catch(() => load());
  }

  async function toggleDestination(connectionId: string, d: AutoDest) {
    setData((data) =>
      data
        ? {
            ...data,
            channels: data.channels.map((c) =>
              c.connectionId === connectionId
                ? { ...c, destinations: c.destinations.map((x) => (x.id === d.id ? { ...x, autoReplyEnabled: !x.autoReplyEnabled } : x)) }
                : c,
            ),
          }
        : data,
    );
    await api("/knowledge/auto-reply", { method: "PATCH", body: JSON.stringify({ destinationId: d.id, enabled: !d.autoReplyEnabled }) }).catch(() => load());
  }

  if (!data) return <div className="h-full grid place-items-center text-ink-500">Loading…</div>;
  const anyOn = data.channels.some((c) => c.destinations.some((d) => d.autoReplyEnabled));
  const hasKnowledge = data.docs.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600"><BookOpen size={22} /></span>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Knowledge & Auto-reply</h1>
            <p className="text-ink-500">Give the AI your facts, then let it answer customers on the channels you choose.</p>
          </div>
        </div>

        {anyOn && !hasKnowledge && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-[15px]">
            Auto-reply is on, but your knowledge base is empty — add some facts below or the AI will stay silent (it only answers from your facts).
          </div>
        )}

        {/* Auto-reply channels */}
        <div className="mt-6 card p-6">
          <div className="flex items-center gap-2"><Bot size={18} className="text-brand-600" /><h2 className="font-bold text-ink-900">Auto-reply channels</h2></div>
          <p className="mt-1 text-sm text-ink-500">
            Pick the exact groups/channels the AI should answer in. When on, it reads new messages there and replies automatically — <b>only when it's confident the answer is in your knowledge base</b>. If it's unsure, it stays silent and leaves it for you.
          </p>
          <div className="mt-4 space-y-5">
            {data.channels.length === 0 && <p className="text-sm text-ink-400">No connected channels yet — connect one in Connections first.</p>}
            {data.channels.map((c) => (
              <div key={c.connectionId}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-ink-900">{PLATFORM_LABEL[c.platform] || c.platform}</span>
                  <span className="text-sm text-ink-400 truncate">{c.displayName}</span>
                  <span className="ml-auto text-xs text-ink-400">
                    {c.destinations.filter((d) => d.autoReplyEnabled).length}/{c.destinations.length} on
                  </span>
                </div>
                {c.destinations.length === 0 ? (
                  <p className="text-sm text-ink-400 pl-1">No groups/channels found yet — they appear shortly after connecting.</p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {c.destinations.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5">
                        <div className="min-w-0 text-[15px] text-ink-800 truncate">{d.name}</div>
                        <button
                          onClick={() => toggleDestination(c.connectionId, d)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition ${d.autoReplyEnabled ? "bg-brand-600" : "bg-ink-200"}`}
                          aria-label={`Toggle auto-reply for ${d.name}`}
                        >
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${d.autoReplyEnabled ? "left-6" : "left-1"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Guardrails */}
        <div className="mt-5 card p-6">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-brand-600" /><h2 className="font-bold text-ink-900">Guardrails</h2></div>
          <p className="mt-1 text-sm text-ink-500">Tell the AI what it may and may not do. Plain English.</p>
          <textarea
            className="input h-28 py-2 mt-3"
            value={guardrails}
            onChange={(e) => setGuardrails(e.target.value)}
            placeholder={"e.g. Answer questions about our products, prices, opening hours and address. Never discuss refunds, never give legal or medical advice, and never promise delivery dates."}
          />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={saveGuardrails} disabled={savingGuard} className="btn-primary">
              {savingGuard ? <Loader2 className="animate-spin" size={18} /> : "Save guardrails"}
            </button>
            {guardSaved && <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><Check size={16} /> Saved</span>}
          </div>
        </div>

        {/* Knowledge documents */}
        <div className="mt-5 card p-6">
          <div className="flex items-center gap-2"><FileText size={18} className="text-brand-600" /><h2 className="font-bold text-ink-900">Knowledge documents</h2></div>
          <p className="mt-1 text-sm text-ink-500">Your facts: products, prices, hours, address, policies. Paste text or upload a PDF.</p>

          <div className="mt-4 grid gap-3">
            <input className="input" placeholder="Document title (e.g. September Product List)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
            <textarea className="input h-28 py-2" placeholder="Paste facts here…" value={docText} onChange={(e) => setDocText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={addText} disabled={addingText} className="btn-primary">
                {addingText ? <Loader2 className="animate-spin" size={18} /> : "Add text"}
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-ghost">
                {uploading ? <Loader2 className="animate-spin" size={18} /> : <><Upload size={16} /> Upload PDF</>}
              </button>
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
          </div>

          <div className="mt-5 space-y-2">
            {data.docs.length === 0 && <p className="text-sm text-ink-400">No documents yet.</p>}
            {data.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
                <span className="grid place-items-center h-9 w-9 rounded-lg bg-surface text-ink-500 shrink-0">
                  {d.source === "pdf" ? <FileText size={16} /> : <BookOpen size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink-900 truncate">{d.title}</div>
                  <div className="text-xs text-ink-400">{d.source.toUpperCase()} · {d.chars.toLocaleString()} chars</div>
                </div>
                <button onClick={() => removeDoc(d.id)} className="text-ink-400 hover:text-red-500"><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent auto-replies */}
        <div className="mt-5 card p-6">
          <h2 className="font-bold text-ink-900">Recent auto-replies</h2>
          <p className="mt-1 text-sm text-ink-500">What the AI answered — and what it chose to leave for you.</p>
          <div className="mt-4 space-y-2">
            {data.recent.length === 0 && <p className="text-sm text-ink-400">Nothing yet. Turn on a channel and add facts to get started.</p>}
            {data.recent.map((r) => (
              <div key={r.id} className="rounded-xl border border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-ink-500 truncate">{PLATFORM_LABEL[r.platform] || r.platform} · {r.destination} · from {r.from}</div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${r.replied ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"}`}>
                    {r.replied ? "Replied" : "Skipped"}
                  </span>
                </div>
                <div className="mt-1.5 text-[15px] text-ink-800"><span className="text-ink-400">Q:</span> {r.incoming}</div>
                {r.replied ? (
                  <div className="mt-1 text-[15px] text-brand-800"><span className="text-ink-400">A:</span> {r.replyText}</div>
                ) : (
                  <div className="mt-1 text-sm text-ink-400">Stayed silent — {r.reason || "not confident"}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
