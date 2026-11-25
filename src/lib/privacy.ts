"use client";
import { db } from "./db";
import type { Privacy, UserProfile } from "./types";

/**
 * Hidden profile fields must not be readable by others in Firestore itself, not only hidden in the UI.
 * Firestore rules allow or deny a whole document, so hidden fields are moved out of users/{uid} into
 * users/{uid}/private/profile, which only the owner can read (see firestore.rules). The owner's app
 * reads both documents and merges them.
 */
export const HIDEABLE: Record<keyof Privacy, (keyof UserProfile)[]> = {
  showProgram: ["program", "dreamProgram"],
  showEntryYear: ["entryYear"],
  showContact: ["contact"],
};

const privateCol = (uid: string) => `users/${uid}/private`;
const PRIVATE_ID = "profile";

export const isShown = (p: Pick<UserProfile, "privacy"> | null | undefined, key: keyof Privacy) => p?.privacy?.[key] !== false;

/** Public part (users/{uid}) and hidden part (users/{uid}/private/profile) of a profile. */
export function splitProfile(p: UserProfile): { shared: UserProfile; hidden: Partial<UserProfile> } {
  const shared: UserProfile = { ...p };
  const hidden: Partial<UserProfile> = {};
  for (const [key, fields] of Object.entries(HIDEABLE) as [keyof Privacy, (keyof UserProfile)[]][]) {
    if (isShown(p, key)) continue;
    for (const f of fields) {
      if (shared[f] !== undefined) (hidden as Record<string, unknown>)[f] = shared[f];
      delete shared[f];
    }
  }
  return { shared, hidden };
}

/** The owner's own profile, with hidden fields merged back in. */
export async function loadOwnProfile(uid: string): Promise<UserProfile | null> {
  const shared = await db.get<UserProfile>("users", uid);
  if (!shared) return null;
  const hidden = await db.get<Partial<UserProfile>>(privateCol(uid), PRIVATE_ID);
  return { ...shared, ...hidden };
}

/** Saves the profile, writing each field to the document its privacy switch calls for. */
export async function saveOwnProfile(p: UserProfile) {
  const { shared, hidden } = splitProfile(p);
  await db.set("users", p.id, shared);
  await db.set(privateCol(p.id), PRIVATE_ID, hidden);
}
