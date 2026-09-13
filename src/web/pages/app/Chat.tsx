import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../../lib/api";
import { Plus, Send, Trash2, Sparkles, Check, MessageSquare, X, MoreVertical, Pencil, AlertTriangle } from "lucide-react";

interface Step {
  label: string;
  done: boolean;
}
interface ToolResult {
  name: string;
  result?: any;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  resolvedActions?: { key: string; state: string; text: string }[];
  pending?: boolean;
  steps?: Step[];
}
interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  preview?: string;
}

const PLATFORM_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };

export default function Chat() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionStatus, setActionStatus] = useState<Record<string, { state: "sending" | "sent" | "failed" | "scheduled"; text: string }>>({});
  const setStatus = (key: string, state: "sending" | "sent" | "failed" | "scheduled", text: string) =>
    setActionStatus((s) => ({ ...s, [key]: { state, text } }));
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ChatSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The chat currently being streamed into — skip the server reload for it so the
  // optimistic messages + live stream are not wiped when we navigate to the new URL.
  const streamingRef = useRef<string | null>(null);

  const loadChats = async () => {
    const { chats } = await api<{ chats: ChatSummary[] }>("/chats");
    setChats(chats);
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (!chatId) {
      if (!streamingRef.current) setMessages([]);
      return;
    }
    if (chatId === streamingRef.current) return; // don't clobber an in-flight stream
    api<{ messages: Msg[] }>(`/chats/${chatId}`)
      .then(({ messages }) => {
        setMessages(messages);
        seedResolved(messages);
      })
      .catch(() => setMessages([]));
  }, [chatId]);

  // Re-apply approvals already acted on so a refresh doesn't show the Approve button again.
  function seedResolved(msgs: Msg[]) {
    setActionStatus((prev) => {
      const next = { ...prev };
      for (const m of msgs) for (const r of m.resolvedActions || []) next[r.key] = { state: r.state as any, text: r.text };
      return next;
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function newChat() {
    const { chat } = await api<{ chat: ChatSummary }>("/chats", { method: "POST" });
    setChats((c) => [chat, ...c]);
    nav(`/app/chat/${chat.id}`);
  }

  async function deleteChat(id: string) {
    setConfirmDelete(null);
    setChats((c) => c.filter((x) => x.id !== id));
    if (id === chatId) nav("/app/chat");
    await api(`/chats/${id}`, { method: "DELETE" }).catch(() => loadChats());
  }

  function startRename(c: ChatSummary) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setMenuId(null);
  }

  async function saveRename(id: string) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    setChats((cs) => cs.map((x) => (x.id === id ? { ...x, title } : x)));
    await api(`/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }).catch(() => loadChats());
  }

  const patchAssistant = (id: string, fn: (m: Msg) => Msg) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");

    let activeId = chatId;
    if (!activeId) {
      const { chat } = await api<{ chat: ChatSummary }>("/chats", { method: "POST" });
      setChats((c) => [chat, ...c]);
      activeId = chat.id;
      streamingRef.current = activeId;
      nav(`/app/chat/${chat.id}`);
    } else {
      streamingRef.current = activeId;
    }

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    const asstId = `a-${Date.now()}`;
    const asst: Msg = { id: asstId, role: "assistant", content: "", pending: true, steps: [], toolResults: [] };
    setMessages((m) => [...m, userMsg, asst]);

    try {
      const res = await fetch(`/api/chats/${activeId}/stream`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        patchAssistant(asstId, (m) => ({
          ...m,
          pending: false,
          content: data.detail || "You're out of AI credits. Upgrade your plan in Settings to keep going.",
        }));
        return;
      }
      if (!res.ok || !res.body) throw new Error("Request failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let sawTerminal = false;
      while (true) {
        const { value, done } = await reader.read();
        buf += dec.decode(value || new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "activity") {
            patchAssistant(asstId, (m) => {
              const steps = [...(m.steps || [])];
              if (ev.phase === "start") steps.push({ label: ev.label, done: false });
              else if (ev.phase === "done") {
                const last = [...steps].reverse().find((s) => !s.done);
                if (last) {
                  last.done = true;
                  last.label = ev.label;
                } else steps.push({ label: ev.label, done: true });
              }
              return { ...m, steps, ...(ev.phase !== "done" ? {} : {}) };
            });
          } else if (ev.type === "text_delta") {
            patchAssistant(asstId, (m) => ({ ...m, content: m.content + ev.delta, pending: false }));
          } else if (ev.type === "completed") {
            sawTerminal = true;
            // Adopt the server's message id so approvals persist against the id the
            // message keeps after a refresh.
            patchAssistant(asstId, (m) => ({ ...m, id: ev.messageId || m.id, pending: false, toolResults: ev.toolResults || [] }));
          } else if (ev.type === "error") {
            sawTerminal = true;
            patchAssistant(asstId, (m) => ({ ...m, pending: false, content: ev.detail || "Something went wrong." }));
          }
        }
        if (done) break;
      }
      if (!sawTerminal) patchAssistant(asstId, (m) => ({ ...m, pending: false, content: m.content || "The response was interrupted. Please try again." }));
      loadChats();
    } catch {
      patchAssistant(asstId, (m) => ({ ...m, pending: false, content: "I couldn't complete that request. Please try again." }));
    } finally {
      streamingRef.current = null;
      setBusy(false);
    }
  }

  function persistResolve(messageId: string, key: string, state: string, text: string) {
    if (!messageId || messageId.startsWith("a-")) return; // no server id yet (shouldn't happen post-stream)
    api(`/chats/${chatId}/resolve`, { method: "POST", body: JSON.stringify({ messageId, key, state, text }) }).catch(() => undefined);
  }

  async function approveSend(messageId: string, key: string, content: string, targets: any[]) {
    if (!targets?.length) {
      setStatus(key, "failed", "No destination resolved — ask the agent to prepare it again.");
      return;
    }
    setStatus(key, "sending", targets.length > 1 ? `Sending to ${targets.length} destinations…` : "Sending…");
    try {
      const res = await api<{ ok: number; total: number; results: any[] }>(`/chats/${chatId}/confirm-send`, {
        method: "POST",
        body: JSON.stringify({ content, targets }),
      });
      const ok = res.ok ?? 0;
      const total = res.total ?? targets.length;
      let state: "sent" | "failed" = "sent";
      let text = "";
      if (ok === total) text = `Sent to ${total} destination${total === 1 ? "" : "s"}`;
      else if (ok === 0) {
        state = "failed";
        text = `Failed — ${res.results?.find((r) => !r.ok)?.error || "delivery failed"}`;
      } else text = `Sent to ${ok} of ${total} (some failed)`;
      setStatus(key, state, text);
      if (state !== "failed") persistResolve(messageId, key, state, text);
    } catch (e) {
      setStatus(key, "failed", `Failed — ${(e as Error).message}`);
    }
  }

  async function approveSchedule(messageId: string, key: string, payload: any) {
    setStatus(key, "sending", "Scheduling…");
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: payload.title, instruction: payload.instruction, schedule: payload.schedule, runAt: payload.run_at }),
      });
      setStatus(key, "scheduled", "Scheduled");
      persistResolve(messageId, key, "scheduled", "Scheduled");
    } catch (e) {
      setStatus(key, "failed", `Couldn't schedule — ${(e as Error).message}`);
    }
  }

  async function approveMonitor(messageId: string, key: string, payload: any) {
    setStatus(key, "sending", "Starting monitor…");
    try {
      await api("/monitors", {
        method: "POST",
        body: JSON.stringify({
          title: payload.title,
          platform: payload.platform,
          group: payload.group ?? null,
          condition: payload.condition,
          mode: payload.mode,
          intervalMinutes: payload.interval_minutes,
          absenceHours: payload.absence_hours,
        }),
      });
      const text = "Monitoring — I'll email you when it matches.";
      setStatus(key, "scheduled", text);
      persistResolve(messageId, key, "scheduled", text);
    } catch (e) {
      setStatus(key, "failed", `Couldn't start monitor — ${(e as Error).message}`);
    }
  }

  return (
    <div className="h-full flex">
      {/* Sessions */}
      <div className="w-64 shrink-0 border-r border-line bg-white flex flex-col">
        <div className="p-3">
          <button onClick={newChat} className="btn-primary w-full h-11">
            <Plus size={18} /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {chats.length === 0 && <p className="text-sm text-ink-400 px-3 py-4">No conversations yet.</p>}
          {chats.map((c) => {
            const active = c.id === chatId;
            const editing = editingId === c.id;
            return (
              <div key={c.id} className={`group relative rounded-xl ${active ? "bg-brand-50" : "hover:bg-surface"}`}>
                {editing ? (
                  <div className="px-2 py-1.5">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(c.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => saveRename(c.id)}
                      className="input h-9 text-sm"
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer" onClick={() => nav(`/app/chat/${c.id}`)}>
                    <MessageSquare size={16} className={`mt-0.5 shrink-0 ${active ? "text-brand-600" : "text-ink-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${active ? "text-brand-700" : "text-ink-800"}`}>{c.title}</div>
                      {c.preview && <div className="truncate text-xs text-ink-400 mt-0.5">{c.preview}</div>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(menuId === c.id ? null : c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-ink-700 -mr-1 mt-0.5 shrink-0"
                      aria-label="Chat options"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                )}

                {menuId === c.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                    <div className="absolute right-2 top-10 z-20 w-40 rounded-xl border border-line bg-white shadow-pop p-1">
                      <button
                        onClick={() => startRename(c)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-ink-700 hover:bg-surface"
                      >
                        <Pencil size={15} /> Rename
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDelete(c);
                          setMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-ink-900/40 grid place-items-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-red-50 text-red-600 shrink-0">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-bold text-ink-900">Delete this chat?</h3>
                <p className="text-sm text-ink-500">This permanently removes the conversation.</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-700 bg-surface rounded-lg px-3 py-2 truncate">{confirmDelete.title}</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => deleteChat(confirmDelete.id)} className="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8">
            {messages.length === 0 && (
              <div className="mt-20 text-center">
                <span className="inline-grid place-items-center h-14 w-14 rounded-2xl text-white" style={{ background: "linear-gradient(135deg,#22c1d6,#4f46e5)" }}>
                  <Sparkles size={26} />
                </span>
                <h2 className="mt-5 text-2xl font-bold text-ink-900">What should we do across your channels?</h2>
                <p className="mt-2 text-ink-500">Ask about recent messages, or say “send this to all my channels”.</p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center">
                  {["Summarize what's been said on WhatsApp today", "Which channels am I connected to?", "Send 'We're open!' to all my channels"].map((p) => (
                    <button key={p} onClick={() => setInput(p)} className="text-sm rounded-full border border-line px-3.5 py-2 text-ink-600 hover:bg-surface">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((m, idx) => (
                <MessageView
                  key={m.id}
                  msg={m}
                  isLast={idx === messages.length - 1}
                  actionStatus={actionStatus}
                  onApproveSend={approveSend}
                  onApproveSchedule={approveSchedule}
                  onApproveMonitor={approveMonitor}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-line p-4">
          <div className="mx-auto max-w-3xl flex items-end gap-2 rounded-2xl border border-line focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 bg-white p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Message RelayFlow…  (Enter to send)"
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none max-h-40"
            />
            <button onClick={send} disabled={busy || !input.trim()} className="btn-primary h-11 w-11 !px-0 rounded-xl">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageView({
  msg,
  isLast,
  actionStatus,
  onApproveSend,
  onApproveSchedule,
  onApproveMonitor,
}: {
  msg: Msg;
  isLast: boolean;
  actionStatus: Record<string, { state: "sending" | "sent" | "failed" | "scheduled"; text: string }>;
  onApproveSend: (messageId: string, key: string, content: string, targets: any[]) => void;
  onApproveSchedule: (messageId: string, key: string, payload: any) => void;
  onApproveMonitor: (messageId: string, key: string, payload: any) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-50 text-brand-800 px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.content}</div>
      </div>
    );
  }

  const pendingActions = (msg.toolResults || []).filter((t) => t.result?.status === "pending_confirmation");
  const sendActions = pendingActions.filter((t) => t.result?.action === "send");
  const scheduleActions = pendingActions.filter((t) => t.result?.action === "schedule");
  const monitorActions = pendingActions.filter((t) => t.result?.action === "monitor");

  // Collapse pending sends by (message, platform): the SAME message going to several
  // groups on ONE channel becomes a single Approve & send; different channels stay
  // separate so each gets its own confirmation.
  const sendGroups: { key: string; platform: string; content: string; targets: any[] }[] = [];
  {
    const map = new Map<string, { key: string; platform: string; content: string; targets: any[]; seen: Set<string> }>();
    for (const a of sendActions) {
      const content = a.result.content || "";
      for (const t of a.result.targets || []) {
        const gk = `${msg.id}::${content}::${t.platform}`;
        let g = map.get(gk);
        if (!g) {
          g = { key: gk, platform: t.platform, content, targets: [], seen: new Set() };
          map.set(gk, g);
          sendGroups.push(g);
        }
        const dedup = `${t.platform}:${t.externalId}`;
        if (!g.seen.has(dedup)) {
          g.seen.add(dedup);
          g.targets.push(t);
        }
      }
    }
  }
  // A prepared send that matched no destination — surface it once so the user isn't left
  // wondering why nothing appeared.
  const unresolvedSend = sendActions.length > 0 && sendGroups.length === 0;

  const renderStatus = (key: string) => {
    const status = actionStatus[key];
    if (!status) return null;
    const cls = status.state === "failed" ? "text-red-600" : status.state === "sending" ? "text-ink-500" : "text-emerald-600";
    return (
      <div key={key} className={`mt-3 flex items-center gap-2 text-sm font-medium ${cls}`}>
        {status.state === "sending" ? (
          <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        ) : status.state === "failed" ? (
          <X size={16} />
        ) : (
          <Check size={16} />
        )}
        {status.text}
      </div>
    );
  };

  return (
    <div className="flex items-start gap-3">
      <span className="grid place-items-center h-8 w-8 rounded-lg text-white shrink-0" style={{ background: "linear-gradient(135deg,#22c1d6,#4f46e5)" }}>
        <Sparkles size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {msg.pending && (!msg.content || msg.content.length === 0) ? (
          <ActivityFeed steps={msg.steps || []} />
        ) : (
          <div className="prose-chat text-[15px] leading-relaxed text-ink-800">
            <ReactMarkdown>{msg.content || "…"}</ReactMarkdown>
          </div>
        )}

        {/* One Approve & send per channel: many groups on the same channel share a button. */}
        {sendGroups.map((g) => {
          if (actionStatus[g.key]) return renderStatus(g.key);
          const label = PLATFORM_LABEL[g.platform] || g.platform;
          const names = g.targets.map((t) => t.name);
          const many = g.targets.length > 1;
          const toLabel = !many ? names[0] : `${g.targets.length} groups — ${names.slice(0, 3).join(", ")}${g.targets.length > 3 ? "…" : ""}`;
          return (
            <div key={g.key} className="mt-3 card p-4">
              <div className="text-sm font-semibold text-ink-900">
                Send to {label}{many ? ` · ${g.targets.length} groups` : ""}?
              </div>
              <div className="mt-2 rounded-xl bg-surface border border-line px-3 py-2.5 text-[15px] text-ink-800 whitespace-pre-wrap">{g.content}</div>
              <div className="mt-2 text-sm text-ink-500">To: {toLabel}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => onApproveSend(msg.id, g.key, g.content, g.targets)} className="btn-primary h-10 px-4">
                  {many ? `Approve & send to all ${g.targets.length}` : "Approve & send"}
                </button>
              </div>
            </div>
          );
        })}

        {unresolvedSend && (
          <div className="mt-3 card p-4 border-amber-200">
            <div className="text-sm font-semibold text-ink-900">Couldn't find a matching destination</div>
            <div className="mt-1 text-sm text-ink-500">Check that the channel is connected and the group name is correct, then try again.</div>
          </div>
        )}

        {scheduleActions.map((action, i) => {
          const key = `${msg.id}-sched-${i}`;
          if (actionStatus[key]) return renderStatus(key);
          const r = action.result;
          return (
            <div key={key} className="mt-3 card p-4">
              <div className="text-sm font-semibold text-ink-900">Schedule this task?</div>
              <div className="mt-2 text-[15px] text-ink-800">{r.title}</div>
              <div className="mt-1 text-sm text-ink-500">
                {r.schedule} · runs {new Date(r.run_at).toLocaleString()}
              </div>
              <div className="mt-3">
                <button onClick={() => onApproveSchedule(msg.id, key, r)} className="btn-primary h-10 px-4">Approve & schedule</button>
              </div>
            </div>
          );
        })}

        {monitorActions.map((action, i) => {
          const key = `${msg.id}-mon-${i}`;
          if (actionStatus[key]) return renderStatus(key);
          const r = action.result;
          const where = `${PLATFORM_LABEL[r.platform] || r.platform}${r.group ? ` · ${r.group}` : ""}`;
          return (
            <div key={key} className="mt-3 card p-4">
              <div className="text-sm font-semibold text-ink-900">Start this monitor?</div>
              <div className="mt-2 text-[15px] text-ink-800">{r.title}</div>
              <div className="mt-1 text-sm text-ink-500">
                Watch <span className="font-medium text-ink-700">{where}</span> for: “{r.condition}”
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {r.mode === "absence"
                  ? `Alerts you if it hasn't happened within ${r.absence_hours}h · checks every ${r.interval_minutes} min`
                  : `Checks every ${r.interval_minutes} min · emails you only when it matches`}
              </div>
              <div className="mt-3">
                <button onClick={() => onApproveMonitor(msg.id, key, r)} className="btn-primary h-10 px-4">Approve &amp; start monitoring</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ steps }: { steps: Step[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-ink-700 font-semibold text-[15px]">
        <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        Working on it…
      </div>
      {steps.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-2.5 text-sm ${s.done ? "text-ink-900" : "text-ink-500"}`}>
              <span className={`grid place-items-center h-4 w-4 rounded-full text-[10px] ${s.done ? "bg-brand-600 text-white" : "border border-brand-400"}`}>
                {s.done ? "✓" : ""}
              </span>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
