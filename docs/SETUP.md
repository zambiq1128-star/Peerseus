# Setup Firebase, Gemini, dan deploy ke Vercel

Total sekitar 15 menit. Semua langkah gratis (Spark plan + Vercel Hobby).

## 1. Gemini API key
1. Buka https://aistudio.google.com/apikey → **Create API key**.
2. Simpan key-nya, nanti dipakai sebagai `GEMINI_API_KEY`.
3. Model per tugas (tier gratis punya batas per menit per model, jadi tugasnya dipisah):
   - `GEMINI_MODEL`: membuat kuis, mis. `gemini-3.8-flash` (5 RPM).
   - `GEMINI_PDF_MODEL`: membaca halaman PDF dan "Rapikan dengan AI", mis. `gemini-3.5-flash-lite` (15 RPM). Kosong = pakai `GEMINI_MODEL`.
   - `GEMINI_PDF_RPM` (opsional): batas per menit model PDF, untuk jeda antar halaman. Default 15.
   - `GEMINI_FALLBACK_MODEL`: cadangan semua tugas, mis. `gemini-3.1-flash-lite`. Dipakai setelah 3 kali gagal karena limit/sibuk, atau langsung kalau model utama tidak ada (404).

## 2. Firebase
1. Buka https://console.firebase.google.com → **Create a project** (mis. `peerseus`). Google Analytics boleh dimatikan.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, pilih support email, Save.
3. **Build → Firestore Database → Create database** → lokasi `asia-southeast2 (Jakarta)` → **Start in production mode**.
   Lalu buka tab **Rules**, ganti isinya dengan isi file [`firestore.rules`](../firestore.rules), klik **Publish**.
4. **Storage tidak perlu diaktifkan.** File (PDF, .tex, .md, .txt) diproses di browser; yang disimpan hanya teks Markdown + LaTeX hasilnya di Firestore.
5. **Project settings (ikon ⚙️) → General → Your apps → ikon `</>` (Web)** → daftarkan app (tanpa Hosting).
   Salin nilai dari `firebaseConfig` ke env:

   | firebaseConfig | Env var |
   | --- | --- |
   | apiKey | `NEXT_PUBLIC_FIREBASE_API_KEY` |
   | authDomain | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
   | projectId | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
   | storageBucket | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (boleh diisi atau dikosongkan, tidak dipakai) |
   | messagingSenderId | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
   | appId | `NEXT_PUBLIC_FIREBASE_APP_ID` |

## 3. Coba di laptop (opsional)
```bash
cp .env.example .env.local   # isi semua nilai di atas + GEMINI_API_KEY
npm install
npm run dev
```

## 4. Deploy ke Vercel
1. Buka https://vercel.com/new → login dengan GitHub → **Import** repo `Peerseus`.
2. Framework otomatis terdeteksi Next.js. Buka **Environment Variables**, isi semua env di atas plus `GEMINI_API_KEY`.
3. Klik **Deploy**. Setelah selesai kamu dapat domain seperti `peerseus.vercel.app`.
4. Balik ke Firebase: **Authentication → Settings → Authorized domains → Add domain** → isi domain Vercel tadi. Tanpa ini, login Google akan gagal (`auth/unauthorized-domain`).
5. Login pertama kali akan mengisi data awal (mata kuliah, teman demo, kuis contoh, info akademik contoh).

Setiap push ke `main` otomatis di-deploy ulang oleh Vercel.

## Masalah umum
- **Login popup langsung tertutup / `unauthorized-domain`**: langkah 4.4 belum dilakukan.
- **`Missing or insufficient permissions`**: rules Firestore belum di-publish (langkah 2.3).
- **Kuis jadi "isian kalimat"** atau **PDF tidak dirapikan AI**: `GEMINI_API_KEY` belum terisi di Vercel. Setelah menambah env, lakukan **Redeploy**.
- **"Kuota AI per menit habis, menunggu sebentar..."**: batas per menit tier gratis. Prosesnya menunggu dan lanjut sendiri, lalu pindah ke model cadangan kalau masih gagal. Kalau ada halaman yang tetap gagal, klik nomornya untuk mengulang halaman itu saja. Log Vercel mencatat `[gemini] task=… model=…` beserta pesan error asli Gemini.
- **Mau mulai dari data kosong lagi**: hapus collection di Firestore (termasuk `meta`), lalu login ulang.
