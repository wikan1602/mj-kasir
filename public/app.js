// app.js — logika view Kasir desktop.
//
// Alur: staff ketik nama barang (autocomplete dari server) -> atur harga &
// jumlah lewat keypad besar -> "Tambah ke Nota" -> ulangi -> "Simpan
// Transaksi". Semua data disambungkan ke backend Express/SQLite yang sudah
// ada (tidak ada perubahan di sisi server untuk view ini).

// ---- State di memori (satu transaksi yang sedang disusun) ----
const state = {
  nota: [],            // [{ nama, harga, jumlah }]
  draftNama: '',
  hargaStr: '',        // string angka mentah dari keypad
  jumlahStr: '1',
  activeField: 'jumlah', // 'harga' | 'jumlah' — kotak mana yang diketik keypad
  fresh: true,         // true = ketukan angka berikutnya mengganti (bukan menambah)
  suggestions: [],     // hasil autocomplete terakhir
};

// ---- Ambil elemen ----
const $ = (id) => document.getElementById(id);
const inputNama = $('input-nama');
const saranBox = $('saran-box');
const boxHarga = $('box-harga');
const boxJumlah = $('box-jumlah');
const draftHargaEl = $('draft-harga');
const draftJumlahEl = $('draft-jumlah');
const subtotalDraftEl = $('subtotal-draft');
const notaListEl = $('nota-list');
const notaCountLabel = $('nota-count-label');
const totalDisplay = $('total-display');
const btnSimpan = $('btn-simpan');
const btnKosongkan = $('btn-kosongkan');
const toastEl = $('toast');

// ---- Util ----
function formatRupiah(angka) {
  return 'Rp ' + (Number(angka) || 0).toLocaleString('id-ID');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer;
function toast(teks, tipe) {
  clearTimeout(toastTimer);
  toastEl.textContent = teks;
  toastEl.className = 'toast tampil' + (tipe === 'error' ? ' error' : '');
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
}

// ============================================================
//  KEYPAD — mengetik ke kotak Harga atau Jumlah yang sedang aktif
// ============================================================
function keyForActive() {
  return state.activeField === 'harga' ? 'hargaStr' : 'jumlahStr';
}

function pressDigit(d) {
  const key = keyForActive();
  let str = state.fresh ? '' : state[key];
  if (str.length >= 9) return;      // batasi supaya angka tidak kebablasan
  state[key] = str + d;
  state.fresh = false;
  renderDraft();
}

function clearField() {
  state[keyForActive()] = '';
  state.fresh = false;
  renderDraft();
}

function backspace() {
  const key = keyForActive();
  state[key] = state[key].slice(0, -1);
  state.fresh = false;
  renderDraft();
}

function setActiveField(f) {
  state.activeField = f;
  state.fresh = true;               // ketukan berikutnya mulai dari awal
  renderDraft();
}

// ============================================================
//  AUTOCOMPLETE — cari barang dari server (debounce 250ms)
// ============================================================
let debounceTimer;
inputNama.addEventListener('input', () => {
  state.draftNama = inputNama.value;
  clearTimeout(debounceTimer);
  const q = inputNama.value.trim();

  if (q.length < 2) {
    tutupSaran();
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/barang/cari?q=${encodeURIComponent(q)}`);
      state.suggestions = await res.json();
      renderSaran();
    } catch {
      // Gagal ambil saran bukan masalah — staff tetap bisa ketik manual.
      tutupSaran();
    }
  }, 250);
});

function renderSaran() {
  if (!state.suggestions.length) {
    tutupSaran();
    return;
  }
  saranBox.innerHTML = state.suggestions
    .map(
      (b) =>
        `<div class="saran-item" data-nama="${escapeHtml(b.nama_barang)}" data-harga="${b.harga_terakhir}">
          <span class="saran-nama">${escapeHtml(b.nama_barang)}</span>
          <span class="saran-harga">${formatRupiah(b.harga_terakhir)}</span>
        </div>`
    )
    .join('');
  saranBox.classList.add('tampil');
}

function tutupSaran() {
  saranBox.classList.remove('tampil');
}

// Klik salah satu saran -> isi nama + harga, fokus ke jumlah.
saranBox.addEventListener('click', (e) => {
  const item = e.target.closest('.saran-item');
  if (!item) return;
  pilihBarang(item.dataset.nama, Number(item.dataset.harga));
});

function pilihBarang(nama, harga) {
  state.draftNama = nama;
  state.hargaStr = String(harga);
  state.jumlahStr = '1';
  state.activeField = 'jumlah';
  state.fresh = true;
  inputNama.value = nama;
  tutupSaran();
  renderDraft();
}

// Sembunyikan saran kalau klik di luar area input nama.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.field-nama')) tutupSaran();
});

// ============================================================
//  NOTA — tambah / hapus / kosongkan
// ============================================================
function addToNota() {
  const nama = state.draftNama.trim();
  const harga = Number(state.hargaStr) || 0;
  const jumlah = Number(state.jumlahStr) || 0;

  if (!nama) { toast('Isi nama barang dulu', 'error'); inputNama.focus(); return; }
  if (harga <= 0) { toast('Isi harga barang dulu', 'error'); return; }
  if (jumlah <= 0) { toast('Jumlah harus lebih dari 0', 'error'); return; }

  state.nota.push({ nama, harga, jumlah });

  // Reset kolom entry untuk barang berikutnya.
  state.draftNama = '';
  state.hargaStr = '';
  state.jumlahStr = '1';
  state.activeField = 'jumlah';
  state.fresh = true;
  state.suggestions = [];
  inputNama.value = '';
  tutupSaran();

  renderNota();
  renderDraft();
  inputNama.focus();
}

function removeItem(idx) {
  state.nota.splice(idx, 1);
  renderNota();
}

function clearNota() {
  if (!state.nota.length) return;
  state.nota = [];
  renderNota();
}

// ============================================================
//  PEMBAYARAN & KEMBALIAN
//  Tombol "Bayar" tidak langsung menyimpan — membuka modal untuk memasukkan
//  uang yang diterima dan menghitung kembalian. Transaksi baru disimpan
//  setelah staff mengonfirmasi di modal ini.
// ============================================================
let bayarTotal = 0; // total transaksi yang sedang dibayar

function bukaBayar() {
  if (!state.nota.length) { toast('Nota masih kosong', 'error'); return; }
  bayarTotal = state.nota.reduce((s, i) => s + i.harga * i.jumlah, 0);
  $('bayar-total').textContent = formatRupiah(bayarTotal);
  $('bayar-uang').value = '';
  renderNominalCepat(bayarTotal);
  renderKembalian();
  $('bayar-overlay').classList.add('tampil');
  $('bayar-uang').focus();
}

function tutupBayar() { $('bayar-overlay').classList.remove('tampil'); }

// Saran nominal cepat: "uang pas" (persis total) + beberapa pembulatan ke
// atas ke pecahan uang yang umum, supaya staff cukup satu ketuk.
function hitungSaranNominal(total) {
  const set = new Set([total]);
  [5000, 10000, 20000, 50000, 100000].forEach((k) => {
    set.add(Math.ceil(total / k) * k);
  });
  return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 5);
}

function renderNominalCepat(total) {
  const saran = hitungSaranNominal(total);
  $('bayar-nominal').innerHTML = saran
    .map((v, i) => `<button class="bayar-chip" data-nominal="${v}">${i === 0 ? 'Uang pas' : formatRupiah(v)}</button>`)
    .join('');
}

function renderKembalian() {
  const uang = Number($('bayar-uang').value) || 0;
  const kembali = uang - bayarTotal;
  const box = $('bayar-kembali-box');
  const el = $('bayar-kembali');
  const btn = $('bayar-simpan');

  if (uang === 0) {
    el.textContent = 'Rp 0';
    box.className = 'bayar-kembali-box';
    btn.disabled = true;
  } else if (kembali < 0) {
    el.textContent = 'Kurang ' + formatRupiah(-kembali);
    box.className = 'bayar-kembali-box kurang';
    btn.disabled = true;
  } else {
    el.textContent = formatRupiah(kembali);
    box.className = 'bayar-kembali-box cukup';
    btn.disabled = false;
  }
}

function konfirmasiBayar() {
  const uang = Number($('bayar-uang').value) || 0;
  if (uang < bayarTotal) { toast('Uang diterima masih kurang', 'error'); return; }
  simpanTransaksi(uang - bayarTotal);
}

// ============================================================
//  SIMPAN TRANSAKSI
//  Dipanggil dari modal pembayaran. Transaksi SELALU tersimpan dengan harga
//  yang diketik. Popup perubahan harga muncul SETELAH itu (kalau ada) dan
//  hanya memperbarui harga acuan untuk transaksi berikutnya. Nilai kembalian
//  hanya untuk ditampilkan di notifikasi — tidak disimpan ke server.
// ============================================================
async function simpanTransaksi(kembalian) {
  if (!state.nota.length) { toast('Nota masih kosong', 'error'); return; }

  const items = state.nota.map((it) => ({
    nama_barang: it.nama,
    harga: it.harga,
    jumlah: it.jumlah,
  }));

  const btn = $('bayar-simpan');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const res = await fetch('/api/transaksi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan transaksi');

    const infoKembali = kembalian > 0 ? ' · Kembalian ' + formatRupiah(kembalian) : '';
    toast('Transaksi tersimpan — ' + formatRupiah(data.total) + infoKembali, 'sukses');
    state.nota = [];
    renderNota();
    muatRingkasan();
    tutupBayar();

    if (data.perubahan_harga && data.perubahan_harga.length > 0) {
      tampilkanPopupPerubahanHarga(data.perubahan_harga);
    }
  } catch (err) {
    toast(err.message || 'Terjadi kesalahan, cek koneksi', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Transaksi';
  }
}

// ============================================================
//  POPUP PERUBAHAN HARGA
// ============================================================
function tampilkanPopupPerubahanHarga(perubahanList) {
  const overlay = $('popup-overlay');
  const daftarEl = $('popup-daftar-perubahan');

  daftarEl.innerHTML = perubahanList
    .map(
      (p) => `
        <div class="popup-perubahan-item">
          <div class="popup-perubahan-nama">${escapeHtml(p.nama_barang)}</div>
          <span class="popup-harga-lama">${formatRupiah(p.harga_lama)}</span>
          <span class="popup-panah">&rarr;</span>
          <span class="popup-harga-baru">${formatRupiah(p.harga_baru)}</span>
        </div>`
    )
    .join('');

  overlay.classList.add('tampil');

  // Ganti tombol dengan klon segar supaya listener tidak menumpuk kalau
  // popup muncul berkali-kali.
  const btnSimpanLama = $('popup-simpan');
  const btnLewatiLama = $('popup-lewati');
  const btnSimpanBaru = btnSimpanLama.cloneNode(true);
  const btnLewatiBaru = btnLewatiLama.cloneNode(true);
  btnSimpanLama.replaceWith(btnSimpanBaru);
  btnLewatiLama.replaceWith(btnLewatiBaru);

  btnLewatiBaru.addEventListener('click', () => overlay.classList.remove('tampil'));

  btnSimpanBaru.addEventListener('click', async () => {
    btnSimpanBaru.disabled = true;
    btnSimpanBaru.textContent = 'Menyimpan...';
    try {
      for (const p of perubahanList) {
        await fetch('/api/barang/konfirmasi-harga', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama_barang: p.nama_barang, harga_baru: p.harga_baru }),
        });
      }
      overlay.classList.remove('tampil');
    } catch {
      // Transaksi sudah aman tersimpan sebelumnya, jadi gagal di sini
      // tidak kritis — biarkan staff coba lagi.
      btnSimpanBaru.disabled = false;
      btnSimpanBaru.textContent = 'Ya, simpan harga baru';
    }
  });
}

// ============================================================
//  RINGKASAN HARI INI (di header)
// ============================================================
async function muatRingkasan() {
  try {
    const res = await fetch('/api/ringkasan-hari-ini');
    const data = await res.json();
    $('today-total').textContent = formatRupiah(data.total_penjualan);
    $('today-count').textContent = data.jumlah_transaksi;
  } catch {
    // Diamkan — angka ringkasan tidak kritis untuk mencatat transaksi.
  }
}

// ============================================================
//  RENDER
// ============================================================
function renderNota() {
  if (!state.nota.length) {
    notaListEl.innerHTML = `
      <div class="nota-empty">
        <div class="nota-empty-icon">🧾</div>
        <div class="nota-empty-title">Belum ada barang</div>
        <div class="nota-empty-text">Ketik nama barang di panel sebelah untuk mulai transaksi.</div>
      </div>`;
    notaCountLabel.textContent = 'Belum ada barang';
    btnKosongkan.disabled = true;
  } else {
    notaListEl.innerHTML = state.nota
      .map(
        (it, idx) => `
        <div class="nota-row">
          <div class="nota-nama">${escapeHtml(it.nama)}</div>
          <div class="nota-jml">×${it.jumlah}</div>
          <div class="nota-harga">${formatRupiah(it.harga)}</div>
          <div class="nota-subtotal">${formatRupiah(it.harga * it.jumlah)}</div>
          <button class="btn-hapus-item" data-idx="${idx}" aria-label="Hapus barang ini">×</button>
        </div>`
      )
      .join('');
    notaCountLabel.textContent = state.nota.length + ' jenis barang';
    btnKosongkan.disabled = false;
  }

  const total = state.nota.reduce((s, i) => s + i.harga * i.jumlah, 0);
  totalDisplay.textContent = formatRupiah(total);
}

function renderDraft() {
  const harga = Number(state.hargaStr) || 0;
  const jumlah = Number(state.jumlahStr) || 0;

  draftHargaEl.textContent = harga > 0 ? formatRupiah(harga) : 'Rp 0';
  draftJumlahEl.textContent = state.jumlahStr === '' ? '0' : state.jumlahStr;
  subtotalDraftEl.textContent = formatRupiah(harga * jumlah);

  boxHarga.classList.toggle('active', state.activeField === 'harga');
  boxJumlah.classList.toggle('active', state.activeField === 'jumlah');
}

// ============================================================
//  RIWAYAT — daftar transaksi (ringkasan, pencarian, kelompok per tanggal)
//  Data diambil sekali dari server lalu ringkasan/pencarian/pengelompokan
//  dihitung di sisi klien (cukup untuk skala toserba). Diambil ulang tiap
//  kali tab Riwayat dibuka supaya transaksi baru ikut muncul.
// ============================================================
let riwayatData = [];
const rwList = $('rw-list');
const rwSearch = $('rw-search');

async function muatRiwayat() {
  rwList.innerHTML = '<div class="rw-loading">Memuat riwayat…</div>';
  try {
    const res = await fetch('/api/transaksi?limit=500');
    riwayatData = await res.json();
    renderRiwayat();
  } catch {
    rwList.innerHTML = '<div class="rw-empty">Gagal memuat riwayat (cek koneksi).</div>';
  }
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function labelTanggal(d) {
  const now = new Date();
  if (sameDay(d, now)) return 'Hari ini';
  const kemarin = new Date(now);
  kemarin.setDate(kemarin.getDate() - 1);
  if (sameDay(d, kemarin)) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderRiwayat() {
  const now = new Date();

  // --- Kartu ringkasan (dari SELURUH data, tidak terpengaruh pencarian) ---
  const awalMinggu = new Date(now);
  awalMinggu.setDate(awalMinggu.getDate() - 6);
  awalMinggu.setHours(0, 0, 0, 0);

  let todayTotal = 0, todayCount = 0, weekTotal = 0, weekCount = 0;
  riwayatData.forEach((t) => {
    const w = new Date(t.waktu);
    if (sameDay(w, now)) { todayTotal += t.total; todayCount++; }
    if (w >= awalMinggu) { weekTotal += t.total; weekCount++; }
  });

  $('rw-hari-ini').textContent = formatRupiah(todayTotal);
  $('rw-hari-ini-count').textContent = todayCount;
  $('rw-minggu').textContent = formatRupiah(weekTotal);
  $('rw-minggu-count').textContent = weekCount;
  $('rw-rata').textContent = formatRupiah(weekCount ? Math.round(weekTotal / weekCount) : 0);

  // --- Daftar (dengan filter pencarian nama barang) ---
  const q = rwSearch.value.toLowerCase().trim();
  let list = riwayatData.slice();
  if (q) list = list.filter((t) => t.items.some((i) => i.nama_barang.toLowerCase().includes(q)));
  list.sort((a, b) => new Date(b.waktu) - new Date(a.waktu));

  if (list.length === 0) {
    rwList.innerHTML = `<div class="rw-empty">${q ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.'}</div>`;
    return;
  }

  // Kelompokkan per tanggal (urut sudah desc, jadi grup mengikuti urutan).
  const groups = [];
  list.forEach((t) => {
    const w = new Date(t.waktu);
    const key = w.toDateString();
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, tanggal: w, transaksi: [] }; groups.push(g); }
    g.transaksi.push(t);
  });

  rwList.innerHTML = groups.map(renderGrup).join('');
}

function renderGrup(g) {
  const totalGrup = g.transaksi.reduce((s, t) => s + t.total, 0);
  const kartu = g.transaksi.map(renderTrxCard).join('');
  return `
    <div>
      <div class="rw-group-head">
        <div class="rw-group-date">${labelTanggal(g.tanggal)}</div>
        <div class="rw-group-meta">${g.transaksi.length} transaksi · ${formatRupiah(totalGrup)}</div>
      </div>
      <div class="rw-group-grid">${kartu}</div>
    </div>`;
}

// Kartu di Riwayat hanya menampilkan beberapa item pertama supaya tidak
// membuat kartu melonjak tinggi kalau transaksinya punya banyak jenis
// barang (mis. belanja bulanan). Sisanya diringkas jadi "+N barang
// lainnya" — klik kartu untuk lihat detail lengkap lewat modal.
const RW_ITEM_PREVIEW = 4;

function renderTrxCard(t) {
  const jam = new Date(t.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const tampil = t.items.slice(0, RW_ITEM_PREVIEW);
  const sisa = t.items.length - tampil.length;

  const baris = tampil
    .map(
      (i) =>
        `<div class="rw-trx-item">
          <span class="rw-trx-item-nama">${escapeHtml(i.nama_barang)} ×${i.jumlah}</span>
          <span class="rw-trx-item-sub">${formatRupiah(i.subtotal)}</span>
        </div>`
    )
    .join('');
  const lainnya = sisa > 0 ? `<div class="rw-trx-more">+${sisa} barang lainnya</div>` : '';

  return `
    <div class="rw-trx-card" data-trx-id="${t.id}">
      <div class="rw-trx-head">
        <span class="rw-trx-jam">🕐 ${jam}</span>
        <span class="rw-trx-total">${formatRupiah(t.total)}</span>
      </div>
      ${baris}
      ${lainnya}
    </div>`;
}

// ---- Modal detail transaksi (dipanggil dari klik kartu Riwayat) ----
function bukaDetailTrx(id) {
  const t = riwayatData.find((x) => x.id === id);
  if (!t) return;

  $('detail-trx-waktu').textContent = new Date(t.waktu).toLocaleString('id-ID', {
    dateStyle: 'full', timeStyle: 'short',
  });
  $('detail-trx-list').innerHTML = t.items
    .map(
      (i) =>
        `<div class="detail-trx-item">
          <span class="detail-trx-item-nama">${escapeHtml(i.nama_barang)} ×${i.jumlah}</span>
          <span class="detail-trx-item-sub">${formatRupiah(i.subtotal)}</span>
        </div>`
    )
    .join('');
  $('detail-trx-total').textContent = formatRupiah(t.total);
  $('detail-trx-overlay').classList.add('tampil');
}

function tutupDetailTrx() { $('detail-trx-overlay').classList.remove('tampil'); }

// ============================================================
//  PESANAN — order printing (status kerja + pembayaran DP/lunas)
//  Data diambil dari server; ringkasan, penyaringan, pengurutan, dan
//  logika tenggat dihitung di sisi klien. Aksi (maju status, catat bayar,
//  buat pesanan) memanggil endpoint lalu memuat ulang daftar.
// ============================================================
let pesananData = [];
let pesananFilter = 'aktif';
let payTargetId = null;

const psList = $('ps-list');

// Warna badge status kerja & garis tepi kartu.
const KERJA_META = {
  pending: { label: 'Pending', color: '#6B7684', bg: '#EEF1F5', garis: '#C4CBD4' },
  proses:  { label: 'Dikerjakan', color: '#1D5089', bg: '#EAF3FB', garis: '#3C9AD9' },
  selesai: { label: 'Selesai', color: '#2C7A4B', bg: '#E4F2EA', garis: '#2C7A4B' },
};

// Selisih hari dari hari ini ke tenggat (0 = hari ini, negatif = lewat).
function dayDiff(iso) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

async function muatPesanan() {
  psList.innerHTML = '<div class="ps-loading">Memuat pesanan…</div>';
  try {
    const res = await fetch('/api/pesanan');
    pesananData = await res.json();
    renderPesanan();
  } catch {
    psList.innerHTML = '<div class="ps-empty">Gagal memuat pesanan (cek koneksi).</div>';
  }
}

function renderPesanan() {
  // --- Ringkasan (dari seluruh data) ---
  const aktif = pesananData.filter((o) => o.status_kerja !== 'selesai');
  const urgent = aktif.filter((o) => dayDiff(o.deadline) <= 2);
  const sisaTotal = pesananData.reduce((s, o) => s + Math.max(0, o.biaya - o.bayar), 0);

  $('ps-aktif').textContent = aktif.length;
  $('ps-urgent').textContent = urgent.length;
  $('ps-sisa').textContent = formatRupiah(sisaTotal);
  setBadgePesanan(aktif.length);

  // --- Daftar (dengan filter) ---
  let list = pesananData.slice();
  if (pesananFilter === 'aktif') list = list.filter((o) => o.status_kerja !== 'selesai');
  else if (pesananFilter === 'selesai') list = list.filter((o) => o.status_kerja === 'selesai');

  // Selesai turun ke bawah; sisanya urut berdasarkan tenggat terdekat.
  list.sort((a, b) => {
    const as = a.status_kerja === 'selesai' ? 1 : 0;
    const bs = b.status_kerja === 'selesai' ? 1 : 0;
    if (as !== bs) return as - bs;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  if (list.length === 0) {
    psList.innerHTML = '<div class="ps-empty">Belum ada pesanan di kategori ini.</div>';
    return;
  }
  psList.innerHTML = list.map(renderOrderCard).join('');
}

function renderOrderCard(o) {
  const sisa = Math.max(0, o.biaya - o.bayar);
  const diff = dayDiff(o.deadline);
  const km = KERJA_META[o.status_kerja];

  // Chip tenggat: teks & warna sesuai urgensi.
  let chipSub, chipBg, chipCol;
  if (o.status_kerja === 'selesai') { chipSub = 'Selesai'; chipBg = '#E4F2EA'; chipCol = '#2C7A4B'; }
  else if (diff < 0) { chipSub = 'Terlambat ' + (-diff) + ' hari'; chipBg = '#FBE7E1'; chipCol = '#C0492E'; }
  else if (diff === 0) { chipSub = 'Hari ini'; chipBg = '#FBE7E1'; chipCol = '#C0492E'; }
  else if (diff === 1) { chipSub = 'Besok'; chipBg = '#FDF0DC'; chipCol = '#D9820A'; }
  else if (diff <= 2) { chipSub = 'H-' + diff; chipBg = '#FDF0DC'; chipCol = '#D9820A'; }
  else { chipSub = 'H-' + diff; chipBg = '#EEF1F5'; chipCol = '#6B7684'; }

  const sisaColor = sisa > 0 ? '#D9820A' : '#2C7A4B';
  const sisaFmt = sisa > 0 ? formatRupiah(sisa) : 'Lunas';
  const tglOpt = { day: 'numeric', month: 'short' };
  const masukLabel = 'Masuk ' + new Date(o.masuk).toLocaleDateString('id-ID', tglOpt);
  const deadlineLabel = new Date(o.deadline).toLocaleDateString('id-ID', tglOpt);

  const belumSelesai = o.status_kerja !== 'selesai';
  const nextStatus = o.status_kerja === 'pending' ? 'proses' : 'selesai';
  const majuLabel = o.status_kerja === 'pending' ? 'Mulai Kerjakan' : 'Tandai Selesai';

  const btnMaju = belumSelesai
    ? `<button class="btn-ps-maju" data-maju="${o.id}" data-next="${nextStatus}">${majuLabel}</button>` : '';
  const btnBayar = sisa > 0
    ? `<button class="btn-ps-bayar" data-bayar="${o.id}">Catat Bayar</button>` : '';

  return `
    <div class="ps-order" style="border-left:5px solid ${km.garis};">
      <div class="ps-order-main">
        <div class="ps-order-top">
          <span class="ps-order-nama">${escapeHtml(o.pelanggan)}</span>
          <span class="ps-kerja-badge" style="background:${km.bg};color:${km.color};">${km.label}</span>
        </div>
        <div class="ps-order-spek">${escapeHtml(o.spek || '(tanpa catatan)')}</div>
        ${o.items && o.items.length ? `<button class="ps-item-count" data-detail-pesanan="${o.id}">🧾 ${o.items.length} barang · lihat rincian</button>` : ''}
        <div class="ps-order-masuk">${masukLabel}</div>
      </div>
      <div class="ps-order-uang">
        <div><div class="ps-uang-label">BIAYA</div><div class="ps-uang-val">${formatRupiah(o.biaya)}</div></div>
        <div><div class="ps-uang-label">DIBAYAR</div><div class="ps-uang-val ps-uang-val-hijau">${formatRupiah(o.bayar)}</div></div>
        <div><div class="ps-uang-label">SISA</div><div class="ps-uang-val" style="color:${sisaColor};">${sisaFmt}</div></div>
      </div>
      <div class="ps-order-sep"></div>
      <div class="ps-order-tenggat">
        <div class="ps-tenggat-label">TENGGAT</div>
        <div class="ps-tenggat-tgl">${deadlineLabel}</div>
        <div class="ps-tenggat-chip" style="background:${chipBg};color:${chipCol};">${chipSub}</div>
      </div>
      <div class="ps-order-aksi">${btnMaju}${btnBayar}</div>
    </div>`;
}

function setBadgePesanan(n) {
  const badge = $('pesanan-badge');
  badge.textContent = n;
  badge.hidden = n === 0;
}

// ---- Aksi: maju status kerja ----
async function majuStatus(id, nextStatus) {
  try {
    const res = await fetch(`/api/pesanan/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_kerja: nextStatus }),
    });
    if (!res.ok) throw new Error();
    muatPesanan();
  } catch {
    toast('Gagal memperbarui status', 'error');
  }
}

// ---- Rincian barang/jasa di form Pesanan Baru (opsional, seperti nota) ----
// Menambah/menghapus item di sini otomatis mengisi ulang Biaya Total (jumlah
// semua item) — tapi staff tetap bisa mengubah Biaya Total secara manual
// sesudahnya (mis. untuk batch besar/kompleksitas tinggi yang dinego).
let orderItems = [];

function tambahOrderItem() {
  const nama = $('of-item-nama').value.trim();
  const harga = Number($('of-item-harga').value) || 0;
  const jumlah = Number($('of-item-jumlah').value) || 0;

  if (!nama) { toast('Isi nama barang/jasa dulu', 'error'); return; }
  if (harga <= 0) { toast('Isi harga dulu', 'error'); return; }
  if (jumlah <= 0) { toast('Jumlah harus lebih dari 0', 'error'); return; }

  orderItems.push({ nama, harga, jumlah });
  $('of-item-nama').value = '';
  $('of-item-harga').value = '';
  $('of-item-jumlah').value = '1';
  renderOrderItems();
  $('of-item-nama').focus();
}

function hapusOrderItem(idx) {
  orderItems.splice(idx, 1);
  renderOrderItems();
}

function renderOrderItems() {
  $('of-item-list').innerHTML = orderItems
    .map(
      (it, idx) => `
        <div class="of-item-row">
          <span class="of-item-row-nama">${escapeHtml(it.nama)} ×${it.jumlah}</span>
          <span class="of-item-row-subtotal">${formatRupiah(it.harga * it.jumlah)}</span>
          <button type="button" class="of-item-row-hapus" data-idx="${idx}" aria-label="Hapus barang ini">×</button>
        </div>`
    )
    .join('');

  if (orderItems.length) {
    $('of-biaya').value = orderItems.reduce((s, it) => s + it.harga * it.jumlah, 0);
  }
}

// ---- Modal: buat pesanan baru ----
function bukaOrderForm() {
  ['of-pelanggan', 'of-spek', 'of-biaya', 'of-bayar', 'of-deadline', 'of-item-nama', 'of-item-harga'].forEach((id) => { $(id).value = ''; });
  $('of-item-jumlah').value = '1';
  orderItems = [];
  renderOrderItems();
  $('order-overlay').classList.add('tampil');
  $('of-pelanggan').focus();
}
function tutupOrderForm() { $('order-overlay').classList.remove('tampil'); }

async function simpanPesanan() {
  const pelanggan = $('of-pelanggan').value.trim();
  const spek = $('of-spek').value.trim();
  const biaya = Number($('of-biaya').value) || 0;
  const bayar = Number($('of-bayar').value) || 0;
  const deadline = $('of-deadline').value;
  const items = orderItems.map((it) => ({ nama_barang: it.nama, harga: it.harga, jumlah: it.jumlah }));

  if (!pelanggan) { toast('Isi nama pelanggan dulu', 'error'); return; }
  if (biaya <= 0) { toast('Isi biaya total dulu', 'error'); return; }
  if (!deadline) { toast('Pilih tenggat selesai dulu', 'error'); return; }

  const btn = $('order-simpan');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    const res = await fetch('/api/pesanan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pelanggan, spek, biaya, bayar, deadline, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pesanan');
    toast('Pesanan ' + pelanggan + ' tersimpan', 'sukses');
    tutupOrderForm();
    muatPesanan();
  } catch (err) {
    toast(err.message || 'Terjadi kesalahan', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan Pesanan';
  }
}

// ---- Modal: detail pesanan (rincian barang, dibuka dari kartu) ----
function bukaDetailPesanan(id) {
  const o = pesananData.find((x) => x.id === id);
  if (!o) return;

  $('detail-pesanan-pelanggan').textContent = o.pelanggan;
  $('detail-pesanan-masuk').textContent = 'Masuk ' + new Date(o.masuk).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  $('detail-pesanan-spek').textContent = o.spek || '(tanpa catatan)';
  $('detail-pesanan-list').innerHTML = (o.items || [])
    .map(
      (i) => `
        <div class="detail-trx-item">
          <span class="detail-trx-item-nama">${escapeHtml(i.nama_barang)} ×${i.jumlah}</span>
          <span class="detail-trx-item-sub">${formatRupiah(i.subtotal)}</span>
        </div>`
    )
    .join('');
  $('detail-pesanan-biaya').textContent = formatRupiah(o.biaya);
  $('detail-pesanan-overlay').classList.add('tampil');
}
function tutupDetailPesanan() { $('detail-pesanan-overlay').classList.remove('tampil'); }

// ---- Modal: catat bayar ----
function bukaPay(id) {
  const o = pesananData.find((x) => x.id === id);
  if (!o) return;
  payTargetId = id;
  const sisa = Math.max(0, o.biaya - o.bayar);
  $('pay-pelanggan').textContent = o.pelanggan;
  $('pay-sisa').textContent = formatRupiah(sisa);
  $('pay-lunas-nominal').textContent = formatRupiah(sisa);
  $('pay-jumlah').value = '';
  $('pay-overlay').classList.add('tampil');
  $('pay-jumlah').focus();
}
function tutupPay() { $('pay-overlay').classList.remove('tampil'); payTargetId = null; }

async function kirimBayar(jumlah) {
  if (payTargetId == null) return;
  if (!(jumlah > 0)) { toast('Isi jumlah bayar dulu', 'error'); return; }
  const btn = $('pay-simpan');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    const res = await fetch(`/api/pesanan/${payTargetId}/bayar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jumlah }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mencatat pembayaran');
    toast('Pembayaran tercatat', 'sukses');
    tutupPay();
    muatPesanan();
  } catch (err) {
    toast(err.message || 'Terjadi kesalahan', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan';
  }
}

// ============================================================
//  TAB SWITCHING
// ============================================================
function gantiView(view) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  if (view === 'riwayat') muatRiwayat();
  if (view === 'pesanan') muatPesanan();
}

// ============================================================
//  JAM & TANGGAL (header)
// ============================================================
function updateJam() {
  const now = new Date();
  $('jam').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  $('tanggal').textContent = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ============================================================
//  PASANG EVENT LISTENER
// ============================================================
// Keypad (delegasi klik).
$('keypad').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.digit) pressDigit(btn.dataset.digit);
  else if (btn.dataset.action === 'clear') clearField();
  else if (btn.dataset.action === 'back') backspace();
});

// Klik kotak Harga / Jumlah untuk memilih target keypad.
boxHarga.addEventListener('click', () => setActiveField('harga'));
boxJumlah.addEventListener('click', () => setActiveField('jumlah'));

// Hapus item di nota (delegasi).
notaListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-hapus-item');
  if (btn) removeItem(Number(btn.dataset.idx));
});

$('btn-tambah').addEventListener('click', addToNota);
btnSimpan.addEventListener('click', bukaBayar);
btnKosongkan.addEventListener('click', clearNota);

// Modal pembayaran (kembalian)
$('bayar-close').addEventListener('click', tutupBayar);
$('bayar-batal').addEventListener('click', tutupBayar);
$('bayar-uang').addEventListener('input', renderKembalian);
$('bayar-uang').addEventListener('keydown', (e) => { if (e.key === 'Enter') konfirmasiBayar(); });
$('bayar-nominal').addEventListener('click', (e) => {
  const chip = e.target.closest('.bayar-chip');
  if (!chip) return;
  $('bayar-uang').value = chip.dataset.nominal;
  renderKembalian();
});
$('bayar-simpan').addEventListener('click', konfirmasiBayar);

// Tab
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => gantiView(t.dataset.view))
);

// Pencarian riwayat (filter data yang sudah diambil, tanpa fetch ulang).
rwSearch.addEventListener('input', renderRiwayat);

// Klik kartu transaksi -> buka modal detail lengkap.
rwList.addEventListener('click', (e) => {
  const kartu = e.target.closest('.rw-trx-card');
  if (kartu) bukaDetailTrx(Number(kartu.dataset.trxId));
});
$('detail-trx-close').addEventListener('click', tutupDetailTrx);

// --- Pesanan ---
// Filter semua/aktif/selesai (tanpa fetch ulang).
document.querySelectorAll('.ps-filter-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    pesananFilter = btn.dataset.filter;
    document.querySelectorAll('.ps-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderPesanan();
  })
);

// Tombol aksi di kartu pesanan (delegasi karena kartu di-render ulang).
psList.addEventListener('click', (e) => {
  const maju = e.target.closest('.btn-ps-maju');
  if (maju) { majuStatus(Number(maju.dataset.maju), maju.dataset.next); return; }
  const bayar = e.target.closest('.btn-ps-bayar');
  if (bayar) { bukaPay(Number(bayar.dataset.bayar)); return; }
  const detail = e.target.closest('.ps-item-count');
  if (detail) { bukaDetailPesanan(Number(detail.dataset.detailPesanan)); }
});
$('detail-pesanan-close').addEventListener('click', tutupDetailPesanan);

// Modal Pesanan Baru
$('btn-pesanan-baru').addEventListener('click', bukaOrderForm);
$('order-close').addEventListener('click', tutupOrderForm);
$('order-batal').addEventListener('click', tutupOrderForm);
$('order-simpan').addEventListener('click', simpanPesanan);

// Entri item di form Pesanan Baru: tombol + dan Enter di kolom manapun
// menambah baris (kemudahan input cepat, mirip alur Kasir).
$('of-item-tambah').addEventListener('click', tambahOrderItem);
$('of-item-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.of-item-row-hapus');
  if (btn) hapusOrderItem(Number(btn.dataset.idx));
});
['of-item-nama', 'of-item-harga', 'of-item-jumlah'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tambahOrderItem(); } });
});

// Modal Catat Bayar
$('pay-close').addEventListener('click', tutupPay);
$('pay-batal').addEventListener('click', tutupPay);
$('pay-simpan').addEventListener('click', () => kirimBayar(Number($('pay-jumlah').value) || 0));
$('pay-lunas').addEventListener('click', () => {
  const o = pesananData.find((x) => x.id === payTargetId);
  if (o) kirimBayar(Math.max(0, o.biaya - o.bayar));
});

// Tutorial
$('btn-tutorial').addEventListener('click', () => $('tutorial-overlay').classList.add('tampil'));
$('tutorial-close').addEventListener('click', () => $('tutorial-overlay').classList.remove('tampil'));
$('tutorial-selesai').addEventListener('click', () => $('tutorial-overlay').classList.remove('tampil'));

// Keyboard fisik (bonus desktop): angka & Enter berfungsi tanpa harus
// klik keypad — kecuali saat sedang mengetik di kolom nama barang.
document.addEventListener('keydown', (e) => {
  // Kalau sedang mengetik di kolom nama barang: Enter = tambah, sisanya
  // biarkan mengetik normal.
  if (document.activeElement === inputNama) {
    if (e.key === 'Enter') addToNota();
    return;
  }
  // Jangan bajak keyboard saat fokus di input lain (mis. pencarian riwayat).
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  // Keypad fisik hanya relevan di view Kasir.
  if (!$('view-kasir').classList.contains('active')) return;
  // Abaikan kalau modal/popup terbuka.
  if (document.querySelector('.modal-overlay.tampil, .popup-overlay.tampil')) return;

  if (/^[0-9]$/.test(e.key)) { pressDigit(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { backspace(); e.preventDefault(); }
  else if (e.key === 'Delete') { clearField(); }
  else if (e.key === 'Enter') { addToNota(); }
  else if (e.key === 'h' || e.key === 'H') { setActiveField('harga'); }
  else if (e.key === 'j' || e.key === 'J') { setActiveField('jumlah'); }
});

// ============================================================
//  INISIALISASI
// ============================================================
updateJam();
setInterval(updateJam, 15000);
renderNota();
renderDraft();
muatRingkasan();
muatPesanan(); // memuat badge jumlah pesanan aktif di tab
