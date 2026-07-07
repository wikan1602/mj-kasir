# Toserba MVP — Sistem Transaksi Sederhana

MVP (Minimum Viable Product) untuk pencatatan transaksi toserba. Ini adalah
implementasi dari **Tahap 1** di rancangan sistem manajemen usaha —
fokus ke satu hal saja: staff bisa catat transaksi dengan cepat, otomatis
tersimpan sebagai history.

**Fitur yang sudah ada:**
- Input transaksi (bisa banyak barang sekaligus), barang tidak perlu
  didaftarkan dulu — ketik nama & harga manual, langsung tersimpan.
- **Autocomplete barang** — begitu mengetik nama barang yang pernah dicatat
  sebelumnya, muncul saran lengkap dengan harga terakhirnya. Pilih dari
  saran itu untuk mengisi nama & harga otomatis.
- **Konfirmasi perubahan harga** — kalau harga yang diketik ternyata beda
  dari harga terakhir yang tersimpan untuk barang itu, setelah transaksi
  tersimpan akan muncul popup menanyakan apakah harga baru itu mau dipakai
  untuk transaksi berikutnya juga. Transaksi yang baru saja dibuat **tidak
  terpengaruh** oleh jawaban di popup ini — popup ini hanya menentukan
  harga acuan untuk ke depannya.
- History transaksi lengkap dengan rincian per barang.
- Ringkasan total transaksi & penjualan hari ini.

Belum ada: tracking stok, order printing, laporan WhatsApp otomatis, dan
halaman khusus untuk melihat/mengedit semua daftar barang sekaligus (saat
ini daftar barang terbentuk otomatis dari histori transaksi, cukup untuk
kebutuhan sekarang). Itu semua menyusul di tahap berikutnya.

## Cara menjalankan (di laptop Windows)

### Sekali saja saat instalasi pertama

1. Install [Node.js](https://nodejs.org) versi 22 atau lebih baru (pilih yang "LTS").
   Cek dengan membuka Command Prompt, ketik:
   ```
   node --version
   ```
   Harus muncul angka v22.x.x atau lebih tinggi.

2. Salin folder `toserba-mvp` ini ke laptop, misalnya ke `D:\toserba-mvp`.

3. Buka Command Prompt, masuk ke folder tersebut:
   ```
   cd D:\toserba-mvp
   ```

4. Install dependency (sekali saja, butuh internet saat ini):
   ```
   npm install
   ```

### Menjalankan sehari-hari

Dari folder `toserba-mvp`, jalankan:
```
npm start
```

Akan muncul tulisan `Server jalan di http://localhost:3000` — artinya sudah
aktif. **Biarkan jendela Command Prompt ini tetap terbuka** selama jam
operasional (jangan ditutup, boleh di-minimize).

### Mengakses dari laptop itu sendiri

Buka browser (Edge/Chrome), kunjungi:
```
http://localhost:3000
```

### Mengakses dari HP staff

1. Pastikan HP staff terhubung ke WiFi yang sama dengan laptop (dari mifi/router).
2. Cari tahu alamat IP laptop: di Command Prompt, ketik `ipconfig`, cari baris
   **IPv4 Address** (contoh: `192.168.1.5`).
3. Di browser HP, buka:
   ```
   http://192.168.1.5:3000
   ```
   (Ganti dengan IP laptop yang sebenarnya. Alamat ini bisa disimpan sebagai
   bookmark/shortcut di HP supaya tidak perlu ketik ulang setiap hari.)

**Catatan**: IP laptop bisa berubah setiap kali laptop restart atau reconnect
ke jaringan. Kalau HP tiba-tiba tidak bisa connect, cek ulang IP dengan
`ipconfig` — kemungkinan besar cuma berubah angka.

## Struktur file

```
toserba-mvp/
├── server.js       ← server utama, berisi semua endpoint API
├── db.js           ← setup database (SQLite, satu file: toserba.db)
├── package.json    ← daftar dependency
├── toserba.db      ← file database (dibuat otomatis saat pertama jalan)
└── public/         ← halaman yang dibuka di browser
    ├── index.html
    ├── style.css
    └── app.js
```

## Tentang database (toserba.db)

Semua data transaksi tersimpan dalam **satu file**: `toserba.db`, di folder
yang sama dengan `server.js`. Ini penting untuk dipahami:

- **Backup itu sesederhana menyalin satu file ini.** Disarankan salin
  `toserba.db` ke Google Drive atau flashdisk secara berkala (misal
  mingguan) sebagai cadangan.
- **Jangan hapus atau pindahkan file ini** kecuali sudah dibackup — semua
  history transaksi ada di dalamnya.
- File ini akan terus bertambah besar seiring waktu, tapi untuk skala
  transaksi toserba ini, ukurannya akan tetap kecil (hitungan MB) bahkan
  setelah bertahun-tahun.

## Kalau server tidak bisa diakses dari HP

Kemungkinan penyebab, urut dari yang paling sering:

1. **HP tidak terhubung ke WiFi yang sama dengan laptop** — cek pengaturan WiFi di HP.
2. **IP laptop berubah** — cek ulang dengan `ipconfig`.
3. **Windows Firewall memblokir koneksi** — saat pertama kali menjalankan
   `npm start`, Windows mungkin menampilkan popup "Allow access?" — pilih
   **Allow** (terutama untuk "Private networks").
4. **Laptop dalam mode sleep/hibernate** — pastikan pengaturan power laptop
   tidak membuatnya tidur otomatis saat dicolok charger.

## Catatan teknis (untuk pengembangan lanjutan)

- Database menggunakan `node:sqlite`, modul bawaan Node.js (tidak perlu
  instalasi terpisah). Saat ini masih berstatus "experimental" di Node.js —
  warning yang muncul saat start (`ExperimentalWarning: SQLite...`) itu
  normal dan bisa diabaikan. Kalau suatu saat ingin pindah ke library yang
  lebih matang (misal `better-sqlite3`), struktur kode di `server.js` tidak
  banyak berubah — hanya bagian koneksi database di `db.js`.
- Harga barang disimpan di setiap baris transaksi (`harga_saat_itu`), bukan
  hanya merujuk ke tabel barang — supaya history transaksi lama tidak
  berubah kalau harga barang saat ini berbeda.
- Belum ada sistem login/autentikasi staff — sesuai keputusan awal (MVP
  fokus ke fungsi inti dulu). Field `staff` di transaksi saat ini opsional
  dan belum ada UI untuk mengisinya secara eksplisit.

## Langkah berikutnya (sesuai rancangan Tahap 2 dst.)

- Tracking stok otomatis berkurang saat transaksi
- Alert stok menipis
- Input order printing
- Laporan otomatis ke WhatsApp
