// db.js — Setup dan koneksi database SQLite
//
// Menggunakan node:sqlite (bawaan Node.js sejak v22, tidak perlu install
// tambahan atau proses build). Database disimpan sebagai satu file
// (toserba.db) di folder yang sama — cukup untuk kebutuhan MVP ini.
//
// Kalau nanti mau upgrade ke better-sqlite3 (lebih matang, tapi perlu
// native build saat instalasi), struktur kode di file lain tidak perlu
// banyak berubah — hanya bagian import & inisialisasi di file ini.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'toserba.db');
const db = new DatabaseSync(DB_PATH);

// Tabel transaksi: satu baris = satu transaksi (bisa berisi banyak barang,
// disimpan di tabel terpisah "transaksi_item" supaya satu transaksi bisa
// punya banyak barang di dalamnya).
db.exec(`
  CREATE TABLE IF NOT EXISTS transaksi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    waktu TEXT NOT NULL,
    total INTEGER NOT NULL,
    staff TEXT
  )
`);

// Tabel item per transaksi. Harga disimpan di sini (bukan hanya merujuk ke
// tabel barang) supaya kalau harga barang berubah di masa depan, history
// transaksi lama tetap menunjukkan harga yang benar saat itu terjadi.
db.exec(`
  CREATE TABLE IF NOT EXISTS transaksi_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaksi_id INTEGER NOT NULL,
    nama_barang TEXT NOT NULL,
    harga_saat_itu INTEGER NOT NULL,
    jumlah INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    FOREIGN KEY (transaksi_id) REFERENCES transaksi(id)
  )
`);

// Tabel barang: menyimpan "harga terakhir yang disepakati" per nama barang.
// Ini yang membuat autocomplete & saran harga bekerja — TIDAK dimaksudkan
// sebagai "master data" yang harus diisi dulu sebelum transaksi bisa
// dilakukan. Baris di tabel ini terbentuk otomatis begitu staff mengetik
// nama barang baru saat transaksi (lihat endpoint POST /api/transaksi).
// nama_barang_lower dipakai untuk pencarian tanpa peduli huruf besar/kecil.
db.exec(`
  CREATE TABLE IF NOT EXISTS barang (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_barang TEXT NOT NULL UNIQUE,
    nama_barang_lower TEXT NOT NULL,
    harga_terakhir INTEGER NOT NULL,
    diperbarui_pada TEXT NOT NULL
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_barang_nama_lower ON barang(nama_barang_lower)
`);

// Tabel pesanan: order printing (job order/custom). Berbeda dari transaksi
// toserba yang selesai seketika, pesanan punya masa pengerjaan sehingga
// perlu melacak DUA hal yang berdiri sendiri:
//   1. status_kerja: pending -> proses -> selesai (progres pengerjaan)
//   2. pembayaran: biaya total vs bayar (DP/cicilan); sisa = biaya - bayar
// "spek" sengaja teks bebas (ukuran/bahan/jumlah dll), bukan field
// terstruktur, sesuai keputusan desain. Nilai uang integer rupiah.
db.exec(`
  CREATE TABLE IF NOT EXISTS pesanan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelanggan TEXT NOT NULL,
    spek TEXT NOT NULL DEFAULT '',
    biaya INTEGER NOT NULL,
    bayar INTEGER NOT NULL DEFAULT 0,
    status_kerja TEXT NOT NULL DEFAULT 'pending'
      CHECK (status_kerja IN ('pending', 'proses', 'selesai')),
    masuk TEXT NOT NULL,
    deadline TEXT NOT NULL
  )
`);

// Tabel rincian barang/jasa per pesanan — OPSIONAL, seperti item nota di
// Kasir (nama, harga, jumlah, subtotal). "biaya" di tabel pesanan TETAP
// jadi sumber kebenaran harga (staff boleh mengubahnya manual, misalnya
// untuk batch besar atau kompleksitas tertentu) — rincian ini murni
// catatan/rincian, bukan yang menentukan biaya secara paksa di server.
db.exec(`
  CREATE TABLE IF NOT EXISTS pesanan_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pesanan_id INTEGER NOT NULL,
    nama_barang TEXT NOT NULL,
    harga INTEGER NOT NULL,
    jumlah INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    FOREIGN KEY (pesanan_id) REFERENCES pesanan(id)
  )
`);

module.exports = db;
