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
2. **Build → Authentication → Get started → Sign-in method**:
   - **Microsoft**, untuk akun ITB (ITB memakai Microsoft 365). Butuh pendaftaran app di Microsoft Entra, lihat [Login akun ITB (Microsoft)](#login-akun-itb-microsoft).
   - **Google → Enable**, pilih support email, Save. Dipakai tamu (mis. juri), lihat [Daftar email tamu](#daftar-email-tamu).
3. **Build → Firestore Database → Create database** → lokasi `asia-southeast2 (Jakarta)` → **Start in production mode**.
   Lalu buka tab **Rules**, ganti isinya dengan isi file [`firestore.rules`](../firestore.rules), klik **Publish**.
   Setiap kali `firestore.rules` berubah, **publish ulang** dengan isi terbaru.
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
4. Balik ke Firebase: **Authentication → Settings → Authorized domains → Add domain** → isi domain Vercel tadi. Tanpa ini, login akan gagal (`auth/unauthorized-domain`).
5. Login pertama kali akan mengisi data awal (mata kuliah, teman demo, kuis contoh, info akademik contoh).

Setiap push ke `main` otomatis di-deploy ulang oleh Vercel.

## Akses khusus akun ITB
Kalau Firebase aktif, Peerseus hanya bisa dipakai oleh:
1. **Akun ITB**: email `itb.ac.id` atau subdomainnya (`mahasiswa.itb.ac.id`, dan lain-lain), login lewat **Microsoft** (tombol "Masuk dengan akun ITB"). Akun Google yang dibuat dengan email ITB dan sudah terverifikasi juga diterima.
2. **Tamu** yang emailnya ada di daftar tamu, login lewat **Google** (tautan "Masuk dengan Google").

Ada tiga lapis pengecekan, dengan aturan yang sama:
1. **Browser** (`src/lib/auth.tsx`): setelah login, akun yang tidak diizinkan langsung di-logout dan diberi pesan.
2. **Firestore rules** (`firestore.rules`): setiap baca/tulis data ditolak kalau token login bukan akun ITB atau tamu terdaftar. Ini pengaman utamanya.
3. **Route AI** (`/api/generate-quiz`, `/api/to-markdown`): server memeriksa token login Firebase (tanda tangan Google, project, masa berlaku), lalu akun ITB atau daftar tamu. Jadi kuota Gemini tidak bisa dipakai orang luar. Tidak perlu env var baru.

### Login akun ITB (Microsoft)
Firebase menandai email dari Microsoft sebagai "belum terverifikasi". Karena itu, keamanan cek domain bergantung pada app Microsoft yang **hanya menerima tenant ITB**. Cara paling aman: daftarkan app di tenant ITB sendiri (single tenant).

1. Di Firebase Console: **Authentication → Sign-in method → Add new provider → Microsoft**. Aktifkan, lalu salin **callback URL** yang tertera, bentuknya `https://<project>.firebaseapp.com/__/auth/handler`. Biarkan tab ini terbuka.
2. Buka https://entra.microsoft.com, login dengan **akun ITB** kamu.
3. **App registrations → New registration** (cari "App registrations" di kotak pencarian atas kalau menunya tidak terlihat):
   - Name: `Peerseus`
   - Supported account types: **Accounts in this organizational directory only (Institut Teknologi Bandung only - Single tenant)**
   - Redirect URI: platform **Web**, isi callback URL dari langkah 1.
   - Klik **Register**.
4. Di halaman app: salin **Application (client) ID**.
5. **Certificates & secrets → Client secrets → New client secret** (mis. berlaku 6 bulan) → salin kolom **Value** (bukan Secret ID). Nilai ini hanya muncul sekali.
6. Kembali ke Firebase: isi **Application ID** dan **Application secret**, klik **Save**.
7. Coba "Masuk dengan akun ITB" di situs.

Kemungkinan hambatan dari pengaturan ITB:
- **Tidak bisa membuat app registration** ("You do not have access" atau tombol New registration nonaktif): ITB mematikan pendaftaran app oleh pengguna. Pilihannya: minta Direktorat TI ITB mendaftarkannya, atau daftarkan app dari akun Microsoft pribadi dengan tipe **Accounts in any organizational directory (Multitenant)**. Cara kedua lebih lemah: aplikasi tetap meminta login di tenant ITB, tapi orang yang sengaja mengakali alur login dengan tenant Microsoft lain secara teori bisa memakai email palsu berdomain ITB.
- **"Need admin approval" / "Perlu persetujuan admin"** saat login: ITB tidak mengizinkan mahasiswa menyetujui aplikasi sendiri. Ini hanya bisa dibuka oleh admin ITB (admin consent). Sambil menunggu, tim dan juri bisa masuk sebagai tamu lewat Google.

Tenant ITB (`itb.ac.id` dan `mahasiswa.itb.ac.id`) sudah tertulis di kode sebagai `ITB_MICROSOFT_TENANT` di `src/lib/access.ts`. Akun `std.stei.itb.ac.id` ada di tenant Microsoft lain, jadi pemiliknya masuk dengan akun `@mahasiswa.itb.ac.id`.

### Daftar email tamu
Untuk juri atau tamu tanpa akun ITB. Tidak perlu deploy ulang; perubahan langsung berlaku.

1. Firebase Console → **Firestore Database → Data → Start collection**.
2. Collection ID: `config` → Next.
3. Document ID: `access`.
4. Field: `guestEmails`, type **array**. Tambah satu item per email (type **string**), mis. `juri1@gmail.com`. Tulis **huruf kecil semua**, tanpa spasi.
5. **Save**.

Menambah atau menghapus tamu nanti: buka `config → access`, edit array `guestEmails`. Tamu login lewat **"Masuk dengan Google"** dengan akun Google yang emailnya persis sama. Daftar ini hanya bisa diubah dari Console, tidak dari aplikasi.

Catatan:
- Orang yang mencoba login tanpa izin tetap tercatat di **Authentication → Users** (Firebase membuat akunnya sebelum aplikasi sempat menolak), tapi tidak bisa membaca atau menulis apa pun. Boleh dihapus manual.
- **Mode demo lokal** (tanpa env Firebase) tidak punya login sama sekali, jadi pembatasan ini tidak berlaku di sana. Untuk situs publik, pastikan env Firebase terisi.
- Mengganti domain yang diizinkan: ubah regex di `src/lib/access.ts`, `firestore.rules`, dan `storage.rules` bersamaan, lalu publish ulang rules.

## Masalah umum
- **Login popup langsung tertutup / `unauthorized-domain`**: langkah 4.4 belum dilakukan.
- **"Akun ini belum punya akses..."** setelah login: akun yang dipilih bukan akun ITB dan emailnya tidak ada di daftar tamu (cek huruf kecil dan ejaannya).
- **"Cara login ini belum diaktifkan di Firebase"**: provider Microsoft atau Google belum di-enable (langkah 2.2).
- **Popup Microsoft menampilkan `AADSTS...`**: biasanya redirect URI di Entra tidak sama persis dengan callback URL Firebase, atau client secret salah/kedaluwarsa.
- **Akun yang diizinkan tetap ditolak dengan `Missing or insufficient permissions`**: rules Firestore belum di-publish ulang dengan versi terbaru (langkah 2.3).
- **`Missing or insufficient permissions`**: rules Firestore belum di-publish (langkah 2.3).
- **Kuis jadi "isian kalimat"** atau **PDF tidak dirapikan AI**: `GEMINI_API_KEY` belum terisi di Vercel. Setelah menambah env, lakukan **Redeploy**.
- **"Kuota AI per menit habis, menunggu sebentar..."**: batas per menit tier gratis. Prosesnya menunggu dan lanjut sendiri, lalu pindah ke model cadangan kalau masih gagal. Kalau ada halaman yang tetap gagal, klik nomornya untuk mengulang halaman itu saja. Log Vercel mencatat `[gemini] task=… model=…` beserta pesan error asli Gemini.
- **Mau mulai dari data kosong lagi**: hapus collection di Firestore (termasuk `meta`), lalu login ulang.
