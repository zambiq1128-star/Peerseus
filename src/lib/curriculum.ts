/**
 * ITB Kurikulum 2024 (https://six.itb.ac.id/pub/kur2024/<program code>): the courses of each semester,
 * used to fill the Mata Kuliah page. Students can remove any course and add others.
 *
 * Data read so far (2026-11-24):
 * - Full semester 1 to 8 tables for 130 Teknik Kimia, 135 Teknik Informatika, 133 Teknik Fisika and
 *   131 Teknik Mesin (BY_PROGRAM), as listed, labs and placeholders such as "WI201X Agama" included.
 * - Semester 1 for everyone else, by faculty (SEM1_BY_FACULTY): the MA/FI/KI core was read from
 *   101, 130, 135 and 152; FSRD from 170; SBM from 190. Labs are left out there because they differ
 *   per program. Other faculties are assumed to follow the MA/FI/KI core.
 * Other programs from semester 2 on start empty and add courses with search.
 * To add a program, copy its semester tables into BY_PROGRAM as `code|name|sks` lines.
 */
import { currentIntakeYear, programCode, type Academic } from "./itb";

export type CourseInfo = { code: string; name: string; sks?: number };

/** Parses `CODE|Name|SKS` lines. */
function rows(text: string): CourseInfo[] {
  return text.trim().split("\n").map((line) => {
    const [code, name, sks] = line.split("|").map((s) => s.trim());
    return { code, name, sks: Number(sks) };
  });
}

const SEM1_CORE = rows(`
MA1101|Matematika I|4
FI1101|Fisika Dasar I|3
KI1101|Kimia Dasar I|3
WI1102|Berpikir Komputasional|2
WI1101|Pancasila|2
WI1103|Pengantar Prinsip Keberlanjutan|2
`);

const SEM1_BY_FACULTY: Record<string, CourseInfo[]> = {
  FSRD: rows(`
WF1121|Gambar Bentuk|3
WF1122|Gambar Konstruktif|3
WF1123|Rupa Dasar Dua Dimensi|3
WF1124|Rupa Dasar Tiga Dimensi|3
WI1102|Berpikir Komputasional|2
WI1101|Pancasila|2
WI1103|Pengantar Prinsip Keberlanjutan|2
`),
  SBM: rows(`
MA1103|Matematika Bisnis I|4
MB1101|Pengantar Bisnis|4
MB1102|Sains Terpadu|2
WI1102|Berpikir Komputasional|2
WI1101|Pancasila|2
WI1103|Pengantar Prinsip Keberlanjutan|2
`),
};

/** Program code → semester → courses. */
const BY_PROGRAM: Record<string, Record<number, CourseInfo[]>> = {
  // Teknik Kimia
  "130": {
    1: rows(`
MA1101|Matematika I|4
FI1101|Fisika Dasar I|3
KI1101|Kimia Dasar I|3
WI1101|Pancasila|2
WI1102|Berpikir Komputasional|2
WI1103|Pengantar Prinsip Keberlanjutan|2
WI1111|Laboratorium Fisika Dasar|1
WI1112|Laboratorium Kimia Dasar|1
`),
    2: rows(`
MA1201|Matematika IIA (Sains dan Rekayasa)|4
FI1201|Fisika Dasar IIA|3
KI1201|Kimia Dasar 2A|3
WI2001|Pengenalan Rekayasa dan Desain|3
WI2003|Olah Raga|1
WI2004|Bahasa Inggris|2
WI2005|Bahasa Indonesia|2
`),
    3: rows(`
TK2101|Mikrobiologi|2
TK2102|Neraca Massa dan Energi|3
TK2103|Termodinamika Teknik Kimia|3
TK2104|Mekanika Fluida & Partikel|3
TK2105|Kimia dan Sintesis Organik|3
WI201X|Agama|2
WI2006|Kewarganegaraan|2
WI2002|Literasi Data dan Inteligensi Artifisial|2
`),
    4: rows(`
TK2201|Kimia Analitik & Fisik|3
TK2202|Teknik Reaksi Kimia I|3
TK2203|Operasi Perpindahan Kalor|3
TK2205|Matematika & Komputasi Proses|4
TK2204|Statistika dan Rancangan Percobaan|2
TK2001|Laboratorium Dasar Pengukuran dan Analisis|1
`),
    5: rows(`
TK3101|Proses Pemisahan|3
TK3102|Sistem Utilitas|3
TK3103|Pengantar Peristiwa Perpindahan|2
TK3104|Pengelolaan Lingkungan Industri & Ekonomi Sirkular|2
TK3001|Laboratorium Teknik Kimia I|2
`),
    6: rows(`
TK3201|Perancangan Produk Kimia|2
TK3202|Pengendalian Proses|3
TK3203|Ekonomi Teknik Kimia|2
WI2021|Manajemen Rekayasa Industri|2
TK3002|Laboratorium Teknik Kimia II|2
`),
    7: rows(`
TK4102|Keselamatan Pabrik Proses|3
TK4103|Rancangan dan Analisis Sistem Pemroses|4
TK4104|Proyek Rekayasa Interdisiplin|2
TK4101|Seminar Keprofesian Teknik Kimia|1
TK4091|Kerja Praktik|2
TK4092|Penelitian Teknik Kimia I|1
`),
    8: rows(`
TK4093|Penelitian Teknik Kimia II|3
TK4094|Perancangan Pabrik Teknik Kimia|5
TK4098|Asesmen Komprehensif|1
`),
  },
  // Teknik Informatika
  "135": {
    1: rows(`
WI1102|Berpikir Komputasional|2
MA1101|Matematika I|4
FI1101|Fisika Dasar I|3
KI1101|Kimia Dasar I|3
WI1101|Pancasila|2
WI1103|Pengantar Prinsip Keberlanjutan|2
WI1111|Laboratorium Fisika Dasar|1
WI1116|Laboratorium Interaksi Komputer|1
`),
    2: rows(`
WI2002|Literasi Data dan Inteligensi Artifisial|2
IF1220|Matematika Diskrit|3
IF1221|Logika Komputasional|2
IF1230|Organisasi dan Arsitektur Komputer|3
WI2001|Pengenalan Rekayasa dan Desain|3
WI2005|Bahasa Indonesia|2
IF1210|Algoritma dan Pemrograman 1|3
`),
    3: rows(`
IF2110|Algoritma dan Pemrograman 2|3
IF2120|Probabilitas dan Statistika|3
IF2123|Aljabar Linier dan Geometri|3
IF2130|Sistem Operasi|3
IF2150|Rekayasa Perangkat Lunak|4
WI2003|Olah Raga|1
IF2180|Sosio-informatika dan Profesionalisme|2
`),
    4: rows(`
IF2010|Pemrograman Berorientasi Objek|3
IF2211|Strategi Algoritma|3
IF2224|Teori Bahasa Formal dan Otomata|4
IF2230|Jaringan Komputer|3
IF2240|Basis Data|3
WI2022|Manajemen Proyek|2
`),
    5: rows(`
IF3110|Pengembangan Aplikasi Web|3
IF3130|Sistem Paralel dan Terdistribusi|3
IF3140|Sistem Basis Data|3
IF3141|Sistem Informasi|3
IF3151|Interaksi Manusia Komputer|3
IF3170|Inteligensi Artifisial|4
`),
    6: rows(`
IF3210|Pengembangan Aplikasi Piranti Bergerak|2
IF3250|Proyek Perangkat Lunak|4
IF3270|Pembelajaran Mesin|3
WI2004|Bahasa Inggris|2
IF3211|Komputasi Domain Spesifik|2
`),
    7: rows(`
WI201X|Agama|2
WI2006|Kewarganegaraan|2
IF4090|Kerja Praktik|2
IF4091|Penyusunan Proposal|2
`),
    8: rows(`
IF4092|Tugas Akhir|4
`),
  },
  // Teknik Fisika
  "133": {
    1: rows(`
MA1101|Matematika I|4
FI1101|Fisika Dasar I|3
KI1101|Kimia Dasar I|3
WI1101|Pancasila|2
WI1102|Berpikir Komputasional|2
WI1103|Pengantar Prinsip Keberlanjutan|2
WI1111|Laboratorium Fisika Dasar|1
WI1112|Laboratorium Kimia Dasar|1
`),
    2: rows(`
TF1201|Dasar Fisika Teknik|2
TF1202|Rangkaian Listrik|3
TF1203|Pengantar Struktur dan Sifat Material|2
WI2001|Pengenalan Rekayasa dan Desain|3
WI2002|Literasi Data dan Inteligensi Artifisial|2
WI2003|Olah Raga|1
WI2005|Bahasa Indonesia|2
MA2021|Matriks dan Ruang Vektor|3
`),
    3: rows(`
TF2101|Matematika Fisika I|3
TF2102|Probabilitas dan Statistik|3
TF2103|Komputasi Rekayasa|3
TF2104|Rekayasa Termal|3
TF2105|Elektronika Analog dan Digital|3
TF2106|Pengantar Biologi untuk Rekayasa|2
TF2107|Laboratorium Teknik Fisika I|2
`),
    4: rows(`
TF2201|Matematika Fisika II|3
TF2202|Dinamika Sistem|3
TF2203|Sains Data Rekayasa|3
TF2204|Mekanika Kontinum|3
TF2205|Medan Elektromagnetika|3
TF2206|Konversi Energi|3
TF2207|Laboratorium Teknik Fisika II|2
`),
    5: rows(`
TF3101|Kontrol Otomatik|3
TF3102|Mekanika Kuantum|3
TF3103|Rekayasa Optik|3
TF3104|Sistem Pengukuran|3
TF3105|Pemrosesan Sinyal|3
TF3106|Laboratorium Teknik Fisika III|2
WI2022|Manajemen Proyek|2
`),
    6: rows(`
TF3001|Tugas Perancangan Terintegrasi I|3
TF3002|Etika Profesi|2
TF3003|Praktisi Mengajar (Kapita Selekta)|2
WI2004|Bahasa Inggris|2
`),
    7: rows(`
TF4001|Tugas Perancangan Terintegrasi II|3
TF4002|Kerja Praktek|3
WI201X|Agama|2
WI2006|Kewarganegaraan|2
`),
    8: rows(`
TF4090|Tugas Akhir|3
`),
  },
  // Teknik Mesin
  "131": {
    1: rows(`
MA1101|Matematika I|4
FI1101|Fisika Dasar I|3
KI1101|Kimia Dasar I|3
WI1101|Pancasila|2
WI1102|Berpikir Komputasional|2
WI1103|Pengantar Prinsip Keberlanjutan|2
WI1111|Laboratorium Fisika Dasar|1
WI1112|Laboratorium Kimia Dasar|1
WF1100|Pengenalan Teknik Mesin, Material, dan Dirgantara|1
`),
    2: rows(`
WF1200|Gambar Teknik|2
WF1202|Statika Struktur|2
WI2005|Bahasa Indonesia|2
WI2003|Olah Raga|1
WI2001|Pengenalan Rekayasa dan Desain|3
MA1203|Matematika IIC (Rekayasa I)|4
FI1201|Fisika Dasar IIA|3
`),
    3: rows(`
MS2100|Pengenalan Teknik Mesin|2
WF2101|Mekanika Material|3
WF2102|Aljabar Linear dan Persamaan Diferensial|3
MS2103|Termodinamika Teknik|4
MS2104|Material Teknik|4
MS2105|Kinematika dan Dinamika|4
`),
    4: rows(`
MS2200|Desain dan Manufaktur 1|3
MS2201|Tugas Desain dan Manufaktur 1|2
WF2202|Persamaan Diferensial Parsial dan Metode Numerik|3
MS2203|Mekanika Fluida|4
MS2204|Mekatronika Dasar|4
WI2002|Literasi Data dan Inteligensi Artifisial|2
`),
    5: rows(`
MS3100|Desain dan Manufaktur 2|2
MS3101|Tugas Desain dan Manufaktur 2|2
WF3102|Statistika|2
MS3103|Perpindahan Panas dan Massa|4
MS3104|Getaran Mekanik|3
MS3105|Instrumentasi, Pengukuran, dan Eksperimen|2
WI2004|Bahasa Inggris|2
`),
    6: rows(`
MS3200|Desain dan Rekayasa Sistem Termofluida|3
MS3201|Kendali Sistem Dinamik|4
WI2006|Kewarganegaraan|2
WI2021|Manajemen Rekayasa Industri|2
BI1012|Biologi B|2
WI201X|Agama|2
`),
    7: rows(`
MS4000|Perancangan dan Purwarupa Produk Rekayasa|5
MS4090|Kerja Praktik|1
MS4091|Tugas Sarjana I|2
`),
    8: rows(`
MS4092|Tugas Sarjana 2 dan Ujian Komprehensif|3
`),
  },
};

/** Every course in the data above, by code: for search and for the SKS of catalog courses. */
const ALL: Map<string, CourseInfo> = new Map(
  [...SEM1_CORE, ...Object.values(SEM1_BY_FACULTY).flat(), ...Object.values(BY_PROGRAM).flatMap((p) => Object.values(p).flat())].map((c) => [c.code, c]),
);

export const curriculumCourses = (): CourseInfo[] => [...ALL.values()];
export const courseInfo = (code: string): CourseInfo | undefined => ALL.get(code);

/** Programs with data beyond semester 1, as Kurikulum 2024 codes. */
export const PROGRAMS_WITH_DATA = Object.keys(BY_PROGRAM);

/** "Ganjil" (August to December) or "Genap", and the academic year, e.g. "2026/2027 Ganjil". */
export function termLabel(now = new Date()) {
  const y = currentIntakeYear(now);
  return `${y}/${y + 1} ${now.getMonth() >= 7 ? "Ganjil" : "Genap"}`;
}

/**
 * Semester the student is in now (1 = first semester of the first year), from the NIM's entry year.
 * Without a NIM, only a TPB student's semester is known (first year).
 */
export function currentSemester(a: Academic, entryYear: number | null, now = new Date()): number | null {
  const odd = now.getMonth() >= 7;
  if (entryYear === null) return a.stage === "tpb" ? (odd ? 1 : 2) : null;
  const year = Math.max(0, currentIntakeYear(now) - entryYear);
  return year * 2 + (odd ? 1 : 2);
}

/**
 * The curriculum's courses for a semester. Uses the program (or, in TPB, the dream program) when we have
 * its data, else the faculty's semester 1. Empty when we don't know.
 */
export function curriculumFor(a: Academic, semester: number | null): CourseInfo[] {
  if (!semester) return [];
  const code = programCode(a.program);
  const own = code ? BY_PROGRAM[code]?.[semester] : undefined;
  if (own) return own;
  return semester === 1 ? SEM1_BY_FACULTY[a.faculty] ?? SEM1_CORE : [];
}
