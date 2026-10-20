# PROPOSAL EMAIL REPORT HARIAN: MATELINE UTILIZATION & CORRECTIVE MAINTENANCE (D-1)

## 1. Latar Belakang & Tujuan
Email report ini dirancang untuk dikirim setiap pagi (misal pk 07:00 / 08:00 WIB) yang merangkum kinerja operasional **D-1 (Kemarin)** secara komprehensif, profesional, dan mudah dibaca oleh Manajerial, Dispatcher, maupun Koordinator Lapangan langsung dari smartphone atau desktop tanpa perlu login ke OWS.

---

## 2. Struktur Konten Email (Executive & Operational View)

Email disusun dalam bentuk **HTML Email Responsif** dengan palet warna enterprise (Dark/Light card design yang clean, font modern, tabel bergaris rapi, dan indikator warna status).

```
+-----------------------------------------------------------------------+
|  [HEADER] MATELINE UTILIZATION & CM DAILY REPORT (D-1)               |
|  Periode: Senin, 19 Oktober 2026 (00:00 - 23:59 WIB)                 |
+-----------------------------------------------------------------------+
|  [SECTION 1] EXECUTIVE HIGHLIGHTS (KPI CARDS)                         |
|   - Total Tickets D-1    : 142 TT                                     |
|   - Mateline Accept Rate : 92.3% (Target >= 90%)                      |
|   - Total Active FME     : 38 Persons                                 |
|   - Avg MTTR (Hours)     : 2.45 Jam                                   |
+-----------------------------------------------------------------------+
|  [SECTION 2] MILESTONE ADHERENCE PIPELINE (FUNNEL)                    |
|   Accepted -> Departed -> Arrived -> Left Site                        |
|   Visual table perbandingan tingkat adopsi Mateline per milestone     |
+-----------------------------------------------------------------------+
|  [SECTION 3] ACCEPTANCE RATE PER REGION / PARTNER                     |
|   Ringkasan performa per Region & Mitra Lapangan                      |
+-----------------------------------------------------------------------+
|  [SECTION 4] TOP 5 HIGHEST TICKET CLUSTERS                            |
|   Cluster dengan aktivitas gangguan tertinggi di D-1                  |
+-----------------------------------------------------------------------+
|  [SECTION 5] FME MATELINE UTILIZATION HIGHLIGHT                       |
|   - Top 3 Best Utilization FME (100% adherence)                       |
|   - Bottom / Need Attention FME (Unaccepted tickets)                  |
+-----------------------------------------------------------------------+
|  [FOOTER] Generated automatically by Huawei OWS Automation            |
+-----------------------------------------------------------------------+
```

---

## 3. Detail Rincian Konten Tiap Section

### Section 1: Executive KPI Summary Cards
Menampilkan 4 kartu metrik utama D-1 dalam 1 baris (tabel 4 kolom yang responsive):
1. **Total Dispatch TT**: Total tiket yang ter-dispatch ke Mateline kemarin.
2. **Acceptance Rate**: Persentase tiket yang di-Accept oleh FME (`(Accepted / Total) * 100%`). Ditandai warna Hijau jika $\ge 90\%$, Kuning jika $80\% - 89\%$, Merah jika $<80\%$.
3. **Active FME Count**: Jumlah teknisi lapangan yang login / menangani tiket kemarin.
4. **Average MTTR / MTTA**: Durasi rata-rata penyelesaian & durasi terima tiket.

### Section 2: Mateline Milestone Breakdown (Funnel Pelaksanaan)
Tabel matriks yang memperlihatkan seberapa patuh teknisi mencatatkan aktivitas di aplikasi Mateline:
- **Total Assigned**: 100%
- **Accepted**: XX TT (XX%)
- **Depart to Site**: XX TT (XX%)
- **Arrive on Site**: XX TT (XX%)
- **Leave Site**: XX TT (XX%)
*Dilengkapi progress bar visual mini (HTML/CSS table bar) yang bisa tampil sempurna di semua aplikasi email.*

### Section 3: Performance Breakdown by Partner / Contractor
Tabel evaluasi vendor lapangan (Parties/Contractor):
- Nama Partner
- Total Tiket
- Accepted Count & Rate (%)
- Milestone Compliance Score
- Status (Achieved / Below Target)

### Section 4: Cluster Hotspots (Top 5 Cluster Tiket Terbanyak)
Menampilkan 5 cluster dengan jumlah tiket tertinggi kemarin untuk evaluasi fokus pemeliharaan preventif.

### Section 5: FME Attention List
- **Top Performers**: Teknisi dengan kepatuhan milestone 100%.
- **Action Required**: Teknisi yang memiliki tiket tanpa respon/unaccepted > 2 jam.

---

## 4. Mekanisme Eksekusi (Backend Pipeline)
1. **Pemicu (Trigger)**:
   - **Mode Otomatis**: Crontab / Timer OWS Schedule setiap hari pk 07:00 WIB.
   - **Mode On-Demand**: Tombol manual di dashboard jika sewaktu-waktu dibutuhkan.
2. **Data Fetching**:
   - Backend memanggil service `corrective_dashboard_summary_get` dengan parameter rentang tanggal D-1 (kemarin 00:00:00 s/d kemarin 23:59:59).
3. **HTML Generator**:
   - Engine kecil di backend merangkai template HTML responsif dengan data aktual.
4. **Email Dispatch**:
   - Memanggil `System/email/email_send_create` yang sudah terverifikasi 100% aktif.
