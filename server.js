// server.js — Server utama aplikasi
//
// Menjalankan web server yang bisa diakses dari browser laptop maupun
// dari HP staff (asal HP terhubung ke jaringan WiFi lokal yang sama).

const express = require('express');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public')); // menyajikan halaman HTML/CSS/JS di folder public/

// --- API: Catat transaksi baru ---
// Menerima daftar barang (nama, harga, jumlah) dan menyimpannya sebagai
// satu transaksi. Tidak memerlukan barang terdaftar sebelumnya — staff
// bisa ketik nama & harga barang secara manual langsung di sini.
//
// PENTING: transaksi SELALU tersimpan dengan harga yang diketik staff saat
// itu, apa pun yang terjadi dengan tabel "barang". Deteksi perubahan harga
// (dibanding harga_terakhir di tabel barang) dilakukan SETELAH transaksi
// tersimpan, dan hanya untuk memberi tahu staff — tidak pernah memblokir
// atau menunda penyimpanan transaksi itu sendiri.
app.post('/api/transaksi', (req, res) => {
  const { items, staff } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Transaksi harus berisi minimal satu barang' });
  }

  for (const item of items) {
    if (!item.nama_barang || typeof item.harga !== 'number' || typeof item.jumlah !== 'number') {
      return res.status(400).json({ error: 'Setiap barang harus punya nama, harga, dan jumlah yang valid' });
    }
    if (item.harga < 0 || item.jumlah <= 0) {
      return res.status(400).json({ error: 'Harga tidak boleh negatif, jumlah harus lebih dari 0' });
    }
  }

  const total = items.reduce((sum, item) => sum + item.harga * item.jumlah, 0);
  const waktu = new Date().toISOString();

  // Menyimpan transaksi dan semua itemnya bersamaan. Kalau salah satu
  // langkah gagal di tengah, semuanya dibatalkan (tidak ada data setengah
  // tersimpan) — penting untuk kasus laptop mati mendadak saat proses ini.
  db.exec('BEGIN');
  try {
    const insertTransaksi = db.prepare(
      'INSERT INTO transaksi (waktu, total, staff) VALUES (?, ?, ?)'
    );
    const result = insertTransaksi.run(waktu, total, staff || null);
    const transaksiId = result.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO transaksi_item (transaksi_id, nama_barang, harga_saat_itu, jumlah, subtotal)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insertItem.run(transaksiId, item.nama_barang, item.harga, item.jumlah, item.harga * item.jumlah);
    }

    db.exec('COMMIT');

    // Setelah transaksi aman tersimpan, baru cek apakah ada harga yang
    // beda dari harga_terakhir tersimpan di tabel barang. Ini murni
    // informasi tambahan untuk staff — transaksi sudah selesai & aman
    // terlepas dari apa pun hasil pengecekan ini.
    const cekHarga = db.prepare('SELECT harga_terakhir FROM barang WHERE nama_barang_lower = ?');
    const perubahanHarga = [];

    for (const item of items) {
      const existing = cekHarga.get(item.nama_barang.toLowerCase());
      if (existing && existing.harga_terakhir !== item.harga) {
        perubahanHarga.push({
          nama_barang: item.nama_barang,
          harga_lama: existing.harga_terakhir,
          harga_baru: item.harga,
        });
      } else if (!existing) {
        // Barang benar-benar baru (belum pernah tersimpan) — langsung
        // simpan sebagai harga awal tanpa perlu konfirmasi, karena tidak
        // ada "harga lama" yang bisa dibandingkan.
        simpanAtauPerbaruiHargaBarang(item.nama_barang, item.harga);
      }
    }

    res.json({ success: true, transaksi_id: Number(transaksiId), total, perubahan_harga: perubahanHarga });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Gagal menyimpan transaksi:', err);
    res.status(500).json({ error: 'Gagal menyimpan transaksi, silakan coba lagi' });
  }
});

// --- API: Cari barang (untuk autocomplete) ---
// Mengembalikan barang yang namanya mengandung kata kunci ?q=, beserta
// harga terakhir yang tersimpan. Dipakai saat staff mengetik nama barang
// di form transaksi.
app.get('/api/barang/cari', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();

  if (!q) {
    return res.json([]);
  }

  const hasil = db
    .prepare(
      `SELECT nama_barang, harga_terakhir FROM barang
       WHERE nama_barang_lower LIKE ?
       ORDER BY diperbarui_pada DESC
       LIMIT 8`
    )
    .all(`%${q}%`);

  res.json(hasil);
});

// --- API: Konfirmasi update harga barang ---
// Dipanggil setelah staff mengonfirmasi popup "harga berubah, update juga
// untuk transaksi berikutnya?". Transaksi yang baru saja dibuat TIDAK
// terpengaruh oleh endpoint ini — endpoint ini hanya memperbarui harga
// acuan untuk transaksi-transaksi berikutnya.
app.post('/api/barang/konfirmasi-harga', (req, res) => {
  const { nama_barang, harga_baru } = req.body;

  if (!nama_barang || typeof harga_baru !== 'number' || harga_baru < 0) {
    return res.status(400).json({ error: 'Nama barang dan harga baru harus valid' });
  }

  simpanAtauPerbaruiHargaBarang(nama_barang, harga_baru);
  res.json({ success: true });
});

// Fungsi bantu: simpan barang baru atau update harga_terakhir kalau sudah ada.
//
// Pencarian barang existing memakai nama_barang_lower (bukan constraint
// UNIQUE di nama_barang, yang case-sensitive dan bisa membuat "Paku 5cm"
// dan "PAKU 5CM" dianggap dua barang berbeda). Kalau barang sudah ada
// (dengan casing apa pun), nama_barang ASLI yang tersimpan pertama kali
// dipertahankan — supaya popup konfirmasi & saran autocomplete konsisten
// menampilkan satu bentuk nama, bukan berganti-ganti tergantung casing
// terakhir yang diketik staff.
function simpanAtauPerbaruiHargaBarang(nama_barang, harga) {
  const now = new Date().toISOString();
  const namaLower = nama_barang.toLowerCase();

  const existing = db.prepare('SELECT id FROM barang WHERE nama_barang_lower = ?').get(namaLower);

  if (existing) {
    db.prepare('UPDATE barang SET harga_terakhir = ?, diperbarui_pada = ? WHERE id = ?').run(
      harga,
      now,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO barang (nama_barang, nama_barang_lower, harga_terakhir, diperbarui_pada)
       VALUES (?, ?, ?, ?)`
    ).run(nama_barang, namaLower, harga, now);
  }
}

// --- API: Lihat history transaksi ---
// Mengembalikan daftar transaksi terbaru beserta detail barangnya.
// Parameter ?limit= membatasi jumlah hasil (default 50 transaksi terakhir).
app.get('/api/transaksi', (req, res) => {
  const limit = Number(req.query.limit) || 50;

  const transaksiList = db
    .prepare('SELECT * FROM transaksi ORDER BY id DESC LIMIT ?')
    .all(limit);

  const getItems = db.prepare('SELECT * FROM transaksi_item WHERE transaksi_id = ?');

  const hasil = transaksiList.map((t) => ({
    ...t,
    items: getItems.all(t.id),
  }));

  res.json(hasil);
});

// --- API: Ringkasan hari ini ---
// Dipakai untuk tampilan ringkasan sederhana di halaman utama.
app.get('/api/ringkasan-hari-ini', (req, res) => {
  const mulaiHariIni = new Date();
  mulaiHariIni.setHours(0, 0, 0, 0);

  const row = db
    .prepare('SELECT COUNT(*) as jumlah_transaksi, COALESCE(SUM(total), 0) as total_penjualan FROM transaksi WHERE waktu >= ?')
    .get(mulaiHariIni.toISOString());

  res.json(row);
});

// ============================================================
//  PESANAN (order printing)
// ============================================================

// --- API: Daftar pesanan ---
// Mengembalikan semua pesanan (terbaru dulu) beserta rincian barang/jasanya
// (kalau ada). Penyaringan semua/aktif/selesai dan pengurutan berdasarkan
// tenggat dilakukan di sisi klien.
app.get('/api/pesanan', (req, res) => {
  const hasil = db.prepare('SELECT * FROM pesanan ORDER BY id DESC').all();
  const getItems = db.prepare('SELECT * FROM pesanan_item WHERE pesanan_id = ?');
  const dengan_items = hasil.map((o) => ({ ...o, items: getItems.all(o.id) }));
  res.json(dengan_items);
});

// --- API: Buat pesanan baru ---
// Menerima nama pelanggan, spek (teks bebas), biaya total, uang muka/DP
// (opsional), tenggat, dan rincian barang/jasa opsional (items, seperti
// item nota di Kasir). Pesanan baru selalu mulai dari status "pending".
//
// PENTING: "biaya" TETAP jadi sumber kebenaran harga, apa pun isi "items".
// Staff boleh mengetik biaya berbeda dari jumlah rincian barang (misal
// untuk batch besar atau kompleksitas tinggi yang harganya dinego) —
// server tidak memaksa biaya = total items. "items" murni rincian/catatan.
app.post('/api/pesanan', (req, res) => {
  const { pelanggan, spek, biaya, bayar, deadline, items } = req.body;

  if (!pelanggan || typeof pelanggan !== 'string' || !pelanggan.trim()) {
    return res.status(400).json({ error: 'Nama pelanggan wajib diisi' });
  }
  if (typeof biaya !== 'number' || !Number.isFinite(biaya) || biaya <= 0) {
    return res.status(400).json({ error: 'Biaya total harus lebih dari 0' });
  }
  // Uang muka opsional; tidak boleh negatif, dan dibatasi maksimal = biaya
  // (tidak mungkin bayar lebih dari total).
  let dp = 0;
  if (bayar != null) {
    if (typeof bayar !== 'number' || !Number.isFinite(bayar) || bayar < 0) {
      return res.status(400).json({ error: 'Uang muka tidak boleh negatif' });
    }
    dp = Math.min(biaya, bayar);
  }
  if (!deadline || typeof deadline !== 'string') {
    return res.status(400).json({ error: 'Tenggat selesai wajib diisi' });
  }
  // Tenggat dari input tanggal (YYYY-MM-DD) dianggap jam 17:00 waktu lokal.
  const deadlineDate = new Date(`${deadline}T17:00:00`);
  if (isNaN(deadlineDate.getTime())) {
    return res.status(400).json({ error: 'Format tenggat tidak valid' });
  }
  // Rincian barang/jasa opsional — order tanpa rincian (cukup spek bebas)
  // tetap valid, sesuai perilaku sebelumnya.
  const itemList = Array.isArray(items) ? items : [];
  for (const item of itemList) {
    if (!item.nama_barang || typeof item.harga !== 'number' || typeof item.jumlah !== 'number') {
      return res.status(400).json({ error: 'Setiap barang harus punya nama, harga, dan jumlah yang valid' });
    }
    if (item.harga < 0 || item.jumlah <= 0) {
      return res.status(400).json({ error: 'Harga tidak boleh negatif, jumlah harus lebih dari 0' });
    }
  }

  const masuk = new Date().toISOString();

  db.exec('BEGIN');
  try {
    const insertPesanan = db.prepare(
      `INSERT INTO pesanan (pelanggan, spek, biaya, bayar, status_kerja, masuk, deadline)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    );
    const result = insertPesanan.run(
      pelanggan.trim(), (spek || '').trim(), biaya, dp, masuk, deadlineDate.toISOString()
    );
    const pesananId = result.lastInsertRowid;

    if (itemList.length > 0) {
      const insertItem = db.prepare(
        `INSERT INTO pesanan_item (pesanan_id, nama_barang, harga, jumlah, subtotal)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const item of itemList) {
        insertItem.run(pesananId, item.nama_barang, item.harga, item.jumlah, item.harga * item.jumlah);
      }
    }

    db.exec('COMMIT');

    const pesanan = db.prepare('SELECT * FROM pesanan WHERE id = ?').get(pesananId);
    pesanan.items = db.prepare('SELECT * FROM pesanan_item WHERE pesanan_id = ?').all(pesananId);
    res.json({ success: true, pesanan });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Gagal menyimpan pesanan:', err);
    res.status(500).json({ error: 'Gagal menyimpan pesanan, silakan coba lagi' });
  }
});

// --- API: Ubah status kerja pesanan ---
// Dipakai tombol "Mulai Kerjakan" (pending -> proses) dan "Tandai Selesai"
// (proses -> selesai). Menerima status tujuan secara eksplisit.
app.post('/api/pesanan/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status_kerja } = req.body;

  if (!['pending', 'proses', 'selesai'].includes(status_kerja)) {
    return res.status(400).json({ error: 'Status kerja tidak valid' });
  }

  const result = db.prepare('UPDATE pesanan SET status_kerja = ? WHERE id = ?').run(status_kerja, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  }
  res.json({ success: true });
});

// --- API: Catat pembayaran pesanan ---
// Menambah jumlah yang dibayar (cicilan/pelunasan). Total bayar dibatasi
// tidak melebihi biaya. Tidak mengubah status kerja — pembayaran dan
// pengerjaan adalah dua jalur yang terpisah.
app.post('/api/pesanan/:id/bayar', (req, res) => {
  const id = Number(req.params.id);
  const { jumlah } = req.body;

  if (typeof jumlah !== 'number' || !Number.isFinite(jumlah) || jumlah <= 0) {
    return res.status(400).json({ error: 'Jumlah bayar harus lebih dari 0' });
  }

  const pesanan = db.prepare('SELECT biaya, bayar FROM pesanan WHERE id = ?').get(id);
  if (!pesanan) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  }

  const bayarBaru = Math.min(pesanan.biaya, pesanan.bayar + jumlah);
  db.prepare('UPDATE pesanan SET bayar = ? WHERE id = ?').run(bayarBaru, id);
  res.json({ success: true, bayar: bayarBaru, sisa: pesanan.biaya - bayarBaru });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log('Untuk diakses dari HP staff, gunakan alamat IP laptop ini, misalnya:');
  console.log(`  http://[IP-laptop]:${PORT}`);
  console.log('(Cara cek IP laptop: buka Command Prompt, ketik "ipconfig", lihat "IPv4 Address")');
});
