# PROPOSAL PENAMBAHAN SECTION: FME RESPONSE & ARRIVAL PERFORMANCE

Dokumen proposal ini telah disepakati dan siap diimplementasikan pada **Mateline Utilization Dashboard**.

---

## 1. Nama Section Terpilih
* **Title**: `FME Response & Arrival Performance`
* **Subtitle**: `Daily response rate (Accept) and on-site mobility (Arrive) monitoring by party across selected date range`

---

## 2. Struktur Komponen Visual & Layout

```
+---------------------------------------------------------------------------------------------------------+
|  [SECTION HEADER] FME Response & Arrival Performance                                                   |
|  Active Range: {start_date} - {end_date} | Region: {selected_region} | Party: {selected_party}          |
+---------------------------------------------------------------------------------------------------------+
|  [BARIS 1: TREND HARIAN (2 KOLOM ECHARTS)]                                                              |
|                                                                                                         |
|  +----------------------------------------------+  +-------------------------------------------------+  |
|  | [Badge] Accept Rate                          |  | [Badge] Arrive Rate                             |  |
|  |                                              |  |                                                 |  |
|  | - Line Biru Solid : % WO Accept Rate CM      |  | - Line Biru/Cyan : % WO Arrive Rate CM          |  |
|  | - Garis Putus Merah : Target SLA (90%)       |  | - Garis Putus Merah : Target SLA (25%)          |  |
|  | - Bar Oranye Bawah : Active PIC FME / Person |  | - Bar Oranye Bawah : Active PIC FME / Person    |  |
|  | *(Garis Hijau 'All WO' DIHAPUS)*             |  | *(Garis Hijau 'All WO' DIHAPUS)*                |  |
|  +----------------------------------------------+  +-------------------------------------------------+  |
|                                                                                                         |
|  [BARIS 2: PERFORMANCE PER PARTY (3 KARTU BERDAMPINGAN)]                                                |
|                                                                                                         |
|  +-----------------------------+ +-----------------------------+ +-----------------------------+        |
|  |           Persada           | |        Telkom Akses         | |           Mandau            |        |
|  |   Total Tickets: 3,715      | |   Total Tickets: 1,175      | |   Total Tickets: 365        |        |
|  |   Active PIC: 57 FME        | |   Active PIC: 92 FME        | |   Active PIC: 27 FME        |        |
|  |                             | |                             | |                             |        |
|  |  [Donut Accept] [Donut Arr] | |  [Donut Accept] [Donut Arr] | |  [Donut Accept] [Donut Arr] |        |
|  |     61.5%          X.X%     | |      0.3%          X.X%     | |      0.3%          X.X%     |        |
|  |  2,286 / 3,715    XX / 3,715| |    4 / 1,175     XX / 1,175 | |    1 / 365        XX / 365 |        |
|  +-----------------------------+ +-----------------------------+ +-----------------------------+        |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. Rincian Metrik & Desain

### A. Baris 1: Trend Harian (Accept Rate & Arrive Rate)
1. **Trend Chart 1: Accept Rate**:
   * **Garis Biru Solid**: `% WO Accept Rate CM` = `(count_accept_time / count_ticket_id) * 100%`.
   * **Target SLA Line**: Garis putus-putus merah horizontal di **90%**.
   * **Bar Oranye (Sumbu Bawah)**: **Jumlah Teknisi / PIC Lapangan Aktif** yang menangani tiket pada hari tersebut.
   * *(Sesuai instruksi: Garis hijau '% All WO' ditiadakan karena fokus murni CM)*.
2. **Trend Chart 2: Arrive Rate**:
   * **Garis Biru/Cyan Solid**: `% WO Arrive Rate CM` = `(count_arrive_time / count_ticket_id) * 100%`.
   * **Target SLA Line**: Garis putus-putus merah horizontal di **25%**.
   * **Bar Oranye (Sumbu Bawah)**: **Jumlah Teknisi / PIC Lapangan Aktif** dengan konfirmasi kedatangan di hari tersebut.
   * *(Garis hijau '% All WO' ditiadakan)*.

### B. Baris 2: Kartu Party (Persada, Telkom Akses, Mandau)
Setiap kartu memiliki:
1. **Header**: Nama Mitra/Party + Total Tiket & Total Active PIC di Date Range terpilih.
2. **Dua Donut Chart Berdampingan**:
   * **Donut Kiri (Accept Rate)**:
     * Menampilkan rasio **Accepted vs Unaccepted**.
     * Tengah lingkaran: Nilai persentase besar (e.g. `61.5%`).
     * Sub-text: `2,286 / 3,715 accepted`.
   * **Donut Kanan (Arrive Rate)**:
     * Menampilkan rasio **Arrived vs Not Arrived**.
     * Tengah lingkaran: Nilai persentase besar (e.g. `X.X%`).
     * Sub-text: `XX / 3,715 arrived`.

---

## 4. Implementasi Teknis

1. **Backend Service (`service/corrective_dashboard_summary_get.js`)**:
   * Menambahkan `sum(case when cm.arrive_time is not null then 1 else 0 end) as count_arrive_time` ke dalam query TQL `acceptRateDailyTql`.
   * Menghitung distinct count FME / PIC per hari dan per party.
2. **Frontend UI (`page/html.html`, `page/corrective_maintenance_css.css`, `page/corrective_maintenance_script.js`)**:
   * Menambahkan container `#cmFmeResponseArrivalSection` di bawah stacking accept rate.
   * Mengintegrasikan ke `applyCmFilters()` sehingga otomatis ter-update saat user mengganti Date Range, Region, atau Party.
3. **Email Report Service (`service/corrective_send_email_report.js`)**:
   * Dapat meng-include ringkasan metrik Accept & Arrive Rate ini ke dalam daily email report.
