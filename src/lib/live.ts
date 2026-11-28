"use client";
import { useEffect, useState } from "react";
import { db, syncServerClock, serverOffset, type Filter } from "./db";

export interface Live<T> {
  data: T;
  /** True until the first value for the current col/id (or filters) has arrived. */
  loading: boolean;
  error: Error | null;
}

/** Live document; stops listening on unmount or when col/id change. Pass a null id to listen to nothing. */
export function useDoc<T>(col: string, id: string | null | undefined): Live<T | null> {
  const key = id ? `${col}/${id}` : null;
  const [s, setS] = useState<{ key: string | null; data: T | null; error: Error | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!id) return;
    return db.subscribe<T>(
      col,
      id,
      (data) => setS({ key, data, error: null }),
      (error) => setS({ key, data: null, error }),
    );
  }, [col, id, key]);
  const ready = key !== null && s.key === key;
  return { data: ready ? s.data : null, loading: key !== null && !ready, error: ready ? s.error : null };
}

/** Live query (same filters as db.list); pass null filters to listen to nothing (e.g. before sign-in). */
export function useQuery<T>(col: string, filters: Filter[] | null): Live<T[]> {
  // Filters are compared by value, so an inline array literal doesn't resubscribe on every render.
  const key = filters ? `${col}?${JSON.stringify(filters)}` : null;
  const [s, setS] = useState<{ key: string | null; data: T[]; error: Error | null }>({ key: null, data: [], error: null });
  useEffect(() => {
    if (!key) return;
    const f = JSON.parse(key.slice(col.length + 1)) as Filter[];
    return db.subscribeQuery<T>(
      col,
      f,
      (data) => setS({ key, data, error: null }),
      (error) => setS({ key, data: [], error }),
    );
  }, [col, key]);
  const ready = key !== null && s.key === key;
  return { data: ready ? s.data : [], loading: key !== null && !ready, error: ready ? s.error : null };
}

/** Clock offset to the server in ms (server time = Date.now() + offset); 0 until measured, always 0 in demo mode. */
export function useServerOffset(): number {
  const [o, setO] = useState(serverOffset);
  useEffect(() => {
    let live = true;
    syncServerClock().then((v) => live && setO(v));
    return () => {
      live = false;
    };
  }, []);
  return o;
}
