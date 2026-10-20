/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 *
 * Daily D-1 Report - Mateline Utilization (replika dashboard OWS, dark theme).
 * Semua angka berasal dari service corrective_dashboard_summary_get (tanpa data dummy).
 *
 * Input (opsional): { email_to, date: "YYYY-MM-DD" (default D-1), start_date, end_date, title }
 *
 * Urutan section (sama dengan dashboard):
 *  1. Header + Report Date (D-1) + Active filter badge
 *  2. Ticket Summary | Accepted Ticket Distribution (donut) | FME Ticket Acceptance Detail
 *  3. Accept Rate by Party (D-1)
 *  4. Mateline Utilization Trend (chart + tabel)
 *  5. Daily Accept Rate by Party (chart + tabel)
 *  6. Milestone Utilization (5 cards D-1)
 *  7. 1 Day - Hourly Timeline (chart + tabel)
 *  8. Date Range Timeline (chart)
 *  9. Cluster Office Milestone Summary
 * 10. FME Performance Detail (semua teknisi)
 *
 * Catatan: JavaScript ES5 saja (runtime OWS).
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger)
    ? JsLogger.serviceDebugLogger
    : (typeof console !== 'undefined' ? console : null);

function logInfo(msg) { if (logger && logger.info) logger.info(msg); }
function logError(msg) { if (logger && logger.error) logger.error(msg); }

// ======================================================================
// 0. KONSTANTA
// ======================================================================
var SUMMARY_SERVICE = "/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get";
var EMAIL_SERVICE = "/adc-service/rest/v1/services/System/email/email_send_create";
var DEFAULT_RECEIVER = "anderasinggih1@gmail.com";

var PARTIES = ['Telkom Akses', 'Persada', 'Mandau'];
var PARTY_COLORS = { 'Telkom Akses': '#c8102e', 'Persada': '#31b5c6', 'Mandau': '#62b230' };
var DONUT_COLORS = ['#5470c6', '#91cc75', '#fac858'];

var C = {
    bg: '#09090b',
    card: '#0d0d10',
    border: '#27272a',
    rowLine: '#1f1f23',
    head: '#18181b',
    text: '#fafafa',
    sub: '#a1a1aa',
    muted: '#8b949e',
    blue: '#3b82f6',
    orange: '#f97316',
    pink: '#ec4899',
    green: '#34d399'
};

var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ======================================================================
// 1. HELPER TANGGAL (semua dalam GMT+7 / Jakarta)
// ======================================================================
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function parseYmd(s) {
    var p = String(s).split('-');
    return new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
}
function fmtYmd(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
function addDays(s, n) {
    var d = parseYmd(s);
    d.setUTCDate(d.getUTCDate() + n);
    return fmtYmd(d);
}
function dateList(startStr, endStr) {
    var list = [];
    var cur = startStr;
    var guard = 0;
    while (cur <= endStr && guard < 400) {
        list.push(cur);
        cur = addDays(cur, 1);
        guard++;
    }
    return list;
}
function dayNameOf(s) { return DAY_NAMES[parseYmd(s).getUTCDay()]; }
function longDateEn(s) {
    var d = parseYmd(s);
    return dayNameOf(s) + ', ' + d.getUTCDate() + ' ' + MONTH_EN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
function longDateId(s) {
    var d = parseYmd(s);
    return d.getUTCDate() + ' ' + MONTH_ID[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}
function shortDate(s) { return String(s).substring(5); }
function esc(v) {
    return String(v === null || typeof v === 'undefined' ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}
function pct(a, b, digits) {
    return b > 0 ? ((a / b) * 100).toFixed(digits) : (0).toFixed(digits);
}

var nowJakarta = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
var todayStr = fmtYmd(nowJakarta);
var d1Default = addDays(todayStr, -1);

// ======================================================================
// 2. REQUEST
// ======================================================================
var body = (typeof message !== "undefined" && message && message.body)
    ? message.body
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" && input ? input : {}));

function pick(v, fallback) { return (v && String(v).trim()) ? String(v).trim() : fallback; }

var sendTo = pick(body.email_to || body.send_to || body.sendto || body.emails, DEFAULT_RECEIVER);
var targetDate = pick(body.date, d1Default);                       // tanggal laporan (D-1)
var endDateRange = pick(body.end_date, targetDate);
var startDateRange = pick(body.start_date, targetDate.substring(0, 8) + '01');   // tgl 1 bulan berjalan

// ======================================================================
// 3. AMBIL DATA RIIL
// ======================================================================
function fetchSummary(startDate, endDate) {
    var res = ServiceInvoker.post(SUMMARY_SERVICE, {
        "start_date": startDate,
        "end_date": endDate,
        "start": 0,
        "limit": 10000
    });
    return (res && res.result) ? res.result : null;
}

var d1Result = null;
var rangeResult = null;
try {
    d1Result = fetchSummary(targetDate, targetDate);          // snapshot D-1
    rangeResult = (startDateRange === targetDate && endDateRange === targetDate)
        ? d1Result
        : fetchSummary(startDateRange, endDateRange);          // trend & range timeline
} catch (e) {
    logError("Failed fetching summary data: " + e.message);
    return { success: false, error: "Failed fetching dashboard data: " + e.message };
}

if (!d1Result || !rangeResult) {
    return { success: false, error: "Dashboard summary service returned no result. Email not sent." };
}

function rowsOf(obj, key) {
    return (obj && obj[key] && Array.isArray(obj[key].rows)) ? obj[key].rows : [];
}

var d1Tickets = rowsOf(d1Result, 'data_grid');
var rangeTickets = rowsOf(rangeResult, 'data_grid');
var fmeMgmtRows = rowsOf(d1Result, 'fme_management');
var dailyRows = (rangeResult.charts && Array.isArray(rangeResult.charts.accept_rate_daily))
    ? rangeResult.charts.accept_rate_daily : [];

// ======================================================================
// 4. OLAH DATA
// ======================================================================
function isLeave(t) {
    return !!(t.complete_time || t.exit_time || t.current_phase === 'leave' || t.out_in === 'exit');
}
function hourOf(ts) {
    if (!ts || String(ts).length < 13) return -1;
    var h = parseInt(String(ts).substring(11, 13), 10);
    return (isNaN(h) || h < 0 || h > 23) ? -1 : h;
}

// --- 4a. Daily accept rate per tanggal & party (dari accept_rate_daily, tanpa lubang tanggal)
var trendDates = dateList(startDateRange, endDateRange);
var dailyMap = {};
var di, pi;
for (di = 0; di < trendDates.length; di++) {
    dailyMap[trendDates[di]] = { total: 0, accepted: 0, parties: {} };
    for (pi = 0; pi < PARTIES.length; pi++) {
        dailyMap[trendDates[di]].parties[PARTIES[pi]] = { total: 0, accepted: 0 };
    }
}
for (di = 0; di < dailyRows.length; di++) {
    var dr = dailyRows[di];
    var drDate = dr.ticket_date;
    var drParty = dr.party_name;
    if (!dailyMap[drDate] || !dailyMap[drDate].parties[drParty]) continue;
    var drTotal = num(dr.count_ticket_id);
    var drAcc = num(dr.count_accept_time);
    dailyMap[drDate].total += drTotal;
    dailyMap[drDate].accepted += drAcc;
    dailyMap[drDate].parties[drParty].total += drTotal;
    dailyMap[drDate].parties[drParty].accepted += drAcc;
}

var trendTotals = [], trendAccepted = [], trendRates = [], trendOverall = [];
var partyRateSeries = {};
var partySumTotal = {}, partySumAccepted = {};
for (pi = 0; pi < PARTIES.length; pi++) {
    partyRateSeries[PARTIES[pi]] = [];
    partySumTotal[PARTIES[pi]] = 0;
    partySumAccepted[PARTIES[pi]] = 0;
}
var grandTotal = 0, grandAccepted = 0;
for (di = 0; di < trendDates.length; di++) {
    var dm = dailyMap[trendDates[di]];
    grandTotal += dm.total;
    grandAccepted += dm.accepted;
    trendTotals.push(dm.total);
    trendAccepted.push(dm.accepted);
    var rateDay = Number(pct(dm.accepted, dm.total, 2));
    trendRates.push(rateDay);
    trendOverall.push(rateDay);
    for (pi = 0; pi < PARTIES.length; pi++) {
        var pp = dm.parties[PARTIES[pi]];
        partySumTotal[PARTIES[pi]] += pp.total;
        partySumAccepted[PARTIES[pi]] += pp.accepted;
        partyRateSeries[PARTIES[pi]].push(Number(pct(pp.accepted, pp.total, 2)));
    }
}

// --- 4b. Snapshot D-1 (Ticket Summary, Accept Rate by Party, Donut)
var d1Daily = dailyMap[targetDate] || { total: 0, accepted: 0, parties: {} };
for (pi = 0; pi < PARTIES.length; pi++) {
    if (!d1Daily.parties[PARTIES[pi]]) d1Daily.parties[PARTIES[pi]] = { total: 0, accepted: 0 };
}
var d1Total = d1Daily.total;
var d1Accepted = d1Daily.accepted;
var d1Rate = pct(d1Accepted, d1Total, 1);

// --- 4c. FME Ticket Acceptance Detail (fme_management D-1)
var fmeParty = {};
for (pi = 0; pi < PARTIES.length; pi++) {
    fmeParty[PARTIES[pi]] = { totalFme: 0, tickets: 0, accepted: 0 };
}
for (di = 0; di < fmeMgmtRows.length; di++) {
    var fr = fmeMgmtRows[di];
    if (!fmeParty[fr.party_name]) continue;
    fmeParty[fr.party_name].totalFme++;
    fmeParty[fr.party_name].tickets += num(fr.count_ticket_id);
    fmeParty[fr.party_name].accepted += num(fr.count_accept_time);
}

// --- 4d. Milestone D-1, hourly, cluster, FME detail (dari tiket D-1)
var ms = { total: d1Tickets.length, accepted: 0, depart: 0, arrive: 0, leave: 0 };
var hourly = [];
var hh;
for (hh = 0; hh < 24; hh++) hourly.push({ total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 });

var clusterMap = {};
var fmeMap = {};
var ti;
for (ti = 0; ti < d1Tickets.length; ti++) {
    var t = d1Tickets[ti];
    if (!t) continue;

    var acc = !!t.accept_time, dep = !!t.depart_time, arr = !!t.arrive_time, lev = isLeave(t);
    if (acc) ms.accepted++;
    if (dep) ms.depart++;
    if (arr) ms.arrive++;
    if (lev) ms.leave++;

    // Hourly: sama dengan dashboard -> hanya tiket yang createtime-nya D-1
    if (t.createtime && String(t.createtime).substring(0, 10) === targetDate) {
        var hc = hourOf(t.createtime);
        if (hc >= 0) hourly[hc].total++;
        var ha = hourOf(t.accept_time);
        if (ha >= 0) hourly[ha].accepted++;
        var hd = hourOf(t.depart_time);
        if (hd >= 0) hourly[hd].depart++;
        var hr = hourOf(t.arrive_time);
        if (hr >= 0) hourly[hr].arrive++;
        var hl = hourOf(t.complete_time || t.exit_time || (t.current_phase === 'leave' ? t.lastupdatetime : null));
        if (hl >= 0) hourly[hl].leave++;
    }

    var cluster = String(t.fme_fm_office_name || t.fm_office || 'Unassigned').trim() || 'Unassigned';
    if (!clusterMap[cluster]) clusterMap[cluster] = { name: cluster, total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
    clusterMap[cluster].total++;
    if (acc) clusterMap[cluster].accepted++;
    if (dep) clusterMap[cluster].depart++;
    if (arr) clusterMap[cluster].arrive++;
    if (lev) clusterMap[cluster].leave++;

    var fmeName = String(t.fme_fullname || t.assign_to_fme || '').trim();
    if (fmeName) {
        var fk = cluster + '___' + fmeName;
        if (!fmeMap[fk]) fmeMap[fk] = { cluster: cluster, name: fmeName, accepted: 0, depart: 0, arrive: 0, leave: 0 };
        if (acc) fmeMap[fk].accepted++;
        if (dep) fmeMap[fk].depart++;
        if (arr) fmeMap[fk].arrive++;
        if (lev) fmeMap[fk].leave++;
    }
}

var clusterList = [];
var key;
for (key in clusterMap) clusterList.push(clusterMap[key]);
clusterList.sort(function (a, b) { return b.total - a.total; });

var fmeList = [];
for (key in fmeMap) fmeList.push(fmeMap[key]);
fmeList.sort(function (a, b) {
    if (a.cluster === b.cluster) {
        if (b.accepted !== a.accepted) return b.accepted - a.accepted;
        return a.name.localeCompare(b.name);
    }
    return a.cluster.localeCompare(b.cluster);
});

// --- 4e. Date Range Timeline (milestone per tanggal kejadian, seluruh range)
var rangeMap = {};
for (di = 0; di < trendDates.length; di++) {
    rangeMap[trendDates[di]] = { total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
}
function bump(ts, field) {
    if (!ts) return;
    var d = String(ts).substring(0, 10);
    if (rangeMap[d]) rangeMap[d][field]++;
}
for (ti = 0; ti < rangeTickets.length; ti++) {
    var rt = rangeTickets[ti];
    if (!rt) continue;
    bump(rt.createtime, 'total');
    bump(rt.accept_time, 'accepted');
    bump(rt.depart_time, 'depart');
    bump(rt.arrive_time, 'arrive');
    bump(rt.complete_time || rt.exit_time, 'leave');
}

// ======================================================================
// 5. CHART (QuickChart, Chart.js v2) - gaya 1:1 dengan ECharts dashboard
// ======================================================================
var GRADIENTS = {
    ORANGE: "getGradientFillHelper('vertical',['rgba(240,136,62,0.35)','rgba(240,136,62,0.03)'])",
    WHITE: "getGradientFillHelper('vertical',['rgba(255,255,255,0.12)','rgba(255,255,255,0)'])",
    BLUE: "getGradientFillHelper('vertical',['rgba(59,130,246,0.25)','rgba(59,130,246,0)'])",
    ORANGE2: "getGradientFillHelper('vertical',['rgba(249,115,22,0.25)','rgba(249,115,22,0)'])",
    PINK: "getGradientFillHelper('vertical',['rgba(236,72,153,0.25)','rgba(236,72,153,0)'])",
    GREEN: "getGradientFillHelper('vertical',['rgba(52,211,153,0.25)','rgba(52,211,153,0)'])"
};
var FUNCTIONS = {
    PCT: "function(v){return v+'%';}",
    PCT1: "function(v){return Number(v||0).toFixed(1)+'%';}",
    PCT2: "function(v){return Number(v||0).toFixed(2)+'%';}"
};

function chartUrl(config, width, height) {
    var s = JSON.stringify(config);
    s = s.replace(/"__G_([A-Z0-9]+)__"/g, function (m, k) { return GRADIENTS[k]; });
    s = s.replace(/"__F_([A-Z0-9]+)__"/g, function (m, k) { return FUNCTIONS[k]; });
    return "https://quickchart.io/chart?v=2.9.4&w=" + width + "&h=" + height +
        "&devicePixelRatio=2&bkg=" + encodeURIComponent(C.card) +
        "&c=" + encodeURIComponent(s);
}

function imgTag(url, width, height, alt) {
    return '<img src="' + url + '" width="' + width + '" height="' + height + '" alt="' + esc(alt) +
        '" style="display:block; width:100%; max-width:' + width + 'px; height:auto; border:0;" />';
}

var axisFont = '#8b949e';
var gridColor = '#30363d';
var CHART_W = 832;

function axisX(size) {
    return [{ ticks: { fontColor: axisFont, fontSize: size || 10 }, gridLines: { color: gridColor, display: false } }];
}
function titleCfg(text) {
    return { display: true, text: text, fontColor: '#c9d1d9', fontSize: 18, fontStyle: 'bold', padding: 14 };
}
var legendCfg = { position: 'bottom', labels: { fontColor: '#c9d1d9', fontSize: 12, boxWidth: 14, padding: 14 } };

function barLabel(color, size) {
    return { anchor: 'end', align: 'end', color: color || '#c9d1d9', font: { size: size || 8 } };
}

// A. Donut
var donutValues = [];
for (pi = 0; pi < PARTIES.length; pi++) donutValues.push(d1Daily.parties[PARTIES[pi]].accepted);
var donutHasData = (donutValues[0] + donutValues[1] + donutValues[2]) > 0;
var donutUrl = chartUrl({
    type: 'doughnut',
    data: { labels: PARTIES, datasets: [{ data: donutValues, backgroundColor: DONUT_COLORS, borderWidth: 0 }] },
    options: {
        cutoutPercentage: 68,
        legend: { position: 'right', labels: { fontColor: '#c9d1d9', fontSize: 13, boxWidth: 14, padding: 12 } },
        plugins: { datalabels: { display: false } }
    }
}, 300, 200);

// B. Mateline Utilization Trend
var trendLabels = [];
for (di = 0; di < trendDates.length; di++) trendLabels.push(shortDate(trendDates[di]));

var trendUrl = chartUrl({
    type: 'bar',
    data: {
        labels: trendLabels,
        datasets: [
            { type: 'bar', label: 'Total Ticket', data: trendTotals, backgroundColor: '#58a6ff', yAxisID: 'y', datalabels: barLabel() },
            { type: 'bar', label: 'Accepted Tickets', data: trendAccepted, backgroundColor: '#3fb950', yAxisID: 'y', datalabels: barLabel() },
            {
                type: 'line', label: 'Accept Rate', data: trendRates, yAxisID: 'y1',
                borderColor: '#f0883e', backgroundColor: '__G_ORANGE__', fill: true, lineTension: 0.4,
                borderWidth: 3, pointRadius: 3, pointBackgroundColor: '#f0883e', pointBorderColor: '#f0883e',
                datalabels: { anchor: 'end', align: 'top', color: '#f0883e', font: { size: 8 }, formatter: '__F_PCT1__' }
            }
        ]
    },
    options: {
        title: titleCfg('Mateline Utilization Trend'),
        legend: legendCfg,
        plugins: { datalabels: { display: true } },
        layout: { padding: { top: 6, right: 6 } },
        scales: {
            xAxes: axisX(10),
            yAxes: [
                { id: 'y', position: 'left', scaleLabel: { display: true, labelString: 'Count', fontColor: axisFont },
                    ticks: { fontColor: axisFont, beginAtZero: true }, gridLines: { color: gridColor } },
                { id: 'y1', position: 'right', scaleLabel: { display: true, labelString: 'Accept Rate', fontColor: axisFont },
                    ticks: { fontColor: axisFont, min: 0, max: 100, callback: '__F_PCT__' }, gridLines: { display: false } }
            ]
        }
    }
}, CHART_W, 420);

// C. Daily Accept Rate by Party
var dailyDatasets = [];
for (pi = 0; pi < PARTIES.length; pi++) {
    dailyDatasets.push({
        type: 'bar', label: PARTIES[pi], data: partyRateSeries[PARTIES[pi]],
        backgroundColor: PARTY_COLORS[PARTIES[pi]], datalabels: barLabel('#c9d1d9', 7)
    });
}
dailyDatasets.push({
    type: 'line', label: 'Overall Accept Rate', data: trendOverall,
    borderColor: '#f0883e', backgroundColor: '__G_ORANGE__', fill: true, lineTension: 0.4,
    borderWidth: 3, pointRadius: 3, pointBackgroundColor: '#f0883e', pointBorderColor: '#f0883e',
    datalabels: { anchor: 'end', align: 'top', color: '#f0883e', font: { size: 8 }, formatter: '__F_PCT2__' }
});
var dailyUrl = chartUrl({
    type: 'bar',
    data: { labels: trendLabels, datasets: dailyDatasets },
    options: {
        title: titleCfg('Daily Accept Rate'),
        legend: legendCfg,
        plugins: { datalabels: { display: true } },
        layout: { padding: { top: 6, right: 6 } },
        scales: {
            xAxes: axisX(10),
            yAxes: [{ position: 'left', scaleLabel: { display: true, labelString: 'Accept Rate', fontColor: axisFont },
                ticks: { fontColor: axisFont, min: 0, max: 100, callback: '__F_PCT__' }, gridLines: { color: gridColor } }]
        }
    }
}, CHART_W, 420);

// D & E. Milestone line charts (Total putus-putus putih + 4 milestone area)
function milestoneChart(labels, series, height, tickSize) {
    function ds(name, data, color, grad, width, dashed) {
        var o = {
            label: name, data: data, borderColor: color, backgroundColor: grad, fill: true, lineTension: 0.4,
            borderWidth: width, pointRadius: 3, pointBackgroundColor: color, pointBorderColor: color,
            datalabels: { display: false }
        };
        if (dashed) o.borderDash = [6, 4];
        return o;
    }
    return chartUrl({
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                ds('Total Ticket', series.total, '#ffffff', '__G_WHITE__', 2, true),
                ds('Accepted', series.accepted, '#3b82f6', '__G_BLUE__', 2.5, false),
                ds('Depart', series.depart, '#f97316', '__G_ORANGE2__', 2.5, false),
                ds('Arrive', series.arrive, '#ec4899', '__G_PINK__', 2.5, false),
                ds('Leave', series.leave, '#34d399', '__G_GREEN__', 2.5, false)
            ]
        },
        options: {
            legend: legendCfg,
            layout: { padding: { top: 10, right: 10 } },
            scales: {
                xAxes: [{ ticks: { fontColor: '#a1a1aa', fontSize: tickSize || 10 }, gridLines: { color: '#27272a', display: false } }],
                yAxes: [{ ticks: { fontColor: '#a1a1aa', beginAtZero: true, precision: 0 },
                    gridLines: { color: '#27272a', borderDash: [4, 4] } }]
            }
        }
    }, CHART_W, height);
}

var hourLabels = [], hSeries = { total: [], accepted: [], depart: [], arrive: [], leave: [] };
for (hh = 0; hh < 24; hh++) {
    hourLabels.push(pad2(hh) + ':00');
    hSeries.total.push(hourly[hh].total);
    hSeries.accepted.push(hourly[hh].accepted);
    hSeries.depart.push(hourly[hh].depart);
    hSeries.arrive.push(hourly[hh].arrive);
    hSeries.leave.push(hourly[hh].leave);
}
var hourlyUrl = milestoneChart(hourLabels, hSeries, 340, 9);

var rSeries = { total: [], accepted: [], depart: [], arrive: [], leave: [] };
for (di = 0; di < trendDates.length; di++) {
    var rm = rangeMap[trendDates[di]];
    rSeries.total.push(rm.total);
    rSeries.accepted.push(rm.accepted);
    rSeries.depart.push(rm.depart);
    rSeries.arrive.push(rm.arrive);
    rSeries.leave.push(rm.leave);
}
var rangeUrl = milestoneChart(trendLabels, rSeries, 340, 10);

// ======================================================================
// 6. HTML BUILDER
// ======================================================================
var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function spacer(h) { return '<tr><td height="' + h + '" style="font-size:0; line-height:0;">&nbsp;</td></tr>'; }

function cardBox(inner) {
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.card +
        '; border:1px solid ' + C.border + '; border-radius:12px;"><tr><td style="padding:20px;">' + inner + '</td></tr></table>';
}

function cardHeader(title, subtitle) {
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;"><tr>' +
        '<td align="left" style="font-size:15px; font-weight:700; color:' + C.text + ';">' + esc(title) + '</td>' +
        '<td align="right" style="font-size:12px; color:' + C.sub + ';">' + esc(subtitle || '') + '</td></tr></table>';
}

// Warna -> class (mengecilkan ukuran HTML; Gmail memotong email > ~102KB)
var COLOR_CLASS = {};
COLOR_CLASS[C.sub] = 'cs';
COLOR_CLASS[C.muted] = 'cm';
COLOR_CLASS[C.blue] = 'cb';
COLOR_CLASS[C.orange] = 'co';
COLOR_CLASS[C.pink] = 'cp';
COLOR_CLASS[C.green] = 'cg';
COLOR_CLASS['#ffffff'] = 'cw';
COLOR_CLASS['#58a6ff'] = 'cl';
COLOR_CLASS['#e4e4e7'] = 'ce';

function cc(color) { return COLOR_CLASS[color] ? ' ' + COLOR_CLASS[color] : ''; }
function wc(weight) { return weight >= 700 ? ' w7' : (weight >= 600 ? ' w6' : ''); }

function th(label, align, color) {
    return '<th class="th' + cc(color) + '" align="' + (align || 'right') + '">' + esc(label) + '</th>';
}
function td(value, align, color, weight, small) {
    return '<td class="td' + cc(color) + wc(weight) + (small ? ' f11' : '') + '" align="' + (align || 'right') + '">' + value + '</td>';
}

// Tabel matriks tanggal (trend & daily) - kolom rapat
function dateMatrixHead(firstLabel, dates, lastLabel) {
    var h = '<tr><th class="mh" align="left">' + esc(firstLabel) + '</th>';
    var i;
    for (i = 0; i < dates.length; i++) {
        h += '<th class="mh mhd" align="right">' + shortDate(dates[i]) + '</th>';
    }
    return h + '<th class="mh w7" align="right" style="color:' + C.text + ';">' + esc(lastLabel) + '</th></tr>';
}
function dateMatrixRow(label, values, grand, color, boldLabel) {
    var r = '<tr><td class="mc ml' + (boldLabel ? ' w7' : '') + '" align="left">' + esc(label) + '</td>';
    var i;
    for (i = 0; i < values.length; i++) {
        r += '<td class="mc mcd' + cc(color) + '" align="right">' + values[i] + '</td>';
    }
    return r + '<td class="mc w7' + cc(color) + '" align="right">' + grand + '</td></tr>';
}

function milestoneCardCell(label, value, pctVal, color, bgRgba, borderRgba) {
    var pill = (pctVal === null) ? '' :
        '<td align="right" valign="bottom" style="padding-bottom:3px;"><span style="font-size:11px; font-weight:700; color:' + color +
        '; background:' + bgRgba + '; border:1px solid ' + borderRgba + '; border-radius:9999px; padding:2px 8px;">' + pctVal + '%</span></td>';
    return '<td width="19%" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:12px; padding:16px;">' +
        '<div style="font-size:11px; font-weight:700; text-transform:uppercase; color:' + C.sub + '; margin-bottom:10px;">' + label + '</div>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td align="left" style="font-size:30px; font-weight:700; color:' + C.text + '; line-height:1;">' + value + '</td>' + pill +
        '</tr></table></td>';
}

function legendDot(color, label) {
    return '<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:' + color + '; margin-right:6px;"></span>' + label;
}

var h = [];

h.push('<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">',
    '<style>',
    '.th{padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;background:' + C.head + ';color:' + C.sub + ';}',
    '.td{padding:9px 8px;font-size:12px;color:' + C.text + ';border-bottom:1px solid ' + C.rowLine + ';}',
    '.f11{font-size:11px;}',
    '.mh{padding:8px 3px;font-size:10px;background:' + C.head + ';color:' + C.sub + ';}',
    '.mhd{font-size:9px;font-weight:700;}',
    '.mc{padding:8px 6px;font-size:10px;color:' + C.text + ';border-bottom:1px solid ' + C.rowLine + ';}',
    '.mcd{padding:8px 3px;font-size:9px;}',
    '.ml{white-space:nowrap;}',
    '.w6{font-weight:600;}.w7{font-weight:700;}',
    '.cs{color:' + C.sub + ';}.cm{color:' + C.muted + ';}.cb{color:' + C.blue + ';}.co{color:' + C.orange + ';}',
    '.cp{color:' + C.pink + ';}.cg{color:' + C.green + ';}.cw{color:#ffffff;}.cl{color:#58a6ff;}.ce{color:#e4e4e7;}',
    '</style>',
    '</head>',
    '<body style="margin:0; padding:0; background:' + C.bg + '; font-family:' + FONT + '; color:#e4e4e7;">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.bg + ';"><tr><td align="center" style="padding:24px 12px;">',
    '<table width="920" cellpadding="0" cellspacing="0" border="0" style="width:920px; max-width:100%;">');

// ---- 1. HEADER -------------------------------------------------------
h.push('<tr><td style="padding-bottom:18px; border-bottom:1px solid ' + C.border + ';">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
    '<td align="left" valign="top">',
    '<div style="font-size:26px; font-weight:800; color:' + C.text + '; letter-spacing:0.5px;">MATELINE UTILIZATION DASHBOARD</div>',
    '<div style="font-size:14px; color:' + C.sub + '; margin-top:6px;">Daily Mateline utilization and ticket acceptance monitoring</div>',
    '</td>',
    '<td align="right" valign="top" style="white-space:nowrap;">',
    '<span style="display:inline-block; font-size:13px; font-weight:700; color:' + C.sub + '; background:' + C.card + '; border:1px solid ' + C.border +
    '; border-radius:8px; padding:8px 14px;">Report Date: <span style="color:#58a6ff;">' + esc(longDateEn(targetDate)) + ' (D-1)</span></span>',
    '</td></tr></table></td></tr>');
h.push(spacer(16));

h.push('<tr><td><span style="display:inline-block; background:' + C.card + '; border:1px solid ' + C.border +
    '; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:600; color:#58a6ff;">Active: ' +
    esc(longDateId(startDateRange)) + ' – ' + esc(longDateId(endDateRange)) + ' | Region: All Region | Party: All Party</span></td></tr>');
h.push(spacer(20));

// ---- 2. TOP ROW: Ticket Summary | Donut | FME Acceptance Detail ----
var summaryHtml =
    '<div style="font-size:15px; font-weight:700; color:' + C.text + '; margin-bottom:14px;">Ticket Summary</div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>' +
    '<td width="48%" valign="top" style="padding:12px; border-radius:8px; background:#d1eaff;">' +
    '<div style="font-size:12px; font-weight:700; color:#0367c1; margin-bottom:14px;">Total Tickets</div>' +
    '<div style="font-size:30px; font-weight:800; color:#0367c1; line-height:1;">' + d1Total + '</div></td>' +
    '<td width="4%">&nbsp;</td>' +
    '<td width="48%" valign="top" style="padding:12px; border-radius:8px; background:#daf5e6;">' +
    '<div style="font-size:12px; font-weight:700; color:#027039; margin-bottom:14px;">Total Accepted</div>' +
    '<div style="font-size:30px; font-weight:800; color:#027039; line-height:1;">' + d1Accepted + '</div></td>' +
    '</tr></table>' +
    '<div style="font-size:13px; color:' + C.sub + '; margin-bottom:4px;">Acceptance Rate</div>' +
    '<div style="font-size:28px; font-weight:800; color:' + C.text + '; margin-bottom:8px;">' + d1Rate + '%</div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1f2937; border-radius:999px;"><tr>' +
    '<td width="' + Math.min(100, Math.max(0, Math.round(Number(d1Rate)))) + '%" height="10" style="background:#3b82f6; border-radius:999px; font-size:0; line-height:0;">&nbsp;</td>' +
    '<td style="font-size:0; line-height:0;">&nbsp;</td></tr></table>';

var donutHtml =
    '<div style="font-size:15px; font-weight:700; color:' + C.text + '; margin-bottom:10px;">Accepted Ticket Distribution by Party</div>' +
    (donutHasData
        ? imgTag(donutUrl, 300, 200, 'Accepted Ticket Distribution by Party')
        : '<div style="padding:70px 0; text-align:center; font-size:13px; color:' + C.muted + ';">No accepted tickets found.</div>');

var fmeRowsHtml = '';
for (pi = 0; pi < PARTIES.length; pi++) {
    var fp = fmeParty[PARTIES[pi]];
    fmeRowsHtml += '<tr>' +
        '<td align="left" style="padding:8px 4px; font-size:11px; font-weight:700; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + PARTIES[pi] + '</td>' +
        '<td align="right" style="padding:8px 4px; font-size:11px; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + fp.totalFme + '</td>' +
        '<td align="right" style="padding:8px 4px; font-size:11px; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + fp.tickets + '</td>' +
        '<td align="right" style="padding:8px 4px; font-size:11px; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + fp.accepted + '</td>' +
        '<td align="right" style="padding:8px 4px; font-size:11px; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + pct(fp.accepted, fp.tickets, 2) + '%</td></tr>';
}
function fmeTh(label, align) {
    return '<th align="' + align + '" style="padding:8px 4px; font-size:9px; font-weight:700; text-transform:uppercase; color:' + C.sub + '; background:' + C.head + ';">' + label + '</th>';
}
var fmeHtml =
    '<div style="font-size:15px; font-weight:700; color:' + C.text + '; margin-bottom:10px;">FME Ticket Acceptance Detail</div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><thead><tr>' +
    fmeTh('FME Party', 'left') + fmeTh('Total FME', 'right') + fmeTh('Ticket Count', 'right') + fmeTh('Accepted Count', 'right') + fmeTh('Accept Rate (%)', 'right') +
    '</tr></thead><tbody>' + fmeRowsHtml + '</tbody></table>';

function boxCell(width, inner) {
    return '<td width="' + width + '" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:12px; padding:18px;">' + inner + '</td>';
}
h.push('<tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
    boxCell('30%', summaryHtml), '<td width="2%">&nbsp;</td>',
    boxCell('34%', donutHtml), '<td width="2%">&nbsp;</td>',
    boxCell('32%', fmeHtml),
    '</tr></table></td></tr>');
h.push(spacer(20));

// ---- 3. ACCEPT RATE BY PARTY (D-1) ----------------------------------
h.push('<tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>');
for (pi = 0; pi < PARTIES.length; pi++) {
    var pd1 = d1Daily.parties[PARTIES[pi]];
    h.push('<td width="32%" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:12px; padding:16px 18px;">' +
        '<div style="font-size:12px; font-weight:700; text-transform:uppercase; color:' + C.muted + ';">' + PARTIES[pi] + ' – D-1</div>' +
        '<div style="font-size:30px; font-weight:800; color:#58a6ff; margin:8px 0 4px 0;">' + pct(pd1.accepted, pd1.total, 1) + '%</div>' +
        '<div style="font-size:12px; color:' + C.muted + ';">' + pd1.accepted + ' / ' + pd1.total + ' accepted</div></td>' +
        (pi < 2 ? '<td width="2%">&nbsp;</td>' : ''));
}
h.push('</tr></table></td></tr>');
h.push(spacer(20));

// ---- 4. MATELINE UTILIZATION TREND ----------------------------------
var trendTable =
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px; table-layout:auto;">' +
    '<thead>' + dateMatrixHead('', trendDates, 'Grand Total') + '</thead><tbody>' +
    dateMatrixRow('Ticket Count', trendTotals, grandTotal, C.text, false) +
    dateMatrixRow('Accepted Count', trendAccepted, grandAccepted, C.text, false) +
    dateMatrixRow('Accept Rate', (function () {
        var arr2 = [], i2;
        for (i2 = 0; i2 < trendRates.length; i2++) arr2.push(trendRates[i2].toFixed(2) + '%');
        return arr2;
    })(), pct(grandAccepted, grandTotal, 2) + '%', C.text, false) +
    '</tbody></table>';

h.push('<tr><td>', cardBox(imgTag(trendUrl, CHART_W, 420, 'Mateline Utilization Trend') + trendTable), '</td></tr>');
h.push(spacer(20));

// ---- 5. DAILY ACCEPT RATE BY PARTY ----------------------------------
var dailyBody = '';
for (pi = 0; pi < PARTIES.length; pi++) {
    var vals = [], i3;
    for (i3 = 0; i3 < partyRateSeries[PARTIES[pi]].length; i3++) vals.push(partyRateSeries[PARTIES[pi]][i3].toFixed(2) + '%');
    dailyBody += dateMatrixRow(PARTIES[pi], vals, pct(partySumAccepted[PARTIES[pi]], partySumTotal[PARTIES[pi]], 2) + '%', C.text, false);
}
var overallVals = [], i4;
for (i4 = 0; i4 < trendOverall.length; i4++) overallVals.push(trendOverall[i4].toFixed(2) + '%');
dailyBody += dateMatrixRow('Overall Accept Rate', overallVals, pct(grandAccepted, grandTotal, 2) + '%', C.text, true);

var dailyTable = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><thead>' +
    dateMatrixHead('', trendDates, 'Grand Total') + '</thead><tbody>' + dailyBody + '</tbody></table>';

h.push('<tr><td>', cardBox(imgTag(dailyUrl, CHART_W, 420, 'Daily Accept Rate') + dailyTable), '</td></tr>');
h.push(spacer(24));

// ---- 6. MILESTONE UTILIZATION DASHBOARD (D-1) -----------------------
h.push('<tr><td style="font-size:15px; font-weight:800; color:' + C.text + '; letter-spacing:0.5px; padding-bottom:12px;">MILESTONE UTILIZATION DASHBOARD</td></tr>');
h.push('<tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
    milestoneCardCell('Total Ticket', ms.total, null, C.text, '', ''), '<td width="1%">&nbsp;</td>',
    milestoneCardCell('Total Accepted', ms.accepted, Math.round(ms.total > 0 ? ms.accepted / ms.total * 100 : 0), '#58a6ff', 'rgba(88,166,255,0.12)', 'rgba(88,166,255,0.3)'), '<td width="1%">&nbsp;</td>',
    milestoneCardCell('Total Depart', ms.depart, Math.round(ms.total > 0 ? ms.depart / ms.total * 100 : 0), C.orange, 'rgba(249,115,22,0.12)', 'rgba(249,115,22,0.3)'), '<td width="1%">&nbsp;</td>',
    milestoneCardCell('Total Arrive', ms.arrive, Math.round(ms.total > 0 ? ms.arrive / ms.total * 100 : 0), C.pink, 'rgba(236,72,153,0.12)', 'rgba(236,72,153,0.3)'), '<td width="1%">&nbsp;</td>',
    milestoneCardCell('Total Leave', ms.leave, Math.round(ms.total > 0 ? ms.leave / ms.total * 100 : 0), C.green, 'rgba(52,211,153,0.12)', 'rgba(52,211,153,0.3)'),
    '</tr></table></td></tr>');
h.push(spacer(20));

// ---- 7. 1 DAY - HOURLY TIMELINE -------------------------------------
var hourHead = '<tr><th align="left" style="padding:10px 8px; font-size:11px; background:' + C.head + '; color:' + C.text + ';">Milestone</th>';
for (hh = 0; hh < 24; hh += 2) {
    hourHead += '<th align="center" style="padding:10px 2px; font-size:10px; font-weight:700; background:' + C.head + '; color:' + C.sub + ';">' + pad2(hh) + ':00</th>';
}
hourHead += '<th align="center" style="padding:10px 6px; font-size:11px; font-weight:700; background:' + C.head + '; color:' + C.text + ';">Total</th></tr>';

function hourRow(label, field, color, grandVal, isLast) {
    var r = '<tr><td align="left" style="padding:9px 8px; font-size:12px; font-weight:700; color:' + color + ';' +
        (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '">' + legendDot(color, label) + '</td>';
    var k;
    for (k = 0; k < 24; k += 2) {
        r += '<td align="center" style="padding:9px 2px; font-size:12px; color:' + color + ';' +
            (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '">' + (hourly[k][field] + hourly[k + 1][field]) + '</td>';
    }
    return r + '<td align="center" style="padding:9px 6px; font-size:12px; font-weight:800; color:' + color + ';' +
        (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '">' + grandVal + '</td></tr>';
}
var hourTotalSum = 0;
for (hh = 0; hh < 24; hh++) hourTotalSum += hourly[hh].total;

var hourTable = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><thead>' + hourHead + '</thead><tbody>' +
    hourRow('Total Ticket', 'total', '#ffffff', hourTotalSum, false) +
    hourRow('Accepted', 'accepted', C.blue, ms.accepted, false) +
    hourRow('Depart', 'depart', C.orange, ms.depart, false) +
    hourRow('Arrive', 'arrive', C.pink, ms.arrive, false) +
    hourRow('Leave', 'leave', C.green, ms.leave, true) +
    '</tbody></table>';

h.push('<tr><td>', cardBox(
    cardHeader('1 Day - Hourly Timeline (' + targetDate + ')', hourTotalSum + ' tickets on this day') +
    '<div style="font-size:12px; color:' + C.sub + '; margin:-8px 0 12px 0;">Distribution of tickets across 24 hours</div>' +
    imgTag(hourlyUrl, CHART_W, 340, '1 Day Hourly Timeline') + hourTable), '</td></tr>');
h.push(spacer(20));

// ---- 8. DATE RANGE TIMELINE -----------------------------------------
h.push('<tr><td>', cardBox(
    cardHeader('Date Range Timeline (' + startDateRange + ' - ' + endDateRange + ')', trendDates.length + ' days in range') +
    imgTag(rangeUrl, CHART_W, 340, 'Date Range Timeline')), '</td></tr>');
h.push(spacer(20));

// ---- 9. CLUSTER OFFICE MILESTONE SUMMARY ----------------------------
var clusterRows = '';
if (clusterList.length === 0) {
    clusterRows = '<tr><td colspan="6" align="center" style="padding:18px; font-size:13px; color:' + C.muted + ';">No cluster data available.</td></tr>';
}
var ci;
for (ci = 0; ci < clusterList.length; ci++) {
    var co = clusterList[ci];
    clusterRows += '<tr>' + td(esc(co.name), 'left', C.text, 700) + td(co.total, 'right', C.text, 700) +
        td(co.accepted, 'right', C.blue, 600) + td(co.depart, 'right', C.orange, 600) +
        td(co.arrive, 'right', C.pink, 600) + td(co.leave, 'right', C.green, 600) + '</tr>';
}
h.push('<tr><td>', cardBox(
    cardHeader('Cluster Office Milestone Summary', clusterList.length + ' clusters active in D-1') +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><thead><tr>' +
    th('Cluster', 'left') + th('Total', 'right') + th('Accepted', 'right', C.blue) + th('Depart', 'right', C.orange) +
    th('Arrive', 'right', C.pink) + th('Leave', 'right', C.green) +
    '</tr></thead><tbody>' + clusterRows + '</tbody></table>'), '</td></tr>');
h.push(spacer(20));

// ---- 10. FME PERFORMANCE DETAIL (semua teknisi) ---------------------
var fmeRows = '';
if (fmeList.length === 0) {
    fmeRows = '<tr><td colspan="6" align="center" style="padding:18px; font-size:13px; color:' + C.muted + ';">No FME data available.</td></tr>';
}
var fi;
for (fi = 0; fi < fmeList.length; fi++) {
    var fo = fmeList[fi];
    fmeRows += '<tr>' + td(esc(fo.cluster), 'left', C.muted, 400, 'font-size:11px;') + td(esc(fo.name), 'left', '#e4e4e7', 600) +
        td(fo.accepted, 'right', C.blue, 600) + td(fo.depart, 'right', C.orange, 600) +
        td(fo.arrive, 'right', C.pink, 600) + td(fo.leave, 'right', C.green, 600) + '</tr>';
}
h.push('<tr><td>', cardBox(
    cardHeader('FME Performance Detail', fmeList.length + ' technicians dispatched in D-1') +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><thead><tr>' +
    th('Cluster', 'left') + th('FME Name', 'left') + th('Accepted', 'right', C.blue) + th('Depart', 'right', C.orange) +
    th('Arrive', 'right', C.pink) + th('Leave', 'right', C.green) +
    '</tr></thead><tbody>' + fmeRows + '</tbody></table>'), '</td></tr>');
h.push(spacer(16));

// ---- FOOTER ---------------------------------------------------------
h.push('<tr><td align="center" style="padding:16px 0; border-top:1px solid ' + C.border + '; font-size:11px; color:#71717a;">',
    'Generated automatically by <strong>Huawei OWS Mateline Utilization Platform</strong> &middot; Data: ' + esc(targetDate) + ' (D-1)',
    '</td></tr>');

h.push('</table></td></tr></table></body></html>');

var html = h.join('');

// ======================================================================
// 7. KIRIM EMAIL
// ======================================================================
var defaultTitle = "[DAILY REPORT] Mateline Utilization " + dayNameOf(todayStr) + " " + todayStr;
var emailSubject = pick(body.title || body.subject, defaultTitle);

var emailPayload = {
    "title": String(emailSubject),
    "email_to": String(sendTo),
    "email_bcc": "",
    "email_cc": "",
    "email_from": "",
    "content": html,
    "data_type": "text/html;charset=utf-8",
    "attachment": "",
    "server_id": ""
};

var result = ServiceInvoker.post(EMAIL_SERVICE, emailPayload);
logInfo("Email sent to " + sendTo + ", response=" + JSON.stringify(result));

return {
    success: true,
    title: emailSubject,
    target_date: targetDate,
    range: startDateRange + " - " + endDateRange,
    recipient: sendTo,
    summary: {
        total_tickets_d1: d1Total,
        accepted_d1: d1Accepted,
        accept_rate_d1: d1Rate + "%",
        technicians_listed: fmeList.length,
        clusters: clusterList.length
    },
    send_result: result
};
