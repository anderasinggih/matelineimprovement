# Aturan Pengembangan Mateline Utilization Dashboard

Dokumen aturan ini wajib ditaati selama pengembangan fitur dashboard tambahan di project ini.

---

## 1. Prinsip Utama & Siklus Pengerjaan (Per-Patch)
1. **Dikerjakan Secara Bertahap (Per-Patch)**:
   - Jangan mengerjakan semuanya sekaligus dalam satu perubahan besar.
   - Selesaikan satu modul/patch hingga teruji dan disetujui pengguna sebelum lanjut ke patch berikutnya.
2. **Dilarang Menggunakan Mock / Fallback Dummy**:
   - Jangan menyuntikkan data dummy statis/fallback palsu saat terjadi error atau data kosong.
   - Jika service atau data tidak tersedia, tampilkan pesan error atau status empty/loading yang informatif dan jujur.
3. **Konfirmasi Sebelum Bertindak (No Self-Assumption)**:
   - Jika ada definisi metrik, formula, atau field data yang ambigu/tidak jelas, **tanyakan dan konfirmasi terlebih dahulu ke pengguna**.
   - Dilarang membuat asumsi sendiri atau improvisasi logic tanpa persetujuan.

---

## 2. Standar Keamanan & Lingkungan Huawei OWS / GDE
1. **Isolasi Logika (Zero Side-Effects)**:
   - Kode baru tidak boleh mengganggu, merusak, atau mengubah *business logic*, state, filter, atau kalkulasi dashboard eksisting yang sudah berjalan.
   - Gunakan namespace khusus untuk state/fungsi baru (misalnya `window.cmMilestoneDashboardState` atau prefix yang terisolasi).
2. **Kepatuhan CSS Validator ADC.UI.SDK (Wajib Prefix `.custom-`)**:
   - **WAJIB**: Compiler validator ADC Studio (`/adc-studio-ui/.../css/check`, error code `10010006`) hanya mengizinkan class selector dengan prefix resmi: `.custom-` (contoh: `.custom-milestone-card`, `.custom-ml-cards-wrapper`).
   - Dilarang keras menggunakan selector class tanpa prefix `.custom-` (seperti `.ml-ms-*` dsb).
   - Hindari komentar multiline CSS dengan format yang memicu parse error pada validator ADC.
3. **Kepatuhan DOM & Validator Compiler OWS**:
   - Di lingkungan Huawei OWS, pemanggilan `document.getElementById` secara langsung terkadang memicu issue compiler validator. Gunakan pola akses dinamis seperti `document['get' + 'Element' + 'ById'](...)` atau `querySelector` jika diperlukan.
4. **Kompatibilitas Runtime OWS**:
   - Backend script service OWS berbasis Rhino/Nashorn (ES5/ES6 parsial). Hindari penggunaan sintaks JS modern yang tidak didukung jika menulis kode service backend.
   - Frontend runtime OWS berjalan di browser enterprise; pastikan kode clean, aman dari injection, dan performan dalam merender ribuan data tiket.

---

## 3. Rencana Patch Pengembangan (Roadmap)
* **Patch 1: Visual Metric Cards (Top Section)**
  * Menampilkan 5 kartu KPI: `Total Ticket`, `Total Accepted`, `Total Depart`, `Total Arrive`, `Total Leave`.
* **Patch 2: 24-Hour Trend Line Chart (Hourly Timeline)**
  * Grafik timeline 24 jam (00:00 - 23:00) untuk memantau intensitas milestone dalam 1 hari.
* **Patch 3: Date Range Trend Line Chart (Multi-day Timeline)**
  * Grafik tren harian milestone berdasarkan rentang tanggal filter yang aktif.
* **Patch 4: Cluster Summary (Table & Bar Chart)**
  * Breakdown per Cluster/FM Office (Accepted, Depart, Arrive, Leave) dengan visualisasi bar chart perbandingan.
* **Patch 5: FME Detail Table (Individual Performance)**
  * Tabel drill-down per Cluster dan FME Name dengan rincian capaian milestone masing-masing teknisi.
