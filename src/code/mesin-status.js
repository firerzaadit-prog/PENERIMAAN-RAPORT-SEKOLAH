// Mesin status percakapan (netral-channel). Menentukan balasan berikutnya dan status sesi baru.
//
//   idle --(pilih rapor)--> await_cred --(NIS + tgl lahir cocok)--> await_confirm --(YA)--> kirim dokumen --> idle
//
// Sesi disimpan di Data Table "sesi_bot" (satu baris per chat) oleh node "Simpan Sesi",
// SETELAH balasan terkirim. Node ini tidak menyimpan apa pun; ia hanya mengembalikan `session`.

// ===================== KONFIGURASI (boleh diubah) =====================
const KONFIG = {
  maksGagal: 5, // maksimum data tidak cocok dalam satu jendela waktu
  jendelaMenit: 15, // panjang jendela penghitungan data tidak cocok
  kunciMenit: 15, // lama layanan rapor dikunci setelah maksGagal tercapai
  sesiMenit: 10, // batas waktu menunggu balasan pengguna di tiap langkah
  kontakAdmin: '088990090900', // dicantumkan di pesan yang mengarahkan ke admin
};
const LABEL = { intra: 'Rapor Intrakurikuler', kokul: 'Rapor Kokurikuler', quran: "Rapor Al Qur'an" };
// ======================================================================

const ambilNode = (nama) => {
  try {
    return $(nama).first()?.json ?? null;
  } catch (e) {
    return null; // node tidak dijalankan pada eksekusi ini
  }
};

const inp = $('Normalisasi Input').first().json;
const row = ambilNode('Ambil Sesi') ?? {};
const cocok = ambilNode('Cocokkan Siswa'); // null bila pencarian siswa tidak dijalankan

const MENIT = 60 * 1000;
const sekarang = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const waktu = (v) => Date.parse(v) || 0;
const h = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // escape HTML
const bersih = (s) => String(s ?? '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Teks balasan (parse_mode HTML) ----------
const PESAN = {
  mintaData: (label) =>
    `📝 <b>${h(label)}</b>\n\n` +
    `Silakan masukkan <b>NIS [spasi] tanggal lahir</b> ananda.\n\n` +
    `Contoh: <code>12345 17-08-2011</code>\n\n` +
    `Tanggal lahir ditulis hari-bulan-tahun (misalnya 17-08-2011, 17/08/2011, atau 17082011).\n` +
    `Ketik /batal untuk membatalkan.`,
  formatSalah:
    `⚠️ Format belum sesuai.\n\n` +
    `Silakan kirim <b>NIS [spasi] tanggal lahir</b>, contoh: <code>12345 17-08-2011</code>\n` +
    `Ketik /batal untuk membatalkan.`,
  tidakCocok: (sisa) =>
    `❌ Data tidak cocok.\n\n` +
    `Periksa kembali NIS dan tanggal lahir ananda, lalu kirim ulang dengan format <b>NIS [spasi] tanggal lahir</b>.\n\n` +
    `Sisa percobaan: ${sisa}`,
  terkunci: (menit) =>
    `🔒 Terlalu banyak data yang tidak cocok.\n\n` +
    `Demi keamanan data siswa, layanan rapor dikunci sementara. Silakan coba lagi dalam <b>${menit} menit</b> ` +
    `atau hubungi admin sekolah (WA ${KONFIG.kontakAdmin}).`,
  konfirmasi: (nama, kelas, label) =>
    `✅ Data ditemukan\n\n` +
    `Nama: <b>${h(nama)}</b>\nKelas: <b>${h(kelas || '-')}</b>\nDokumen: ${h(label)}\n\n` +
    `Apakah data di atas sudah benar? Ketik <b>YA</b> untuk menerima dokumen rapor, atau <b>BATAL</b> untuk membatalkan.`,
  ingatkan: (nama) =>
    `Ketik <b>YA</b> untuk menerima dokumen rapor${nama ? ` atas nama <b>${h(nama)}</b>` : ''}, ` +
    `atau <b>BATAL</b> untuk membatalkan.`,
  belumTersedia: (label, nama, kelas) =>
    `Data ditemukan atas nama <b>${h(nama)}</b> (kelas ${h(kelas || '-')}), namun dokumen <b>${h(label)}</b> belum tersedia.\n\n` +
    `Silakan hubungi admin sekolah (WA ${KONFIG.kontakAdmin}) untuk informasi lebih lanjut.`,
  gangguanData:
    `Mohon maaf, data siswa belum dapat diperiksa saat ini. Silakan coba lagi beberapa saat lagi ` +
    `atau hubungi admin sekolah (WA ${KONFIG.kontakAdmin}).`,
  dibatalkan: `Baik, proses dibatalkan. Tekan tombol di bawah atau ketik /start untuk kembali ke menu utama.`,
  sesiBerakhir:
    `⏱️ Sesi Anda telah berakhir karena terlalu lama tidak ada balasan.\n\n` +
    `Silakan pilih menu kembali dengan menekan tombol di bawah atau ketik /start.`,
};

// ---------- Sesi saat ini ----------
let s = {
  chat_id: inp.chatId,
  state: row.state || 'idle',
  rapor_type: row.rapor_type || '',
  nis: row.nis || '',
  nama: row.nama || '',
  kelas: row.kelas || '',
  file_ref: row.file_ref || '',
  fail_count: Number(row.fail_count) || 0,
  fail_since: row.fail_since || '',
  locked_until: row.locked_until || '',
  expires_at: row.expires_at || '',
};
// Kembali ke idle; data percobaan gagal & kunci sengaja dipertahankan.
const idle = (x) => ({ ...x, state: 'idle', rapor_type: '', nis: '', nama: '', kelas: '', file_ref: '', expires_at: '' });

const kedaluwarsa = s.state !== 'idle' && waktu(s.expires_at) <= sekarang;
if (kedaluwarsa) s = idle(s);

const sisaKunci = Math.ceil((waktu(s.locked_until) - sekarang) / MENIT);
const terkunci = sisaKunci > 0;
const batasSesi = () => iso(sekarang + KONFIG.sesiMenit * MENIT);

const hasil = (action, extra = {}) => [{ json: { action, chatId: inp.chatId, session: s, ...extra } }];
const teks = (text) => hasil('teks', { text });

// Catat satu data tidak cocok. Mengembalikan true bila kini terkunci.
const catatGagal = () => {
  if (!s.fail_since || sekarang - waktu(s.fail_since) > KONFIG.jendelaMenit * MENIT) {
    s.fail_since = iso(sekarang);
    s.fail_count = 0;
  }
  s.fail_count += 1;
  if (s.fail_count < KONFIG.maksGagal) return false;
  s.locked_until = iso(sekarang + KONFIG.kunciMenit * MENIT);
  s.fail_count = 0;
  s.fail_since = '';
  return true;
};

// ---------- Keputusan ----------
switch (inp.intent) {
  case 'menu':
    s = idle(s);
    return hasil('welcome');

  case 'spmb':
    s = idle(s);
    return hasil('spmb');

  case 'lhb':
    s = idle(s);
    return hasil('menu_lhb');

  case 'pilih': {
    s = idle(s);
    if (terkunci) return teks(PESAN.terkunci(sisaKunci));
    s.state = 'await_cred';
    s.rapor_type = inp.pilih;
    s.expires_at = batasSesi();
    return teks(PESAN.mintaData(LABEL[inp.pilih]));
  }

  case 'batal': {
    const adaProses = s.state !== 'idle' || kedaluwarsa;
    s = idle(s);
    return adaProses ? teks(PESAN.dibatalkan) : hasil('welcome');
  }

  case 'ya': {
    if (s.state === 'await_confirm' && s.file_ref) {
      const label = LABEL[s.rapor_type] || 'Rapor';
      const kirim = {
        fileId: s.file_ref,
        fileName: `${bersih(`${label} - ${s.nama}`)}.pdf`,
        caption: `📄 ${label}\nNama: ${s.nama}\nKelas: ${s.kelas || '-'}`,
      };
      s = idle(s); // disimpan setelah dokumen terkirim
      return hasil('send_doc', kirim);
    }
    if (s.state === 'await_cred') return teks(PESAN.formatSalah);
    if (kedaluwarsa) return teks(PESAN.sesiBerakhir);
    s = idle(s);
    return hasil('welcome');
  }

  default: {
    // intent 'teks' (ketikan bebas) atau 'lain' (stiker, foto, dst.)
    if (s.state !== 'await_cred' && s.state !== 'await_confirm') {
      if (kedaluwarsa) return teks(PESAN.sesiBerakhir);
      s = idle(s);
      return hasil('welcome');
    }

    if (terkunci) return teks(PESAN.terkunci(sisaKunci));

    // Tanpa "NIS tanggal-lahir" yang terbaca, tidak ada pencarian siswa; sesi dibiarkan apa adanya.
    if (!inp.credNis || !inp.credDob || !cocok) {
      return s.state === 'await_cred' ? teks(PESAN.formatSalah) : teks(PESAN.ingatkan(s.nama));
    }

    // Google Sheets gagal diakses: bukan salah pengguna, jadi tidak dihitung dan sesi dibiarkan agar bisa dicoba lagi.
    if (cocok.status === 'error') return teks(PESAN.gangguanData);

    // Data baru menggantikan konfirmasi sebelumnya (bila ada).
    const tipe = s.rapor_type;
    const label = LABEL[tipe] || 'Rapor';
    s = idle(s);
    s.state = 'await_cred';
    s.rapor_type = tipe;
    s.expires_at = batasSesi();

    if (cocok.status !== 'match') {
      if (catatGagal()) {
        s = idle(s);
        return teks(PESAN.terkunci(KONFIG.kunciMenit));
      }
      return teks(PESAN.tidakCocok(KONFIG.maksGagal - s.fail_count));
    }

    const file = cocok.files?.[tipe] || '';
    if (!file) {
      s = idle(s);
      return teks(PESAN.belumTersedia(label, cocok.nama, cocok.kelas));
    }
    s.state = 'await_confirm';
    s.nis = cocok.nis;
    s.nama = cocok.nama;
    s.kelas = cocok.kelas;
    s.file_ref = file;
    return hasil('confirm', { text: PESAN.konfirmasi(cocok.nama, cocok.kelas, label) });
  }
}
