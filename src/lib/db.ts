"use client";
import {
  getFirestore, doc, getDoc, getDocs, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, runTransaction, serverTimestamp, Timestamp,
  type QueryConstraint, type DocumentSnapshot,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { firebaseEnabled, getFirebaseApp } from "./firebase";

export type Filter = [field: string, op: "==" | "array-contains", value: unknown];
export type Unsubscribe = () => void;

/**
 * Writes inside `db.transaction`. Like Firestore: read every document first (all `get` calls),
 * then queue the writes; the function may run more than once, so keep it free of other side effects.
 */
export interface Tx {
  get<T>(col: string, id: string): Promise<T | null>;
  set<T extends object>(col: string, id: string, data: T): void;
  update(col: string, id: string, data: Record<string, unknown>): void;
  remove(col: string, id: string): void;
}

export interface Db {
  get<T>(col: string, id: string): Promise<T | null>;
  list<T>(col: string, filters?: Filter[]): Promise<T[]>;
  set<T extends object>(col: string, id: string, data: T): Promise<void>;
  update(col: string, id: string, data: Record<string, unknown>): Promise<void>;
  remove(col: string, id: string): Promise<void>;
  /** Live document: `cb` runs now and on every change (null when it doesn't exist). Returns the unsubscribe function. */
  subscribe<T>(col: string, id: string, cb: (data: T | null) => void, onError?: (e: Error) => void): Unsubscribe;
  /** Live query with the same filters as `list`. Returns the unsubscribe function. */
  subscribeQuery<T>(col: string, filters: Filter[], cb: (data: T[]) => void, onError?: (e: Error) => void): Unsubscribe;
  /** Atomic read-then-write. Firebase: runTransaction; demo mode: one transaction at a time (across tabs too). */
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

// ---------- Server time ----------
const SERVER_TIME = Object.freeze({ __peerseusServerTime: true });
/**
 * Put this in data you write to store the server's time (Firebase: serverTimestamp(), which rules can
 * compare with request.time; demo mode: Date.now()). Reads always return times as milliseconds (number).
 */
export function serverTime(): number {
  return SERVER_TIME as unknown as number;
}

/** Copy of `v` without undefined fields (as JSON would), with serverTime() markers replaced by `now`. */
function clean(v: unknown, now: () => unknown): unknown {
  if (v === SERVER_TIME) return now();
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : clean(x, now)));
  if (v && typeof v === "object") {
    if (typeof (v as { toJSON?: unknown }).toJSON === "function") return JSON.parse(JSON.stringify(v));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && typeof x !== "function") out[k] = clean(x, now);
    return out;
  }
  return v;
}

/** Firestore Timestamps (from serverTime()) become milliseconds, so the app only ever sees numbers. */
function fromFs(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(fromFs);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = fromFs(x);
    return out;
  }
  return v;
}

// A write of ours still waiting for the server has no server time yet: estimate it instead of null.
const snapData = (s: DocumentSnapshot) => fromFs(s.data({ serverTimestamps: "estimate" }));

// ---------- Listener count (to check nothing is left listening after leaving a page) ----------
let listeners = 0;
function counted(unsub: () => void): Unsubscribe {
  listeners++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    listeners--;
    unsub();
  };
}
/** Number of active subscribe/subscribeQuery listeners. In the browser console: `__peerseusListeners()`. */
export function listenerCount() {
  return listeners;
}
if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__peerseusListeners = listenerCount;

// ---------- Firestore implementation ----------
function firestoreDb(): Db {
  const fs = () => getFirestore(getFirebaseApp());
  const toFs = <T,>(data: T) => clean(data, serverTimestamp) as T & Record<string, unknown>;
  const constraints = (filters: Filter[]): QueryConstraint[] => filters.map(([f, op, v]) => where(f, op, v));
  const report = (onError?: (e: Error) => void) => (e: Error) => (onError ? onError(e) : console.warn("[db]", e));
  return {
    async get<T>(col: string, id: string) {
      const snap = await getDoc(doc(fs(), col, id));
      return snap.exists() ? (snapData(snap) as T) : null;
    },
    async list<T>(col: string, filters: Filter[] = []) {
      const snap = await getDocs(query(collection(fs(), col), ...constraints(filters)));
      return snap.docs.map((d) => snapData(d) as T);
    },
    async set(col, id, data) {
      await setDoc(doc(fs(), col, id), toFs(data));
    },
    async update(col, id, data) {
      await updateDoc(doc(fs(), col, id), toFs(data));
    },
    async remove(col, id) {
      await deleteDoc(doc(fs(), col, id));
    },
    subscribe<T>(col: string, id: string, cb: (data: T | null) => void, onError?: (e: Error) => void) {
      return counted(onSnapshot(doc(fs(), col, id), (s) => cb(s.exists() ? (snapData(s) as T) : null), report(onError)));
    },
    subscribeQuery<T>(col: string, filters: Filter[], cb: (data: T[]) => void, onError?: (e: Error) => void) {
      const q = query(collection(fs(), col), ...constraints(filters));
      return counted(onSnapshot(q, (s) => cb(s.docs.map((d) => snapData(d) as T)), report(onError)));
    },
    transaction(fn) {
      return runTransaction(fs(), (t) =>
        fn({
          async get<T>(col: string, id: string) {
            const s = await t.get(doc(fs(), col, id));
            return s.exists() ? (snapData(s) as T) : null;
          },
          set(col, id, data) {
            t.set(doc(fs(), col, id), toFs(data));
          },
          update(col, id, data) {
            t.update(doc(fs(), col, id), toFs(data));
          },
          remove(col, id) {
            t.delete(doc(fs(), col, id));
          },
        }),
      );
    },
  };
}

// ---------- Local (browser storage) implementation for demo mode ----------
const PREFIX = "peerseus:";
function readCol(col: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + col) || "{}");
  } catch {
    return {};
  }
}
function writeCol(col: string, data: Record<string, unknown>) {
  try {
    localStorage.setItem(PREFIX + col, JSON.stringify(data));
  } catch {
    throw new Error("Penyimpanan browser penuh (mode demo lokal). Hapus data situs ini atau sambungkan Firebase.");
  }
  emit(col);
}
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}
const localClean = <T,>(data: T) => clean(data, Date.now) as T & Record<string, unknown>;
function matches(d: unknown, filters: Filter[]) {
  return filters.every(([f, op, v]) => {
    const val = getPath(d, f);
    return op === "==" ? val === v : Array.isArray(val) && val.includes(v);
  });
}
function applySet(col: string, id: string, data: object) {
  const c = readCol(col);
  c[id] = localClean(data);
  writeCol(col, c);
}
function applyUpdate(col: string, id: string, data: Record<string, unknown>) {
  const c = readCol(col);
  const cur = (c[id] ?? {}) as Record<string, unknown>;
  // Firestore-style dotted paths are supported
  for (const [k, v] of Object.entries(localClean(data))) setPath(cur, k, v);
  c[id] = cur;
  writeCol(col, c);
}
function applyRemove(col: string, id: string) {
  const c = readCol(col);
  delete c[id];
  writeCol(col, c);
}

// Change notifications: an emitter for this tab, and the `storage` event for writes made in other tabs.
const watchers = new Map<string, Set<() => void>>();
function emit(col: string) {
  watchers.get(col)?.forEach((f) => f());
}
let storageHooked = false;
function watch(col: string, fn: () => void) {
  if (!storageHooked && typeof window !== "undefined") {
    storageHooked = true;
    window.addEventListener("storage", (e) => {
      if (e.key === null) watchers.forEach((_, c) => emit(c)); // storage cleared
      else if (e.key.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length));
    });
  }
  if (!watchers.has(col)) watchers.set(col, new Set());
  watchers.get(col)!.add(fn);
  return () => {
    watchers.get(col)?.delete(fn);
  };
}
/** Calls `cb` with a fresh copy of `read()` now and whenever it changes. */
function localSubscribe<V>(col: string, read: () => V, cb: (v: V) => void): Unsubscribe {
  let active = true;
  let last: string | undefined;
  const run = () => {
    if (!active) return;
    const s = JSON.stringify(read() ?? null);
    if (s === last) return;
    last = s;
    cb(JSON.parse(s));
  };
  queueMicrotask(run); // like onSnapshot, the first value arrives after subscribe returns
  const off = watch(col, run);
  return counted(() => {
    active = false;
    off();
  });
}

// Demo transactions run one at a time: Web Locks covers every tab of this browser, the promise chain is the fallback.
let txChain: Promise<unknown> = Promise.resolve();
function withLocalLock<R>(fn: () => Promise<R>): Promise<R> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("peerseus:tx", fn) as Promise<R>;
  const run = txChain.then(fn, fn);
  txChain = run.catch(() => undefined);
  return run;
}

function localDb(): Db {
  return {
    async get<T>(col: string, id: string) {
      return (readCol(col)[id] as T) ?? null;
    },
    async list<T>(col: string, filters: Filter[] = []) {
      return Object.values(readCol(col)).filter((d) => matches(d, filters)) as T[];
    },
    async set(col, id, data) {
      applySet(col, id, data);
    },
    async update(col, id, data) {
      applyUpdate(col, id, data);
    },
    async remove(col, id) {
      applyRemove(col, id);
    },
    subscribe<T>(col: string, id: string, cb: (data: T | null) => void) {
      return localSubscribe(col, () => (readCol(col)[id] as T) ?? null, cb);
    },
    subscribeQuery<T>(col: string, filters: Filter[], cb: (data: T[]) => void) {
      return localSubscribe(col, () => Object.values(readCol(col)).filter((d) => matches(d, filters)) as T[], cb);
    },
    transaction(fn) {
      return withLocalLock(async () => {
        const writes: (() => void)[] = [];
        const result = await fn({
          async get<T>(col: string, id: string) {
            if (writes.length) throw new Error("db.transaction: baca semua dokumen sebelum menulis (aturan Firestore).");
            const d = readCol(col)[id];
            return d === undefined ? null : (JSON.parse(JSON.stringify(d)) as T);
          },
          set: (col, id, data) => void writes.push(() => applySet(col, id, data)),
          update: (col, id, data) => void writes.push(() => applyUpdate(col, id, data)),
          remove: (col, id) => void writes.push(() => applyRemove(col, id)),
        });
        // All writes land together once the function succeeds; nothing is written if it throws.
        writes.forEach((w) => w());
        return result;
      });
    },
  };
}

export const db: Db = firebaseEnabled ? firestoreDb() : localDb();

// ---------- Clock offset ----------
let offset = 0;
let offsetSync: Promise<number> | null = null;
/**
 * Measures (once per page load, 3 round trips) how far this device's clock is from the server's: writes serverTime() to
 * clockSync/{uid}, reads it back from the server, and compares it with the midpoint of the round trip.
 * Demo mode: 0. Resolves to the offset in ms (server = Date.now() + offset).
 */
export function syncServerClock(): Promise<number> {
  if (!firebaseEnabled) return Promise.resolve(0);
  if (offsetSync) return offsetSync;
  const uid = getAuth(getFirebaseApp()).currentUser?.uid;
  if (!uid) return Promise.resolve(offset);
  const fs = getFirestore(getFirebaseApp());
  const ref = doc(fs, "clockSync", uid);
  offsetSync = (async () => {
    // A few round trips; the shortest one is the most precise (the first also pays for opening the connection).
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const sentAt = Date.now();
      await setDoc(ref, { t: serverTimestamp() });
      const ackAt = Date.now();
      const t = (await getDocFromServer(ref)).get("t");
      if (t instanceof Timestamp && ackAt - sentAt < best) {
        best = ackAt - sentAt;
        offset = Math.round(t.toMillis() - (sentAt + ackAt) / 2);
      }
    }
    return offset;
  })().catch((e) => {
    console.warn("[db] syncServerClock", e);
    offsetSync = null; // try again next time
    return offset;
  });
  return offsetSync;
}
/** Last measured offset (0 until syncServerClock has finished). */
export function serverOffset() {
  return offset;
}
/** The server's current time in ms, by this device's clock plus the measured offset. */
export function serverNow() {
  return Date.now() + offset;
}

export function newId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
