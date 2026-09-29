// Cocokkan NIS + tanggal lahir yang diketik pengguna dengan baris siswa dari Google Sheets.
// Input node ini = hasil "Baca Data Siswa": 0 atau 1 baris (kosong bila NIS tidak ditemukan),
// atau satu item {error: '...'} bila Google Sheets gagal diakses (node itu memakai "continue on error").
// Output: status 'error' | 'no_match' | 'match' + data siswa. Tanggal lahir TIDAK ikut dikeluarkan.
// Bila data siswa pindah ke sumber lain (database, API), cukup ganti node pembacanya dan
// pertahankan bentuk output node ini.
const inp = $('Normalisasi Input').first().json;
const semua = $input.all().map((i) => i.json);
const gagalBaca = semua.some((r) => r && Object.keys(r).length === 1 && typeof r.error === 'string');
const baris = semua.filter((r) => r && Object.keys(r).length > 0);

// ---------- Nama kolom di Sheet (huruf besar/kecil & tanda baca diabaikan) ----------
const KOLOM = {
  nis: ['nis', 'nisn', 'nomorinduk'],
  nama: ['nama', 'namasiswa', 'namalengkap'],
  kelas: ['kelas', 'rombel'],
  lahir: ['tanggallahir', 'tgllahir', 'ttl', 'lahir'],
  intra: ['intrakurikuler', 'raporintrakurikuler', 'akademik', 'raporakademik'],
  kokul: ['kokurikuler', 'raporkokurikuler', 'ekstrakurikuler', 'raporekstrakurikuler', 'ekskul'],
  quran: ['alquran', 'raporalquran', 'quran', 'raporquran'],
};

const kunciKolom = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const ambil = (row, alias) => {
  const peta = {};
  for (const k of Object.keys(row)) peta[kunciKolom(k)] = row[k];
  for (const a of alias) if (peta[a] !== undefined && peta[a] !== null && peta[a] !== '') return peta[a];
  return '';
};
const teks = (v) => String(v ?? '').trim();
const normNis = (v) => teks(v).replace(/\s+/g, '').toUpperCase();

// ---------- ID file Google Drive (tautan atau ID mentah) ----------
const idDrive = (v) => {
  const s = teks(v);
  if (!s) return '';
  const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
};

//@include _tanggal.js

// ---------- Pencocokan ----------
const kosong = { nis: '', nama: '', kelas: '', files: { intra: '', kokul: '', quran: '' } };
if (gagalBaca) return [{ json: { status: 'error', ...kosong } }];

const nis = normNis(inp.credNis);
const siswa = nis ? baris.find((r) => normNis(ambil(r, KOLOM.nis)) === nis) : null;
const dobSheet = siswa ? parseTanggal(ambil(siswa, KOLOM.lahir)) : null;

// Pesan yang sama untuk "NIS tidak ada" dan "tanggal lahir salah" agar NIS tidak bisa ditebak.
if (!siswa || !dobSheet || dobSheet !== inp.credDob) return [{ json: { status: 'no_match', ...kosong } }];

return [
  {
    json: {
      status: 'match',
      nis,
      nama: teks(ambil(siswa, KOLOM.nama)),
      kelas: teks(ambil(siswa, KOLOM.kelas)),
      files: {
        intra: idDrive(ambil(siswa, KOLOM.intra)),
        kokul: idDrive(ambil(siswa, KOLOM.kokul)),
        quran: idDrive(ambil(siswa, KOLOM.quran)),
      },
    },
  },
];
