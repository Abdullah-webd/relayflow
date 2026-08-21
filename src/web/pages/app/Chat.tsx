import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../../lib/api";
import { Plus, Send, Trash2, Sparkles, Check, MessageSquare } from "lucide-react";

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
  pending?: boolean;
  steps?: Step[];
}
interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const PLATFORM_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };

export default function Chat() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChats = async () => {
    const { chats } = await api<{ chats: ChatSummary[] }>("/chats");
    setChats(chats);
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    api<{ messages: Msg[] }>(`/chats/${chatId}`)
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]));
  }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function newChat() {
    const { chat } = await api<{ chat: ChatSummary }>("/chats", { method: "POST" });
    setChats((c) => [chat, ...c]);
    nav(`/app/chat/${chat.id}`);
  }

  async function deleteChat(id: string) {
    await api(`/chats/${id}`, { method: "DELETE" });
    setChats((c) => c.filter((x) => x.id !== id));
    if (id === chatId) nav("/app/chat");
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
      nav(`/app/chat/${chat.id}`);
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
            patchAssistant(asstId, (m) => ({ ...m, pending: false, toolResults: ev.toolResults || [] }));
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
      setBusy(false);
    }
  }

  async function approveSend(key: string, content: string, platforms: string[]) {
    setResolved((s) => new Set(s).add(key));
    try {
      await api(`/chats/${chatId}/confirm-send`, { method: "POST", body: JSON.stringify({ content, platforms }) });
      const { messages } = await api<{ messages: Msg[] }>(`/chats/${chatId}`);
      setMessages(messages);
    } catch {
      /* keep resolved */
    }
  }

  async function approveSchedule(key: string, payload: any) {
    setResolved((s) => new Set(s).add(key));
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: payload.title, instruction: payload.instruction, schedule: payload.schedule, runAt: payload.run_at }),
      });
    } catch {
      /* noop */
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
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {chats.length === 0 && <p className="text-sm text-ink-400 px-3 py-4">No conversations yet.</p>}
          {chats.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 rounded-xl px-3 h-11 cursor-pointer ${
                c.id === chatId ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-surface"
              }`}
              onClick={() => nav(`/app/chat/${c.id}`)}
            >
              <MessageSquare size={16} className="shrink-0 opacity-70" />
              <span className="flex-1 truncate text-sm font-medium">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

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
                  resolved={resolved}
                  onApproveSend={approveSend}
                  onApproveSchedule={approveSchedule}
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
  resolved,
  onApproveSend,
  onApproveSchedule,
}: {
  msg: Msg;
  isLast: boolean;
  resolved: Set<string>;
  onApproveSend: (key: string, content: string, platforms: string[]) => void;
  onApproveSchedule: (key: string, payload: any) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-50 text-brand-800 px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.content}</div>
      </div>
    );
  }

  const pendingActions = (msg.toolResults || []).filter((t) => t.result?.status === "pending_confirmation");

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

        {pendingActions.map((action, i) => {
          const key = `${msg.id}-${i}`;
          if (resolved.has(key)) return <div key={key} className="mt-3 text-sm text-emerald-600 flex items-center gap-1.5"><Check size={15} /> Approved</div>;
          const r = action.result;
          if (r.action === "send") {
            return (
              <div key={key} className="mt-3 card p-4">
                <div className="text-sm font-semibold text-ink-900">Send this message?</div>
                <div className="mt-2 rounded-xl bg-surface border border-line px-3 py-2.5 text-[15px] text-ink-800 whitespace-pre-wrap">{r.content}</div>
                <div className="mt-2 text-sm text-ink-500">
                  To: {r.platforms?.length ? r.platforms.map((p: string) => PLATFORM_LABEL[p] || p).join(", ") : "no connected channel"}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!r.platforms?.length}
                    onClick={() => onApproveSend(key, r.content, r.platforms)}
                    className="btn-primary h-10 px-4"
                  >
                    Approve & send
                  </button>
                </div>
              </div>
            );
          }
          if (r.action === "schedule") {
            return (
              <div key={key} className="mt-3 card p-4">
                <div className="text-sm font-semibold text-ink-900">Schedule this task?</div>
                <div className="mt-2 text-[15px] text-ink-800">{r.title}</div>
                <div className="mt-1 text-sm text-ink-500">
                  {r.schedule} · runs {new Date(r.run_at).toLocaleString()}
                </div>
                <div className="mt-3">
                  <button onClick={() => onApproveSchedule(key, r)} className="btn-primary h-10 px-4">Approve & schedule</button>
                </div>
              </div>
            );
          }
          return null;
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
