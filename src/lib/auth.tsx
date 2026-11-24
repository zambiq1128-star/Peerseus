"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { isItbEmail, NOT_ITB_MESSAGE } from "./access";
import { firebaseEnabled, getFirebaseApp } from "./firebase";
import { db, newId } from "./db";
import { ensureSeeded } from "./seed";
import type { UserProfile } from "./types";

type AuthState = {
  loading: boolean;
  uid: string | null;
  profile: UserProfile | null;
  authName: string;
  /** Why the last Google sign-in was refused (e.g. not an ITB account), shown on the sign-in screen. */
  authError: string;
  signInGoogle: () => Promise<void>;
  signInLocal: (name: string, major: string) => Promise<void>;
  saveProfile: (p: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const LOCAL_UID_KEY = "peerseus:uid";

/** Only verified ITB Google accounts get in. Firestore rules and the AI routes check the same on the server. */
const allowed = (u: User) => u.emailVerified && isItbEmail(u.email);

function googleProvider() {
  const p = new GoogleAuthProvider();
  // hd=* asks Google's account chooser to prefer organisation (Workspace) accounts like ITB's over personal Gmail.
  p.setCustomParameters({ hd: "*", prompt: "select_account" });
  return p;
}

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "Login dibatalkan.",
  "auth/cancelled-popup-request": "Login dibatalkan.",
  "auth/popup-blocked": "Popup login diblokir browser. Izinkan popup untuk situs ini, lalu coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase (Authentication, Settings, Authorized domains).",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
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
      const auth = getAuth(getFirebaseApp());
      return onAuthStateChanged(auth, async (u) => {
        if (u && !allowed(u)) {
          // Also catches sessions that were signed in before the ITB-only rule.
          setAuthError(NOT_ITB_MESSAGE);
          await signOut(auth);
          u = null;
        }
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
    authError,
    async signInGoogle() {
      const auth = getAuth(getFirebaseApp());
      setAuthError("");
      let user: User;
      try {
        user = (await signInWithPopup(auth, googleProvider())).user;
      } catch (e) {
        const code = (e as { code?: string }).code ?? "";
        throw new Error(SIGN_IN_ERRORS[code] ?? (e as Error).message);
      }
      if (!allowed(user)) {
        await signOut(auth);
        throw new Error(NOT_ITB_MESSAGE);
      }
      setAuthName(user.displayName ?? "");
      await load(user.uid);
    },
    async signInLocal(name: string, major: string) {
      const id = newId("u_");
      await ensureSeeded();
      await db.set<UserProfile>("users", id, { id, name, major, year: 1, isPublic: true, courseIds: [], createdAt: Date.now() });
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
