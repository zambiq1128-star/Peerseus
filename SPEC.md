# Spesifikasi Peerseus

Dasar dokumen ini adalah app yang sudah berjalan. Nama route, koleksi Firestore, dan field di bawah mengikuti kode (`src/lib/types.ts`, `src/lib/peerseus.ts`, `firestore.rules`). Jangan ganti nama atau strukturnya. Fitur baru memakai pola yang sama.

Bagian "Belum ada" berisi fitur dari daftar awal yang belum dibangun, diurutkan dari yang paling penting untuk demo.

## 1. Akses dan login

- **Akun ITB**: login Microsoft (Microsoft 365 ITB, tenant ITB) dengan email `itb.ac.id` atau subdomainnya, mis. `NIM@mahasiswa.itb.ac.id`.
- **Tamu** (mis. juri): login Google dengan email terverifikasi yang ada di `config/access.guestEmails`. Daftar ini diubah di Firebase Console.
- Selain itu ditolak. Aturan yang sama dicek di app (`src/lib/access.ts`), di `firestore.rules` untuk setiap baca/tulis, dan di route server AI dan lampiran (`src/lib/serverAuth.ts`).
- Tanpa env Firebase, app jalan di **mode demo lokal** (localStorage + teman demo).

## 2. Model data (Firestore)

| Koleksi / dokumen | Isi |
| --- | --- |
| `users/{uid}` | `name`, `major` (kode fakultas, mis. STEI), `stage` (`tpb` atau `jurusan`), `program` (prodi), `dreamProgram` (prodi incaran saat TPB, tidak pernah bersamaan dengan `program`), `semester`, `entryYear` (angkatan), `year` (lama, tidak dipakai), `bio`, `contact`, `isPublic` (tampil di rekomendasi teman belajar), `privacy` (`showProgram`, `showEntryYear`, `showContact`; kosong = tampil), `isItbVerified` (akun ITB = true, tamu = false), `isBot`, `courseIds[]`, `createdAt` |
| `users/{uid}/private/profile` | Field profil yang disembunyikan pemiliknya (`program`, `dreamProgram`, `entryYear`, `contact`). Hanya bisa dibaca dan ditulis pemiliknya |
| `courses/{id}` | `code`, `name`, `description`, `sks`. `id` = kode huruf kecil, mis. `if2110`. Diisi dari `src/lib/seed.ts` dan dari Kurikulum 2024 (`src/lib/curriculum.ts`) saat mahasiswa memilih mata kuliah |
| `memberships/{courseId}_{uid}` | Mata kuliah yang diikuti: `courseId`, `uid`, `name`, `major`, `isBot`, `left`, `elo`, `wins`, `losses`, `draws`, `topicStats{topik: {correct, total}}`. `name` dan `major` hanya salinan saat bergabung; peringkat, lawan duel, dan teman belajar memakai nama dan fakultas terbaru dari `users`, dan anggota yang dokumen `users`-nya sudah dihapus tidak ditampilkan (`courseMembers`). |
| `materials/{id}` | `courseId`, `title`, `type` (`materi`, `catatan`, `paper`; kosong = `materi`), `description`, `topics[]`, `text` (Markdown + LaTeX), `format`, `attachment` (file asli di Google Drive tim: `driveFileId`, `name`, `mimeType`, `size`; kosong/`null` = tanpa lampiran), `fileUrl`, `fileName`, `mimeType` (lama, tidak diisi lagi), `uploaderId`, `uploaderName`, `createdAt`, `updatedAt`, `reports`. Hanya materi publik |
| `privateMaterials/{id}` | Materi privat (Materiku): field sama dengan `materials` plus `isPublic: false`, tanpa `attachment`. Hanya bisa dibaca dan ditulis pengunggahnya. Id tetap sama saat dipindah dari/ke `materials` |
| `quizzes/quiz_{materialId}` | `materialId`, `courseId`, `title`, `status` (`draft` atau `published`), `questions[]`, `createdBy`, `createdAt`, `generator` (`gemini`, `fallback`, `seed`), `reports` |
| `duels/{id}` | `courseId`, `quizId`, `quizTitle`, `challengerId/Name`, `opponentId/Name`, `opponentIsBot`, `status` (`pending`, `completed`, `declined`), `questions[]`, `challenger`, `opponent` (jawaban, waktu, skor), `winnerId` (`null` = seri), `eloChange`, `participants[]`, `createdAt` |
| `opportunities/{id}` (tidak dipakai halaman mana pun sejak Info dihapus) | `title`, `type` (`beasiswa`, `lomba`, `seminar`, `lainnya`), `organizer`, `majors[]` (kosong = semua fakultas), `deadline` (YYYY-MM-DD), `link`, `description`, `postedBy`, `createdAt` |
| `config/access` | `guestEmails[]`. Hanya bisa diubah di console |
| `meta/seed` | Versi data contoh |

File tidak disimpan di Firebase Storage. PDF dan file lain diubah jadi teks Markdown + LaTeX di browser, dan teks itu yang disimpan (dipakai untuk kuis). File asli (PDF atau gambar, maks. 10 MB) bisa ikut disimpan sebagai **lampiran** di satu folder Google Drive akun Gmail tim lewat `/api/attachments` (`src/lib/drive.ts`): browser mengirim file langsung ke Drive, server memeriksa akun ITB/tamu, tipe, dan ukuran, lalu membagikan file "siapa pun yang punya link". Karena itu materi privat tidak boleh punya lampiran. Setup di `docs/SETUP.md`.

### Daftar awal → nama di app

| Daftar awal | Di app |
| --- | --- |
| `username`, `jurusan`, `angkatan` | `name`, `major` + `stage` + `program`/`dreamProgram`, `entryYear` |
| `socials{}` | `contact` (satu teks, mis. LINE / IG / WA) |
| `users/{uid}/enrolledCourses/{code}` | `memberships/{courseId}_{uid}` + `users.courseIds` |
| `repository/{id}`, `tipe` | `materials/{id}` (repositori bersama per mata kuliah), `type` |
| `courses/{code}` + `data/courses.json` | `courses/{id}` + `src/lib/seed.ts` + `src/lib/curriculum.ts`. Tidak ada field fakultas karena kurikulum disimpan per prodi |
| `duels.players[]`, `winnerUid` | `participants[]`, `winnerId` |
| `posts/{id}` | `opportunities/{id}` |

## 3. Alur halaman

Navigasi hanya tiga: **Mata Kuliah** (`/`), **Duel** (`/duels`), **Jelajah** (`/explore`). Profil dan keluar ada di bawah nama pengguna.

1. **Masuk** (layar di `Shell`, muncul di route mana pun selama belum login): "Masuk dengan akun ITB" (Microsoft) atau "Masuk dengan Google" untuk tamu.
2. **Data diri** (layar yang sama): nama, fakultas, TPB/jurusan, prodi atau prodi incaran. Untuk akun ITB diisi otomatis dari NIM di email dan tetap bisa diubah.
3. `/courses`: **Mata Kuliah**. Pengguna baru diarahkan ke sini. Semester ditebak dari NIM, mata kuliah semester ini diisi dari Kurikulum 2024, bisa dihapus, dan ada pencarian untuk menambah. Mata kuliah yang dihapus menyimpan ratingnya.
4. `/`: **Mata kuliahku**. Daftar mata kuliah dengan rating, tantangan duel yang menunggu jawaban, 5 materi terbaru dari mata kuliahku (dengan tanda kuis siap duel), dan mata kuliah lain untuk digabung.
5. `/courses/[id]`: tab Materi (dengan filter jenis: Materi, Catatan, Past paper), Peringkat, Teman belajar. Tombol "Upload materi" dan "Mulai duel".
6. `/courses/[id]/upload`: upload materi (PDF, .tex, .md, .txt, atau tempel teks) dan pilih jenisnya, diubah per halaman jadi Markdown + LaTeX dengan Gemini. Lampiran file asli opsional (PDF/gambar ke Google Drive tim); PDF yang dipilih di tab "Upload PDF" otomatis jadi lampiran dan bisa dihapus.
7. `/materials`: **Materiku**, semua materi yang aku upload (publik dan privat) dari semua mata kuliah, dengan filter dan tombol edit. Jadi tab kedua di Jelajah ("Semua materi" | "Materiku"), dan menu Jelajah aktif di sini.
8. `/materials/[id]`: baca materi, dengan pratinjau lampiran (iframe Google Drive) di atas teksnya. Materi privat hanya terbuka untuk pengunggahnya dan tidak bisa dibuat kuis. Uploader membuat kuis (Gemini, 8 soal pilihan ganda), mengecek, lalu mempublikasikan. Ada tombol lapor materi/kuis. Edit di `/materials/[id]/edit`.
9. `/duel/new?course=…|quiz=…&opponent=…`: pilih kuis dan lawan. Lawan diurutkan dari rating terdekat dan yang terdekat dipilih otomatis, jadi duel bisa dimulai dengan satu klik.
10. `/duel/[id]`: main (6 soal acak, 20 detik per soal), lalu hasil: skor, perubahan rating, topik yang salah, dan teman belajar yang kuat di topik itu.
11. `/duels`: tantangan masuk dan riwayat duel.
12. `/explore`: **Jelajah materi**. Semua materi publik dari semua mata kuliah (hanya koleksi `materials`, tidak pernah `privateMaterials`), terbaru dulu. Cari berdasarkan judul, topik, mata kuliah, atau pengunggah, filter jenis (Materi, Catatan, Past paper), dan feed kartu yang bisa di-scroll dengan "Muat lebih banyak". Tab "Materiku" di atasnya membuka `/materials`. Menggantikan halaman Info (`/opportunities`), yang dihapus; koleksi `opportunities` dan seed-nya dibiarkan tapi tidak dipakai halaman mana pun.
13. `/profile`: nama, fakultas/prodi, bio, kontak, pengaturan "Yang bisa dilihat orang lain" (prodi, kontak, tampil di rekomendasi), keluar.
14. `/users/[id]`: profil seseorang seperti dilihat orang lain: nama, fakultas/prodi, semester, bio, kontak (yang tidak disembunyikan), mata kuliah dengan rating, dan materi yang dibagikan. Nama di tab Peringkat dan Teman belajar menaut ke sini.

## 4. Aturan yang berlaku sekarang

- **Duel** berjalan bergantian: penantang menjawab dulu, lawan menjawab soal yang sama nanti. Teman demo menjawab otomatis sesuai akurasi topiknya.
- **Pemenang duel**: skor lebih tinggi menang. Skor sama, total waktu lebih cepat menang (selisih > 0,5 detik). Selain itu seri.
- **Elo** per mata kuliah, K = 32, mulai dari 1000 (`src/lib/elo.ts`).
- **Skor teman belajar**: `0,6 × akurasi dia di topik lemahku + 0,3 × kedekatan Elo + 0,1 × fakultas sama`. Pengguna dengan `isPublic = false` tidak direkomendasikan.
- **firestore.rules**: profil (`users/{uid}`) hanya bisa ditulis pemiliknya, dan bagian privatnya hanya bisa dibaca pemiliknya (bagian 6). Data lain bisa dibaca dan ditulis semua pengguna yang diizinkan, kecuali `config`.

## 5. Belum ada

Diurutkan dari yang paling penting untuk demo. Ukuran: **Kecil** (beberapa jam), **Sedang** (sekitar setengah hari), **Besar** (sehari atau lebih).

### Prioritas untuk demo

1. ~~**Jenis materi dan past paper**~~ (sudah dibuat)
   - `Material.type?: "materi" | "catatan" | "paper"` (`MaterialType`). Kosong dianggap `"materi"` (`materialType()`), jadi materi lama tetap jalan. Label di `MATERIAL_TYPES`.
   - Dipilih di `/courses/[id]/upload` dan `/materials/[id]/edit`. Jenis tampil di daftar dan halaman materi, dan ada filter jenis di tab Materi `/courses/[id]`.
   - Alasan: 24 dari 40 responden survei latihan dengan soal ujian lalu.

2. ~~**Privasi per item dan profil publik**~~ (sudah dibuat)
   - `UserProfile.privacy?: { showProgram, showContact }` (`Privacy`), semua boolean, kosong = tampil. `showProgram` mencakup `program` dan `dreamProgram`. Daftar field per switch ada di `HIDEABLE` (`src/lib/privacy.ts`).
   - `showEntryYear` ditambahkan bersama angkatan (#5). `showAchievements` menyusul bersama pencapaian (#8).
   - Halaman `/users/[id]` untuk melihat profil orang lain. Nama di tab Peringkat dan Teman belajar menaut ke sana.
   - Penegakan di Firestore Security Rules, lihat bagian 6.
   - Alasan: abstrak menjanjikan "users choose what is public", dan aturan privasi ini wajib.

3. ~~**Materiku (repositori pribadi)**~~ (sudah dibuat)
   - Halaman `/materials`: semua materi yang aku upload (`uploaderId == uid`) dari semua mata kuliah, publik dan privat, dengan filter, jenis, dan tombol edit.
   - `Material.isPublic?: boolean`. Kosong dianggap publik. Pilihan "Privat, hanya untuk saya" ada di form upload dan edit. Materi privat tidak bisa dibuat kuis, dan materi yang sudah punya kuis tidak bisa dijadikan privat.
   - Beda dari rencana awal: materi privat disimpan di koleksi terpisah `privateMaterials` (pola yang sama dengan `users/{uid}/private`), bukan di `materials` dengan filter rules. Alasannya, Firestore menolak query yang bisa memuat dokumen terlarang, sehingga semua query `materials` harus diubah dan materi lama harus dimigrasi. Dengan koleksi terpisah, query yang ada tidak berubah dan tidak perlu migrasi.

4. ~~**Materi terbaru di beranda**~~ (sudah dibuat)
   - Bagian "Materi terbaru di mata kuliahku" di `/`: 5 materi publik terbaru dari mata kuliah di `courseIds` (`latestMaterials()`), dengan kode mata kuliah, jenis, pengunggah, dan tanda "Kuis siap duel".

5. ~~**Angkatan dan tanda akun ITB**~~ (sudah dibuat)
   - `UserProfile.entryYear?: number`, diisi dari NIM (`readNim(...).entryYear`) saat daftar, dan di `/profile` untuk profil lama. Bisa diubah dan disembunyikan (`showEntryYear`). Field `year` yang lama dibiarkan.
   - `UserProfile.isItbVerified?: boolean`, ditulis app saat login dan saat menyimpan profil, dan divalidasi di rules (`honestItbFlag`: harus sama dengan `isItb()` dari token). Akun ITB diberi badge "✓ ITB" dan tamu badge "Tamu" (`AccountBadge`) di Profil, `/users/[id]`, dan daftar teman belajar.

6. ~~**Kategori Info "lainnya"**~~ (sudah dibuat, lalu halaman Info diganti Jelajah materi)
   - `OpportunityType` ditambah `"lainnya"`, beserta filter dan form "+ Bagikan info".

### Usul ditunda

Juri menilai scope terlalu luas dan feasibility paling lemah. Fitur di bawah menambah scope tanpa memperkuat alur inti (materi → kuis → duel → teman belajar), jadi usulnya ditunda sampai setelah semifinal.

7. **Cari pengguna dan permintaan pertemanan** (Sedang–Besar)
   - Kolom cari di header. Firestore tidak punya pencarian teks, jadi nama difilter di browser (cukup untuk skala hackathon).
   - `friendRequests/{from}_{to}`: `from`, `to`, `fromName`, `toName`, `status` (`pending`, `accepted`, `declined`), `participants[]`, `createdAt`.
   - Di `/duel/new`, pilihan lawan bisa difilter ke "Teman".
   - Rekomendasi teman belajar dan tombol "Ajak duel" sudah menjawab masalah utama dari survei.

8. **Pencapaian** (Kecil–Sedang)
   - `users/{uid}/achievements/{id}`: `title`, `year`, `description`, `createdAt`. Dikelola di `/profile`, tampil di `/users/[id]` jika `privacy.showAchievements`.
   - Tidak ada di abstrak. Tidak ditambahkan ke langkah daftar, agar daftar tetap satu layar + `/courses`.

9. **Foto profil dan akun sosial** (Kecil, tapi perlu Storage)
   - Login Microsoft lewat Firebase biasanya tidak memberi foto, jadi foto perlu Firebase Storage, yang sekarang tidak dipakai. Usul: tetap `contact` dan avatar inisial.

10. **Latihan sendiri** (Kecil–Sedang)
    - Mengerjakan kuis `published` tanpa lawan dan tanpa Elo. Duel melawan teman demo sudah bisa dipakai untuk latihan.

11. **Duel kompleks dan antrean auto-match** (Besar)
    - `Duel.mode?: "cepat" | "kompleks"` (kosong = `"cepat"`), `matchQueue/{uid}`: `courseId`, `mode`, `joinedAt`.
    - "Pemenang = yang pertama benar" butuh dua pemain online bersamaan dan listener realtime (`onSnapshot`), yang belum ada di `src/lib/db.ts`. Duel sekarang bergantian, jadi ini perubahan terbesar dan paling berisiko untuk demo.
    - Lawan dengan rating terdekat yang dipilih otomatis di `/duel/new` sudah berfungsi seperti auto-match.

## 6. Aturan privasi

Field yang disembunyikan tidak boleh bisa dibaca orang lain di level Firestore Security Rules, bukan hanya disembunyikan di UI.

Cara menerapkannya di app ini (sudah berlaku untuk profil, lihat `src/lib/privacy.ts` dan `firestore.rules`):

- Firestore Security Rules mengizinkan atau menolak baca per dokumen, bukan per field. Jadi field yang disembunyikan disimpan di dokumen terpisah `users/{uid}/private/profile` yang hanya bisa dibaca pemiliknya. Saat profil disimpan, field yang `privacy`-nya mati ditulis ke sana dan dihapus dari `users/{uid}`. Pemilik membaca keduanya dan menggabungkannya. Rules juga menolak `users/{uid}` yang masih memuat field yang disembunyikan.
- `users/{uid}` dan `users/{uid}/private/profile` hanya bisa ditulis pemiliknya. Pengecualian: profil teman demo (`bot_…` dengan `isBot`) yang ditulis seed. Subkoleksi lain di bawah `users/{uid}` ditolak sampai ditambahkan ke rules (mis. `achievements` di #8).
- Nanti: `achievements` bisa dibaca jika pemiliknya, atau `get(users/{uid}).data.privacy.showAchievements == true`.
- Materi privat: `privateMaterials/{id}` hanya bisa dibaca dan ditulis pengunggahnya, dan `materials` menolak dokumen dengan `isPublic == false`.
- `major` (fakultas) tetap terlihat, karena disalin ke `memberships` untuk peringkat dan dulu dipakai filter Info (halaman Info sudah dihapus). Jika prodi disembunyikan, rekomendasi teman belajar tidak memakai kecocokan prodi untuk orang itu.
- `memberships` dan `duels` tetap bisa ditulis peserta lain, karena hasil duel memperbarui Elo kedua pemain.
