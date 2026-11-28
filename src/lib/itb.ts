/**
 * ITB faculties/schools, their S1 study programs (jurusan), and what a student's NIM says about them.
 *
 * An S1 NIM has 8 digits: a 3-digit code, the 2-digit year of entry, then a 3-digit number.
 * The code is either a first-year (TPB) faculty code, e.g. 167 = TPB FTI, or a study program code,
 * e.g. 135 = Teknik Informatika. Students get a program code after TPB; IUP students get one right away
 * (e.g. 13026xxx). ITB student emails use the NIM: 16726303@mahasiswa.itb.ac.id.
 *
 * Sources:
 * - Program codes and faculties: ITB Kurikulum 2024, https://six.itb.ac.id/pub/kur2024 (all 53 S1 programs).
 * - TPB codes: TPB Center, "Daftar Kepala NIM S1 ITB" (2013), since TPB isn't a study program on the
 *   Kurikulum page. Newer TPB codes aren't known: those NIMs aren't recognized and the user picks by hand.
 * To add a code, add one line below.
 */

export const FACULTIES = ["STEI", "FTI", "FMIPA", "SITH", "SF", "FTSL", "FTTM", "FITB", "FTMD", "SAPPK", "SBM", "FSRD"];

/** First-year (TPB) codes: the student has a faculty but no program yet. */
const TPB_CODES: Record<string, string> = {
  "160": "FMIPA", "161": "SITH", "162": "SF", "163": "FITB", "164": "FTTM", "165": "STEI",
  "166": "FTSL", "167": "FTI", "168": "FSRD", "169": "FTMD", "199": "SAPPK",
};

/** S1 study program codes, as listed in Kurikulum 2024. */
export const PROGRAM_CODES: Record<string, [faculty: string, program: string]> = {
  "101": ["FMIPA", "Matematika"],
  "102": ["FMIPA", "Fisika"],
  "103": ["FMIPA", "Astronomi"],
  "105": ["FMIPA", "Kimia"],
  "108": ["FMIPA", "Aktuaria"],
  "104": ["SITH", "Mikrobiologi"],
  "106": ["SITH", "Biologi"],
  "112": ["SITH", "Rekayasa Hayati"],
  "114": ["SITH", "Rekayasa Pertanian"],
  "115": ["SITH", "Rekayasa Kehutanan"],
  "119": ["SITH", "Teknologi Pasca Panen"],
  "107": ["SF", "Sains dan Teknologi Farmasi"],
  "116": ["SF", "Farmasi Klinik dan Komunitas"],
  "121": ["FTTM", "Teknik Pertambangan"],
  "122": ["FTTM", "Teknik Perminyakan"],
  "123": ["FTTM", "Teknik Geofisika"],
  "125": ["FTTM", "Teknik Metalurgi"],
  "120": ["FITB", "Teknik Geologi"],
  "128": ["FITB", "Meteorologi"],
  "129": ["FITB", "Oseanografi"],
  "151": ["FITB", "Teknik Geodesi dan Geomatika"],
  "130": ["FTI", "Teknik Kimia"],
  "133": ["FTI", "Teknik Fisika"],
  "134": ["FTI", "Teknik Industri"],
  "143": ["FTI", "Teknik Pangan"],
  "144": ["FTI", "Manajemen Rekayasa"],
  "145": ["FTI", "Teknik Bioenergi dan Kemurgi"],
  "194": ["FTI", "Teknik Industri (Kampus Cirebon)"],
  "132": ["STEI", "Teknik Elektro"],
  "135": ["STEI", "Teknik Informatika"],
  "180": ["STEI", "Teknik Tenaga Listrik"],
  "181": ["STEI", "Teknik Telekomunikasi"],
  "182": ["STEI", "Sistem dan Teknologi Informasi"],
  "183": ["STEI", "Teknik Biomedis"],
  "131": ["FTMD", "Teknik Mesin"],
  "136": ["FTMD", "Teknik Dirgantara"],
  "137": ["FTMD", "Teknik Material"],
  "150": ["FTSL", "Teknik Sipil"],
  "153": ["FTSL", "Teknik Lingkungan"],
  "155": ["FTSL", "Teknik Kelautan"],
  "157": ["FTSL", "Rekayasa Infrastruktur Lingkungan"],
  "158": ["FTSL", "Teknik dan Pengelolaan Sumber Daya Air"],
  "152": ["SAPPK", "Arsitektur"],
  "154": ["SAPPK", "Perencanaan Wilayah dan Kota"],
  "156": ["SAPPK", "Perencanaan Wilayah dan Kota (Kampus Cirebon)"],
  "170": ["FSRD", "Seni Rupa"],
  "171": ["FSRD", "Kriya (Kampus Cirebon)"],
  "172": ["FSRD", "Kriya"],
  "173": ["FSRD", "Desain Interior"],
  "174": ["FSRD", "Desain Komunikasi Visual"],
  "175": ["FSRD", "Desain Produk"],
  "190": ["SBM", "Manajemen"],
  "192": ["SBM", "Kewirausahaan"],
};

/** Each faculty/school with its S1 programs (for the dropdowns). */
export const PROGRAMS: Record<string, string[]> = Object.fromEntries(
  FACULTIES.map((f) => [f, Object.values(PROGRAM_CODES).filter(([pf]) => pf === f).map(([, p]) => p)]),
);

/** Kurikulum 2024 code of a program name, e.g. "Teknik Kimia" → "130". */
export function programCode(program?: string): string | undefined {
  return Object.entries(PROGRAM_CODES).find(([, [, p]]) => p === program)?.[0];
}

/** "tpb" = first year, before getting a program; "jurusan" = already in a study program. */
export type Stage = "tpb" | "jurusan";

/** The academic part of a profile, as the forms edit it. `program` is the dream program while in TPB. */
export type Academic = { faculty: string; stage: Stage; program: string };

export type NimInfo = { nim: string; entryYear: number; faculty: string; program?: string; tpb: boolean };

/** Reads an 8-digit NIM from an ITB email. Null for staff emails, guests and codes not in the list. */
export function readNim(email?: string | null): NimInfo | null {
  const m = email?.trim().toLowerCase().match(/^((\d{3})(\d{2})\d{3})@([a-z0-9-]+\.)*itb\.ac\.id$/);
  if (!m) return null;
  const [, nim, code, yy] = m;
  const entryYear = 2000 + Number(yy);
  if (TPB_CODES[code]) return { nim, entryYear, faculty: TPB_CODES[code], tpb: true };
  if (PROGRAM_CODES[code]) {
    const [faculty, program] = PROGRAM_CODES[code];
    return { nim, entryYear, faculty, program, tpb: false };
  }
  return null;
}

/** Year of the current academic year's intake. ITB's academic year starts in August. */
export function currentIntakeYear(now = new Date()) {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

/** What to prefill on the profile form, and a line telling the user where it came from. */
export function suggestAcademic(email?: string | null, now = new Date()): { value: Academic; note: string } | null {
  const n = readNim(email);
  if (!n) return null;
  const from = `Diisi dari NIM ${n.nim}`;
  if (n.program) {
    return { value: { faculty: n.faculty, stage: "jurusan", program: n.program }, note: `${from} (${n.program}, angkatan ${n.entryYear}). Ubah kalau keliru.` };
  }
  if (n.entryYear >= currentIntakeYear(now)) {
    return { value: { faculty: n.faculty, stage: "tpb", program: "" }, note: `${from} (TPB ${n.faculty}, angkatan ${n.entryYear}). Ubah kalau keliru.` };
  }
  // A TPB code from an earlier year: the email still carries the first-year NIM, so the program is unknown.
  return { value: { faculty: n.faculty, stage: "jurusan", program: "" }, note: `${from} (TPB ${n.faculty}, angkatan ${n.entryYear}). Pilih jurusanmu sekarang.` };
}

type AcademicFields = { major: string; stage?: Stage; program?: string; dreamProgram?: string };

/** Profile → form. The profile's `major` field holds the faculty/school code. */
export function academicOf(p: Partial<AcademicFields> | null | undefined, fallback: Academic): Academic {
  if (!p?.major) return fallback;
  const stage: Stage = p.stage ?? (p.program ? "jurusan" : "tpb");
  return { faculty: p.major, stage, program: (stage === "tpb" ? p.dreamProgram : p.program) ?? "" };
}

/** Form → profile fields. A dream program is stored apart from a confirmed one, never both. */
export function academicPatch(a: Academic): Required<Pick<AcademicFields, "major" | "stage">> & Pick<AcademicFields, "program" | "dreamProgram"> {
  const choice = a.program || undefined;
  return a.stage === "tpb"
    ? { major: a.faculty, stage: "tpb", program: undefined, dreamProgram: choice }
    : { major: a.faculty, stage: "jurusan", program: choice, dreamProgram: undefined };
}

/** Angkatan for other people, e.g. "angkatan 2024"; empty when hidden or unknown. */
export const entryYearLabel = (p: { entryYear?: number } | null | undefined) => (p?.entryYear ? `angkatan ${p.entryYear}` : "");

/** Short label for other people, e.g. "Teknik Kimia · FTI" or "TPB FTI · incar Teknik Kimia". */
export function academicLabel(p: Partial<AcademicFields> | null | undefined, fallbackFaculty = ""): string {
  const faculty = p?.major || fallbackFaculty;
  // A program label that already carries the faculty code (e.g. "TPB FTI") does not get it twice.
  if (p?.program) return !faculty || p.program.split(/[^A-Za-z]+/).includes(faculty) ? p.program : `${p.program} · ${faculty}`;
  if (p?.stage === "tpb") return `TPB ${faculty}${p.dreamProgram ? ` · incar ${p.dreamProgram}` : ""}`;
  return faculty;
}
