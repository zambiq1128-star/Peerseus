"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { firebaseEnabled, getFirebaseApp } from "./firebase";
import { db, newId } from "./db";
import { ensureSeeded } from "./seed";
import type { UserProfile } from "./types";

type AuthState = {
  loading: boolean;
  uid: string | null;
  profile: UserProfile | null;
  authName: string;
  signInGoogle: () => Promise<void>;
  signInLocal: (name: string) => Promise<void>;
  saveProfile: (p: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const LOCAL_UID_KEY = "peerseus:uid";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [authName, setAuthName] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(async (id: string | null) => {
    setUid(id);
    if (!id) {
      setProfile(null);
      return;
    }
    await ensureSeeded();
    setProfile(await db.get<UserProfile>("users", id));
  }, []);

  useEffect(() => {
    if (firebaseEnabled) {
      return onAuthStateChanged(getAuth(getFirebaseApp()), async (u) => {
        setAuthName(u?.displayName ?? "");
        await load(u?.uid ?? null);
        setLoading(false);
      });
    }
    const id = localStorage.getItem(LOCAL_UID_KEY);
    load(id).finally(() => setLoading(false));
  }, [load]);

  const value: AuthState = {
    loading,
    uid,
    profile,
    authName,
    async signInGoogle() {
      const cred = await signInWithPopup(getAuth(getFirebaseApp()), new GoogleAuthProvider());
      setAuthName(cred.user.displayName ?? "");
      await load(cred.user.uid);
    },
    async signInLocal(name: string) {
      const id = newId("u_");
      localStorage.setItem(LOCAL_UID_KEY, id);
      setAuthName(name);
      await load(id);
    },
    async saveProfile(p) {
      if (!uid) return;
      const base: UserProfile = profile ?? { id: uid, name: authName || "Mahasiswa", major: "", year: 1, isPublic: true, courseIds: [], createdAt: Date.now() };
      const next = { ...base, ...p, id: uid };
      await db.set("users", uid, next);
      setProfile(next);
    },
    async logout() {
      if (firebaseEnabled) await signOut(getAuth(getFirebaseApp()));
      else localStorage.removeItem(LOCAL_UID_KEY);
      setUid(null);
      setProfile(null);
    },
    async refresh() {
      await load(uid);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
