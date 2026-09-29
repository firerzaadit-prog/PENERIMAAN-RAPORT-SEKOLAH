// Harness pengujian: menjalankan sumber Code node persis seperti di n8n
// ($input, $('Nama Node'), Date) dan meniru alur workflow (baca sesi -> cari siswa -> mesin status -> simpan sesi).
import { bacaKode } from '../kode.mjs';

export const sumber = bacaKode;

/** Jam palsu yang bisa dimajukan; hanya Date.now() yang dikendalikan. */
export function buatJam(mulai = Date.parse('2026-09-29T03:00:00Z')) {
  const jam = { sekarang: mulai };
  jam.Date = class extends Date {
    static now() {
      return jam.sekarang;
    }
  };
  jam.maju = (menit) => {
    jam.sekarang += menit * 60000;
  };
  return jam;
}

/** Jalankan satu file Code node. `nodes` = keluaran node lain yang bisa dibaca lewat $('Nama'). */
export function jalankan(namaFile, { input = [], nodes = {}, jam = buatJam() } = {}) {
  const daftar = (arr) => ({ first: () => arr[0], all: () => arr, last: () => arr[arr.length - 1] });
  const $ = (nama) => {
    if (!(nama in nodes)) throw new Error(`Node '${nama}' hasn't been executed`);
    return daftar(nodes[nama]);
  };
  const fn = new Function('$input', '$', 'Date', `"use strict";\n${sumber(namaFile)}`);
  return fn(daftar(input), $, jam.Date);
}

/** Baris contoh Google Sheet. */
export const SISWA = [
  {
    NIS: 12345,
    Nama: 'Ahmad Fulan',
    Kelas: '7A',
    'Tanggal Lahir': '17-08-2011',
    Intrakurikuler: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing',
    Kokurikuler: '1KoKuRiKuLeRxxxxxxxxxxxxxx',
    'Al Quran': 'https://drive.google.com/open?id=1QuRaNxxxxxxxxxxxxxxxxxx',
  },
  {
    NIS: '00789',
    Nama: 'Siti <Aisyah> & Co',
    Kelas: '8B',
    'Tanggal Lahir': 40772, // nomor seri Sheets = 2011-08-17
    Intrakurikuler: '1SiTiIntraxxxxxxxxxxxxxxx',
    Kokurikuler: '',
    'Al Quran': '',
  },
];

/** Meniru node Google Sheets "Baca Data Siswa": filter kolom NIS (dibandingkan sebagai string), ambil kecocokan pertama. */
export function bacaSheet(baris, nisDicari, { gagal = false } = {}) {
  if (gagal) return [{ json: { error: 'Service unavailable - try again later' } }]; // onError: continueRegularOutput
  const ketemu = baris.find((r) => String(r.NIS ?? '') === String(nisDicari));
  return ketemu ? [{ json: ketemu }] : [{ json: {} }]; // alwaysOutputData
}

/** Bot tiruan: mengikuti persis alur workflow (termasuk "simpan sesi setelah balasan terkirim"). */
export function buatBot({ baris = SISWA, jam = buatJam() } = {}) {
  const tabel = new Map(); // chat_id -> baris sesi
  const catatan = { sheetsDibaca: 0, sheetsGagal: false };

  function kirim(update, { gagalKirim = false } = {}) {
    const norm = jalankan('normalisasi-input.js', { input: [{ json: update }], jam });
    if (norm.length === 0) return { diabaikan: true };
    const inp = norm[0].json;
    const sesi = tabel.get(inp.chatId) ?? {};
    const nodes = { 'Normalisasi Input': norm, 'Ambil Sesi': [{ json: sesi }] };

    // Sama dengan kondisi node IF "Perlu Cari Siswa?".
    const perluCari =
      ['await_cred', 'await_confirm'].includes(sesi.state ?? '') &&
      inp.intent === 'teks' &&
      Boolean(inp.credNis) &&
      Boolean(inp.credDob) &&
      (Date.parse(sesi.locked_until ?? '') || 0) <= jam.sekarang;
    if (perluCari) {
      catatan.sheetsDibaca += 1;
      nodes['Cocokkan Siswa'] = jalankan('cocokkan-siswa.js', {
        input: bacaSheet(baris, inp.credNis, { gagal: catatan.sheetsGagal }),
        nodes,
        jam,
      });
    }

    const [{ json: keputusan }] = jalankan('mesin-status.js', { nodes, jam });
    if (!gagalKirim) tabel.set(inp.chatId, { ...keputusan.session }); // "Simpan Sesi" berjalan setelah pengiriman
    return { ...keputusan, inp };
  }

  return { kirim, tabel, jam, catatan };
}

// Pembuat update Telegram
let idUpdate = 1;
export const pesan = (teks, { chatId = 111, nama = 'Budi', tipe = 'private' } = {}) => ({
  update_id: idUpdate++,
  message: {
    message_id: idUpdate,
    from: { id: chatId, is_bot: false, first_name: nama },
    chat: { id: chatId, type: tipe, first_name: nama },
    date: 0,
    text: teks,
  },
});
export const tombol = (data, { chatId = 111, nama = 'Budi' } = {}) => ({
  update_id: idUpdate++,
  callback_query: {
    id: `cb${idUpdate}`,
    from: { id: chatId, is_bot: false, first_name: nama },
    message: { message_id: 5, chat: { id: chatId, type: 'private' }, date: 0 },
    data,
  },
});
