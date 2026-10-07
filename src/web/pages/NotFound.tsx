import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";

// A real "not found" page (the server also returns HTTP 404), instead of silently showing home.
export default function NotFound() {
  return (
    <div className="min-h-full bg-white flex flex-col">
      <header className="px-5 sm:px-8 h-16 flex items-center">
        <Link to="/" aria-label="RelayFlow home">
          <Logo />
        </Link>
      </header>
      <main className="flex-1 grid place-items-center px-5 pb-20 text-center">
        <div className="max-w-md">
          <p className="font-mono text-[13px] text-ink-500">404</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.022em] text-ink-900">This page doesn’t exist</h1>
          <p className="mt-3 text-[15px] text-ink-600">The link may be broken, or the page may have moved.</p>
          <Link to="/" className="btn-primary mt-7 h-10 px-4">Go to the home page</Link>
        </div>
      </main>
    </div>
  );
}
