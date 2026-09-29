// Merakit workflow n8n (JSON) dari sumber Code node di src/code/.
//   node src/build-workflow.mjs            -> menulis workflow/rapor-bot-telegram.n8n.json
// Target: n8n 2.36.x (Telegram Trigger 1.5, Telegram 1.2, Data table 1.1, Google Sheets 4.7, Google Drive 3, IF 2.3, Switch 3.4).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaKode } from './kode.mjs';

const akar = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMA_TABEL = 'sesi_bot';
const NAMA_SHEET = 'Data Siswa';
const KONTAK_ADMIN = '088990090900';

// ---------------------------------------------------------------- util
const uuid = (kunci) => {
  const h = createHash('sha1').update(`raport-bot|${kunci}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const nodes = [];
const koneksi = {};

function tambah(nama, type, typeVersion, parameters, posisi, ekstra = {}) {
  if (nodes.some((n) => n.name === nama)) throw new Error(`Nama node ganda: ${nama}`);
  nodes.push({ parameters, id: uuid(`node|${nama}`), name: nama, type, typeVersion, position: posisi, ...ekstra });
}

/** hubungkan(dari, ke) atau hubungkan(dari, ke, keluaran) untuk node bercabang (IF/Switch/error output). */
function hubungkan(dari, ke, keluaran = 0) {
  koneksi[dari] ??= { main: [] };
  while (koneksi[dari].main.length <= keluaran) koneksi[dari].main.push([]);
  koneksi[dari].main[keluaran].push({ node: ke, type: 'main', index: 0 });
}

const dariMesin = (field) => `={{ $('Mesin Status').first().json.${field} }}`;
const dariNormalisasi = (field) => `={{ $('Normalisasi Input').first().json.${field} }}`;

// ---------------------------------------------------------------- kondisi IF / Switch
const opsiFilter = { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 };
const kondisi = (kiri, operator, kanan = '') => ({
  id: uuid(`kondisi|${kiri}|${operator.type}.${operator.operation}|${kanan}`),
  leftValue: kiri,
  rightValue: kanan,
  operator,
});
const teksSama = (kiri, kanan) => kondisi(kiri, { type: 'string', operation: 'equals' }, kanan);
const tidakKosong = (kiri) => kondisi(kiri, { type: 'string', operation: 'notEmpty', singleValue: true });
const benar = (kiri) => kondisi(kiri, { type: 'boolean', operation: 'true', singleValue: true });
const saring = (daftar) => ({ options: opsiFilter, conditions: daftar, combinator: 'and' });

// ---------------------------------------------------------------- tombol Telegram
const tombol = (teks, data) => ({ text: teks, additionalFields: { callback_data: data } });
const papan = (...baris) => ({ rows: baris.map((b) => ({ row: { buttons: b } })) });
const TOMBOL_MENU_UTAMA = papan([tombol('🏠 Menu Utama', 'm:main')]);

/** Node Telegram "Send Message" (HTML). */
function kirimPesan(nama, teks, posisi, keyboard, ekstra = {}) {
  tambah(
    nama,
    'n8n-nodes-base.telegram',
    1.2,
    {
      resource: 'message',
      operation: 'sendMessage',
      chatId: dariNormalisasi('chatId'),
      text: teks,
      replyMarkup: keyboard ? 'inlineKeyboard' : 'none',
      ...(keyboard ? { inlineKeyboard: keyboard } : {}),
      // parse_mode wajib diisi eksplisit: bila kosong, node Telegram memaksa Markdown lama yang gagal pada karakter "_" dan "*".
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' },
    },
    posisi,
    ekstra,
  );
}

// ---------------------------------------------------------------- teks pesan statis (HTML)
const TEKS_SAMBUTAN =
  '=Assalamu’alaikum warahmatullahi wabarakatuh\n\n' +
  'Selamat datang {{ $(\'Normalisasi Input\').first().json.sapaan }}, di SMP IT Abu Bakar Yogyakarta, ' +
  'ini adalah Layanan Chatbot Informasi Sekolah dan Penerimaan Hasil Belajar 😊\n\n' +
  'Admin siap membantu memberikan informasi seputar sekolah untuk Anda.\n' +
  'Jelajahi lingkungan dan program unggulan sekolah kami secara digital dengan mengunjungi tautan https://smpit-abubakar.sch.id\n\n' +
  'Ada yang bisa kami bantu hari ini? Silakan pilih menu di bawah ini ya! 👇';

// Catatan: tanda & ditulis sebagai &amp; karena pesan dikirim dengan parse_mode HTML.
const TEKS_SPMB =
  '✨🌟 PINTU GERBANG GENERASI MASA DEPAN TELAH DIBUKA🌟✨\n\n' +
  'Bismillahirrahmanirrahim\n' +
  "Assalamu'alaikum Ayah/Bunda Hebat 💛\n\n" +
  'Alhamdulillah.. \n' +
  'SISTEM PENERIMAAN MURID BARU (SPMB) \n' +
  'SMPIT ABU BAKAR YOGYAKARTA \n' +
  'TAHUN AJARAN 2027/2028 \n' +
  'RESMI DIBUKA!!! 🎉\n\n' +
  'Ingin ananda menjadi:\n' +
  "✅ Hafizh/Hafizhah Qur'an\n" +
  '✅ Berakhlak mulia &amp; Mandiri \n' +
  '✅ Cerdas, Berprestasi &amp; Berjiwa Pemimpin\n' +
  '✅ Tumbuh di lingkungan yang Islami &amp; Aman\n\n' +
  'Di sinilah tempatnya! \n' +
  'SMP IT Abu Bakar Yogyakarta \n' +
  '"Menempa Generasi Qur\'ani, Cerdas, Berkarakter"\n\n' +
  '📍 Pendaftaran dibuka mulai: 1 Agustus - 16 Oktober 2026\n' +
  '📍 Informasi &amp; Pendaftaran: \n\n' +
  'Link pendaftaran: \n' +
  'https://s.id/daftar_smpitaby\n\n' +
  `CP: ${KONTAK_ADMIN} (WA Only) \n\n` +
  'Kuota terbatas! Jangan sampai kehabisan ya Ayah/Bunda\n' +
  'Karena pendidikan terbaik adalah investasi akhirat terbaik 🤲\n\n' +
  'Yuk segera daftarkan putra-putri tercinta!\n' +
  'Barakallahu fiikum\n\n' +
  "Wassalamu'alaikum warahmatullahi wabarakatuh";

const TEKS_MENU_LAPORAN = '📚 <b>Laporan Hasil Belajar</b>\n\nSilakan pilih jenis laporan yang ingin Anda terima 👇';
const TEKS_GAGAL_DOKUMEN = `Mohon maaf, dokumen rapor belum dapat dikirim saat ini. Ketik YA untuk mencoba lagi, atau hubungi admin sekolah (WA ${KONTAK_ADMIN}).`;

// ---------------------------------------------------------------- sticky note
const catatan = (nama, isi, posisi, lebar, tinggi, warna) =>
  tambah(nama, 'n8n-nodes-base.stickyNote', 1, { content: isi, height: tinggi, width: lebar, color: warna }, posisi);

// ================================================================ ALUR UTAMA
tambah(
  'Telegram Trigger',
  'n8n-nodes-base.telegramTrigger',
  1.5,
  { updates: ['message', 'callback_query'], additionalFields: {} },
  [0, 480],
  { webhookId: uuid('webhook|telegram-trigger') },
);

tambah('Normalisasi Input', 'n8n-nodes-base.code', 2, { jsCode: bacaKode('normalisasi-input.js') }, [240, 480], {
  notes: 'Mengubah update Telegram menjadi format netral-channel + mengenali maksud pengguna (intent).',
});

tambah(
  'Klik Tombol?',
  'n8n-nodes-base.if',
  2.3,
  { conditions: saring([teksSama('={{ $json.kind }}', 'callback')]), options: {} },
  [480, 480],
);

tambah(
  'Jawab Callback',
  'n8n-nodes-base.telegram',
  1.2,
  { resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.callbackId }}', additionalFields: {} },
  [720, 336],
  {
    onError: 'continueRegularOutput', // tombol lama (>15 menit) tidak boleh menghentikan alur
    notes: 'Menghilangkan animasi "memuat" di tombol yang ditekan.',
  },
);

tambah(
  'Ambil Sesi',
  'n8n-nodes-base.dataTable',
  1.1,
  {
    resource: 'row',
    operation: 'get',
    dataTableId: { __rl: true, mode: 'name', value: NAMA_TABEL },
    matchType: 'allConditions',
    filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: dariNormalisasi('chatId') }] },
    limit: 1,
  },
  [960, 480],
  {
    alwaysOutputData: true, // pengguna baru belum punya baris sesi
    notes: `Data table "${NAMA_TABEL}" (dibuat oleh cabang "Setup: Jalankan Sekali").`,
  },
);

tambah(
  'Perlu Cari Siswa?',
  'n8n-nodes-base.if',
  2.3,
  {
    conditions: saring([
      benar("={{ ['await_cred', 'await_confirm'].includes($json.state ?? '') }}"),
      teksSama(dariNormalisasi('intent'), 'teks'),
      tidakKosong(dariNormalisasi('credNis')),
      tidakKosong(dariNormalisasi('credDob')),
      benar("={{ (Date.parse($json.locked_until ?? '') || 0) <= Date.now() }}"),
    ]),
    options: {},
  },
  [1200, 480],
  {
    notes:
      'Google Sheets hanya dibaca bila: sedang menunggu NIS/tanggal lahir, ketikan terbaca sebagai "NIS tanggal-lahir" yang valid, dan pengguna tidak sedang dikunci.',
  },
);

tambah(
  'Baca Data Siswa',
  'n8n-nodes-base.googleSheets',
  4.7,
  {
    resource: 'sheet',
    operation: 'read',
    documentId: { __rl: true, mode: 'list', value: '' },
    sheetName: { __rl: true, mode: 'name', value: NAMA_SHEET },
    filtersUI: { values: [{ lookupColumn: 'NIS', lookupValue: dariNormalisasi('credNis') }] },
    options: {
      returnFirstMatch: true,
      outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'SERIAL_NUMBER' } },
    },
  },
  [1440, 336],
  {
    alwaysOutputData: true, // NIS tidak ditemukan -> item kosong, diputuskan oleh "Cocokkan Siswa"
    onError: 'continueRegularOutput', // gagal akses -> item {error}, ditangani "Cocokkan Siswa" (bukan salah pengguna)
    notes: `Pilih dokumen Google Sheet Anda. Tab "${NAMA_SHEET}" dengan kolom: NIS | Nama | Kelas | Tanggal Lahir | Intrakurikuler | Kokurikuler | Al Quran`,
  },
);

tambah('Cocokkan Siswa', 'n8n-nodes-base.code', 2, { jsCode: bacaKode('cocokkan-siswa.js') }, [1680, 336], {
  notes: 'Membandingkan tanggal lahir yang diketik dengan data Sheet. Pesan "tidak cocok" sama untuk NIS salah dan tanggal salah; error Google Sheets dilaporkan sebagai status "error".',
});

tambah('Mesin Status', 'n8n-nodes-base.code', 2, { jsCode: bacaKode('mesin-status.js') }, [1920, 480], {
  notes: 'Otak percakapan: menentukan balasan & status sesi. Batas percobaan, waktu sesi, dan kontak admin ada di konstanta KONFIG (baris atas).',
});

tambah(
  'Router',
  'n8n-nodes-base.switch',
  3.4,
  {
    rules: {
      values: ['welcome', 'spmb', 'menu_lhb', 'confirm', 'send_doc', 'teks'].map((aksi) => ({
        conditions: saring([teksSama('={{ $json.action }}', aksi)]),
        renameOutput: true,
        outputKey: aksi,
      })),
    },
    options: {},
  },
  [2160, 480],
);

// ---- Balasan Telegram
kirimPesan(
  'Kirim Sambutan',
  TEKS_SAMBUTAN,
  [2480, 0],
  papan([tombol('Informasi SPMB', 'm:spmb')], [tombol('Laporan Hasil Belajar', 'm:lhb')]),
);
kirimPesan('Kirim Info SPMB', TEKS_SPMB, [2480, 176], TOMBOL_MENU_UTAMA);
kirimPesan(
  'Kirim Menu Laporan',
  TEKS_MENU_LAPORAN,
  [2480, 352],
  papan(
    [tombol('Intrakurikuler', 'r:intra')],
    [tombol('Kokurikuler', 'r:kokul')],
    [tombol("Al Qur'an", 'r:quran')],
    [tombol('🏠 Menu Utama', 'm:main')],
  ),
);
kirimPesan('Kirim Konfirmasi', dariMesin('text'), [2480, 528], papan([tombol('✅ YA', 'c:ya'), tombol('❌ BATAL', 'c:no')]));
kirimPesan('Kirim Teks', dariMesin('text'), [2480, 704], TOMBOL_MENU_UTAMA);

tambah(
  'Unduh PDF Rapor',
  'n8n-nodes-base.googleDrive',
  3,
  {
    resource: 'file',
    operation: 'download',
    fileId: { __rl: true, mode: 'id', value: dariMesin('fileId') },
    options: {
      // Bila file berupa Google Docs/Slides/Sheets (bukan PDF unggahan), ekspor otomatis ke PDF.
      googleFileConversion: {
        conversion: { docsToFormat: 'application/pdf', slidesToFormat: 'application/pdf', sheetsToFormat: 'application/pdf' },
      },
    },
  },
  [2480, 880],
  { onError: 'continueErrorOutput', notes: 'Mengunduh berkas PDF rapor dari Google Drive (akun yang dipilih harus punya akses ke berkas).' },
);

tambah(
  'Kirim Dokumen',
  'n8n-nodes-base.telegram',
  1.2,
  {
    resource: 'message',
    operation: 'sendDocument',
    chatId: dariNormalisasi('chatId'),
    binaryData: true,
    binaryPropertyName: 'data',
    replyMarkup: 'inlineKeyboard',
    inlineKeyboard: TOMBOL_MENU_UTAMA,
    additionalFields: { caption: dariMesin('caption'), fileName: dariMesin('fileName') },
  },
  [2720, 880],
);

kirimPesan('Kirim Gagal Dokumen', TEKS_GAGAL_DOKUMEN, [2720, 1040], TOMBOL_MENU_UTAMA, {
  notes: 'Dikirim bila PDF gagal diunduh dari Google Drive. Sesi tidak diubah, jadi pengguna cukup mengetik YA lagi.',
});

const kolomSesi = [
  ['chat_id', 'string'],
  ['state', 'string'],
  ['rapor_type', 'string'],
  ['nis', 'string'],
  ['nama', 'string'],
  ['kelas', 'string'],
  ['file_ref', 'string'],
  ['fail_count', 'number'],
  ['fail_since', 'string'],
  ['locked_until', 'string'],
  ['expires_at', 'string'],
];

tambah(
  'Simpan Sesi',
  'n8n-nodes-base.dataTable',
  1.1,
  {
    resource: 'row',
    operation: 'upsert',
    dataTableId: { __rl: true, mode: 'name', value: NAMA_TABEL },
    matchType: 'allConditions',
    filters: { conditions: [{ keyName: 'chat_id', condition: 'eq', keyValue: dariMesin('session.chat_id') }] },
    columns: {
      mappingMode: 'defineBelow',
      value: Object.fromEntries(kolomSesi.map(([k]) => [k, dariMesin(`session.${k}`)])),
      matchingColumns: [],
      schema: kolomSesi.map(([k, tipe]) => ({
        id: k,
        displayName: k,
        required: false,
        defaultMatch: false,
        display: true,
        type: tipe,
        canBeUsedToMatch: true,
        removed: false,
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: {},
  },
  [2960, 480],
  { notes: 'Status sesi disimpan SETELAH balasan terkirim (satu baris per chat).' },
);

// ---- Koneksi alur utama
hubungkan('Telegram Trigger', 'Normalisasi Input');
hubungkan('Normalisasi Input', 'Klik Tombol?');
hubungkan('Klik Tombol?', 'Jawab Callback', 0);
hubungkan('Klik Tombol?', 'Ambil Sesi', 1);
hubungkan('Jawab Callback', 'Ambil Sesi');
hubungkan('Ambil Sesi', 'Perlu Cari Siswa?');
hubungkan('Perlu Cari Siswa?', 'Baca Data Siswa', 0);
hubungkan('Perlu Cari Siswa?', 'Mesin Status', 1);
hubungkan('Baca Data Siswa', 'Cocokkan Siswa');
hubungkan('Cocokkan Siswa', 'Mesin Status');
hubungkan('Mesin Status', 'Router');
['Kirim Sambutan', 'Kirim Info SPMB', 'Kirim Menu Laporan', 'Kirim Konfirmasi', 'Unduh PDF Rapor', 'Kirim Teks'].forEach((n, i) =>
  hubungkan('Router', n, i),
);
hubungkan('Unduh PDF Rapor', 'Kirim Dokumen', 0);
hubungkan('Unduh PDF Rapor', 'Kirim Gagal Dokumen', 1);
['Kirim Sambutan', 'Kirim Info SPMB', 'Kirim Menu Laporan', 'Kirim Konfirmasi', 'Kirim Teks', 'Kirim Dokumen'].forEach((n) =>
  hubungkan(n, 'Simpan Sesi'),
);

// ================================================================ SETUP SEKALI
tambah('Setup: Jalankan Sekali', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 1120]);
tambah(
  `Buat Tabel ${NAMA_TABEL}`,
  'n8n-nodes-base.dataTable',
  1.1,
  {
    resource: 'table',
    operation: 'create',
    tableName: NAMA_TABEL,
    columns: { column: kolomSesi.map(([name, type]) => ({ name, type })) },
    options: { createIfNotExists: true },
  },
  [240, 1120],
  { notes: 'Aman dijalankan berulang: bila tabel sudah ada, tidak dibuat ulang.' },
);
hubungkan('Setup: Jalankan Sekali', `Buat Tabel ${NAMA_TABEL}`);

// ================================================================ STICKY NOTES
catatan(
  'Catatan Panduan',
  '## 📋 Chatbot Rapor & SPMB — SMP IT Abu Bakar (Telegram)\n' +
    'Versi untuk n8n 2.36.x. Panduan lengkap ada di **README.md**.\n\n' +
    '### Persiapan (sekali saja)\n' +
    '1. Buat bot lewat **@BotFather** → salin token → buat credential **Telegram API** di n8n, lalu pasang di semua node Telegram (Trigger + Kirim …).\n' +
    `2. Klik **Execute** pada cabang **Setup: Jalankan Sekali** (bawah) → tabel \`${NAMA_TABEL}\` terbentuk otomatis.\n` +
    `3. Buat Google Sheet, tab \`${NAMA_SHEET}\`, kolom: \`NIS | Nama | Kelas | Tanggal Lahir | Intrakurikuler | Kokurikuler | Al Quran\` (isi tiga kolom terakhir dengan tautan/ID file PDF di Google Drive).\n` +
    '4. Pilih dokumen di node **Baca Data Siswa**; pasang credential Google di node itu dan **Unduh PDF Rapor**.\n' +
    '5. **Publish** workflow, lalu kirim `/start` ke bot Anda.',
  [-32, -480],
  1120,
  400,
  4,
);
catatan(
  'Catatan Telegram',
  '### 💬 Bagian khusus Telegram\n' +
    'Telegram Trigger, **Normalisasi Input**, dan semua node **Kirim …** / **Jawab Callback**.\n\n' +
    'Saat pindah ke WhatsApp (kirimi.id), hanya bagian ini yang diganti. Logika di tengah (Ambil Sesi → Mesin Status → Simpan Sesi) tidak berubah.',
  [-32, 224],
  720,
  208,
  7,
);
catatan(
  'Catatan Data',
  '### 🗂️ Sumber data\n' +
    'Data siswa dibaca dari Google Sheets (satu kali baca per pengecekan). Ingin memakai database lain? Ganti node **Baca Data Siswa**, pertahankan bentuk output **Cocokkan Siswa**.',
  [1408, 128],
  480,
  160,
  3,
);
catatan(
  'Catatan Sesi',
  '### 🔐 Sesi & keamanan\n' +
    'Sesi per chat tersimpan di Data table. Maksimum 5 data tidak cocok per 15 menit, setelah itu dikunci 15 menit. Sesi kedaluwarsa 10 menit. Semua angka ada di **Mesin Status** (KONFIG).',
  [1200, 656],
  480,
  176,
  6,
);

// ================================================================ KELUARAN
const workflow = {
  id: 'RaportBotTg00001', // ekspor bawaan n8n selalu memuat id; impor lewat CLI mewajibkannya
  name: 'Chatbot Rapor & SPMB - SMP IT Abu Bakar (Telegram)',
  nodes,
  pinData: {},
  connections: koneksi,
  active: false,
  settings: { executionOrder: 'v1', timezone: 'Asia/Jakarta' },
  versionId: uuid('versi'),
  tags: [],
};

const tujuan = path.join(akar, 'workflow', 'rapor-bot-telegram.n8n.json');
mkdirSync(path.dirname(tujuan), { recursive: true });
writeFileSync(tujuan, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(`Ditulis: ${path.relative(akar, tujuan)} (${nodes.length} node)`);
