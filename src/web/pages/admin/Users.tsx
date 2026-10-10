import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import { Badge, ChannelIcon, Segmented, ago, type Tone } from "../../components/ui";
import { EASE_OUT } from "../../components/motion";
import { useAdminLive, Loading, duration } from "./kit";
import UserDrawer from "./UserDrawer";

interface Row {
  id: string;
  email: string;
  name: string | null;
  verified: boolean;
  plan: { label: string; tone: Tone };
  createdAt: string;
  lastSeenAt: string | null;
  channels: { platform: string; status: string }[];
  autoReplies: number;
  monitors: number;
  schedules: number;
  chats: number;
  openReports: number;
  seconds7d: number;
}
type Filter = "all" | "online" | "paying" | "trial" | "ended";

const isOnline = (r: Row) => Boolean(r.lastSeenAt && Date.now() - new Date(r.lastSeenAt).getTime() < 120_000);

export default function AdminUsers() {
  const { data } = useAdminLive<{ users: Row[]; total: number }>("/users", 15_000);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [userId, setUserId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data?.users ?? [];
    return list.filter((r) => {
      if (q && !`${r.email} ${r.name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "online") return isOnline(r);
      if (filter === "paying") return r.plan.tone === "live";
      if (filter === "trial") return r.plan.label === "Trial";
      if (filter === "ended") return r.plan.label === "Trial ended";
      return true;
    });
  }, [data, q, filter]);

  if (!data) return <Loading rows={1} />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-navy">Users</h1>
          <p className="text-[13px] text-ink-500">{data.total.toLocaleString()} accounts. Click anyone to see everything about them.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            id="users-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "online", label: "Online" },
              { value: "paying", label: "Paying" },
              { value: "trial", label: "On trial" },
              { value: "ended", label: "Trial ended" },
            ]}
          />
          <div className="relative w-[240px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="input h-9 pl-9" aria-label="Search users" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[920px] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-surface/60 text-[12px] font-medium text-ink-500">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-3 py-2.5 font-medium">Plan</th>
              <th className="px-3 py-2.5 font-medium">Channels</th>
              <th className="px-3 py-2.5 text-right font-medium">Auto-replies</th>
              <th className="px-3 py-2.5 text-right font-medium">Monitors</th>
              <th className="px-3 py-2.5 text-right font-medium">Time (7 days)</th>
              <th className="px-3 py-2.5 font-medium">Last seen</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <motion.tr
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  onClick={() => setUserId(r.id)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface/70"
                >
                  <td className="max-w-[280px] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink-900">{r.name || r.email.split("@")[0]}</span>
                      {r.openReports > 0 && <Badge tone="warn">{r.openReports} open</Badge>}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-500">
                      {r.email}
                      {!r.verified && " (not verified)"}
                    </div>
                  </td>
                  <td className="px-3 py-3"><Badge tone={r.plan.tone}>{r.plan.label}</Badge></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {r.channels.length === 0 && <span className="text-ink-400">None</span>}
                      {r.channels.map((c, i) => (
                        <span key={i} className={`relative ${c.status === "connected" ? "" : "opacity-40"}`} title={`${c.platform}: ${c.status}`}>
                          <ChannelIcon platform={c.platform} size={20} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.autoReplies}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.monitors}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.seconds7d ? duration(r.seconds7d) : "–"}</td>
                  <td className="px-3 py-3">{isOnline(r) ? <Badge tone="live" dot>Online</Badge> : <span className="text-ink-600">{ago(r.lastSeenAt)}</span>}</td>
                  <td className="px-4 py-3 text-ink-600">{ago(r.createdAt)}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-[13.5px] text-ink-500">No users match.</p>}
      </div>
      <UserDrawer userId={userId} onClose={() => setUserId(null)} />
    </div>
  );
}
