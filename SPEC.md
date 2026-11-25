# Spesifikasi

## Model data (Firestore)
- users/{uid}: username, jurusan, semester, angkatan, bio, photoURL,
  socials{}, isItbVerified, privacy{showRepo, showAchievements, showJurusan, showAngkatan}
- users/{uid}/achievements/{id}: judul, tahun, deskripsi
- repository/{id}: ownerUid, judul, tipe(materi|catatan|paper), courseCode, fileURL, isPublic
- courses/{code}: nama, sks, fakultas  (seed dari data/courses.json)
- users/{uid}/enrolledCourses/{code}
- duels/{id}: courseCode, mode(cepat|kompleks), players[], status, questions[], winnerUid
- matchQueue/{uid}: courseCode, mode, joinedAt
- friendRequests/{id}: from, to, status
- posts/{id}: kategori(seminar|beasiswa|lomba|lainnya), judul, isi, link, deadline

## Alur halaman
1. /login – Google Sign-In; domain ITB → verified, lainnya → guest
2. /onboarding/profile – setup profil + pencapaian + upload awal (opsional, bisa dilewati)
3. /onboarding/courses – pilih mata kuliah dari daftar ITB
4. /home – materi relevan, kuis/latihan, past paper, tombol duel
5. /duel – pilih matkul, mode, lawan (teman/auto-match)
   - Duel cepat: ada timer per soal
   - Duel kompleks: tanpa batas waktu, pemenang = yang pertama benar
6. /info – papan informasi seminar/beasiswa/lomba
7. /profile – edit profil, pengaturan privasi per item
8. /repository – upload & kelola file pribadi
9. Search bar + friend request (di navbar)

## Aturan privasi
Field yang disembunyikan tidak boleh bisa dibaca orang lain di level Firestore Security Rules, bukan hanya disembunyikan di UI.
