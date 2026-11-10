"use client";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  type QueryConstraint,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseEnabled, getFirebaseApp } from "./firebase";

export type Filter = [field: string, op: "==" | "array-contains", value: unknown];

export interface Db {
  get<T>(col: string, id: string): Promise<T | null>;
  list<T>(col: string, filters?: Filter[]): Promise<T[]>;
  set<T extends object>(col: string, id: string, data: T): Promise<void>;
  update(col: string, id: string, data: Record<string, unknown>): Promise<void>;
  uploadFile(path: string, file: File): Promise<string>;
}

// ---------- Firestore implementation ----------
function firestoreDb(): Db {
  const fs = () => getFirestore(getFirebaseApp());
  return {
    async get<T>(col: string, id: string) {
      const snap = await getDoc(doc(fs(), col, id));
      return snap.exists() ? (snap.data() as T) : null;
    },
    async list<T>(col: string, filters: Filter[] = []) {
      const cs: QueryConstraint[] = filters.map(([f, op, v]) => where(f, op, v));
      const snap = await getDocs(query(collection(fs(), col), ...cs));
      return snap.docs.map((d) => d.data() as T);
    },
    async set(col, id, data) {
      await setDoc(doc(fs(), col, id), stripUndefined(data));
    },
    async update(col, id, data) {
      await updateDoc(doc(fs(), col, id), stripUndefined(data));
    },
    async uploadFile(path, file) {
      const r = ref(getStorage(getFirebaseApp()), path);
      await uploadBytes(r, file, { contentType: file.type });
      return getDownloadURL(r);
    },
  };
}

function stripUndefined<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
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
  localStorage.setItem(PREFIX + col, JSON.stringify(data));
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

function localDb(): Db {
  return {
    async get<T>(col: string, id: string) {
      return (readCol(col)[id] as T) ?? null;
    },
    async list<T>(col: string, filters: Filter[] = []) {
      return Object.values(readCol(col)).filter((d) =>
        filters.every(([f, op, v]) => {
          const val = getPath(d, f);
          return op === "==" ? val === v : Array.isArray(val) && val.includes(v);
        }),
      ) as T[];
    },
    async set(col, id, data) {
      const c = readCol(col);
      c[id] = stripUndefined(data);
      writeCol(col, c);
    },
    async update(col, id, data) {
      const c = readCol(col);
      const cur = (c[id] ?? {}) as Record<string, unknown>;
      // Firestore-style dotted paths are supported
      for (const [k, v] of Object.entries(stripUndefined(data))) setPath(cur, k, v);
      c[id] = cur;
      writeCol(col, c);
    },
    async uploadFile(_path, file) {
      if (file.size > 1.5 * 1024 * 1024) {
        throw new Error("Mode demo lokal hanya menerima file ≤ 1,5 MB. Sambungkan Firebase untuk file lebih besar.");
      }
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    },
  };
}

export const db: Db = firebaseEnabled ? firestoreDb() : localDb();

export function newId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
