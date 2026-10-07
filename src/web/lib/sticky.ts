import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// Per-session memory of each tab's data, so coming back to a tab renders instantly from the
// last known state while fresh data loads in the background (no blank-then-pop).
// Cleared on sign-out/account switch so one user's data can never show for another.
const store = new Map<string, unknown>();

export const peekSticky = <T,>(key: string): T | undefined => store.get(key) as T | undefined;
export const putSticky = (key: string, value: unknown) => void store.set(key, value);
export const clearSticky = () => store.clear();

/** Like useState, but remembers the value across unmounts. `cached` = we had data on mount. */
export function useStickyState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, boolean] {
  const cachedRef = useRef(store.has(key));
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  useEffect(() => {
    store.set(key, value);
  }, [key, value]);
  return [value, setValue, cachedRef.current];
}
