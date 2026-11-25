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
   - **Microsoft**, untuk akun ITB (ITB memakai Microsoft 365). Butuh pendaftaran app di tenant Microsoft milik sendiri, lihat [Login akun ITB (Microsoft)](#login-akun-itb-microsoft).
   - **Google → Enable**, pilih support email, Save. Dipakai tamu (mis. juri), lihat [Daftar email tamu](#daftar-email-tamu).
3. **Build → Firestore Database → Create database** → lokasi `asia-southeast2 (Jakarta)` → **Start in production mode**.
   Lalu buka tab **Rules**, ganti isinya dengan isi file [`firestore.rules`](../firestore.rules), klik **Publish**.
   Setiap kali `firestore.rules` berubah, **publish ulang** dengan isi terbaru.
4. **Storage tidak perlu diaktifkan.** File (PDF, .tex, .md, .txt) diproses di browser; yang disimpan hanya teks Markdown + LaTeX hasilnya di Firestore. File asli (PDF/gambar) bisa ikut disimpan sebagai lampiran di Google Drive tim, lihat [Lampiran file di Google Drive](#lampiran-file-di-google-drive) (opsional).
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
3. **Route server** (`/api/generate-quiz`, `/api/to-markdown`, `/api/attachments`): server memeriksa token login Firebase (tanda tangan Google, project, masa berlaku), lalu akun ITB atau daftar tamu. Jadi kuota Gemini dan Google Drive tim tidak bisa dipakai orang luar. Tidak perlu env var baru.

### Login akun ITB (Microsoft)
Mahasiswa ITB tidak bisa mendaftarkan app di tenant Microsoft ITB (halaman Entra menolak dengan "You don't have access", error 401). Jadi app didaftarkan di **tenant Microsoft milik sendiri** sebagai app *multi-tenant*, lalu Peerseus meminta login langsung ke tenant ITB (`ITB_MICROSOFT_TENANT` di `src/lib/access.ts`). Login hanya meminta izin dasar (`openid`, `email`, `profile`), tanpa akses ke email atau file.

**A. Ambil callback URL dari Firebase**
1. Firebase Console → **Authentication → Sign-in method → Add new provider → Microsoft**. Aktifkan, lalu salin **callback URL** yang tertera (bentuknya `https://<project>.firebaseapp.com/__/auth/handler`). Biarkan tab ini terbuka.

**B. Buat tenant Microsoft sendiri** (sekali saja)

Akun Microsoft pribadi saja belum cukup untuk mendaftarkan app; harus punya tenant (directory) sendiri. Tenant dibuat otomatis saat mendaftar Azure:
1. Siapkan akun Microsoft **pribadi** (outlook.com/hotmail, atau buat baru di https://signup.live.com). Jangan pakai akun ITB di langkah ini, supaya tenantnya bukan tenant ITB.
2. Buka jendela **incognito/private**, lalu https://azure.microsoft.com/free/students (Azure for Students, tanpa kartu kredit). Login dengan akun pribadi tadi, lalu verifikasi status mahasiswa dengan email ITB kalau diminta.
   - Kalau Azure for Students menolak, pakai https://azure.microsoft.com/free (Azure free account). Ini meminta verifikasi kartu kredit/debit, tapi app registration sendiri gratis.
3. Setelah selesai, buka https://entra.microsoft.com dengan akun pribadi itu. Di pojok kanan atas harus tertulis directory baru (mis. "Default Directory"), bukan "Institut Teknologi Bandung" atau "Microsoft Services".

**C. Daftarkan app**
1. Di Entra (tenant pribadi): **App registrations → New registration** (cari "App registrations" di kotak pencarian kalau menunya tidak terlihat).
   - Name: `Peerseus`
   - Supported account types: **Multiple Entra ID tenants** (di tampilan lama: *Accounts in any organizational directory - Multitenant*). Jangan pilih yang menyertakan *Personal Microsoft accounts*.
   - Redirect URI: platform **Web**, isi callback URL dari langkah A.
   - Klik **Register**.
2. Salin **Application (client) ID**.
3. **Certificates & secrets → Client secrets → New client secret** (mis. berlaku 12 bulan) → salin kolom **Value** (bukan Secret ID). Nilai ini hanya muncul sekali.
4. (Opsional) **Branding & properties**: isi nama dan logo supaya layar izin Microsoft terlihat jelas.

**D. Sambungkan ke Firebase**
1. Kembali ke tab Firebase: isi **Application ID** dan **Application secret**, klik **Save**.
2. Buka situs, klik **Masuk dengan akun ITB**, login dengan akun `@mahasiswa.itb.ac.id`.

**E. Yang mungkin muncul saat login pertama**
- **Layar izin ("Permissions requested")** dengan label *unverified*: klik **Accept**. Ini normal untuk app yang belum diverifikasi Microsoft.
- **"Need admin approval" / "Approval required"**: ITB tidak mengizinkan mahasiswa menyetujui app dari luar ITB. Kalau ada kolom alasan dan tombol **Request approval**, isi dan kirim; permintaan masuk ke admin ITB. Kalau tidak, hanya admin ITB yang bisa membukanya. Sementara itu, tim dan juri tetap bisa masuk sebagai tamu lewat Google.
- **`AADSTS50011` (redirect URI mismatch)**: redirect URI di app tidak sama persis dengan callback URL Firebase.
- **`AADSTS700016` / `AADSTS50194`**: tipe akun app bukan multi-tenant. Ubah di **Authentication → Supported account types**.
- **`AADSTS7000215` (invalid client secret)**: yang ditempel di Firebase adalah Secret ID, bukan Value, atau secret sudah kedaluwarsa.

Catatan keamanan: karena app multi-tenant, pembatasan ke tenant ITB dilakukan oleh parameter login di browser, dan Firebase tidak menandai email Microsoft sebagai terverifikasi. Untuk demo hackathon ini cukup; untuk pemakaian sungguhan, app sebaiknya didaftarkan oleh admin ITB sebagai single tenant di tenant ITB. Akun `std.stei.itb.ac.id` ada di tenant Microsoft lain, jadi pemiliknya masuk dengan akun `@mahasiswa.itb.ac.id`.

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

## Lampiran file di Google Drive
Opsional. Kalau diaktifkan, form upload materi punya kolom **"Lampiran file asli"**: PDF atau gambar (PNG, JPG, WebP) maksimal 10 MB. File-nya masuk ke satu folder di Google Drive **akun Gmail tim**, lalu tampil sebagai pratinjau di halaman materi. Pengguna tidak perlu login Google, jadi akun ITB (Microsoft) tetap bisa upload. Kalau env di bawah kosong, kolom lampiran tidak muncul dan app tetap jalan seperti biasa.

Kenapa pakai akun Gmail, bukan service account: service account tidak punya kuota penyimpanan Drive sendiri. Jadi server bertindak sebagai akun tim lewat *refresh token*. Izin yang diminta hanya `drive.file`, artinya app **hanya bisa melihat file dan folder yang dibuatnya sendiri**, bukan isi Drive tim yang lain.

Total sekitar 10 menit. Semua langkah pakai **akun Gmail tim** (bukan akun ITB).

**A. Buat project Google Cloud**
1. Buka https://console.cloud.google.com dan login dengan Gmail tim. Kalau diminta, setujui Terms of Service.
2. Klik pemilih project di kiri atas → **New project** → nama `peerseus-drive` → **Create**. Pastikan project itu yang terpilih.
3. Cari **"Google Drive API"** di kotak pencarian atas → buka → **Enable**.

**B. Layar izin OAuth**
1. Menu kiri **Google Auth Platform** (atau cari "OAuth consent screen") → **Get started**.
2. App name `Peerseus`, User support email = Gmail tim → Next. Audience: **External** → Next. Contact email = Gmail tim → Next. Centang persetujuan → **Create**.
3. Buka **Audience** → klik **Publish app** → **Confirm**, sampai statusnya **In production**.
   Ini penting: selama status masih *Testing*, refresh token kedaluwarsa setelah 7 hari dan upload akan berhenti jalan. Scope `drive.file` tidak butuh verifikasi Google, jadi publish langsung berlaku.

**C. Buat OAuth client**
1. **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**, nama `Peerseus Drive`.
3. **Authorized redirect URIs → Add URI**: `https://developers.google.com/oauthplayground`
4. **Create**, lalu salin **Client ID** dan **Client secret** (simpan, secret mungkin hanya ditampilkan sekali).

**D. Ambil refresh token**
1. Buka https://developers.google.com/oauthplayground
2. Klik ikon ⚙️ di kanan atas → centang **Use your own OAuth credentials** → tempel Client ID dan Client secret dari langkah C → tutup panel.
3. Di kiri (Step 1), kotak **"Input your own scopes"**, ketik persis: `https://www.googleapis.com/auth/drive.file` → **Authorize APIs**.
4. Login dengan **Gmail tim** → **Continue/Allow**. Kalau muncul "Google hasn't verified this app", klik **Advanced → Go to Peerseus**; ini app milik tim sendiri.
5. Kembali di Playground (Step 2): klik **Exchange authorization code for tokens** → salin **Refresh token** (diawali `1//`).

**E. Isi env di Vercel**
1. Vercel → project → **Settings → Environment Variables**, tambahkan:

   | Env var | Isi |
   | --- | --- |
   | `GOOGLE_DRIVE_CLIENT_ID` | Client ID (langkah C) |
   | `GOOGLE_DRIVE_CLIENT_SECRET` | Client secret (langkah C) |
   | `GOOGLE_DRIVE_REFRESH_TOKEN` | Refresh token (langkah D) |

2. **Deployments → ⋯ → Redeploy**, supaya env baru terbaca.

**F. Coba**
1. Buka situs → mata kuliah mana pun → **Upload materi**. Kolom **"Lampiran file asli (opsional)"** sekarang muncul di bawah editor. Memilih PDF di tab "Upload PDF" otomatis mengisinya.
2. Simpan. Halaman materi menampilkan pratinjau PDF dan tautan **"Buka di Google Drive"**.
3. Di Google Drive tim muncul folder **Peerseus Lampiran** (dibuat otomatis saat upload pertama). Jangan dihapus atau diganti nama; kalau tidak ketemu, app membuat folder baru dengan nama itu.

Yang perlu diketahui:
- File lampiran bisa dibuka **siapa pun yang punya link-nya** (tanpa login), supaya pratinjau jalan untuk akun ITB. Karena itu **materi privat tidak memakai Drive tim**. Di materi privat, kolomnya berganti jadi "Link file di Google Drive-mu": pengguna upload sendiri ke Drive pribadinya dengan akses **Dibatasi (Restricted)**, lalu menempel link-nya. Saat materi dijadikan privat, lampiran di Drive tim dihapus; saat dijadikan publik, link Drive pribadi dilepas. Link pribadi ini tidak butuh env apa pun.
- Mengganti atau menghapus lampiran lewat **Edit materi** juga menghapus file lamanya dari Drive.
- Kuota Drive gratis 15 GB, dipakai bersama Gmail dan Foto akun tim.
- File dikirim langsung dari browser ke Google Drive (tidak lewat Vercel, yang membatasi 4,5 MB per request). Server hanya membuka sesi upload lalu membagikan file-nya.
- `GOOGLE_DRIVE_FOLDER_ID` (opsional) memaksa folder tertentu, tapi harus folder yang dibuat app ini sendiri (karena izin `drive.file`). Biasanya tidak perlu diisi.

## Masalah umum
- **Login popup langsung tertutup / `unauthorized-domain`**: langkah 4.4 belum dilakukan.
- **"Akun ini belum punya akses..."** setelah login: akun yang dipilih bukan akun ITB dan emailnya tidak ada di daftar tamu (cek huruf kecil dan ejaannya).
- **"Cara login ini belum diaktifkan di Firebase"**: provider Microsoft atau Google belum di-enable (langkah 2.2).
- **Popup Microsoft menampilkan `AADSTS...`**: lihat daftar error di [Login akun ITB (Microsoft)](#login-akun-itb-microsoft), bagian E.
- **Akun yang diizinkan tetap ditolak dengan `Missing or insufficient permissions`**: rules Firestore belum di-publish ulang dengan versi terbaru (langkah 2.3).
- **`Missing or insufficient permissions`**: rules Firestore belum di-publish (langkah 2.3).
- **Kuis jadi "isian kalimat"** atau **PDF tidak dirapikan AI**: `GEMINI_API_KEY` belum terisi di Vercel. Setelah menambah env, lakukan **Redeploy**.
- **"Kuota AI per menit habis, menunggu sebentar..."**: batas per menit tier gratis. Prosesnya menunggu dan lanjut sendiri, lalu pindah ke model cadangan kalau masih gagal. Kalau ada halaman yang tetap gagal, klik nomornya untuk mengulang halaman itu saja. Log Vercel mencatat `[gemini] task=… model=…` beserta pesan error asli Gemini.
- **Kolom "Lampiran file asli" tidak muncul**: env `GOOGLE_DRIVE_*` belum terisi semua, atau belum Redeploy setelah menambahkannya.
- **"Server gagal masuk ke Google Drive tim"**: refresh token salah, dicabut, atau kedaluwarsa (app OAuth masih *Testing*). Publish app (langkah B.3), ambil refresh token baru (langkah D), ganti env, Redeploy.
- **"Google Drive menolak upload" / upload terputus**: coba sekali lagi. Kalau selalu gagal, buka DevTools → Console dan kirim error-nya; log Vercel mencatat `[drive] ...` dengan pesan asli Google.
- **Mau mulai dari data kosong lagi**: hapus collection di Firestore (termasuk `meta`), lalu login ulang.
