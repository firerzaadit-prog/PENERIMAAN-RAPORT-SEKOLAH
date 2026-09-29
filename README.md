# Chatbot Rapor & SPMB — SMP IT Abu Bakar Yogyakarta (n8n + Telegram)

Workflow **n8n 2.36.x** (diuji langsung di **2.36.9**) untuk layanan chatbot sekolah:

- menyapa pengguna dan menampilkan menu **Informasi SPMB** / **Laporan Hasil Belajar**,
- membagikan **rapor PDF** (Intrakurikuler, Kokurikuler, Al Qur'an) setelah orang tua memasukkan **NIS + tanggal lahir** dan mengetik **YA**.

Saluran yang dipakai sekarang adalah **Telegram** (gratis). Logika di tengah dibuat netral-channel supaya nanti mudah dipindah ke WhatsApp (kirimi.id) — lihat [Pindah ke WhatsApp](#pindah-ke-whatsapp-kirimiid).

## Alur percakapan

```
/start atau pesan apa pun
└─ Step 1  Sambutan + menu ........... [Informasi SPMB] [Laporan Hasil Belajar]
    ├─ Step 2  Informasi SPMB ........ teks pendaftaran SPMB
    └─ Step 3  Laporan Hasil Belajar . [Intrakurikuler] [Kokurikuler] [Al Qur'an]
        └─ Step 4  Bot meminta "NIS [spasi] tanggal lahir"
            ├─ tidak cocok → "Data tidak cocok"  (maks. 5x / 15 menit, lalu dikunci 15 menit)
            └─ cocok → bot menampilkan Nama & Kelas → pengguna mengetik YA → PDF rapor dikirim
```

> Alur ini mengikuti spesifikasi **Step 1–4** dari klien. Pintasan "ketik `NIS_TTL` langsung tanpa memilih menu" (pada permintaan awal) belum diimplementasikan; pemisah `_` pada input sudah diterima.

Yang dipahami bot selain tombol: `/start`, `/menu`, `/batal`, `YA` / `BATAL` (juga tersedia sebagai tombol), dan tanggal lahir dalam banyak penulisan
(`17-08-2011`, `17/08/2011`, `17082011`, `17 Agustus 2011`, `2011-08-17`, …). Pemisah NIS dan tanggal boleh spasi atau `_` (mis. `12345_17082011`).

## Isi repositori

| Path | Fungsi |
|---|---|
| `workflow/rapor-bot-telegram.n8n.json` | **Workflow yang diimpor ke n8n** |
| `data/data-siswa-contoh.csv` | Contoh isi Google Sheet data siswa |
| `src/code/*.js` | Sumber kode tiga Code node (mudah dibaca & diuji) |
| `src/build-workflow.mjs` | Perakit workflow JSON dari sumber di atas (`npm run build`) |
| `src/test/` | 39 unit test logika (`npm test`, Node ≥ 20, tanpa dependensi) |

## Prasyarat

1. **n8n 2.36.x** yang dapat dijangkau Telegram lewat **HTTPS publik** (Telegram Trigger memakai webhook). Self-hosted: atur `WEBHOOK_URL=https://domain-anda/` di belakang reverse proxy; untuk uji lokal pakai tunnel (ngrok / cloudflared). n8n Cloud langsung siap.
2. Bot Telegram dari **@BotFather**.
3. Akun **Google** (Sheets + Drive) tempat data siswa dan berkas PDF rapor disimpan.

## Setup (sekali saja)

### 1. Bot Telegram
1. Chat **@BotFather** → `/newbot` → simpan **token** bot.
2. (Opsional, disarankan) `/setcommands` lalu isi:
   ```
   start - Menu utama
   menu - Menu utama
   batal - Batalkan proses
   ```

### 2. Google Drive & Google Sheets
1. Unggah PDF rapor ke Google Drive (folder bebas, tidak perlu dibagikan ke publik). Berkas Google Docs/Slides/Sheets juga bisa; otomatis diekspor ke PDF.
2. Buat Google Sheet dengan **tab bernama `Data Siswa`** dan header di baris 1 (contoh isi: `data/data-siswa-contoh.csv`):

   | NIS | Nama | Kelas | Tanggal Lahir | Intrakurikuler | Kokurikuler | Al Quran |
   |---|---|---|---|---|---|---|

   | Kolom | Aturan |
   |---|---|
   | `NIS` | Header **harus persis `NIS`**. Tanpa spasi. Bila NIS berawalan angka nol (mis. `00789`), format kolom sebagai **Plain text** *sebelum* mengisi. |
   | `Nama`, `Kelas` | Ditampilkan ke orang tua sebagai konfirmasi. |
   | `Tanggal Lahir` | Format **hari-bulan-tahun**, mis. `17-08-2011`. Boleh teks biasa atau sel bertipe tanggal (tidak terpengaruh pengaturan bahasa Sheet). Jangan memakai format Amerika (`8/17/2011`). |
   | `Intrakurikuler`, `Kokurikuler`, `Al Quran` | Tautan berbagi Drive (`https://drive.google.com/file/d/…/view`) **atau** ID file. Dikosongkan bila belum ada → bot menjawab "dokumen belum tersedia". |

   Nama header selain `NIS` toleran terhadap huruf besar/kecil dan tanda baca (mis. `Tgl Lahir`, `Rapor Intrakurikuler`, `Al-Qur'an`; kolom `Kokurikuler` boleh bernama `Ekstrakurikuler`).

### 3. Credential di n8n
Buat tiga credential (menu *Credentials → Create credential*):

| Credential | Dokumentasi |
|---|---|
| **Telegram API** (isi token dari BotFather) | https://docs.n8n.io/integrations/builtin/credentials/telegram/ |
| **Google Sheets OAuth2 API** | https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ |
| **Google Drive OAuth2 API** | https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ |

> **Penting untuk produksi:** bila layar persetujuan OAuth Google berstatus *Testing*, token Google kedaluwarsa tiap **7 hari** dan bot berhenti mengambil data. Ubah ke *In production* (cukup untuk aplikasi internal), atau pakai **Service Account** ([panduan](https://docs.n8n.io/integrations/builtin/credentials/google/service-account/)): bagikan Sheet dan folder Drive ke email service account, lalu pada node *Baca Data Siswa* dan *Unduh PDF Rapor* ubah **Authentication** menjadi *Service Account*.

### 4. Impor workflow
*Workflows → Create workflow → menu ⋯ → Import from file…* → pilih `workflow/rapor-bot-telegram.n8n.json`.
Bila Anda hanya punya satu credential per jenis, n8n mengisinya otomatis; jika tidak, pilih credential di node yang bertanda peringatan (semua node **Telegram**, **Baca Data Siswa**, **Unduh PDF Rapor**).

### 5. Buat tabel sesi (Data table)
Percakapan Telegram tidak menyimpan status, jadi bot mencatat langkah tiap chat di Data table `sesi_bot`.
Arahkan kursor ke node **Setup: Jalankan Sekali** (kiri bawah) → klik **Execute workflow**. Tabel `sesi_bot` beserta kolomnya terbentuk otomatis (aman diulang; tidak menimpa tabel yang sudah ada).

### 6. Hubungkan Google Sheet
Buka node **Baca Data Siswa** → pada **Document** pilih Google Sheet Anda. (Tab `Data Siswa` sudah diatur; ubah bila nama tab Anda berbeda.)

### 7. Publish dan uji
Klik **Publish**, lalu kirim `/start` ke bot Anda. Uji satu siswa dari awal sampai PDF diterima.

> Tombol **Execute workflow** pada Telegram Trigger memakai *webhook uji* dan dapat menggantikan webhook produksi di Telegram. Setelah selesai menguji, **Unpublish lalu Publish** lagi agar webhook produksi terdaftar kembali. Satu bot hanya bisa punya satu webhook.

## Cara kerja

| Bagian | Node | Fungsi |
|---|---|---|
| Masuk | `Telegram Trigger` → `Normalisasi Input` | Mengubah pesan/tombol Telegram menjadi format netral-channel; mengenali maksud (menu, YA, batal, …) dan memecah "NIS tanggal-lahir". Grup dan bot lain diabaikan. |
| Tombol | `Klik Tombol?` → `Jawab Callback` | Menghilangkan animasi "memuat" pada tombol. Kegagalan di sini tidak menghentikan alur. |
| Sesi | `Ambil Sesi` | Membaca baris sesi chat dari Data table. |
| Data siswa | `Perlu Cari Siswa?` → `Baca Data Siswa` → `Cocokkan Siswa` | Membaca Google Sheets **hanya bila perlu**: sedang menunggu NIS, ketikan valid, dan pengguna tidak sedang dikunci. Sheets memfilter kolom `NIS`, sehingga hanya satu baris yang lewat. |
| Otak | `Mesin Status` | State machine `idle → await_cred → await_confirm → kirim dokumen`, kedaluwarsa sesi, pembatasan percobaan, dan semua teks balasan dinamis. |
| Balasan | `Router` → `Kirim Sambutan` / `Kirim Info SPMB` / `Kirim Menu Laporan` / `Kirim Konfirmasi` / `Kirim Teks` / `Unduh PDF Rapor` → `Kirim Dokumen` | Satu node per jenis balasan. |
| Simpan | `Simpan Sesi` | Menyimpan status **setelah** balasan terkirim (bila pengiriman gagal, status tidak berubah sehingga pengguna bisa mengulang). |
| Setup | `Setup: Jalankan Sekali` → `Buat Tabel sesi_bot` | Membuat Data table. |

Kolom Data table `sesi_bot` (satu baris per chat): `chat_id`, `state`, `rapor_type`, `nis`, `nama`, `kelas`, `file_ref`, `fail_count`, `fail_since`, `locked_until`, `expires_at`. Isinya bisa dilihat di *Data tables* pada halaman proyek n8n.

## Yang bisa Anda ubah

| Ingin mengubah | Ubah di |
|---|---|
| Teks sambutan, info SPMB, judul menu | Node `Kirim Sambutan`, `Kirim Info SPMB`, `Kirim Menu Laporan` (kolom *Text*). Pesan memakai `parse_mode` HTML: tulis `&amp;` untuk tanda &, dan hindari `<` `>` di luar tag. |
| Batas percobaan, lama kunci, batas waktu sesi, nomor admin | Konstanta `KONFIG` di baris atas node `Mesin Status` (bawaan: 5 kali / 15 menit, kunci 15 menit, sesi 10 menit). |
| Nama jenis rapor di pesan (mis. "Kokurikuler" → "Ekstrakurikuler") | `LABEL` di `Mesin Status` dan teks tombol di `Kirim Menu Laporan`. Kolom Sheet boleh bernama `Kokurikuler` maupun `Ekstrakurikuler`. |
| Kalimat balasan lain (format salah, tidak cocok, dikunci, dst.) | Objek `PESAN` di `Mesin Status`. |
| Nama tab Sheet / nama Data table | Node `Baca Data Siswa` / node `Ambil Sesi`, `Simpan Sesi`, `Buat Tabel …` (harus sama, huruf kecil). |

Setelah mengedit sumber di `src/code/` atau `src/build-workflow.mjs`, jalankan `npm run build` untuk menghasilkan ulang JSON, lalu `npm test`.

## Keamanan dan privasi

NIS + tanggal lahir adalah "kata sandi" yang lemah (mudah ditebak). Perlindungan yang sudah ada:

- Pesan gagal **sama** untuk NIS salah dan tanggal salah (NIS tidak bisa ditebak-tebak satu per satu).
- Maksimum **5 data tidak cocok per 15 menit per chat**, lalu layanan rapor dikunci 15 menit. Percobaan berhasil tidak menghapus catatan gagal.
- Pengguna yang terkunci atau mengetik asal **tidak** memakai kuota Google Sheets.
- Hanya chat pribadi yang dilayani; sesi tiap chat terpisah dan kedaluwarsa 10 menit.
- Keluaran `Cocokkan Siswa` dan sesi yang disimpan tidak memuat tanggal lahir; berkas Drive tidak perlu dibagikan ke publik.

Hal yang perlu Anda putuskan:

- Penyerang dengan banyak akun Telegram tetap bisa menebak. Bila perlu keamanan lebih tinggi, tambahkan kolom **PIN/kode unik per siswa** yang dicetak di rapor fisik dan wajibkan pada langkah 4.
- n8n menyimpan data eksekusi (termasuk nama, NIS, dan tanggal lahir yang diketik) selama 14 hari secara bawaan. Persingkat dengan `EXECUTIONS_DATA_MAX_AGE`, atau atur *Save successful production executions = Do not save* pada pengaturan workflow setelah semuanya stabil.
- Riwayat chat Telegram memuat NIS dan tanggal lahir yang diketik orang tua; sarankan untuk menghapus pesan tersebut.
- Data siswa adalah data pribadi anak. Pastikan penggunaannya sesuai kebijakan sekolah dan aturan pelindungan data pribadi yang berlaku.

## Pindah ke WhatsApp (kirimi.id)

Yang **khusus Telegram** hanya: `Telegram Trigger`, `Normalisasi Input`, `Klik Tombol?`, `Jawab Callback`, dan node `Kirim …` / `Unduh PDF Rapor` → `Kirim Dokumen`. Yang perlu disesuaikan:

1. Ganti `Telegram Trigger` dengan node **Webhook** yang menerima pesan masuk dari kirimi.id.
2. Ubah `Normalisasi Input` agar menghasilkan field yang sama (`chatId` = nomor pengirim, `kind`, `text`, `intent`, `pilih`, `credNis`, `credDob`, `sapaan`). WhatsApp tidak punya tombol inline seperti ini: jadikan menu daftar bernomor ("1. Informasi SPMB, 2. Laporan Hasil Belajar", …) dan petakan angka ke `intent`. Hapus `Klik Tombol?` dan `Jawab Callback`.
3. Ganti node Telegram pengirim dengan node **HTTP Request** ke API kirimi.id (kirim teks; kirim dokumen dari data biner hasil `Unduh PDF Rapor`). Sesuaikan pola pemakaian dengan dokumentasi kirimi.id.
4. Teks di `Mesin Status` memakai tag HTML (`<b>`, `<code>`) dan fungsi `h()` hanya karena Telegram `parse_mode=HTML`; ganti dengan format WhatsApp (`*tebal*`) dan hapus escape.
5. `Ambil Sesi`, `Perlu Cari Siswa?`, `Baca Data Siswa`, `Cocokkan Siswa`, `Mesin Status`, `Router`, `Simpan Sesi`, Data table, dan Google Sheets **tidak berubah**.

> Catatan: dokumentasi kirimi.id tidak dapat diakses dari lingkungan tempat workflow ini disusun, jadi detail endpoint dan format webhook-nya belum divalidasi.

## Pengujian

- **Unit test** (`npm test`, 39 kasus): normalisasi input, parser tanggal (puluhan variasi), pencocokan Sheet, seluruh state machine (sambutan, SPMB, tiga rapor, kunci percobaan, kedaluwarsa, batal, HTML escape, kegagalan Sheets/Drive).
- **End-to-end di n8n 2.36.9** (workflow diimpor dan dipublish; Telegram Bot API dan Google API ditiru lokal): 39 pemeriksaan lolos, meliputi Step 1–4 lengkap sampai PDF diterima (nama file, isi, keterangan, tombol), kunci 5 percobaan, callback lama, error Google Sheets/Drive, grup diabaikan, dan isi Data table.

## Pemecahan masalah

| Gejala | Kemungkinan penyebab |
|---|---|
| Bot tidak membalas | Workflow belum **Publish**; n8n tidak dapat dijangkau lewat HTTPS publik; webhook tertimpa mode uji (Unpublish → Publish); token bot salah. Cek tab *Executions*. |
| Error `Data table with name "sesi_bot" not found` | Belum menjalankan cabang **Setup: Jalankan Sekali**. |
| Bot menjawab "data siswa belum dapat diperiksa" | Google Sheets gagal diakses: credential kedaluwarsa, dokumen belum dipilih, tab bukan `Data Siswa`, atau header kolom pertama bukan persis `NIS`. Lihat output node *Baca Data Siswa* pada eksekusi terkait. |
| "Data tidak cocok" padahal benar | NIS mengandung spasi/ nol di depan hilang (format kolom Plain text); tanggal lahir di Sheet berformat Amerika atau bukan tanggal. |
| "Dokumen rapor belum dapat dikirim" | Akun Google pada node *Unduh PDF Rapor* belum punya akses ke berkas, ID/tautan salah, atau ukuran berkas > 50 MB (batas Telegram). Pengguna cukup mengetik **YA** lagi setelah diperbaiki. |
| Bot berhenti mengambil data setelah ±7 hari | Layar persetujuan OAuth Google masih *Testing* (lihat catatan di langkah 3). |
