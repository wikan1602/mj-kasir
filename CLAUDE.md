# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MVP for recording toserba (general store) transactions. Scope is deliberately narrow — Tahap 1 of a larger plan: staff record a transaction quickly, it's saved to history. Out of scope for now (planned for later stages): stock tracking, order printing, WhatsApp reports, staff login/auth.

The app is **offline-first and desktop-only**: it runs on a shop laptop and staff operate it **directly on that laptop** (`http://localhost:3000`). Phone/LAN access has been **dropped** by decision — the UI is a wide desktop layout (min-width 1080px) with an on-screen numeric keypad, and the frontend is **not** mobile-responsive. (Legacy note: the server still binds `0.0.0.0`, which is now unnecessary but harmless; `localhost` would suffice.) There is no build step, no bundler, no framework on the frontend, and no auth. The UI and all comments are in Indonesian — match that language when editing user-facing strings and comments.

The frontend follows a 3-view desktop design ("Kasir Toserba", from `Aplikasi kasir desktop sederhana.zip`). All three views — **Kasir (POS), Pesanan (printing orders), and Riwayat (history)** — are built and wired to the backend. Fonts: the design uses Plus Jakarta Sans but we deliberately do **not** load it from a CDN (would break offline-first) — the stack falls back to Segoe UI on the shop's Windows laptop.

## Commands

- `npm install` — install deps (only `express`; SQLite is built into Node).
- `npm start` — run the server (`node server.js`) on port 3000, bound to `0.0.0.0` so phones on the LAN can reach it.

There are no tests, linter, or build. Requires **Node.js v22+** because it uses the built-in `node:sqlite` module (the `ExperimentalWarning: SQLite` on startup is expected and harmless).

## Architecture

Three-file backend + static frontend, all data in one SQLite file.

- [db.js](db.js) — opens `toserba.db` (one file in the repo root) via `node:sqlite`'s `DatabaseSync`, creates tables if absent, and exports the shared synchronous `db` handle. This is the **only** place coupled to the SQLite driver — a future move to `better-sqlite3` should touch only this file.
- [server.js](server.js) — Express app serving `public/` statically plus five JSON endpoints:
  - `POST /api/transaksi` — save one transaction with N items; validates each item and wraps the transaction-row + item-row inserts in a `BEGIN`/`COMMIT`/`ROLLBACK` block so a mid-write crash leaves no partial data. **After** the commit it compares each typed price against `barang.harga_terakhir`: brand-new items are auto-inserted into `barang` at their typed price, while items whose price differs from the stored one are returned in `perubahan_harga` (purely informational — see price-change flow below).
  - `GET /api/barang/cari?q=` — autocomplete: up to 8 `barang` whose name contains `q` (case-insensitive), each with `harga_terakhir`.
  - `POST /api/barang/konfirmasi-harga` — set `barang.harga_terakhir` for future transactions after the staff confirms a price change. Does **not** touch the already-saved transaction.
  - `GET /api/transaksi?limit=N` — recent transactions (default 50), each with its items attached.
  - `GET /api/ringkasan-hari-ini` — count and sum of today's transactions.
  - `GET /api/pesanan` — all printing orders with their line items attached, newest first (filter/sort done client-side).
  - `POST /api/pesanan` — create an order (`pelanggan`, `spek` free-text, `biaya`, optional `bayar`/DP clamped to `biaya`, `deadline` date → stored as ISO at 17:00 local, optional `items` array mirroring `POST /api/transaksi`'s item shape); wraps the pesanan-row + item-row inserts in `BEGIN`/`COMMIT`/`ROLLBACK`; always starts `status_kerja='pending'`. **`biaya` is never derived from `items` server-side** — staff can type a total that differs from the item sum (e.g. negotiated batch pricing); items are informational detail, not the source of truth.
  - `POST /api/pesanan/:id/status` — set `status_kerja` (`pending`/`proses`/`selesai`); 404 if id missing.
  - `POST /api/pesanan/:id/bayar` — add a payment (`jumlah`); new `bayar` is clamped to `biaya`. Does **not** touch `status_kerja` — payment and work-progress are independent tracks.
- [public/](public/) — plain HTML/CSS/vanilla-JS (no framework), desktop Kasir view. [app.js](public/app.js) holds an in-memory `state` (nota being built + keypad draft) and renders via direct DOM updates: debounced autocomplete (`.saran-box`), the numeric keypad targeting the active field (`harga` vs `jumlah`, with `fresh` = next digit replaces), add/remove/clear nota rows, live totals, the **payment modal** (the "Bayar" button opens it — staff enter cash received, it computes kembalian/change live with quick-nominal chips, and only then does it save → `POST /api/transaksi`; change is display-only, not persisted), the post-save price-change popup, header clock + today's summary, tab switching, and physical-keyboard shortcuts (digits, Enter=tambah, h/j=pick field). The **Riwayat** view fetches `GET /api/transaksi?limit=500` once per tab-open and computes summary cards (today / last-7-days / average), name search, and date grouping (Hari ini / Kemarin / date) entirely client-side. Each transaction card shows only the first `RW_ITEM_PREVIEW` (4) items — a transaction with more shows "+N barang lainnya" and the whole card is clickable to open a detail modal listing every item (keeps cards from growing tall/uneven in the 2-column grid when a transaction has many line items). The **Pesanan** view lists orders (fetched on tab-open + at startup for the tab badge), computes its own summary + urgency + sort client-side, and drives create / advance-status / record-payment via the `/api/pesanan*` endpoints and three modals (create, record-payment, and item-detail). The create-order modal has an optional nota-like item entry (nama/harga/jumlah) that auto-fills Biaya Total from the running sum but leaves it freely editable; orders with items show a "N barang · lihat rincian" link (rather than listing items inline) to keep cards from growing tall, opening a detail modal on click. [style.css](public/style.css) is the design's visual system as CSS classes (colors in `:root`).

### Data model (five tables)

- `transaksi` — one row per transaction: `id`, `waktu` (ISO string), `total`, `staff` (nullable; no UI to set it yet).
- `transaksi_item` — one row per line item, FK `transaksi_id`. Price is stored per-item as `harga_saat_itu` (price-at-time), deliberately **not** a reference to `barang`, so historical transactions keep their original prices when current prices change later. Money values are stored as integers (rupiah, no decimals).
- `barang` — a **price-memory / autocomplete convenience table, not master data**. Rows are created automatically the first time staff type a new item name during a transaction — never required upfront to make a sale. Holds `harga_terakhir` (last agreed price) and `nama_barang_lower` for case-insensitive lookup (so "Paku 5cm" and "PAKU 5CM" are one item, and the first-seen casing of `nama_barang` is preserved).
- `pesanan` — printing/custom job orders. Unlike toserba sales (instant), an order lives over time, so it tracks **two independent things**: `status_kerja` (`pending`→`proses`→`selesai`, guarded by a CHECK constraint) and payment (`biaya` total vs `bayar` paid-so-far; `sisa` = `biaya - bayar` is derived, not stored). `spek` is deliberately free text. `masuk`/`deadline` are ISO strings; money is integer rupiah. The front end derives urgency chips (Terlambat/Hari ini/Besok/H-n) from `deadline`.
- `pesanan_item` — **optional** line-item breakdown per order (nama_barang/harga/jumlah/subtotal, FK `pesanan_id`), mirroring `transaksi_item` but deliberately *not* authoritative: `pesanan.biaya` stays independently editable so staff can negotiate a batch/complexity price that differs from the item sum. The frontend auto-fills the Biaya Total field from the item sum as items are added/removed, but the field remains a plain editable input — the override always wins once saved.

### Price-change flow (a deliberate, load-bearing design)

The transaction **always saves first, at the price staff typed**, no matter what's in `barang`. Only *after* the commit does the server diff typed price vs `harga_terakhir`. A difference is surfaced to staff as a post-save popup asking whether to update the reference price for *future* transactions — it never blocks, delays, or alters the transaction just saved. When editing this area, preserve that ordering and that separation (typed price = historical truth; `barang.harga_terakhir` = suggestion for next time).

## Conventions and gotchas

- The whole system's persistence is the single `toserba.db` file — backup = copy that file. Never delete or move it casually; it holds all history.
- Amounts are integer rupiah end to end (`harga * jumlah`, `subtotal`, `total`). Keep them integers; don't introduce floats/decimals.
- User-facing HTML from transaction data is escaped via `escapeHtml` in [app.js](public/app.js) — keep escaping any store-supplied text rendered into `innerHTML`.
- New API validation should mirror the existing style in `POST /api/transaksi`: reject non-arrays/empty item lists, require `nama_barang` + numeric `harga`/`jumlah`, and forbid negative price / non-positive quantity.
