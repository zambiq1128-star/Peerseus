"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type AuthProvider as FirebaseAuthProvider, type User } from "firebase/auth";
import { ACCESS_DOC, guestListIncludes, isItbAccount, ITB_MICROSOFT_TENANT, NOT_ALLOWED_MESSAGE } from "./access";
import { firebaseEnabled, getFirebaseApp } from "./firebase";
import { db, newId } from "./db";
import { ensureSeeded } from "./seed";
import type { UserProfile } from "./types";

type AuthState = {
  loading: boolean;
  uid: string | null;
  profile: UserProfile | null;
  authName: string;
  /** Why the last sign-in was refused (e.g. not an ITB account), shown on the sign-in screen. */
  authError: string;
  /** ITB accounts (Microsoft 365). */
  signInMicrosoft: () => Promise<void>;
  /** Guests on the list, e.g. judges with a Gmail account. */
  signInGoogle: () => Promise<void>;
  signInLocal: (name: string, major: string) => Promise<void>;
  saveProfile: (p: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const LOCAL_UID_KEY = "peerseus:uid";

/**
 * Only ITB accounts and listed guests get in (see access.ts).
 * Firestore rules and the AI routes check the same on the server.
 */
async function allowed(u: User): Promise<boolean> {
  const { signInProvider } = await u.getIdTokenResult();
  if (isItbAccount({ email: u.email, emailVerified: u.emailVerified, signInProvider })) return true;
  if (!u.emailVerified) return false;
  try {
    // firestore.rules only let allowed users read this document, so a refusal means "not a guest".
    const access = await db.get<{ guestEmails?: unknown }>(ACCESS_DOC.col, ACCESS_DOC.id);
    return guestListIncludes(access?.guestEmails, u.email);
  } catch {
    return false;
  }
}

function microsoftProvider() {
  const p = new OAuthProvider("microsoft.com");
  // Sign in against ITB's own tenant: only ITB Microsoft accounts are offered and accepted.
  p.setCustomParameters({ tenant: ITB_MICROSOFT_TENANT, prompt: "select_account" });
  return p;
}

function googleProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "Login dibatalkan.",
  "auth/cancelled-popup-request": "Login dibatalkan.",
  "auth/popup-blocked": "Popup login diblokir browser. Izinkan popup untuk situs ini, lalu coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase (Authentication, Settings, Authorized domains).",
  "auth/operation-not-allowed": "Cara login ini belum diaktifkan di Firebase (Authentication, Sign-in method).",
  "auth/account-exists-with-different-credential": "Email ini sudah pernah dipakai masuk dengan cara lain. Coba tombol login yang satunya.",
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
        if (u && !(await allowed(u))) {
          // Also catches sessions that were signed in before the ITB-only rule, or guests removed from the list.
          setAuthError(NOT_ALLOWED_MESSAGE);
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

  async function signInWith(provider: FirebaseAuthProvider) {
    const auth = getAuth(getFirebaseApp());
    setAuthError("");
    let user: User;
    try {
      user = (await signInWithPopup(auth, provider)).user;
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      throw new Error(SIGN_IN_ERRORS[code] ?? (e as Error).message);
    }
    if (!(await allowed(user))) {
      await signOut(auth);
      throw new Error(NOT_ALLOWED_MESSAGE);
    }
    setAuthName(user.displayName ?? "");
    await load(user.uid);
  }

  const value: AuthState = {
    loading,
    uid,
    profile,
    authName,
    authError,
    signInMicrosoft: () => signInWith(microsoftProvider()),
    signInGoogle: () => signInWith(googleProvider()),
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
