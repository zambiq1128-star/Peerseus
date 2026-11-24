/**
 * Who can use Peerseus (when Firebase is on):
 * 1. ITB accounts: an email on itb.ac.id or one of its subdomains (mahasiswa.itb.ac.id for students,
 *    itb.ac.id for staff, ...), signed in either
 *    - with Microsoft (ITB runs Microsoft 365). Firebase never marks Microsoft emails as verified; sign-in
 *      is sent to ITB's tenant (ITB_MICROSOFT_TENANT) from a multi-tenant app registration, since students
 *      can't register apps in ITB's tenant (see docs/SETUP.md), or
 *    - with a provider that verified the email (e.g. a Google account made with an ITB address).
 * 2. Guests such as hackathon judges: a verified email (Google sign-in) listed in the Firestore document
 *    config/access, field `guestEmails` (array of lowercase emails). The list is edited in the
 *    Firebase Console and takes effect right away, without a redeploy.
 *
 * The same rule is enforced in firestore.rules (every read/write) and on the AI routes
 * (src/lib/serverAuth.ts). Keep them in sync.
 */
const ITB_EMAIL = /^[^@]+@([a-z0-9-]+\.)*itb\.ac\.id$/;

/** ITB's Microsoft Entra tenant (itb.ac.id and mahasiswa.itb.ac.id), from login.microsoftonline.com discovery. */
export const ITB_MICROSOFT_TENANT = "db6e1183-4c65-405c-82ce-7cd53fa6e9dc";

export function isItbEmail(email?: string | null): boolean {
  return !!email && ITB_EMAIL.test(email.trim().toLowerCase());
}

/** What we know about a signed-in user, from the Firebase user (browser) or ID token (server). */
export type Identity = { email?: string | null; emailVerified: boolean; signInProvider?: string | null };

export function isItbAccount(id: Identity): boolean {
  return isItbEmail(id.email) && (id.signInProvider === "microsoft.com" || id.emailVerified);
}

/** Firestore document holding the guest list. Only readable by allowed users; only editable in the console. */
export const ACCESS_DOC = { col: "config", id: "access" } as const;

/**
 * Exact match on the lowercased email, like `request.auth.token.email.lower() in guestEmails` in
 * firestore.rules, so the app never lets in someone the rules would refuse.
 */
export function guestListIncludes(list: unknown, email?: string | null): boolean {
  return !!email && Array.isArray(list) && list.includes(email.toLowerCase());
}

export const NOT_ALLOWED_MESSAGE =
  "Akun ini belum punya akses. Peerseus khusus untuk akun Microsoft ITB (@mahasiswa.itb.ac.id) dan tamu yang emailnya sudah didaftarkan tim.";
