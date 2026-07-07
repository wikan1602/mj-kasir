# Rancangan Sistem Manajemen Usaha (Printing + Toserba)

Status: draf awal, sebagian keputusan masih perlu dikonfirmasi ke orang tua (ditandai dengan ⚠️).

## 1. Ringkasan Konteks

- Pemilik (kamu) tinggal jauh dari lokasi usaha, tidak bisa jadi IT support harian.
- Ada dua unit usaha di satu lokasi: **printing** (job order/custom) dan **toserba** (retail + stok).
- Staff yang mengoperasikan: 1-2 orang, relatif stabil (bukan sering ganti-ganti).
- Tujuan utama: staff bisa input order/transaksi dengan mudah, otomatis tersimpan sebagai history.
- Kamu perlu bisa cek ringkasan dari jauh, tapi cukup laporan — bukan kontrol interaktif real-time.

## 2. Keputusan Infrastruktur (Fase 1 — Laptop, Bukan Server)

Ini rancangan untuk **Windows biasa di laptop yang sudah ada**, bukan server dedicated.

| Komponen | Keputusan | Catatan |
|---|---|---|
| Komputer utama | Laptop yang sudah ada di lokasi (RAM 8GB, Windows, khusus untuk usaha) | Tidak perlu beli mini PC — spek sudah cukup untuk beban sistem ini |
| Peran laptop | Menjalankan aplikasi + menyimpan database, diakses lewat browser | Bukan "server" dalam arti dedicated hardware — cukup software server lokal yang jalan di background |
| Jaringan lokal | Mifi/router portable (pakai kartu unlimited) | ⚠️ Perlu dikonfirmasi ke ortu — sudah dikonfirmasi bisa diadakan |
| Akses HP staff | Browser HP connect ke laptop lewat WiFi lokal (dari mifi) | Tidak butuh internet untuk ini — jaringan lokal cukup |
| Laporan ke pemilik | Ringkasan otomatis dikirim ke WhatsApp saat ada internet | Internet boleh putus-putus, tidak mengganggu operasional harian |
| Mati lampu | Laptop pakai baterai internal (aman untuk transisi), mifi tidak pakai UPS di fase ini | Fallback manual/catatan kertas untuk kasus jarang (~sebulan sekali, bisa berjam-jam) |
| File desain/PDF printing | **Tidak** disimpan di sistem — cukup catatan order (nama, spek, harga, status) | Mengurangi beban penyimpanan signifikan |

### Kenapa "Windows biasa, bukan server"

Laptop ini akan menjalankan software yang berperan sebagai "server lokal" — istilah ini berarti software yang menyediakan data ke device lain di jaringan yang sama (HP staff), **bukan** berarti butuh hardware/OS server khusus (seperti Windows Server). Windows biasa yang dipakai sehari-hari cukup, selama laptop tersebut menyala saat jam operasional.

Konsekuensi praktis:
- Laptop perlu tetap menyala selama jam operasional (idealnya dicolok charger).
- Software yang dipilih harus ringan — tidak butuh instalasi database server yang berat (akan dibahas di bagian arsitektur teknis).
- Karena bukan server dedicated, restart/update Windows sebaiknya dilakukan di luar jam operasional.

## 3. Arsitektur Teknis (Gambaran Umum)

```
[Laptop Windows]
  - Aplikasi web (frontend + backend) berjalan lokal
  - Database lokal (menyimpan semua transaksi & stok)
  - Diakses dari browser laptop itu sendiri (Edge/Chrome)
        |
        | (WiFi lokal dari mifi/router — tanpa perlu internet)
        |
[HP Staff (Android)]
  - Buka alamat laptop lewat browser HP
  - Tampilan sama seperti di laptop, disesuaikan untuk layar kecil

[Saat ada internet]
  - Laptop kirim ringkasan (penjualan harian, stok menipis) ke WhatsApp
```

### Pilihan teknologi (disesuaikan dengan pengalamanmu)

Karena kamu nyaman coding dari nol dan sudah pernah membuat web app yang "numpang" di Edge (mirip WebView2), pendekatan yang disarankan:

- **Satu web app** (bukan aplikasi Android terpisah) — satu codebase, diakses dari browser di laptop maupun HP.
- **Database ringan yang tidak butuh instalasi server terpisah** — jenis database yang cukup berupa satu file (tidak perlu software database server tambahan berjalan di background). Ini menyederhanakan instalasi di laptop karena tidak ada proses server database yang perlu dikonfigurasi terpisah.
- **Backend ringan** yang bisa dijalankan sebagai satu proses di laptop, idealnya bisa diatur untuk otomatis jalan saat laptop menyala (tanpa staff perlu tahu cara "menjalankan aplikasi" secara manual tiap hari).

*(Detail pemilihan teknologi spesifik — bahasa pemrograman, framework — bisa didiskusikan lebih lanjut sesuai preferensimu.)*

## 4. Rancangan Data (Draf Awal)

### 4.1 Toserba

**Barang**
- Nama barang
- Harga jual
- Stok saat ini
- (Opsional, nanti) kategori, satuan (pcs/kg/dll)

**Transaksi Toserba**
- Tanggal & waktu
- Daftar barang yang dibeli (bisa lebih dari satu jenis per transaksi)
- Jumlah per barang
- Harga saat transaksi (disimpan terpisah dari harga barang, supaya kalau harga barang berubah nanti, history transaksi lama tidak ikut berubah)
- Total
- Staff yang input (jika ada lebih dari satu staff)

**Catatan penting**: sistem harus bisa terima input barang yang **belum terdaftar** — staff ketik nama + harga manual saat transaksi, tanpa harus daftarkan dulu. Barang bisa "didaftarkan resmi" belakangan supaya next time tinggal pilih dari daftar.

### 4.2 Printing

**Order Printing**
- Tanggal & waktu order masuk
- Nama pelanggan (opsional, kalau perlu)
- Deskripsi/spek singkat (bebas teks — ukuran, bahan, jumlah, dll)
- Harga
- Status: ⚠️ perlu dikonfirmasi ke ortu — apakah cukup "Pending → Selesai", atau perlu status pembayaran terpisah (misal "DP → Lunas")
- Staff yang input

### 4.3 Ringkasan/Laporan

- Total penjualan toserba per hari
- Total order printing per hari (dan yang masih pending, jika ada)
- Daftar barang dengan stok menipis (ambang batas bisa diatur)
- Dikirim otomatis ke WhatsApp, format ringkas

## 5. Pertanyaan yang Masih Perlu Dikonfirmasi ke Orang Tua

Rancang ini mengasumsikan constraint berikut sudah benar — sebagian sudah dikonfirmasi kamu, sebagian masih perlu ditanyakan langsung:

- [x] Mifi/router bisa diadakan di lokasi
- [x] Laptop yang ada bisa didedikasikan untuk usaha (tidak dipakai untuk hal lain)
- [ ] Order printing: sistem pembayaran DP/lunas, atau bayar langsung selesai?
- [ ] Order printing: perlu simpan detail spek terstruktur (ukuran, bahan, jumlah sebagai field terpisah), atau cukup catatan bebas?
- [ ] Toserba: berapa banyak jenis barang kira-kira? (Menentukan apakah perlu fitur pencarian/kategori dari awal, atau daftar sederhana dulu cukup)
- [ ] Toserba: ada harga khusus/diskon untuk pelanggan tertentu?
- [ ] Laporan: cukup ringkasan harian, atau juga perlu laporan bulanan (misal untuk pembukuan)?

## 6. Urutan Pengembangan yang Disarankan (Bertahap)

Supaya tidak overwhelm membangun semuanya sekaligus:

1. **Tahap 1 — Toserba dasar**: input transaksi (barang belum terdaftar bisa diketik manual), history transaksi tersimpan, laporan harian sederhana.
2. **Tahap 2 — Stok**: pengurangan stok otomatis saat transaksi, alert stok menipis.
3. **Tahap 3 — Printing**: input order printing dengan status sederhana.
4. **Tahap 4 — Laporan WhatsApp otomatis**: baru diotomatisasi setelah data historis sudah cukup untuk diringkas dengan berguna.
5. **Tahap 5 (nanti)**: fitur tambahan sesuai kebutuhan yang muncul setelah dipakai (misal harga khusus, kategori barang, dll).

---

*Dokumen ini adalah rancangan hidup — akan diperbarui seiring diskusi dengan orang tua dan perkembangan development.*
