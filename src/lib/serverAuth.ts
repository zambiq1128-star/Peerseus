import { verify, X509Certificate, type KeyObject } from "node:crypto";
import { ACCESS_DOC, guestListIncludes, isItbAccount, NOT_ALLOWED_MESSAGE } from "./access";

/**
 * Server-side check for the AI routes: the request must carry a Firebase ID token
 * (Authorization: Bearer …) of a signed-in ITB account or a listed guest (see access.ts).
 *
 * Tokens are verified here with Google's public keys (no firebase-admin, no service account),
 * following https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_S = 60;

/** A token that is missing, malformed, expired, or not signed by Firebase. */
export class InvalidTokenError extends Error {}

export type TokenUser = { uid: string; email: string; emailVerified: boolean; signInProvider: string };
type KeyLookup = (kid: string) => Promise<KeyObject | undefined>;

let cache: { keys: Map<string, KeyObject>; expires: number } | null = null;

async function fetchKeys(): Promise<Map<string, KeyObject>> {
  const res = await fetch(CERTS_URL, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Google public keys: HTTP ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]) || 3600;
  const keys = new Map(Object.entries(certs).map(([kid, pem]) => [kid, new X509Certificate(pem).publicKey]));
  cache = { keys, expires: Date.now() + maxAge * 1000 };
  return keys;
}

/** Google's current signing keys, cached for as long as Google says (Cache-Control max-age). */
async function googleKey(kid: string): Promise<KeyObject | undefined> {
  if (cache && Date.now() < cache.expires) {
    const k = cache.keys.get(kid);
    if (k) return k;
  }
  // Not cached yet, expired, or Google rotated its keys.
  return (await fetchKeys()).get(kid);
}

function decodePart(part: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (v && typeof v === "object") return v;
  } catch {
    /* fall through */
  }
  throw new InvalidTokenError("malformed token");
}

/** Verifies a Firebase ID token's signature and claims, then returns who it belongs to. */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  opts: { keyFor?: KeyLookup; nowS?: number } = {},
): Promise<TokenUser> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new InvalidTokenError("malformed token");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  const now = opts.nowS ?? Math.floor(Date.now() / 1000);

  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new InvalidTokenError("wrong algorithm");
  if (claims.aud !== projectId) throw new InvalidTokenError("wrong audience");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new InvalidTokenError("wrong issuer");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new InvalidTokenError("no subject");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= now) throw new InvalidTokenError("expired");
  if (typeof claims.iat !== "number" || claims.iat - CLOCK_SKEW_S > now) throw new InvalidTokenError("issued in the future");
  if (typeof claims.auth_time !== "number" || claims.auth_time - CLOCK_SKEW_S > now) throw new InvalidTokenError("bad auth_time");

  const key = await (opts.keyFor ?? googleKey)(header.kid);
  if (!key) throw new InvalidTokenError("unknown signing key");
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new InvalidTokenError("bad signature");

  const firebase = (claims.firebase ?? {}) as { sign_in_provider?: unknown };
  return {
    uid: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    emailVerified: claims.email_verified === true,
    signInProvider: typeof firebase.sign_in_provider === "string" ? firebase.sign_in_provider : "",
  };
}

type FirestoreDoc = { fields?: { guestEmails?: { arrayValue?: { values?: { stringValue?: string }[] } } } };

/** Guests confirmed recently, so a PDF with many pages doesn't read the list once per page. */
const guestCache = new Map<string, number>();
const GUEST_CACHE_MS = 60_000;

/**
 * Reads config/access through the Firestore REST API *as the user* (their ID token), so firestore.rules
 * decide: the read only succeeds for allowed users. Returns false when the user is not on the list.
 */
export async function isListedGuest(email: string, token: string, projectId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = email.toLowerCase();
  if ((guestCache.get(key) ?? 0) > Date.now()) return true;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${ACCESS_DOC.col}/${ACCESS_DOC.id}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (res.status === 403 || res.status === 404 || res.status === 401) return false;
  if (!res.ok) throw new Error(`Firestore guest list: HTTP ${res.status}`);
  const doc = (await res.json()) as FirestoreDoc;
  const list = (doc.fields?.guestEmails?.arrayValue?.values ?? []).map((v) => v.stringValue);
  const ok = guestListIncludes(list, email);
  if (ok) guestCache.set(key, Date.now() + GUEST_CACHE_MS);
  return ok;
}

/** Same condition as `firebaseEnabled` in the browser (src/lib/firebase.ts). */
function firebaseProjectId(): string | null {
  const e = process.env;
  return e.NEXT_PUBLIC_FIREBASE_API_KEY && e.NEXT_PUBLIC_FIREBASE_PROJECT_ID && e.NEXT_PUBLIC_FIREBASE_APP_ID
    ? e.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    : null;
}

/**
 * Returns an error response unless the request comes from a signed-in ITB account or listed guest,
 * or null to go on. In local demo mode (no Firebase env) there are no accounts at all, so the routes stay open.
 */
export async function requireAllowedUser(req: Request): Promise<Response | null> {
  const projectId = firebaseProjectId();
  if (!projectId) return null;

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ error: "Silakan masuk dulu.", code: "unauthenticated", retryable: false }, { status: 401 });

  let user: TokenUser;
  try {
    user = await verifyFirebaseIdToken(token, projectId);
  } catch (e) {
    if (e instanceof InvalidTokenError) {
      return Response.json({ error: "Sesi login sudah tidak berlaku. Muat ulang halaman, lalu masuk lagi.", code: "unauthenticated", retryable: false }, { status: 401 });
    }
    console.error("[auth] could not check the login token:", (e as Error).message);
    return Response.json({ error: "Gagal memeriksa login. Coba lagi sebentar.", code: "auth_unavailable", retryable: true }, { status: 503 });
  }
  const denied = Response.json({ error: NOT_ALLOWED_MESSAGE, code: "not_allowed", retryable: false }, { status: 403 });
  if (isItbAccount(user)) return null;
  if (!user.emailVerified || !user.email) return denied; // guests need a verified email
  try {
    return (await isListedGuest(user.email, token, projectId)) ? null : denied;
  } catch (e) {
    console.error("[auth] could not read the guest list:", (e as Error).message);
    return Response.json({ error: "Gagal memeriksa akses. Coba lagi sebentar.", code: "auth_unavailable", retryable: true }, { status: 503 });
  }
}
