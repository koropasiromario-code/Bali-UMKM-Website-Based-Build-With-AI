# BALI UMKM AI — MVP 1.0

MVP full-stack untuk pendamping digital UMKM Bali.

## Fitur yang sudah berfungsi
- Registrasi dan login akun (password di-hash dengan bcrypt).
- Sesi login menggunakan cookie HttpOnly, SameSite=Strict.
- Dashboard dengan ringkasan data milik pengguna.
- CRUD dasar profil usaha (buat, lihat, hapus).
- Kalkulator harga jual dan penyimpanan riwayat ke SQLite.
- AI Assistant: marketing, deskripsi produk, konsultasi, dan ide usaha.
- Integrasi OpenAI Responses API melalui backend (API key tidak pernah dikirim ke browser).
- UI responsif untuk desktop dan ponsel.

## Kebutuhan
- Node.js 20 atau lebih baru
- npm
- API key OpenAI (hanya untuk fitur AI; fitur lain dapat diuji tanpa API key)

## Menjalankan di komputer
1. Ekstrak ZIP dan buka folder `bali-umkm-ai-mvp`.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`.
   - macOS/Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
4. Edit `.env`:
   - Ganti `JWT_SECRET` dengan string acak panjang (minimal 32 karakter).
   - Isi `OPENAI_API_KEY` untuk mengaktifkan fitur AI.
   - `OPENAI_MODEL` dapat disesuaikan dengan model yang tersedia di akun API.
5. Jalankan `npm start`.
6. Buka `http://localhost:3000`.
7. Buat akun melalui tombol "Daftar akun".

Database SQLite dibuat otomatis di folder `data/`.

## Uji MVP
- Daftar akun dengan email dan password minimal 8 karakter.
- Login dan logout.
- Tambahkan profil usaha di menu "Usaha Saya".
- Hitung harga jual dan cek riwayat.
- Isi API key lalu coba AI Assistant.

## Batasan yang diketahui
- Ini MVP untuk validasi awal, belum siap menangani trafik produksi besar.
- Belum ada verifikasi email, reset password, role admin, audit log, backup otomatis, atau dashboard pengelola program.
- Direktori saat ini hanya menampilkan usaha milik akun yang sedang login, bukan direktori publik lintas pengguna.
- Belum ada upload foto, katalog publik, pembayaran, integrasi WhatsApp, atau analitik penjualan.
- AI memerlukan API key dan biaya penggunaan API dapat berlaku.
- SQLite cocok untuk demo/pilot kecil pada satu instance. Untuk deployment multi-instance, migrasikan ke PostgreSQL.
- Cookie secure aktif saat `NODE_ENV=production`; deploy wajib HTTPS.
- Tambahkan rate limiting, proteksi CSRF yang sesuai arsitektur, validasi lebih ketat, monitoring, backup, dan kebijakan privasi sebelum peluncuran publik.

## Struktur
```
bali-umkm-ai-mvp/
├── server.js
├── package.json
├── .env.example
├── README.md
└── public/
    └── index.html
```
