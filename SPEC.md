# Spesifikasi Peerseus

Dasar dokumen ini adalah app yang sudah berjalan. Nama route, koleksi Firestore, dan field di bawah mengikuti kode (`src/lib/types.ts`, `src/lib/peerseus.ts`, `firestore.rules`). Jangan ganti nama atau strukturnya. Fitur baru memakai pola yang sama.

Bagian "Belum ada" berisi fitur dari daftar awal yang belum dibangun, diurutkan dari yang paling penting untuk demo.

## 1. Akses dan login

- **Akun ITB**: login Microsoft (Microsoft 365 ITB, tenant ITB) dengan email `itb.ac.id` atau subdomainnya, mis. `NIM@mahasiswa.itb.ac.id`.
- **Tamu** (mis. juri): login Google dengan email terverifikasi yang ada di `config/access.guestEmails`. Daftar ini diubah di Firebase Console.
- Selain itu ditolak. Aturan yang sama dicek di app (`src/lib/access.ts`), di `firestore.rules` untuk setiap baca/tulis, dan di route AI (`src/lib/serverAuth.ts`).
- Tanpa env Firebase, app jalan di **mode demo lokal** (localStorage + teman demo).

## 2. Model data (Firestore)

| Koleksi / dokumen | Isi |
| --- | --- |
| `users/{uid}` | `name`, `major` (kode fakultas, mis. STEI), `stage` (`tpb` atau `jurusan`), `program` (prodi), `dreamProgram` (prodi incaran saat TPB, tidak pernah bersamaan dengan `program`), `semester`, `year`, `bio`, `contact`, `isPublic` (tampil di rekomendasi teman belajar), `isBot`, `courseIds[]`, `createdAt` |
| `courses/{id}` | `code`, `name`, `description`, `sks`. `id` = kode huruf kecil, mis. `if2110`. Diisi dari `src/lib/seed.ts` dan dari Kurikulum 2024 (`src/lib/curriculum.ts`) saat mahasiswa memilih mata kuliah |
| `memberships/{courseId}_{uid}` | Mata kuliah yang diikuti: `courseId`, `uid`, `name`, `major`, `isBot`, `left`, `elo`, `wins`, `losses`, `draws`, `topicStats{topik: {correct, total}}` |
| `materials/{id}` | `courseId`, `title`, `description`, `topics[]`, `text` (Markdown + LaTeX), `format`, `fileUrl`, `fileName`, `mimeType`, `uploaderId`, `uploaderName`, `createdAt`, `updatedAt`, `reports` |
| `quizzes/quiz_{materialId}` | `materialId`, `courseId`, `title`, `status` (`draft` atau `published`), `questions[]`, `createdBy`, `createdAt`, `generator` (`gemini`, `fallback`, `seed`), `reports` |
| `duels/{id}` | `courseId`, `quizId`, `quizTitle`, `challengerId/Name`, `opponentId/Name`, `opponentIsBot`, `status` (`pending`, `completed`, `declined`), `questions[]`, `challenger`, `opponent` (jawaban, waktu, skor), `winnerId` (`null` = seri), `eloChange`, `participants[]`, `createdAt` |
| `opportunities/{id}` | `title`, `type` (`beasiswa`, `lomba`, `seminar`), `organizer`, `majors[]` (kosong = semua fakultas), `deadline` (YYYY-MM-DD), `link`, `description`, `postedBy`, `createdAt` |
| `config/access` | `guestEmails[]`. Hanya bisa diubah di console |
| `meta/seed` | Versi data contoh |

File tidak disimpan di Firebase Storage. PDF dan file lain diubah jadi teks Markdown + LaTeX di browser, lalu hanya teksnya yang disimpan.

### Daftar awal → nama di app

| Daftar awal | Di app |
| --- | --- |
| `username`, `jurusan`, `angkatan` | `name`, `major` + `stage` + `program`/`dreamProgram`, angkatan belum ada (lihat Belum ada #5) |
| `socials{}` | `contact` (satu teks, mis. LINE / IG / WA) |
| `users/{uid}/enrolledCourses/{code}` | `memberships/{courseId}_{uid}` + `users.courseIds` |
| `repository/{id}` | `materials/{id}` (repositori bersama per mata kuliah) |
| `courses/{code}` + `data/courses.json` | `courses/{id}` + `src/lib/seed.ts` + `src/lib/curriculum.ts`. Tidak ada field fakultas karena kurikulum disimpan per prodi |
| `duels.players[]`, `winnerUid` | `participants[]`, `winnerId` |
| `posts/{id}` | `opportunities/{id}` |

## 3. Alur halaman

Navigasi hanya tiga: **Mata Kuliah** (`/`), **Duel** (`/duels`), **Info** (`/opportunities`). Profil dan keluar ada di bawah nama pengguna.

1. **Masuk** (layar di `Shell`, muncul di route mana pun selama belum login): "Masuk dengan akun ITB" (Microsoft) atau "Masuk dengan Google" untuk tamu.
2. **Data diri** (layar yang sama): nama, fakultas, TPB/jurusan, prodi atau prodi incaran. Untuk akun ITB diisi otomatis dari NIM di email dan tetap bisa diubah.
3. `/courses`: **Mata Kuliah**. Pengguna baru diarahkan ke sini. Semester ditebak dari NIM, mata kuliah semester ini diisi dari Kurikulum 2024, bisa dihapus, dan ada pencarian untuk menambah. Mata kuliah yang dihapus menyimpan ratingnya.
4. `/`: **Mata kuliahku**. Daftar mata kuliah dengan rating, tantangan duel yang menunggu jawaban, dan mata kuliah lain untuk digabung.
5. `/courses/[id]`: tab Materi, Peringkat, Teman belajar. Tombol "Upload materi" dan "Mulai duel".
6. `/courses/[id]/upload`: upload materi (PDF, .tex, .md, .txt, atau tempel teks), diubah per halaman jadi Markdown + LaTeX dengan Gemini.
7. `/materials/[id]`: baca materi. Uploader membuat kuis (Gemini, 8 soal pilihan ganda), mengecek, lalu mempublikasikan. Ada tombol lapor materi/kuis. Edit di `/materials/[id]/edit`.
8. `/duel/new?course=…|quiz=…&opponent=…`: pilih kuis dan lawan. Lawan diurutkan dari rating terdekat dan yang terdekat dipilih otomatis, jadi duel bisa dimulai dengan satu klik.
9. `/duel/[id]`: main (6 soal acak, 20 detik per soal), lalu hasil: skor, perubahan rating, topik yang salah, dan teman belajar yang kuat di topik itu.
10. `/duels`: tantangan masuk dan riwayat duel.
11. `/opportunities`: **Info**. Beasiswa, lomba, seminar. Filter jenis, fakultas, dan deadline. Tombol "+ Bagikan info".
12. `/profile`: nama, fakultas/prodi, bio, kontak, pilihan tampil di rekomendasi (`isPublic`), keluar.

## 4. Aturan yang berlaku sekarang

- **Duel** berjalan bergantian: penantang menjawab dulu, lawan menjawab soal yang sama nanti. Teman demo menjawab otomatis sesuai akurasi topiknya.
- **Pemenang duel**: skor lebih tinggi menang. Skor sama, total waktu lebih cepat menang (selisih > 0,5 detik). Selain itu seri.
- **Elo** per mata kuliah, K = 32, mulai dari 1000 (`src/lib/elo.ts`).
- **Skor teman belajar**: `0,6 × akurasi dia di topik lemahku + 0,3 × kedekatan Elo + 0,1 × fakultas sama`. Pengguna dengan `isPublic = false` tidak direkomendasikan.
- **firestore.rules**: semua pengguna yang diizinkan bisa membaca dan menulis semua data app, kecuali `config`. Ini belum memenuhi aturan privasi di bagian 6.

## 5. Belum ada

Diurutkan dari yang paling penting untuk demo. Ukuran: **Kecil** (beberapa jam), **Sedang** (sekitar setengah hari), **Besar** (sehari atau lebih).

### Prioritas untuk demo

1. **Jenis materi dan past paper** (Kecil)
   - `Material.type?: "materi" | "catatan" | "paper"`. Kosong dianggap `"materi"`, jadi materi lama tetap jalan.
   - Dipilih di `/courses/[id]/upload` dan `/materials/[id]/edit`. Badge dan filter jenis di tab Materi `/courses/[id]`.
   - Alasan: 24 dari 40 responden survei latihan dengan soal ujian lalu.

2. **Privasi per item dan profil publik** (Sedang)
   - `UserProfile.privacy?: { showProgram, showEntryYear, showContact, showAchievements }`, semua boolean. `showProgram` mencakup `program` dan `dreamProgram`. `showContact` adalah tambahan karena `contact` sudah ada dan paling sensitif.
   - Halaman baru `/users/[id]` untuk melihat profil orang lain. Nama di tab Peringkat dan Teman belajar menaut ke sana.
   - Penegakan di Firestore Security Rules, lihat bagian 6.
   - Alasan: abstrak menjanjikan "users choose what is public", dan aturan privasi ini wajib.

3. **Materiku (repositori pribadi)** (Sedang)
   - Halaman baru `/materials`: semua materi yang aku upload (`uploaderId == uid`) dari semua mata kuliah, dengan jenis dan tombol edit.
   - `Material.isPublic?: boolean`. Kosong dianggap publik. Materi privat hanya terlihat oleh pemiliknya dan tidak bisa dipakai untuk kuis duel.
   - Rules: baca jika `isPublic != false` atau pemiliknya. Karena Firestore menolak query yang bisa memuat dokumen terlarang, tab Materi memakai dua query (`isPublic == true` dan `uploaderId == uid`), dan materi lama perlu diisi `isPublic: true` sekali.

4. **Materi terbaru di beranda** (Kecil, setelah #1)
   - Bagian "Materi terbaru" di `/` dari mata kuliah di `courseIds`, dengan badge jenis dan tanda kuis siap duel.

5. **Angkatan dan tanda akun ITB** (Kecil)
   - `UserProfile.entryYear?: number`, diisi dari NIM (`readNim(...).entryYear`) dan bisa diubah. Field `year` yang lama dibiarkan.
   - `UserProfile.isItbVerified?: boolean`, ditulis saat menyimpan profil dan divalidasi di rules (`request.resource.data.isItbVerified == isItb()`). Tamu diberi badge "Tamu".

6. **Kategori Info "lainnya"** (Kecil)
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

Cara menerapkannya di app ini:

- Firestore Security Rules mengizinkan atau menolak baca per dokumen, bukan per field. Jadi field yang disembunyikan disimpan di dokumen terpisah `users/{uid}/private/profile` yang hanya bisa dibaca pemiliknya. Saat profil disimpan, field yang `privacy`-nya mati ditulis ke sana dan dihapus dari `users/{uid}`. Pemilik membaca keduanya dan menggabungkannya.
- `users/{uid}`, `users/{uid}/private/**`, dan `users/{uid}/achievements/**` hanya bisa ditulis pemiliknya. Pengecualian: profil teman demo (`isBot`) yang ditulis seed.
- `achievements` bisa dibaca jika pemiliknya, atau `get(users/{uid}).data.privacy.showAchievements == true`.
- `materials` privat: lihat Belum ada #3.
- `major` (fakultas) tetap terlihat, karena disalin ke `memberships` untuk peringkat dan dipakai filter Info. Jika prodi disembunyikan, rekomendasi teman belajar tidak memakai kecocokan prodi untuk orang itu.
- `memberships` dan `duels` tetap bisa ditulis peserta lain, karena hasil duel memperbarui Elo kedua pemain.
