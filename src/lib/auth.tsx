"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAuth, GoogleAuthProvider, OAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type AuthProvider as FirebaseAuthProvider, type User } from "firebase/auth";
import { ACCESS_DOC, guestListIncludes, isItbAccount, ITB_MICROSOFT_TENANT, NOT_ALLOWED_MESSAGE } from "./access";
import { firebaseEnabled, getFirebaseApp } from "./firebase";
import { db, newId } from "./db";
import { loadOwnProfile, saveOwnProfile } from "./privacy";
import { ensureSeeded } from "./seed";
import type { UserProfile } from "./types";

type AuthState = {
  loading: boolean;
  uid: string | null;
  profile: UserProfile | null;
  authName: string;
  /** Email of the signed-in account (empty in local demo mode); ITB emails carry the NIM. */
  authEmail: string;
  /** Why the last sign-in was refused (e.g. not an ITB account), shown on the sign-in screen. */
  authError: string;
  /** ITB accounts (Microsoft 365). */
  signInMicrosoft: () => Promise<void>;
  /** Guests on the list, e.g. judges with a Gmail account. */
  signInGoogle: () => Promise<void>;
  signInLocal: (p: Pick<UserProfile, "name" | "major" | "stage" | "program" | "dreamProgram">) => Promise<void>;
  saveProfile: (p: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);
const LOCAL_UID_KEY = "peerseus:uid";
// Demo mode: the account is remembered per tab (sessionStorage) as well as for new tabs (localStorage),
// so two tabs of one browser can be two people (sign out in the second tab, then sign in with another name).
function localUid() {
  try {
    const tab = sessionStorage.getItem(LOCAL_UID_KEY);
    if (tab) return tab;
    const last = localStorage.getItem(LOCAL_UID_KEY);
    if (last) sessionStorage.setItem(LOCAL_UID_KEY, last); // this tab keeps it even if another tab switches account
    return last;
  } catch {
    return localStorage.getItem(LOCAL_UID_KEY);
  }
}
function setLocalUid(id: string | null) {
  for (const store of [sessionStorage, localStorage]) {
    try {
      if (id) store.setItem(LOCAL_UID_KEY, id);
      else store.removeItem(LOCAL_UID_KEY);
    } catch {
      // storage blocked: the account just isn't remembered
    }
  }
}

/**
 * Only ITB accounts and listed guests get in (see access.ts).
 * Firestore rules and the AI routes check the same on the server.
 */
async function itbAccount(u: User): Promise<boolean> {
  const { signInProvider } = await u.getIdTokenResult();
  return isItbAccount({ email: u.email, emailVerified: u.emailVerified, signInProvider });
}

async function allowed(u: User): Promise<boolean> {
  if (await itbAccount(u)) return true;
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
  // Basic sign-in scopes only (no Graph/mail access), so ITB users have the best chance to consent themselves.
  for (const scope of ["openid", "email", "profile"]) p.addScope(scope);
  // Sign in against ITB's own tenant, even though the app registration is multi-tenant (see docs/SETUP.md).
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
  "auth/user-cancelled": "Login dibatalkan, atau izin aplikasi tidak diberikan di halaman Microsoft.",
  "auth/account-exists-with-different-credential": "Email ini sudah pernah dipakai masuk dengan cara lain. Coba tombol login yang satunya.",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  /** ITB account (true) or listed guest (false); undefined in local demo mode. Stored as isItbVerified. */
  const [itb, setItb] = useState<boolean | undefined>(undefined);

  const load = useCallback(async (id: string | null, itbVerified?: boolean) => {
    setUid(id);
    setItb(itbVerified);
    if (!id) {
      setProfile(null);
      return;
    }
    await ensureSeeded();
    let p = await loadOwnProfile(id);
    if (p && itbVerified !== undefined && p.isItbVerified !== itbVerified) {
      // Profiles from before this field, or an account that changed: keep the badge right.
      p = { ...p, isItbVerified: itbVerified };
      await saveOwnProfile(p);
    }
    setProfile(p);
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
        setAuthEmail(u?.email ?? "");
        await load(u?.uid ?? null, u ? await itbAccount(u) : undefined);
        setLoading(false);
      });
    }
    const id = localUid();
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
    setAuthEmail(user.email ?? "");
    await load(user.uid, await itbAccount(user));
  }

  const value: AuthState = {
    loading,
    uid,
    profile,
    authName,
    authEmail,
    authError,
    signInMicrosoft: () => signInWith(microsoftProvider()),
    signInGoogle: () => signInWith(googleProvider()),
    async signInLocal(p) {
      const id = newId("u_");
      await ensureSeeded();
      await db.set<UserProfile>("users", id, { ...p, id, year: 1, isPublic: true, courseIds: [], createdAt: Date.now() });
      setLocalUid(id);
      setAuthName(p.name);
      await load(id);
    },
    async saveProfile(p) {
      if (!uid) return;
      const base: UserProfile = profile ?? { id: uid, name: authName || "Mahasiswa", major: "", year: 1, isPublic: true, courseIds: [], createdAt: Date.now() };
      const next = { ...base, ...p, id: uid, ...(itb !== undefined && { isItbVerified: itb }) };
      await saveOwnProfile(next);
      setProfile(next);
    },
    async logout() {
      if (firebaseEnabled) await signOut(getAuth(getFirebaseApp()));
      else setLocalUid(null);
      setAuthEmail("");
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
