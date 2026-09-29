// Normalisasi update Telegram -> format netral-channel.
// Hanya node ini (dan node Telegram) yang khusus Telegram. Saat pindah ke WhatsApp/kirimi.id,
// cukup buat node ini menghasilkan field yang sama; node lain tidak perlu diubah.
const update = $input.first().json;

const cb = update.callback_query;
const msg = update.message;
const chat = cb ? cb.message?.chat : msg?.chat;
const from = cb ? cb.from : msg?.from;

// Hanya layani chat pribadi. Data rapor bersifat rahasia, jadi grup/kanal dan bot lain diabaikan.
if (!chat || chat.type !== 'private' || !from || from.is_bot) return [];

//@include _tanggal.js

// Pesan dikirim dengan parse_mode HTML, jadi teks dari pengguna harus di-escape.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const kind = cb ? 'callback' : typeof msg.text === 'string' ? 'text' : 'other';
const text = kind === 'text' ? msg.text.trim() : '';
const data = cb ? String(cb.data ?? '') : '';

// Tombol inline (callback_data) -> intent
const TOMBOL = { 'm:main': 'menu', 'm:spmb': 'spmb', 'm:lhb': 'lhb', 'c:ya': 'ya', 'c:no': 'batal' };
const PILIHAN = { 'r:intra': 'intra', 'r:kokul': 'kokul', 'r:quran': 'quran' };

// Perintah / kata yang diketik -> intent
const KATA = {
  menu: ['/start', '/menu', 'menu', 'mulai', 'start'],
  batal: ['/batal', '/cancel', 'batal', 'cancel', 'tidak', 'bukan', 'salah', 'no'],
  ya: ['ya', 'y', 'iya', 'yes', 'ok', 'oke', 'betul', 'benar'],
  spmb: ['spmb', 'ppdb'],
  lhb: ['rapor', 'raport', 'lhb', 'laporan'],
};

let intent = 'teks';
let pilih = '';

if (kind === 'callback') {
  if (PILIHAN[data]) {
    intent = 'pilih';
    pilih = PILIHAN[data];
  } else {
    intent = TOMBOL[data] || 'menu';
  }
} else if (kind === 'text') {
  const kataPertama = text.split(/\s+/)[0].toLowerCase();
  const perintah = kataPertama.startsWith('/') ? kataPertama.replace(/@.*$/, '') : '';
  const kunci = perintah || text.toLowerCase().replace(/[\s.!?,]+$/g, '');
  intent = Object.keys(KATA).find((k) => KATA[k].includes(kunci)) || 'teks';
} else {
  intent = 'lain';
}

// "NIS [spasi] tanggal lahir". Pemisah yang diterima: spasi, _, koma, titik koma, titik dua, |, / dan -.
// credNis / credDob baru terisi bila keduanya masuk akal, sehingga ketikan asal tidak memicu pembacaan Sheet.
let credNis = '';
let credDob = '';
if (intent === 'teks') {
  const m = text.replace(/^nis\b[\s:=.]*/i, '').match(/^([A-Za-z0-9]+)[\s_,;:|/\\-]+(\S.*)$/);
  const tanggal = m ? parseTanggal(m[2]) : null;
  if (m && tanggal && /^(?=.*\d)[A-Za-z0-9]{3,20}$/.test(m[1])) {
    credNis = m[1].toUpperCase();
    credDob = tanggal; // 'YYYY-MM-DD'
  }
}

return [
  {
    json: {
      channel: 'telegram',
      chatId: String(chat.id),
      sapaan: esc(from.first_name || 'Ayah/Bunda'),
      kind,
      text,
      intent,
      pilih,
      credNis,
      credDob,
      callbackId: cb ? String(cb.id) : '',
    },
  },
];
