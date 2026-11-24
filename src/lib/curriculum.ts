/**
 * Courses Peerseus suggests when a student sets up their profile, from ITB Kurikulum 2024
 * (https://six.itb.ac.id/pub/kur2024/<program code>). Only the current semester is suggested, and the
 * student can untick any of them. Laboratory courses are left out: they differ per program and have
 * nothing to quiz on.
 *
 * Data read so far (2026-11-24):
 * - Semester 1, by faculty: the MA/FI/KI core was read from 101 Matematika, 130 Teknik Kimia,
 *   135 Teknik Informatika and 152 Arsitektur; FSRD from 170 Seni Rupa; SBM from 190 Manajemen.
 *   Other faculties are assumed to follow the MA/FI/KI core.
 * - Semester 2 and later, by program: only 130 and 135. Other programs get no suggestion yet.
 * To add a program, copy its semester tables from the page above into BY_PROGRAM.
 */
import { currentIntakeYear, programCode, type Academic } from "./itb";

export type CourseInfo = { code: string; name: string; sks: number };

const COURSE_LIST: CourseInfo[] = [
  { code: "MA1101", name: "Matematika I", sks: 4 },
  { code: "FI1101", name: "Fisika Dasar I", sks: 3 },
  { code: "KI1101", name: "Kimia Dasar I", sks: 3 },
  { code: "WI1101", name: "Pancasila", sks: 2 },
  { code: "WI1102", name: "Berpikir Komputasional", sks: 2 },
  { code: "WI1103", name: "Pengantar Prinsip Keberlanjutan", sks: 2 },
  { code: "MA1103", name: "Matematika Bisnis I", sks: 4 },
  { code: "MB1101", name: "Pengantar Bisnis", sks: 4 },
  { code: "MB1102", name: "Sains Terpadu", sks: 2 },
  { code: "WF1121", name: "Gambar Bentuk", sks: 3 },
  { code: "WF1122", name: "Gambar Konstruktif", sks: 3 },
  { code: "WF1123", name: "Rupa Dasar Dua Dimensi", sks: 3 },
  { code: "WF1124", name: "Rupa Dasar Tiga Dimensi", sks: 3 },
  { code: "MA1201", name: "Matematika IIA (Sains dan Rekayasa)", sks: 4 },
  { code: "FI1201", name: "Fisika Dasar IIA", sks: 3 },
  { code: "KI1201", name: "Kimia Dasar 2A", sks: 3 },
  { code: "WI2001", name: "Pengenalan Rekayasa dan Desain", sks: 3 },
  { code: "WI2002", name: "Literasi Data dan Inteligensi Artifisial", sks: 2 },
  { code: "WI2003", name: "Olah Raga", sks: 1 },
  { code: "WI2004", name: "Bahasa Inggris", sks: 2 },
  { code: "WI2005", name: "Bahasa Indonesia", sks: 2 },
  { code: "IF1210", name: "Algoritma dan Pemrograman 1", sks: 3 },
  { code: "IF1220", name: "Matematika Diskrit", sks: 3 },
  { code: "IF1221", name: "Logika Komputasional", sks: 2 },
  { code: "IF1230", name: "Organisasi dan Arsitektur Komputer", sks: 3 },
];
const COURSES = Object.fromEntries(COURSE_LIST.map((c) => [c.code, c]));

const SEM1_CORE = ["MA1101", "FI1101", "KI1101", "WI1102", "WI1101", "WI1103"];
const SEM1_BY_FACULTY: Record<string, string[]> = {
  FSRD: ["WF1121", "WF1122", "WF1123", "WF1124", "WI1102", "WI1101", "WI1103"],
  SBM: ["MA1103", "MB1101", "MB1102", "WI1102", "WI1101", "WI1103"],
};

/** Semester → course codes, by Kurikulum 2024 program code. */
const BY_PROGRAM: Record<string, Record<number, string[]>> = {
  "130": { 2: ["MA1201", "FI1201", "KI1201", "WI2001", "WI2004", "WI2005", "WI2003"] },
  "135": { 2: ["IF1210", "IF1220", "IF1221", "IF1230", "WI2001", "WI2002", "WI2005"] },
};

/**
 * Semester the student is in now (1 = first semester of the first year). Odd semesters run August to
 * December. Without a NIM, only a TPB student's semester is known (first year).
 */
export function currentSemester(a: Academic, entryYear: number | null, now = new Date()): number | null {
  const odd = now.getMonth() >= 7;
  if (entryYear === null) return a.stage === "tpb" ? (odd ? 1 : 2) : null;
  const year = Math.max(0, currentIntakeYear(now) - entryYear);
  return year * 2 + (odd ? 1 : 2);
}

/** This semester's courses for the form, or null when we don't have them. */
export function suggestCourses(a: Academic, entryYear: number | null, now = new Date()): { semester: number; courses: CourseInfo[] } | null {
  const semester = currentSemester(a, entryYear, now);
  if (!semester) return null;
  // A dream program isn't the student's curriculum yet, so TPB students only get the faculty's semester 1.
  const code = a.stage === "jurusan" ? programCode(a.program) : undefined;
  const codes = (code && BY_PROGRAM[code]?.[semester]) || (semester === 1 ? SEM1_BY_FACULTY[a.faculty] ?? SEM1_CORE : null);
  return codes ? { semester, courses: codes.map((c) => COURSES[c]) } : null;
}
