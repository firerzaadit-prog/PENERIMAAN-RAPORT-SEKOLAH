import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SISWA, bacaSheet, buatBot, buatJam, jalankan, pesan, tombol } from './harness.mjs';

// ---------------------------------------------------------------- Normalisasi Input
describe('Normalisasi Input', () => {
  const norm = (update) => {
    const out = jalankan('normalisasi-input.js', { input: [{ json: update }] });
    return out.length ? out[0].json : null;
  };

  it('mengubah pesan teks menjadi format netral-channel', () => {
    const j = norm(pesan('Halo', { chatId: 42, nama: 'Ani & <b>Budi' }));
    assert.equal(j.chatId, '42');
    assert.equal(j.kind, 'text');
    assert.equal(j.intent, 'teks');
    assert.equal(j.sapaan, 'Ani &amp; &lt;b&gt;Budi'); // sudah di-escape untuk parse_mode HTML
  });

  it('memakai "Ayah/Bunda" bila nama depan kosong', () => {
    const u = pesan('hai');
    delete u.message.from.first_name;
    assert.equal(norm(u).sapaan, 'Ayah/Bunda');
  });

  it('mengabaikan grup dan bot', () => {
    assert.equal(norm(pesan('/start', { tipe: 'group' })), null);
    const bot = pesan('/start');
    bot.message.from.is_bot = true;
    assert.equal(norm(bot), null);
    assert.equal(norm({ update_id: 1 }), null);
  });

  it('memetakan tombol inline ke intent', () => {
    const cek = (data) => {
      const j = norm(tombol(data));
      return [j.kind, j.intent, j.pilih];
    };
    assert.deepEqual(cek('m:main'), ['callback', 'menu', '']);
    assert.deepEqual(cek('m:spmb'), ['callback', 'spmb', '']);
    assert.deepEqual(cek('m:lhb'), ['callback', 'lhb', '']);
    assert.deepEqual(cek('r:intra'), ['callback', 'pilih', 'intra']);
    assert.deepEqual(cek('r:kokul'), ['callback', 'pilih', 'kokul']);
    assert.deepEqual(cek('r:quran'), ['callback', 'pilih', 'quran']);
    assert.deepEqual(cek('c:ya'), ['callback', 'ya', '']);
    assert.deepEqual(cek('c:no'), ['callback', 'batal', '']);
    assert.deepEqual(cek('tombol-lama-tak-dikenal'), ['callback', 'menu', '']);
    assert.equal(norm(tombol('m:spmb')).callbackId.startsWith('cb'), true);
  });

  it('mengenali perintah dan kata yang diketik', () => {
    const intent = (t) => norm(pesan(t)).intent;
    for (const t of ['/start', '/start@AbuBakarBot', '/start abc123', '/menu', 'Menu', 'MULAI']) assert.equal(intent(t), 'menu', t);
    for (const t of ['/batal', 'batal', 'Batal!', 'tidak', 'Bukan.']) assert.equal(intent(t), 'batal', t);
    for (const t of ['ya', 'YA', 'Ya.', 'iya', 'Oke!', 'y']) assert.equal(intent(t), 'ya', t);
    assert.equal(intent('spmb'), 'spmb');
    assert.equal(intent('Rapor'), 'lhb');
    assert.equal(intent('12345 17-08-2011'), 'teks');
    assert.equal(intent('halo admin'), 'teks');
  });

  it('non-teks (stiker, foto) menjadi intent "lain"', () => {
    const u = pesan('x');
    delete u.message.text;
    u.message.sticker = { file_id: 'abc' };
    const j = norm(u);
    assert.equal(j.kind, 'other');
    assert.equal(j.intent, 'lain');
  });

  it('memecah "NIS [spasi] tanggal lahir" dengan berbagai pemisah', () => {
    const pecah = (t) => {
      const j = norm(pesan(t));
      return [j.credNis, j.credDob];
    };
    assert.deepEqual(pecah('12345 17-08-2011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('  12345    17/08/2011  '), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('12345_17082011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('12345,17-08-2011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('12345 17 Agustus 2011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('NIS 12345 17-08-2011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('nis: 12345 tgl lahir 17-08-2011'), ['12345', '2011-08-17']);
    assert.deepEqual(pecah('a123 17-08-2011'), ['A123', '2011-08-17']);
  });

  it('ketikan yang bukan "NIS tanggal-lahir" tidak menghasilkan data pencarian', () => {
    for (const t of ['12345', 'halo', 'sebentar ya', '12345 tanggal-salah', '12345 31-02-2011', 'halo 17-08-2011', '12 17-08-2011', '17-08-2011']) {
      const j = norm(pesan(t));
      assert.deepEqual([j.credNis, j.credDob], ['', ''], t);
    }
    // NIS terlalu panjang
    assert.equal(norm(pesan(`${'1'.repeat(21)} 17-08-2011`)).credNis, '');
  });
});

// ---------------------------------------------------------------- Cocokkan Siswa
describe('Cocokkan Siswa', () => {
  // Alur sebenarnya: Normalisasi Input (validasi format) -> Cocokkan Siswa. Tanpa NIS/tanggal yang terbaca => 'format'.
  const cocokkan = (nisKetik, tanggalKetik, baris) => {
    const norm = jalankan('normalisasi-input.js', { input: [{ json: pesan(`${nisKetik} ${tanggalKetik}`.trim()) }] });
    const inp = norm[0].json;
    if (!inp.credNis || !inp.credDob) return { status: 'format' };
    const nodes = { 'Normalisasi Input': norm };
    const input = baris.length ? baris.map((json) => ({ json })) : [{ json: {} }];
    return jalankan('cocokkan-siswa.js', { input, nodes })[0].json;
  };
  const satu = (lahir, ekstra = {}) => [{ NIS: 12345, Nama: 'Ahmad Fulan', Kelas: '7A', 'Tanggal Lahir': lahir, ...ekstra }];

  it('menerima berbagai penulisan tanggal lahir yang sama', () => {
    const variasi = [
      '17-08-2011', '17/08/2011', '17.08.2011', '17 08 2011', '17-8-2011', '1-8-2011'.replace('1-', '17-'),
      '17082011', '17 Agustus 2011', '17 agustus 2011', '17-Agu-2011', '17agustus2011', '17 Agt 2011',
      '2011-08-17', '2011/08/17', '20110817', '170811', '17-08-11',
      'tgl lahir 17-08-2011', 'Yogyakarta, 17 Agustus 2011', '17-08-2011.',
    ];
    for (const v of variasi) assert.equal(cocokkan('12345', v, satu('17-08-2011')).status, 'match', `input: ${v}`);
  });

  it('menerima berbagai penulisan tanggal lahir di Sheet', () => {
    const variasi = ['17-08-2011', '17/08/2011', '2011-08-17', '2011-08-17T00:00:00.000Z', 40772, '17 Agustus 2011', 'Yogyakarta, 17 Agustus 2011', '17082011'];
    for (const v of variasi) assert.equal(cocokkan('12345', '17-08-2011', satu(v)).status, 'match', `sheet: ${v}`);
  });

  it('menolak tanggal yang salah (tanpa membedakan NIS salah / tanggal salah)', () => {
    assert.equal(cocokkan('12345', '18-08-2011', satu('17-08-2011')).status, 'no_match');
    assert.equal(cocokkan('12345', '08-17-2011', satu('17-08-2011')).status, 'format'); // bulan 17 tidak ada
    assert.equal(cocokkan('99999', '17-08-2011', []).status, 'no_match');
    assert.equal(cocokkan('99999', '17-08-2011', satu('17-08-2011')).status, 'no_match'); // baris NIS lain
    assert.equal(cocokkan('12345', '17-08-2011', satu('')).status, 'no_match'); // tanggal di Sheet kosong
    assert.equal(cocokkan('12345', '17-08-2011', satu('bukan tanggal')).status, 'no_match');
  });

  it('format tanggal tidak valid -> status format', () => {
    for (const v of ['31-02-2011', '17-08', '2011', 'abc', '', '32-01-2011', '00-01-2011', '17-13-2011', '17-08-1800']) {
      assert.equal(cocokkan('12345', v, satu('17-08-2011')).status, 'format', `input: ${v}`);
    }
    assert.equal(cocokkan('', '17-08-2011', satu('17-08-2011')).status, 'format');
    assert.equal(cocokkan('12345', '', satu('17-08-2011')).status, 'format');
  });

  it('error dari Google Sheets dilaporkan sebagai status "error"', () => {
    const nodes = { 'Normalisasi Input': [{ json: { credNis: '12345', credDob: '2011-08-17' } }] };
    const j = jalankan('cocokkan-siswa.js', { input: [{ json: { error: 'Service unavailable' } }], nodes })[0].json;
    assert.equal(j.status, 'error');
    assert.equal(j.nama, '');
  });

  it('hanya satu tanggal per percobaan yang diperiksa', () => {
    assert.equal(cocokkan('12345', '18-08-2011 17-08-2011', satu('17-08-2011')).status, 'no_match');
    assert.equal(cocokkan('12345', '17-08-2011 18-08-2011', satu('17-08-2011')).status, 'match');
  });

  it('membaca nama kolom secara toleran & tidak membocorkan tanggal lahir', () => {
    const baris = [{ nis: '12345', ' NAMA ': 'Ahmad Fulan', Rombel: '7A', 'Tgl. Lahir': '17-08-2011', 'Rapor Intrakurikuler': '1AbCdEfGhIjKlMnOpQrStUv', 'Al-Qur\'an': '1QuRaNxxxxxxxxxxxxxxxxxx' }];
    const j = cocokkan('12345', '17-08-2011', baris);
    assert.equal(j.status, 'match');
    assert.equal(j.nama, 'Ahmad Fulan');
    assert.equal(j.kelas, '7A');
    assert.deepEqual(j.files, { intra: '1AbCdEfGhIjKlMnOpQrStUv', kokul: '', quran: '1QuRaNxxxxxxxxxxxxxxxxxx' });
    assert.equal(JSON.stringify(j).includes('2011'), false);
  });

  it('kolom kokurikuler juga bisa bernama Ekstrakurikuler', () => {
    const baris = [{ NIS: 12345, Nama: 'A', Kelas: '7A', 'Tanggal Lahir': '17-08-2011', Ekstrakurikuler: '1EkStRaKuRiKuLeRxxxxxxxx' }];
    assert.equal(cocokkan('12345', '17-08-2011', baris).files.kokul, '1EkStRaKuRiKuLeRxxxxxxxx');
  });

  it('mengekstrak ID file dari tautan Drive atau ID mentah', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUv_-x';
    const files = (nilai) => cocokkan('12345', '17-08-2011', satu('17-08-2011', { Intrakurikuler: nilai })).files.intra;
    assert.equal(files(`https://drive.google.com/file/d/${id}/view?usp=sharing`), id);
    assert.equal(files(`https://drive.google.com/open?id=${id}`), id);
    assert.equal(files(`https://drive.google.com/uc?export=download&id=${id}`), id);
    assert.equal(files(`https://docs.google.com/document/d/${id}/edit`), id);
    assert.equal(files(id), id);
    assert.equal(files(`  ${id}  `), id);
    assert.equal(files(''), '');
    assert.equal(files('belum ada'), '');
    assert.equal(files('https://contoh.com/rapor.pdf'), '');
  });

  it('NIS bertipe angka maupun teks dengan nol di depan', () => {
    const j1 = cocokkan('12345', '17-08-2011', satu('17-08-2011'));
    assert.equal(j1.nis, '12345');
    const j2 = cocokkan('00789', '17-08-2011', [SISWA[1]]);
    assert.equal(j2.status, 'match');
    assert.equal(j2.nis, '00789');
    assert.equal(cocokkan('789', '17-08-2011', [SISWA[1]]).status, 'no_match');
  });
});

// ---------------------------------------------------------------- Alur lengkap (Step 1-4)
describe('Alur percakapan', () => {
  it('Step 1: pesan pertama apa pun -> sambutan + menu', () => {
    for (const kirim of [(b) => b.kirim(pesan('/start')), (b) => b.kirim(pesan('assalamualaikum'))]) {
      const bot = buatBot();
      const r = kirim(bot);
      assert.equal(r.action, 'welcome');
      assert.equal(r.session.state, 'idle');
      assert.equal(bot.tabel.get('111').state, 'idle');
    }
  });

  it('Step 2 & 3: menu SPMB, menu laporan, kembali ke menu utama', () => {
    const bot = buatBot();
    assert.equal(bot.kirim(tombol('m:spmb')).action, 'spmb');
    assert.equal(bot.kirim(tombol('m:lhb')).action, 'menu_lhb');
    assert.equal(bot.kirim(tombol('m:main')).action, 'welcome');
  });

  it('Step 4: intrakurikuler -> NIS + tgl lahir -> nama & kelas -> YA -> PDF', () => {
    const bot = buatBot();
    bot.kirim(tombol('m:lhb'));

    const minta = bot.kirim(tombol('r:intra'));
    assert.equal(minta.action, 'teks');
    assert.match(minta.text, /Rapor Intrakurikuler/);
    assert.match(minta.text, /NIS \[spasi\] tanggal lahir/);
    assert.equal(bot.tabel.get('111').state, 'await_cred');
    assert.equal(bot.tabel.get('111').rapor_type, 'intra');

    const konfirmasi = bot.kirim(pesan('12345 17-08-2011'));
    assert.equal(konfirmasi.action, 'confirm');
    assert.match(konfirmasi.text, /Ahmad Fulan/);
    assert.match(konfirmasi.text, /7A/);
    assert.equal(bot.tabel.get('111').state, 'await_confirm');
    assert.equal(bot.tabel.get('111').file_ref, '1AbCdEfGhIjKlMnOpQrStUv');

    const kirim = bot.kirim(pesan('YA'));
    assert.equal(kirim.action, 'send_doc');
    assert.equal(kirim.fileId, '1AbCdEfGhIjKlMnOpQrStUv');
    assert.equal(kirim.fileName, 'Rapor Intrakurikuler - Ahmad Fulan.pdf');
    assert.equal(kirim.caption, '📄 Rapor Intrakurikuler\nNama: Ahmad Fulan\nKelas: 7A');
    assert.equal(bot.tabel.get('111').state, 'idle');
    assert.equal(bot.tabel.get('111').file_ref, '');
    assert.equal(bot.catatan.sheetsDibaca, 1); // hanya satu kali baca Sheet per rapor
  });

  it('kokurikuler dan Al Qur\'an memakai kolom file masing-masing; tombol YA sama dengan mengetik YA', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:kokul'));
    bot.kirim(pesan('12345 17-08-2011'));
    const k = bot.kirim(tombol('c:ya'));
    assert.equal(k.action, 'send_doc');
    assert.equal(k.fileId, '1KoKuRiKuLeRxxxxxxxxxxxxxx');
    assert.equal(k.fileName, 'Rapor Kokurikuler - Ahmad Fulan.pdf');

    bot.kirim(tombol('r:quran'));
    bot.kirim(pesan('12345 17-08-2011'));
    const q = bot.kirim(pesan('ya'));
    assert.equal(q.fileId, '1QuRaNxxxxxxxxxxxxxxxxxx');
    assert.equal(q.fileName, "Rapor Al Qur'an - Ahmad Fulan.pdf");
  });

  it('nama siswa di-escape untuk HTML dan tanggal lahir dari Sheet bertipe date diterima', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    const r = bot.kirim(pesan('00789 17-08-2011'));
    assert.equal(r.action, 'confirm');
    assert.match(r.text, /Siti &lt;Aisyah&gt; &amp; Co/);
    assert.equal(r.text.includes('<Aisyah>'), false);
  });

  it('dokumen belum tersedia -> tidak diminta konfirmasi', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:kokul'));
    const r = bot.kirim(pesan('00789 17-08-2011'));
    assert.equal(r.action, 'teks');
    assert.match(r.text, /belum tersedia/);
    assert.match(r.text, /Rapor Kokurikuler/);
    assert.equal(bot.tabel.get('111').state, 'idle');
  });

  it('data tidak cocok: pesan sama untuk NIS salah dan tanggal salah, dengan sisa percobaan', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    const a = bot.kirim(pesan('12345 18-08-2011'));
    const b = bot.kirim(pesan('99999 17-08-2011'));
    assert.match(a.text, /Data tidak cocok/);
    assert.match(a.text, /Sisa percobaan: 4/);
    assert.match(b.text, /Sisa percobaan: 3/);
    assert.equal(bot.tabel.get('111').state, 'await_cred'); // boleh mencoba lagi
    assert.equal(a.text.includes('Ahmad'), false);
  });

  it('format salah tidak dihitung sebagai percobaan gagal dan tidak membaca Sheet', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    for (const t of ['halo', '12345', 'sebentar ya', '???']) {
      const r = bot.kirim(pesan(t));
      assert.match(r.text, /Format belum sesuai/, t);
    }
    assert.equal(bot.kirim(pesan('12345 tanggal-salah')).action, 'teks');
    assert.equal(bot.tabel.get('111').fail_count, 0);
    assert.equal(bot.catatan.sheetsDibaca, 0); // ketikan yang tidak terbaca tidak memakai kuota Google Sheets
  });

  it('5 data tidak cocok -> dikunci, lalu terbuka setelah waktunya', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    const sisa = [];
    for (let i = 0; i < 4; i += 1) sisa.push(bot.kirim(pesan('12345 01-01-2010')).text.match(/Sisa percobaan: (\d)/)[1]);
    assert.deepEqual(sisa, ['4', '3', '2', '1']);
    const kunci = bot.kirim(pesan('12345 01-01-2010'));
    assert.match(kunci.text, /dikunci sementara/);
    assert.match(kunci.text, /15 menit/);
    assert.equal(bot.tabel.get('111').state, 'idle');

    // Selama terkunci, memilih rapor ditolak dan NIS+tanggal yang benar pun tidak diproses.
    const dibaca = bot.catatan.sheetsDibaca;
    assert.match(bot.kirim(tombol('r:intra')).text, /dikunci sementara/);
    bot.jam.maju(5);
    const tolak = bot.kirim(tombol('r:quran'));
    assert.match(tolak.text, /10 menit/);
    assert.equal(bot.kirim(pesan('12345 17-08-2011')).action, 'welcome');
    assert.equal(bot.catatan.sheetsDibaca, dibaca); // pengguna terkunci tidak memakai kuota Google Sheets
    // Menu lain tetap bisa dipakai.
    assert.equal(bot.kirim(tombol('m:spmb')).action, 'spmb');

    bot.jam.maju(11);
    const buka = bot.kirim(tombol('r:intra'));
    assert.match(buka.text, /NIS \[spasi\] tanggal lahir/);
    assert.match(bot.kirim(pesan('12345 01-01-2010')).text, /Sisa percobaan: 4/);
  });

  it('percobaan gagal yang sudah lama tidak diperhitungkan (jendela 15 menit)', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 01-01-2010'));
    bot.kirim(pesan('12345 01-01-2010'));
    bot.jam.maju(16);
    bot.kirim(tombol('r:intra'));
    assert.match(bot.kirim(pesan('12345 01-01-2010')).text, /Sisa percobaan: 4/);
  });

  it('berhasil tidak menghapus catatan percobaan gagal (tidak bisa diselingi login sah)', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    for (let i = 0; i < 4; i += 1) bot.kirim(pesan('12345 01-01-2010'));
    bot.kirim(pesan('12345 17-08-2011'));
    bot.kirim(pesan('ya'));
    bot.kirim(tombol('r:intra'));
    assert.match(bot.kirim(pesan('12345 01-01-2010')).text, /dikunci sementara/);
  });

  it('sesi kedaluwarsa setelah 10 menit tanpa balasan', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.jam.maju(11);
    const r = bot.kirim(pesan('12345 17-08-2011'));
    assert.equal(r.action, 'teks');
    assert.match(r.text, /Sesi Anda telah berakhir/);
    assert.equal(bot.tabel.get('111').state, 'idle');
    assert.equal(bot.catatan.sheetsDibaca, 1); // pencarian sudah berjalan sebelum sesi dinilai; hasilnya diabaikan

    // Kedaluwarsa saat menunggu YA.
    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 17-08-2011'));
    bot.jam.maju(11);
    assert.match(bot.kirim(pesan('ya')).text, /Sesi Anda telah berakhir/);
    // Tombol menu lama tetap berfungsi.
    assert.equal(bot.kirim(tombol('m:lhb')).action, 'menu_lhb');
  });

  it('BATAL / tombol batal membatalkan proses; batal saat idle kembali ke sambutan', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    const a = bot.kirim(pesan('/batal'));
    assert.match(a.text, /proses dibatalkan/);
    assert.equal(bot.tabel.get('111').state, 'idle');
    assert.equal(bot.kirim(pesan('batal')).action, 'welcome');

    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 17-08-2011'));
    assert.match(bot.kirim(tombol('c:no')).text, /proses dibatalkan/);
    assert.equal(bot.tabel.get('111').file_ref, '');
  });

  it('YA di luar konteks tidak mengirim dokumen', () => {
    const bot = buatBot();
    assert.equal(bot.kirim(pesan('ya')).action, 'welcome');
    assert.equal(bot.kirim(tombol('c:ya')).action, 'welcome');
    bot.kirim(tombol('r:intra'));
    assert.match(bot.kirim(pesan('ya')).text, /Format belum sesuai/);
    assert.equal(bot.tabel.get('111').state, 'await_cred');
  });

  it('saat menunggu konfirmasi: ketikan lain hanya diingatkan; data baru menggantikan konfirmasi lama', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 17-08-2011'));

    const ingat = bot.kirim(pesan('hmm bentar'));
    assert.match(ingat.text, /Ketik <b>YA<\/b>/);
    assert.match(ingat.text, /Ahmad Fulan/);
    assert.equal(bot.tabel.get('111').state, 'await_confirm');
    assert.match(bot.kirim(pesan('12345 tanggal-ngawur')).text, /Ketik <b>YA<\/b>/); // format salah tidak merusak konfirmasi
    assert.equal(bot.tabel.get('111').state, 'await_confirm');

    const baru = bot.kirim(pesan('00789 17-08-2011'));
    assert.equal(baru.action, 'confirm');
    assert.match(baru.text, /Siti/);
    assert.equal(bot.tabel.get('111').nis, '00789');

    const salah = bot.kirim(pesan('12345 01-01-2010'));
    assert.match(salah.text, /Data tidak cocok/);
    assert.equal(bot.tabel.get('111').state, 'await_cred');
    assert.equal(bot.tabel.get('111').file_ref, '');
    assert.equal(bot.kirim(pesan('ya')).action, 'teks'); // konfirmasi lama sudah tidak berlaku
  });

  it('memilih rapor lain di tengah proses mengulang dari awal', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 17-08-2011'));
    bot.kirim(tombol('r:quran'));
    assert.equal(bot.tabel.get('111').state, 'await_cred');
    assert.equal(bot.tabel.get('111').rapor_type, 'quran');
    assert.equal(bot.tabel.get('111').nis, '');
  });

  it('sesi tiap chat terpisah', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra', { chatId: 1 }));
    bot.kirim(pesan('12345 17-08-2011', { chatId: 1 }));
    assert.equal(bot.kirim(pesan('ya', { chatId: 2 })).action, 'welcome'); // chat lain tidak bisa "YA"
    assert.equal(bot.kirim(pesan('ya', { chatId: 1 })).action, 'send_doc');
  });

  it('grup diabaikan', () => {
    const bot = buatBot();
    assert.equal(bot.kirim(pesan('/start', { tipe: 'supergroup' })).diabaikan, true);
    assert.equal(bot.tabel.size, 0);
  });

  it('Google Sheets error -> pesan gangguan, tidak dihitung gagal, sesi tetap menunggu', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.catatan.sheetsGagal = true;
    for (let i = 0; i < 7; i += 1) {
      const r = bot.kirim(pesan('12345 17-08-2011'));
      assert.equal(r.action, 'teks');
      assert.match(r.text, /belum dapat diperiksa/);
    }
    assert.equal(bot.tabel.get('111').state, 'await_cred');
    assert.equal(bot.tabel.get('111').fail_count, 0);
    assert.equal(bot.tabel.get('111').locked_until, '');
    bot.catatan.sheetsGagal = false;
    assert.equal(bot.kirim(pesan('12345 17-08-2011')).action, 'confirm');
  });

  it('gagal mengirim dokumen -> sesi tidak diubah sehingga YA bisa diulang', () => {
    const bot = buatBot();
    bot.kirim(tombol('r:intra'));
    bot.kirim(pesan('12345 17-08-2011'));
    const gagal = bot.kirim(pesan('ya'), { gagalKirim: true });
    assert.equal(gagal.action, 'send_doc');
    assert.equal(bot.tabel.get('111').state, 'await_confirm');
    assert.equal(bot.kirim(pesan('ya')).action, 'send_doc');
    assert.equal(bot.tabel.get('111').state, 'idle');
  });

  it('bacaSheet meniru filter kolom NIS', () => {
    assert.equal(bacaSheet(SISWA, '12345')[0].json.Nama, 'Ahmad Fulan');
    assert.deepEqual(bacaSheet(SISWA, '54321'), [{ json: {} }]);
    assert.equal(buatJam().sekarang > 0, true);
  });
});
