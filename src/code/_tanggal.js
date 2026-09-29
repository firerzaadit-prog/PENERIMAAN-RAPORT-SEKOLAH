// ---------- Parser tanggal -> 'YYYY-MM-DD' (urutan hari-bulan-tahun, bukan format Amerika) ----------
// Salinan yang sama dipakai di node "Normalisasi Input" dan "Cocokkan Siswa"; jika diubah, ubah keduanya.
const BULAN = {
  januari: 1, jan: 1,
  februari: 2, pebruari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11, nopember: 11,
  desember: 12, des: 12, dec: 12,
};

const tanggalIso = (y, m, d) => {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const tahun = (t) => (t.length <= 2 ? (Number(t) <= 30 ? 2000 : 1900) + Number(t) : Number(t));

const parseTanggal = (v) => {
  if (v === null || v === undefined || v === '') return null;
  // Tanggal bertipe date di Google Sheets (nomor seri; hari sejak 30 Des 1899)
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const t = new Date(Math.round((v - 25569) * 86400000));
    return tanggalIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = String(v).toLowerCase();
  const pola = [
    // 2011-08-17, 2011/08/17, 2011 08 17 (juga 2011-08-17T00:00:00Z)
    [/(?<!\d)(\d{4})[\s\-/.]+(\d{1,2})[\s\-/.]+(\d{1,2})(?!\d)/, (m) => tanggalIso(+m[1], +m[2], +m[3])],
    // 17-08-2011, 17/08/2011, 17.08.2011, 17 08 2011, 17-08-11
    [/(?<!\d)(\d{1,2})[\s\-/.]+(\d{1,2})[\s\-/.]+(\d{4}|\d{2})(?!\d)/, (m) => tanggalIso(tahun(m[3]), +m[2], +m[1])],
    // 17 Agustus 2011, 17-Agu-2011, 17agustus2011
    [/(?<!\d)(\d{1,2})[\s\-/.]*([a-z]{3,10})[\s\-/.,]*(\d{4}|\d{2})(?!\d)/, (m) => (BULAN[m[2]] ? tanggalIso(tahun(m[3]), BULAN[m[2]], +m[1]) : null)],
    // 17082011, 20110817, 170811
    [/(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/, (m) => tanggalIso(+m[3], +m[2], +m[1])],
    [/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/, (m) => tanggalIso(+m[1], +m[2], +m[3])],
    [/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/, (m) => tanggalIso(tahun(m[3]), +m[2], +m[1])],
  ];
  for (const [re, baca] of pola) {
    const m = s.match(re);
    const hasil = m ? baca(m) : null;
    if (hasil) return hasil;
  }
  return null;
};
