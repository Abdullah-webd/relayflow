import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Send, ImageOff } from "lucide-react";
import { Badge, Segmented, useToast, ago, when } from "../../components/ui";
import { EASE_OUT } from "../../components/motion";
import { adminApi, AdminAuthError, Drawer, Loading, useAdmin, useAdminLive, SECTION_LABEL } from "./kit";
import { STATUS } from "../app/Reports";
import UserDrawer from "./UserDrawer";

type Status = keyof typeof STATUS;
interface Row { id: string; category: string; title: string; description: string; page: string | null; status: Status; adminReply: string | null; createdAt: string; userId: string; email: string; name: string | null }
interface Full extends Row { screenshot: string | null; context: { userAgent: string; viewport: string; plan: string; channels: string[] }; resolvedAt: string | null }

const CATEGORY: Record<string, string> = { bug: "Something isn't working", connection: "Channel connection", billing: "Billing or plan", feature: "Feature request", other: "Something else" };

export default function AdminReports() {
  const [filter, setFilter] = useState<"active" | "all" | Status>("active");
  const { data, reload } = useAdminLive<{ reports: Row[]; counts: Record<string, number> }>("/reports", 8_000);
  const [params, setParams] = useSearchParams();
  const openId = params.get("open");
  const [userId, setUserId] = useState<string | null>(null);

  if (!data) return <Loading rows={1} />;
  const c = data.counts;
  const rows = data.reports.filter((r) => (filter === "all" ? true : filter === "active" ? r.status !== "resolved" : r.status === filter));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Reports</h1>
          <p className="text-[13px] text-ink-500">New reports appear here within seconds. Replies and “Resolved” are emailed to the user and shown in their Report tab.</p>
        </div>
        <div className="ml-auto">
          <Segmented
            id="rep-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: `To do (${(c.open ?? 0) + (c.in_progress ?? 0)})` },
              { value: "open", label: `Received (${c.open ?? 0})` },
              { value: "in_progress", label: `Being looked at (${c.in_progress ?? 0})` },
              { value: "resolved", label: `Resolved (${c.resolved ?? 0})` },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li key={r.id} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.25, ease: EASE_OUT }}>
              <button onClick={() => setParams({ open: r.id })} className="flex w-full items-start gap-4 bg-white px-5 py-4 text-left hover:bg-surface/70">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-ink-900">{r.title}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-600">{r.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
                    <span>{r.name || r.email}</span>
                    <span>{CATEGORY[r.category]}</span>
                    {r.page && <span>{SECTION_LABEL[r.page] ?? r.page} tab</span>}
                    {r.adminReply && <span className="text-brand-700">Replied</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>
                  <span className="text-[12px] text-ink-400">{ago(r.createdAt)}</span>
                </div>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {rows.length === 0 && <li className="px-5 py-12 text-center text-[13.5px] text-ink-500">{filter === "active" ? "Nothing to do. Every report is resolved." : "No reports here."}</li>}
      </ul>

      <ReportDrawer id={openId} onClose={() => setParams({})} onChanged={reload} onOpenUser={setUserId} />
      <UserDrawer userId={userId} onClose={() => setUserId(null)} />
    </div>
  );
}

function ReportDrawer({ id, onClose, onChanged, onOpenUser }: { id: string | null; onClose: () => void; onChanged: () => void; onOpenUser: (id: string) => void }) {
  const toast = useToast();
  const { signedOut } = useAdmin();
  const [r, setR] = useState<Full | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setR(null);
    setZoom(false);
    if (!id) return;
    adminApi<{ report: Full }>(`/reports/${id}`)
      .then(({ report }) => {
        setR(report);
        setReply(report.adminReply ?? "");
      })
      .catch((e) => (e instanceof AdminAuthError ? signedOut() : toast((e as Error).message, "error")));
  }, [id]);

  async function save(body: { status?: Status; adminReply?: string | null }, msg: string) {
    if (!r) return;
    setBusy(true);
    try {
      const { report } = await adminApi<{ report: Full }>(`/reports/${r.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setR(report);
      toast(msg);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width="max-w-[640px]"
      title={
        r ? (
          <div>
            <h2 className="font-display text-[19px] font-semibold leading-snug text-navy">{r.title}</h2>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {CATEGORY[r.category]}
              {r.page ? `, ${SECTION_LABEL[r.page] ?? r.page} tab` : ""}, sent {when(r.createdAt)}
            </p>
          </div>
        ) : (
          <div className="h-10 w-64 animate-pulse rounded-lg bg-surface" />
        )
      }
    >
      {!r ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="label">Status</div>
            <Segmented
              id="rep-status"
              value={r.status}
              onChange={(status) => save({ status }, status === "resolved" ? "Marked resolved. The user has been emailed." : `Marked “${STATUS[status].label}”`)}
              options={(Object.keys(STATUS) as Status[]).map((s) => ({ value: s, label: STATUS[s].label }))}
            />
          </div>

          <section>
            <div className="label">From</div>
            <button onClick={() => onOpenUser(r.userId)} className="text-left text-[14px] font-medium text-brand-700 hover:underline">
              {r.name ? `${r.name} (${r.email})` : r.email}
            </button>
            <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-800">{r.description}</p>
          </section>

          <section>
            <div className="label">Screenshot</div>
            {r.screenshot ? (
              <button onClick={() => setZoom((z) => !z)} className="block w-full overflow-hidden rounded-xl border border-line" aria-label={zoom ? "Shrink screenshot" : "Enlarge screenshot"}>
                <motion.img layout src={r.screenshot} alt="Screenshot from the user" className={`w-full object-contain ${zoom ? "max-h-none" : "max-h-64"}`} transition={{ duration: 0.25, ease: EASE_OUT }} />
              </button>
            ) : (
              <p className="inline-flex items-center gap-2 text-[13px] text-ink-500"><ImageOff size={15} /> None attached</p>
            )}
          </section>

          <section className="rounded-xl bg-surface px-4 py-3 text-[12.5px] text-ink-600">
            <div><span className="text-ink-500">Plan:</span> {r.context.plan}</div>
            <div><span className="text-ink-500">Channels:</span> {r.context.channels.length ? r.context.channels.join(", ") : "none"}</div>
            <div><span className="text-ink-500">Screen:</span> {r.context.viewport || "unknown"}</div>
            <div className="truncate" title={r.context.userAgent}><span className="text-ink-500">Browser:</span> {r.context.userAgent || "unknown"}</div>
          </section>

          <section>
            <label className="label" htmlFor="rep-reply">Reply to {r.name?.split(" ")[0] || "the user"}</label>
            <textarea id="rep-reply" className="input h-32 resize-y py-2.5 leading-relaxed" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="They'll see this in their Report tab and get it by email." maxLength={5000} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => save({ adminReply: reply.trim() || null }, "Reply sent")} disabled={busy || (reply.trim() || null) === r.adminReply} className="btn-primary h-9">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <><Send size={14} /> Send reply</>}
              </button>
              {r.status !== "resolved" && (
                <button onClick={() => save({ adminReply: reply.trim() || null, status: "resolved" }, "Replied and marked resolved")} disabled={busy} className="btn-ghost h-9">
                  Reply and resolve
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}
