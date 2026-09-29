// Membaca sumber Code node dari src/code/. Baris "//@include nama-file.js" diganti isi file tersebut,
// sehingga potongan yang dipakai bersama (mis. parser tanggal) cukup ditulis satu kali.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'code');

export function bacaKode(nama) {
  const isi = readFileSync(path.join(folder, nama), 'utf8');
  return isi
    .replace(/^\/\/@include (\S+)[ \t]*$/gm, (_, berkas) => readFileSync(path.join(folder, berkas), 'utf8').trimEnd())
    .trimEnd();
}
