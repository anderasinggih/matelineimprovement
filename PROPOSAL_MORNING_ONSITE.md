# Proposal Implementasi: Section "Morning Onsite Performance"

> **Status Konfirmasi User**:
> 1. **Cakupan Data**: Seluruh tiket dalam rentang tanggal aktif (tanpa filter jam, "Morning Onsite" adalah nama judul KPI operasional).
> 2. **Layout Tampilan**: Grid 2x2 persis sesuai foto referensi (Baris 1: Summary Vendor & Persada, Baris 2: Telkom Akses & Mandau).
> 3. **Prinsip Utama**: Murni 100% data aktif real-time, **tanpa fallback/mock/dummy**.

---

## 1. Arsitektur Visual (Layout Grid 2x2)

Mengacu langsung pada foto referensi yang memiliki 4 panel grafik berjejer 2 atas dan 2 bawah:

```
+===============================================================================================+
| SECTION: Morning Onsite Performance (Container Utama: .custom-filter-card #0d0d10)            |
+---------------------------------------------------------------+-------------------------------+
| PANEL 1 (Kiri Atas): Vendor Summary                           | PANEL 2 (Kanan Atas): Persada |
| Judul: Vendor Summary - Time Stamp Onsite                     | Judul: Persada - Daily Trend  |
| - 3 Bar Vendor: Persada, Telkom Akses, Mandau                 | - Sumbu X: Daftar Tanggal     |
| - Hijau: Arrive, Merah: Belum Arrive (Total = 100%)           | - Hijau: Arrive, Merah: Belum |
| - Garis Overlay (Biru/Cyan): % Arrive Rate                    | - Garis Overlay: % Arrive Rate|
+---------------------------------------------------------------+-------------------------------+
| PANEL 3 (Kiri Bawah): Telkom Akses                            | PANEL 4 (Kanan Bawah): Mandau |
| Judul: Telkom Akses - Daily Trend Time Stamp Onsite           | Judul: Mandau - Daily Trend   |
| - Sumbu X: Daftar Tanggal                                     | - Sumbu X: Daftar Tanggal     |
| - Hijau: Arrive, Merah: Belum Arrive                          | - Hijau: Arrive, Merah: Belum |
| - Garis Overlay: % Arrive Rate                                | - Garis Overlay: % Arrive Rate|
+===============================================================================================+
```

---

## 2. Struktur Detail Setiap Container

### Panel 1: Vendor Summary (Kiri Atas)
- **Judul**: `Vendor Summary - Time Stamp Onsite`
- **Subtitle**: Total tiket & arrive terakumulasi sepanjang rentang tanggal aktif (`startDate` s/d `endDate`).
- **Data 3 Bar**:
  - `Persada`: Akumulasi tiket Persada (Arrive & Not Arrived).
  - `Telkom Akses`: Akumulasi tiket Telkom Akses (Arrive & Not Arrived).
  - `Mandau`: Akumulasi tiket Mandau (Arrive & Not Arrived).
- **Komponen ECharts**:
  - `Bar Dasar (z=1, 100%)`: **Not Arrived / Total Base** (Warna Merah `#ef4444`, tinggi selalu 100%), label `notArr (notRate%)` di bagian atas bar merah.
  - `Bar Layer Depan (z=2, barGap: -100%)`: **Arrived** (Warna Hijau `#22c55e`, tinggi 0% s/d Arrive Rate %), label `arr (rate%)`.
  - `Line Series (z=3)`: **Arrive Rate %** (Garis Cyan `#38bdf8` dengan simbol titik dan label `XX.X%`).

### Panel 2: Persada - Daily Trend (Kanan Atas)
- **Judul**: `Persada - Daily Trend Time Stamp Onsite`
- **Sumbu X**: Urutan tanggal aktif (`2026-10-01`, `2026-10-02`, dst).
- **Sumbu Y Tunggal**: Persentase (0% - 100%, interval 20%).
- **Series**:
  - Bar Merah (`#ef4444`, z=1): Base bar 100% total tiket (Not Arrived portion terlihat di atas hijau).
  - Bar Hijau (`#22c55e`, z=2, `barGap: -100%`): Layer depan persentase Arrive Rate harian.
  - Garis Biru/Cyan (`#38bdf8`, z=3): Persentase `(Arrive / Total) * 100%`.

### Panel 3: Telkom Akses - Daily Trend (Kiri Bawah)
- **Judul**: `Telkom Akses - Daily Trend Time Stamp Onsite`
- Format dan konfigurasi sama dengan Panel 2 (100% Overlapping Bar + Cyan Line).

### Panel 4: Mandau - Daily Trend (Kanan Bawah)
- **Judul**: `Mandau - Daily Trend Time Stamp Onsite`
- Format dan konfigurasi sama dengan Panel 2 (100% Overlapping Bar + Cyan Line).

---

## 3. Rumus & Logika Data (100% Murni Tanpa Fallback)

1. **Pemetaan Vendor (Party)**:
   ```javascript
   var party = getTicketParty(t); // 'Telkom Akses' | 'Persada' | 'Mandau'
   ```
2. **Kondisi Arrive**:
   ```javascript
   var isArrived = !!(t.arrive_time);
   ```
3. **Basis Tanggal**:
   Menggunakan `cmGetTicketDate(t)` (`createtime` WIB) agar mengukur performa kedatangan pada tiket yang diterbitkan di hari tersebut.
4. **Perhitungan Arrive Rate (%)**:
   ```javascript
   var rate = total > 0 ? Number(((arrive / total) * 100).toFixed(1)) : 0;
   ```
5. **Zero Fallback**:
   - Jika suatu vendor tidak memiliki tiket pada tanggal tertentu, nilainya murni `0` (bukan mock data).
   - Bar Not Arrived = `total - arrive`. (Jika `arrive > total` dicegah dengan `Math.max(0, total - arrive)`).

---

## 4. Rencana Implementasi File

1. **HTML ([page/html.html](file:///Volumes/LVNPC/HUAWEI/PROJECT/Mateline%20Utilization%20Dashboard/page/html.html))**:
   - Menambahkan container section `#cmMorningOnsiteSection` di bawah section FME Performance atau di posisi paling bawah dashboard.
   - Di dalamnya terdapat 4 container canvas:
     - `#cmMorningOnsiteSummaryChart`
     - `#cmMorningOnsitePersadaChart`
     - `#cmMorningOnsiteTelkomChart`
     - `#cmMorningOnsiteMandauChart`
2. **CSS ([page/corrective_maintenance_css.css](file:///Volumes/LVNPC/HUAWEI/PROJECT/Mateline%20Utilization%20Dashboard/page/corrective_maintenance_css.css))**:
   - `.custom-morning-onsite-grid`: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;`
   - `.custom-morning-onsite-card`: background `#0d0d10`, border `#27272a`, border-radius `10px`, padding `16px`.
   - `.custom-morning-onsite-canvas`: `width: 100%; height: 340px;`
   - Menghindari selector terlarang di OWS (wajib prefix `.custom-`).
3. **JavaScript ([page/corrective_maintenance_script.js](file:///Volumes/LVNPC/HUAWEI/PROJECT/Mateline%20Utilization%20Dashboard/page/corrective_maintenance_script.js))**:
   - Fungsi utama: `renderCmMorningOnsiteSection(tickets)`.
   - Diintegrasikan ke dalam `renderCmTicketSummary()` dan event filter tanggal/reset agar ter-render otomatis saat data dimuat.
