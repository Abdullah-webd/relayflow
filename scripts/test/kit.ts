import { API } from "./env";

export interface Result { suite: string; name: string; ok: boolean; info: string }
export const results: Result[] = [];
let current = "";
export const suite = (name: string) => { current = name; console.log(`\n▸ ${name}`); };
export function check(name: string, ok: boolean, info = "") {
  results.push({ suite: current, name, ok, info });
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}${info ? `  (${info})` : ""}`);
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const nowSec = () => Math.floor(Date.now() / 1000);

/** Call the local API, optionally as a signed-in user. */
export async function api(path: string, init: RequestInit & { token?: string; host?: string } = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.token) headers.cookie = `rf_session=${init.token}`;
  if (init.body && !headers["content-type"]) headers["content-type"] = "application/json";
  if (init.host) headers.host = init.host;
  const res = await fetch(API + path, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* html or text */ }
  return { status: res.status, body, text, headers: res.headers };
}
