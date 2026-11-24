/**
 * Peerseus is for ITB only: a verified email on itb.ac.id or one of its subdomains
 * (mahasiswa.itb.ac.id for students, std.stei.itb.ac.id, itb.ac.id for staff, ...).
 *
 * The same rule is enforced in firestore.rules (every read/write) and on the AI routes
 * (src/lib/serverAuth.ts). Keep the three in sync.
 */
const ITB_EMAIL = /^[^@]+@([a-z0-9-]+\.)*itb\.ac\.id$/;

export function isItbEmail(email?: string | null): boolean {
  return !!email && ITB_EMAIL.test(email.trim().toLowerCase());
}

export const NOT_ITB_MESSAGE = "Peerseus khusus untuk ITB. Masuk dengan akun Google ITB kamu (email @mahasiswa.itb.ac.id).";
