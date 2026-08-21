import { useAuth } from "../../lib/auth";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Settings</h1>

        <div className="mt-6 card p-6">
          <h2 className="font-bold text-ink-900">Account</h2>
          <div className="mt-4 space-y-3">
            <div>
              <div className="label">Name</div>
              <div className="text-ink-800">{user?.name || "—"}</div>
            </div>
            <div>
              <div className="label">Email</div>
              <div className="text-ink-800">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 card p-6">
          <h2 className="font-bold text-ink-900">Session</h2>
          <p className="mt-1 text-sm text-ink-500">Sign out of RelayFlow on this device.</p>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="btn-ghost mt-4"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
