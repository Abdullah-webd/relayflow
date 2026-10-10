import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../../lib/api";
import { useStickyState } from "../../lib/sticky";
import { EASE_OUT, Rise } from "../../components/motion";
import { Page, PageHeader, Panel, Badge, EmptyState, useToast, ago, type Tone } from "../../components/ui";
import { Bug, Plug, CreditCard, Lightbulb, HelpCircle, ImagePlus, X, Loader2, ChevronDown, Send } from "lucide-react";

type Category = "bug" | "connection" | "billing" | "feature" | "other";
type Status = "open" | "in_progress" | "resolved";
interface Report {
  id: string;
  category: Category;
  title: string;
  description: string;
  page: string | null;
  status: Status;
  adminReply: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: { value: Category; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Something isn't working", icon: Bug },
  { value: "connection", label: "Channel connection", icon: Plug },
  { value: "billing", label: "Billing or plan", icon: CreditCard },
  { value: "feature", label: "Feature request", icon: Lightbulb },
  { value: "other", label: "Something else", icon: HelpCircle },
];
const PAGES: [string, string][] = [
  ["", "Not sure / whole app"],
  ["overview", "Overview"],
  ["chat", "Chat"],
  ["auto-replies", "Auto-replies"],
  ["monitors", "Monitors"],
  ["schedules", "Schedules"],
  ["connections", "Connections"],
  ["settings", "Settings"],
];
export const STATUS: Record<Status, { label: string; tone: Tone }> = {
  open: { label: "Received", tone: "warn" },
  in_progress: { label: "Being looked at", tone: "brand" },
  resolved: { label: "Resolved", tone: "live" },
};

/** Shrink a screenshot in the browser (max 1600px, JPEG) so uploads stay small and fast. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Reports() {
  const toast = useToast();
  const [list, setList, cached] = useStickyState<Report[] | null>("reports", null);
  const [category, setCategory] = useState<Category>("bug");
  const [page, setPage] = useState<string>(() => {
    try {
      return sessionStorage.getItem("rf_last_section") || "";
    } catch {
      return "";
    }
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api<{ reports: Report[] }>("/reports").then((r) => setList(r.reports)).catch(() => undefined);
  useEffect(() => {
    load();
    // Replies and status changes show up without a refresh.
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(t);
  }, []);

  async function attach(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr("Attach a screenshot image (PNG or JPEG).");
    setErr("");
    try {
      setShot(await shrinkImage(file));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Paste a screenshot straight from the clipboard (Cmd/Ctrl+V) anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) attach(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (title.trim().length < 3) return setErr("Give it a short title, e.g. “WhatsApp keeps disconnecting”.");
    if (description.trim().length < 10) return setErr("Tell us a bit more about what happened.");
    setBusy(true);
    try {
      const { report } = await api<{ report: Report }>("/reports", {
        method: "POST",
        body: JSON.stringify({ category, title: title.trim(), description: description.trim(), page: page || null, screenshot: shot, viewport: `${window.innerWidth}x${window.innerHeight}` }),
      });
      setList((l) => [report, ...(l || [])]);
      setOpen(report.id);
      setTitle("");
      setDescription("");
      setShot(null);
      toast("Thanks, we've got your report. We'll reply here.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Report a problem" description="Tell us what went wrong or what you need. We see every report straight away, and reply here and by email." />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="New report">
          <form onSubmit={submit} className="space-y-5">
            <fieldset>
              <legend className="label">What's it about?</legend>
              <div role="radiogroup" className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = c.value === category;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`relative flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-left text-[13.5px] transition-colors ${on ? "border-brand-500 text-brand-800" : "border-line text-ink-700 hover:bg-surface"}`}
                    >
                      {on && <motion.span layoutId="report-cat" className="absolute inset-0 rounded-xl bg-brand-50/70" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} />}
                      <c.icon size={16} className={`relative shrink-0 ${on ? "text-brand-600" : "text-ink-400"}`} />
                      <span className="relative font-medium">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label className="label" htmlFor="rp-title">Short summary</label>
                <input id="rp-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. WhatsApp keeps disconnecting" maxLength={140} />
              </div>
              <div>
                <label className="label" htmlFor="rp-page">Where in RelayFlow?</label>
                <select id="rp-page" className="input" value={page} onChange={(e) => setPage(e.target.value)}>
                  {PAGES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="rp-desc">What happened?</label>
              <textarea
                id="rp-desc"
                className="input h-36 resize-y py-2.5 leading-relaxed"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                placeholder={"What did you do, what did you expect, and what happened instead?\ne.g. I connected WhatsApp at 9am. By evening it showed “Needs reconnecting” again."}
              />
            </div>

            <div>
              <div className="label">Screenshot <span className="font-normal text-ink-400">(optional)</span></div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
              <AnimatePresence mode="wait" initial={false}>
                {shot ? (
                  <motion.div key="shot" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2, ease: EASE_OUT }} className="relative w-fit">
                    <img src={shot} alt="Screenshot to attach" className="max-h-48 rounded-xl border border-line" />
                    <button type="button" onClick={() => setShot(null)} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-ink-600 shadow-xs hover:text-red-600" aria-label="Remove screenshot">
                      <X size={14} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="drop"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      attach(e.dataTransfer.files?.[0]);
                    }}
                    className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13.5px] text-ink-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
                  >
                    <ImagePlus size={18} /> Drop an image, click to choose, or paste with {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+V
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {err && (
              <p role="alert" className="text-[13px] text-red-600">
                {err}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <><Send size={15} /> Send report</>}
              </button>
              <span className="text-[12.5px] text-ink-500">We include your plan and connection status so we can help faster.</span>
            </div>
          </form>
        </Panel>

        <Panel title="Your reports" description="Status and our replies update here on their own." bodyClass="p-2">
          {!list ? (
            <div aria-hidden className="space-y-2 p-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState title="No reports yet">When you send one, you'll see its status and our reply here.</EmptyState>
          ) : (
            <ul>
              <AnimatePresence initial={!cached}>
                {list.map((r, i) => {
                  const expanded = open === r.id;
                  return (
                    <Rise key={r.id} index={i} stagger={!cached}>
                      <button onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded} className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium text-ink-900">{r.title}</div>
                          <div className="mt-0.5 text-[12.5px] text-ink-500">
                            {CATEGORIES.find((c) => c.value === r.category)?.label}, sent {ago(r.createdAt)}
                          </div>
                        </div>
                        <motion.span key={r.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                          <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>
                        </motion.span>
                        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-ink-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }} className="overflow-hidden">
                            <div className="space-y-3 px-3 pb-4">
                              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-700">{r.description}</p>
                              {r.adminReply ? (
                                <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-3">
                                  <div className="text-[12px] font-medium text-brand-700">Reply from RelayFlow</div>
                                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-800">{r.adminReply}</p>
                                </div>
                              ) : (
                                <p className="text-[12.5px] text-ink-500">No reply yet. We'll reply here and by email.</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Rise>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
