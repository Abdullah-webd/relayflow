import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../../lib/api";
import { Logo } from "../../components/Logo";
import { motion, AnimatePresence } from "motion/react";
import { Rise, Dialog, Pop, SkeletonRows, SPRING, EASE_OUT } from "../../components/motion";
import { useStickyState, peekSticky, putSticky } from "../../lib/sticky";
import { Plus, ArrowUp, Trash2, Check, X, MoreHorizontal, Pencil, AlertTriangle, Search, PanelLeft, Sparkles, Radar, Send } from "lucide-react";
import { ago, useToast } from "../../components/ui";

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
  const location = useLocation();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false); // mobile: chat list as a sheet
  // Remembered across tab switches → the list is there instantly when you come back.
  const [chats, setChats, chatsCached] = useStickyState<ChatSummary[]>("chats", []);
  const [chatsLoaded, setChatsLoaded] = useState(chatsCached);
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
    setChatsLoaded(true);
  };

  useEffect(() => {
    loadChats();
  }, []);

  // A question typed on the Overview page arrives here and is sent straight away.
  const askedRef = useRef(false); // effects run twice in dev (StrictMode): send once
  useEffect(() => {
    const ask = (location.state as { ask?: string } | null)?.ask;
    if (ask && !askedRef.current) {
      askedRef.current = true;
      nav(location.pathname, { replace: true, state: null });
      send(ask);
    }
  }, []);

  useEffect(() => setListOpen(false), [chatId]);

  useEffect(() => {
    if (!chatId) {
      if (!streamingRef.current) setMessages([]);
      return;
    }
    if (chatId === streamingRef.current) return; // don't clobber an in-flight stream
    const cached = peekSticky<Msg[]>(`msgs:${chatId}`);
    if (cached) setMessages(cached);
    api<{ messages: Msg[] }>(`/chats/${chatId}`)
      .then(({ messages }) => {
        putSticky(`msgs:${chatId}`, messages);
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
    toast("Chat deleted");
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

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    if (override === undefined) setInput("");

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
        // No active subscription/trial — send them to the paywall.
        patchAssistant(asstId, (m) => ({
          ...m,
          pending: false,
          content: "Your plan isn't active. Redirecting you to choose a plan…",
        }));
        window.location.assign("/pricing");
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

  const shown = q ? chats.filter((c) => `${c.title} ${c.preview || ""}`.toLowerCase().includes(q.toLowerCase())) : chats;

  const sessions = (
    <div className="flex h-full w-[284px] shrink-0 flex-col border-r border-line bg-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-display text-[17px] font-semibold text-navy">Chats</h2>
        <button onClick={newChat} className="btn-primary h-8 gap-1.5 px-2.5 text-[13px]" aria-label="New chat">
          <Plus size={15} /> New
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="h-8 w-full rounded-lg bg-surface pl-8 pr-2 text-[13px] text-ink-900 outline-none ring-brand-500/30 placeholder:text-ink-400 focus:ring-2" />
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {!chatsLoaded && <div className="px-1 pt-1"><SkeletonRows rows={5} className="h-12" /></div>}
          {chatsLoaded && shown.length === 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 py-4 text-[13px] text-ink-500">{q ? `No chats match “${q}”.` : "No conversations yet. Ask anything to start one."}</motion.p>
          )}
          <AnimatePresence initial={!chatsCached}>
          {shown.map((c, index) => {
            const active = c.id === chatId;
            const editing = editingId === c.id;
            return (
              <Rise key={c.id} index={index} stagger={!chatsCached} className={`group relative rounded-xl ${active ? "" : "hover:bg-surface"}`}>
                {active && <motion.div layoutId="chat-pill" className="absolute inset-0 rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-100" transition={SPRING} />}
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
                  <div className="relative flex cursor-pointer items-start gap-2 px-3 py-2.5" onClick={() => nav(`/app/chat/${c.id}`)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[13.5px] font-medium ${active ? "text-brand-800" : "text-ink-900"}`}>{c.title}</span>
                        <span className="shrink-0 text-[11.5px] text-ink-400 group-hover:invisible">{ago(c.updatedAt)}</span>
                      </div>
                      {c.preview && <div className="mt-0.5 truncate text-[12.5px] text-ink-500">{c.preview}</div>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId(menuId === c.id ? null : c.id);
                      }}
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-ink-400 opacity-0 hover:bg-white hover:text-ink-700 focus:opacity-100 group-hover:opacity-100"
                      aria-label="Chat options"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                )}

                {menuId === c.id && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}
                <Pop open={menuId === c.id} className="absolute right-2 top-9 z-20 w-40 rounded-xl border border-line bg-white shadow-pop p-1">
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
                </Pop>
              </Rise>
            );
          })}
          </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      <div className="hidden h-full lg:flex">{sessions}</div>
      <AnimatePresence>
        {listOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <motion.div className="absolute inset-0 bg-ink-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)} />
            <motion.div className="relative h-full" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300, transition: { duration: 0.18 } }} transition={{ duration: 0.26, ease: EASE_OUT }}>
              {sessions}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="w-[min(92vw,400px)] rounded-2xl border border-line bg-white p-6 shadow-pop">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-11 w-11 rounded-full bg-red-50 text-red-600 shrink-0">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-semibold text-ink-900">Delete this chat?</h3>
                <p className="text-sm text-ink-500">This permanently removes the conversation.</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-700 bg-surface rounded-lg px-3 py-2 truncate">{confirmDelete.title}</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => deleteChat(confirmDelete.id)} className="btn-danger">Delete</button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Conversation */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        <div className="flex h-12 items-center gap-2 border-b border-line px-3 lg:hidden">
          <button onClick={() => setListOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[14px] font-medium text-ink-700 hover:bg-surface">
            <PanelLeft size={17} /> Chats
          </button>
          <button onClick={newChat} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-surface" aria-label="New chat">
            <Plus size={18} />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8">
            {messages.length === 0 && (
              <motion.div className="mt-[8vh]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                <Logo size={36} showText={false} />
                <h2 className="mt-5 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-navy">What should we do across your channels?</h2>
                <p className="mt-2 text-[15px] text-ink-500">RelayFlow reads your WhatsApp, Telegram and Slack chats. Ask what happened, send to any group, or set something up. Nothing is sent without your approval.</p>
                <div className="mt-7 grid gap-2 sm:grid-cols-2">
                  {[
                    { icon: Sparkles, t: "Summarize what's been said on WhatsApp today" },
                    { icon: Search, t: "Did any customer ask about delivery this week?" },
                    { icon: Send, t: "Send 'We're open today until 8pm' to all my groups" },
                    { icon: Radar, t: "Let me know when someone asks for a quote" },
                  ].map((p, i) => (
                    <motion.button
                      key={p.t}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT, delay: 0.08 + i * 0.04 }}
                      onClick={() => send(p.t)}
                      className="group flex items-start gap-3 rounded-xl border border-line px-3.5 py-3 text-left text-[14px] text-ink-700 transition-[background-color,border-color,transform] duration-150 hover:border-brand-200 hover:bg-brand-50/40 active:scale-[0.98]"
                    >
                      <p.icon size={16} className="mt-0.5 shrink-0 text-ink-400 group-hover:text-brand-600" />
                      {p.t}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <div className="space-y-6">
              {/* Existing messages appear instantly; new ones rise in as they arrive. */}
              <AnimatePresence initial={false}>
              {messages.map((m, idx) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                <MessageView
                  key={m.id}
                  msg={m}
                  isLast={idx === messages.length - 1}
                  actionStatus={actionStatus}
                  onApproveSend={approveSend}
                  onApproveSchedule={approveSchedule}
                  onApproveMonitor={approveMonitor}
                />
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line-strong bg-white p-2 shadow-xs transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:shadow-[0_0_0_3px_rgb(var(--brand-500)/0.15)]">
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
              placeholder="Message RelayFlow…"
              aria-label="Message RelayFlow"
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none max-h-40 placeholder:text-ink-400"
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} className="btn-primary h-10 w-10 !px-0 rounded-xl" aria-label="Send">
              <ArrowUp size={18} />
            </button>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl px-2 text-[11.5px] text-ink-400">Enter to send, Shift + Enter for a new line. Anything RelayFlow sends waits for your approval.</p>
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
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.content}</div>
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
      <span className="shrink-0"><Logo size={28} showText={false} /></span>
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
            <div key={g.key} className="mt-3 rounded-2xl border border-line bg-white p-4">
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
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="text-sm font-semibold text-ink-900">Couldn't find a matching destination</div>
            <div className="mt-1 text-sm text-ink-500">Check that the channel is connected and the group name is correct, then try again.</div>
          </div>
        )}

        {scheduleActions.map((action, i) => {
          const key = `${msg.id}-sched-${i}`;
          if (actionStatus[key]) return renderStatus(key);
          const r = action.result;
          return (
            <div key={key} className="mt-3 rounded-2xl border border-line bg-white p-4">
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
            <div key={key} className="mt-3 rounded-2xl border border-line bg-white p-4">
              <div className="text-sm font-semibold text-ink-900">Start this monitor?</div>
              <div className="mt-2 text-[15px] text-ink-800">{r.title}</div>
              <div className="mt-1 text-sm text-ink-500">
                Watch <span className="font-medium text-ink-700">{where}</span> for: “{r.condition}”
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {r.mode === "absence"
                  ? `Alerts you if it hasn't happened within ${r.absence_hours}h`
                  : "Checks new messages as they arrive · emails you within seconds when it matches"}
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
    <div className="rounded-2xl border border-line bg-white p-4">
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
