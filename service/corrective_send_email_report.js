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
 *  6. FME Response & Arrival Performance (Accept & Arrive Rate per Partner)
 *  7. Morning Onsite Performance (Vendor Summary chart + Daily Arrive Rate table)
 *  8. Milestone Utilization (5 cards D-1)
 *  9. Date Range Timeline (chart + tabel)
 * 10. Cluster Office Milestone Summary
 * 11. FME Performance Detail (semua teknisi)
 *
 * Catatan: JavaScript ES5 saja (runtime OWS).
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger)
    ? JsLogger.serviceDebugLogger
    : (typeof console !== 'undefined' ? console : null);

function logInfo(msg) { if (logger && logger.info) logger.info(msg); }
function logWarn(msg) { if (logger && (logger.warn || logger.info)) (logger.warn || logger.info)(msg); }
function logError(msg) { if (logger && logger.error) logger.error(msg); }

// ======================================================================
// 0. KONSTANTA
// ======================================================================
var SUMMARY_SERVICE = "/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get";
var EMAIL_SERVICE = "/adc-service/rest/v1/services/System/email/email_send_create";

var PARTIES = ['Persada'];
var PARTY_COLORS = { 'Persada': '#31b5c6' };
var DONUT_COLORS = ['#31b5c6'];

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
var MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MONTH_ID = MONTH_EN;

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
    return d.getUTCDate() + ' ' + MONTH_EN[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
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
var rawInput = null;
if (typeof _message !== "undefined" && _message) {
    if (_message.Input && typeof _message.Input === "object") rawInput = _message.Input;
    else if (_message.input && typeof _message.input === "object") rawInput = _message.input;
    else if (_message.body && typeof _message.body === "object") rawInput = _message.body;
    else rawInput = _message;
} else if (typeof input !== "undefined" && input) {
    if (input.Input && typeof input.Input === "object") rawInput = input.Input;
    else if (input.body && typeof input.body === "object") rawInput = input.body;
    else rawInput = input;
} else if (typeof message !== "undefined" && message) {
    if (message.body && typeof message.body === "object") rawInput = message.body;
    else if (message.Input && typeof message.Input === "object") rawInput = message.Input;
    else rawInput = message;
}

var body = (rawInput && typeof rawInput === "object") ? rawInput : {};
if (body._values && typeof body._values.length === "number" && body._values.length > 0) {
    body = body._values[0];
}

function pick(v, fallback) { return (v && String(v).trim()) ? String(v).trim() : fallback; }

var sendTo = pick(body.email_to || body.send_to || body.sendto || body.emails || body.to, "");
var CC_RECIPIENTS = pick(body.email_cc || body.cc || body.send_cc, "");

if (!sendTo) {
    return {
        success: false,
        error: "Parameter 'email_to' (atau 'send_to') wajib diisi pada payload input."
    };
}

var targetDate = pick(body.date, d1Default);                       // tanggal laporan (D-1)
var endDateRange = pick(body.end_date, targetDate);
// Default rentang: 2 minggu terakhir (14 hari: D-14 s/d D-1 -> endDateRange - 13 hari)
var defaultStart2Weeks = addDays(endDateRange, -13);
var startDateRange = pick(body.start_date, defaultStart2Weeks);

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

function isPersada(item) {
    if (!item) return false;
    var p = String(item.party_name || item.contractor_name || '').trim();
    return p === 'Persada';
}

var rawD1 = rowsOf(d1Result, 'data_grid');
var rawRange = rowsOf(rangeResult, 'data_grid');

var d1Tickets = [];
for (var i = 0; i < rawD1.length; i++) {
    if (isPersada(rawD1[i])) d1Tickets.push(rawD1[i]);
}

var rangeTickets = [];
for (var i = 0; i < rawRange.length; i++) {
    if (isPersada(rawRange[i])) rangeTickets.push(rawRange[i]);
}

var rawFmeMgmt = rowsOf(d1Result, 'fme_management');
var fmeMgmtRows = [];
for (var i = 0; i < rawFmeMgmt.length; i++) {
    if (isPersada(rawFmeMgmt[i])) fmeMgmtRows.push(rawFmeMgmt[i]);
}

var rawDaily = (rangeResult.charts && Array.isArray(rangeResult.charts.accept_rate_daily))
    ? rangeResult.charts.accept_rate_daily : [];
var dailyRows = [];
for (var i = 0; i < rawDaily.length; i++) {
    if (rawDaily[i].party_name === 'Persada') dailyRows.push(rawDaily[i]);
}

// ======================================================================
// 4. OLAH DATA
// ======================================================================
function isLeave(t) {
    if (!t || !t.arrive_time) return false;
    return !!(t.complete_time || t.exit_time || t.current_phase === 'leave' || t.out_in === 'exit');
}

function getLeaveTime(t) {
    if (!t || !t.arrive_time) return null;
    return t.complete_time || t.exit_time || (t.current_phase === 'leave' ? t.lastupdatetime : null);
}

// Konversi timestamp UTC (database) ke WIB (UTC+7) - Pure arithmetic integer O(1) tanpa alokasi Date object
function toWib(ts) {
    if (!ts) return null;
    var s = String(ts);
    if (s.length < 19) return null;
    var h = parseInt(s.substring(11, 13), 10);
    if (isNaN(h)) return null;
    var wHour = h + 7;
    if (wHour < 24) {
        return { date: s.substring(0, 10), hour: wHour };
    }
    wHour -= 24;
    var y = parseInt(s.substring(0, 4), 10);
    var m = parseInt(s.substring(5, 7), 10);
    var d = parseInt(s.substring(8, 10), 10) + 1;
    var dim = 31;
    if (m === 4 || m === 6 || m === 9 || m === 11) dim = 30;
    else if (m === 2) dim = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
    if (d > dim) {
        d = 1;
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return {
        date: y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d),
        hour: wHour
    };
}

// Deteksi tanggal tiket lokal (WIB) dengan memoization (dihitung 1x per tiket)
function getTicketWibDate(t) {
    if (!t) return '';
    if (t._wDate) return t._wDate;
    if (t.createtime) {
        var w = toWib(t.createtime);
        if (w) {
            t._wDate = w.date;
            return w.date;
        }
    }
    if (t.keycode && String(t.keycode).length >= 12) {
        var d = String(t.keycode).substring(4, 12);
        if (/^\d{8}$/.test(d)) {
            var kd = d.substring(0, 4) + '-' + d.substring(4, 6) + '-' + d.substring(6, 8);
            t._wDate = kd;
            return kd;
        }
    }
    var cd = (t.createtime || '').substring(0, 10);
    t._wDate = cd;
    return cd;
}

function getTicketParty(item) {
    if (!item) return '';
    var party = String(item.party_name || item.contractor_name || '').trim();
    if (PARTIES.indexOf(party) === -1) return '';
    return party;
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

// --- 4d. Milestone D-1, cluster, FME detail (pasti langsung dari d1Tickets targetDate)
var d1List = d1Tickets;

var ms = { total: d1List.length, accepted: 0, depart: 0, arrive: 0, leave: 0 };
var clusterMap = {};
var fmeMap = {};
var ti;
for (ti = 0; ti < d1List.length; ti++) {
    var t = d1List[ti];
    if (!t) continue;

    var acc = !!t.accept_time, dep = !!t.depart_time, arr = !!t.arrive_time, lev = isLeave(t);
    if (acc) ms.accepted++;
    if (dep) ms.depart++;
    if (arr) ms.arrive++;
    if (lev) ms.leave++;

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

// --- 4e. Date Range Timeline & Performance Aggregations (SINGLE PASS OVER rangeTickets)
var rangeMap = {};
var fmeDailyMap = {};
for (di = 0; di < trendDates.length; di++) {
    var dtStr = trendDates[di];
    rangeMap[dtStr] = { total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
    fmeDailyMap[dtStr] = { total: 0, accepted: 0, arrived: 0, activeFmes: {} };
}

var fmePerfParty = {};
for (pi = 0; pi < PARTIES.length; pi++) {
    fmePerfParty[PARTIES[pi]] = { total: 0, accepted: 0, arrived: 0, activeFmes: {} };
}

var ONSITE_VENDORS = ['Persada'];
var onsiteVendorDaily = {};
for (pi = 0; pi < ONSITE_VENDORS.length; pi++) {
    onsiteVendorDaily[ONSITE_VENDORS[pi]] = {};
    for (di = 0; di < trendDates.length; di++) {
        onsiteVendorDaily[ONSITE_VENDORS[pi]][trendDates[di]] = { total: 0, pending: 0, accept: 0, depart: 0, arrive: 0, leave: 0 };
    }
}

// Single consolidated loop over rangeTickets
for (ti = 0; ti < rangeTickets.length; ti++) {
    var rt = rangeTickets[ti];
    if (!rt) continue;

    var pName = rt.party_name || rt.contractor_name || '';
    if (pName && !rt.party_name) rt.party_name = pName;
    var isValidParty = (PARTIES.indexOf(pName) !== -1);

    var cDate = getTicketWibDate(rt);
    var hasAcc = !!rt.accept_time;
    var hasDep = !!rt.depart_time;
    var hasArr = !!rt.arrive_time;
    var hasLev = isLeave(rt);

    // 1. Range Timeline Milestone (berdasarkan tanggal kejadian masing-masing status)
    if (cDate && rangeMap[cDate]) rangeMap[cDate].total++;
    if (hasAcc) {
        var wa = toWib(rt.accept_time);
        if (wa && rangeMap[wa.date]) rangeMap[wa.date].accepted++;
    }
    if (hasDep) {
        var wd = toWib(rt.depart_time);
        if (wd && rangeMap[wd.date]) rangeMap[wd.date].depart++;
    }
    if (hasArr) {
        var wr = toWib(rt.arrive_time);
        if (wr && rangeMap[wr.date]) rangeMap[wr.date].arrive++;
    }
    if (hasLev) {
        var wl = toWib(getLeaveTime(rt));
        if (wl && rangeMap[wl.date]) rangeMap[wl.date].leave++;
    }

    // 2. FME Performance & Morning Onsite (hanya jika party valid)
    if (isValidParty) {
        var fmeUser = (rt.assign_to_fme || rt.fme_fullname || '').trim();

        // Akumulasi Party
        fmePerfParty[pName].total++;
        if (hasAcc) fmePerfParty[pName].accepted++;
        if (hasArr) fmePerfParty[pName].arrived++;
        if (fmeUser) fmePerfParty[pName].activeFmes[fmeUser] = true;

        // Akumulasi Harian FME Response
        if (cDate && fmeDailyMap[cDate]) {
            fmeDailyMap[cDate].total++;
            if (hasAcc) fmeDailyMap[cDate].accepted++;
            if (hasArr) fmeDailyMap[cDate].arrived++;
            if (fmeUser) fmeDailyMap[cDate].activeFmes[fmeUser] = true;
        }

        // Akumulasi Harian Morning Onsite (Lifecycle Stage)
        if (cDate && onsiteVendorDaily[pName] && onsiteVendorDaily[pName][cDate]) {
            var bOnsite = onsiteVendorDaily[pName][cDate];
            bOnsite.total++;
            if (hasLev) {
                bOnsite.leave++;
            } else if (hasArr) {
                bOnsite.arrive++;
            } else if (hasDep) {
                bOnsite.depart++;
            } else if (hasAcc) {
                bOnsite.accept++;
            } else {
                bOnsite.pending++;
            }
        }
    }
}

var fmeAcceptRates = [];
var fmeArriveRates = [];
var fmePicCounts = [];
for (di = 0; di < trendDates.length; di++) {
    var fDay = fmeDailyMap[trendDates[di]];
    fmeAcceptRates.push(fDay.total > 0 ? Number(((fDay.accepted / fDay.total) * 100).toFixed(1)) : 0);
    fmeArriveRates.push(fDay.total > 0 ? Number(((fDay.arrived / fDay.total) * 100).toFixed(1)) : 0);
    fmePicCounts.push(Object.keys(fDay.activeFmes).length);
}

var onsiteVendorSummary = {};
var onsiteAllTotal = 0, onsiteAllArrive = 0;
for (pi = 0; pi < ONSITE_VENDORS.length; pi++) {
    var ov = ONSITE_VENDORS[pi];
    var ovTot = 0, ovPen = 0, ovAcc = 0, ovDep = 0, ovArr = 0, ovLev = 0;
    for (di = 0; di < trendDates.length; di++) {
        var dayB = onsiteVendorDaily[ov][trendDates[di]];
        ovTot += dayB.total;
        ovPen += dayB.pending;
        ovAcc += dayB.accept;
        ovDep += dayB.depart;
        ovArr += dayB.arrive;
        ovLev += dayB.leave;
    }
    var ovArrived = ovArr + ovLev;
    var ovRate = ovTot > 0 ? Number(((ovArrived / ovTot) * 100).toFixed(1)) : 0;
    onsiteVendorSummary[ov] = {
        total: ovTot,
        pending: ovPen,
        accept: ovAcc,
        depart: ovDep,
        arrive: ovArr,
        leave: ovLev,
        arrived: ovArrived,
        rate: ovRate
    };
    onsiteAllTotal += ovTot;
    onsiteAllArrive += ovArrived;
}
var onsiteOverallRate = onsiteAllTotal > 0 ? Number(((onsiteAllArrive / onsiteAllTotal) * 100).toFixed(1)) : 0;

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
    PCT2: "function(v){return Number(v||0).toFixed(2)+'%';}",
    PCT_STACK: "function(v){return v>=18?Math.round(v)+'%':'';}",
    PCT_BAR: "function(v){return v>=3?Math.round(v)+'%':'';}",
    PCT_LINE: "function(v){return v>0?Number(v).toFixed(1)+'%':'';}"
};

function chartUrl(config, width, height) {
    var s = JSON.stringify(config);
    s = s.replace(/"__G_([A-Za-z0-9_]+)__"/g, function (m, k) { return GRADIENTS[k]; });
    s = s.replace(/"__F_([A-Za-z0-9_]+)__"/g, function (m, k) { return FUNCTIONS[k]; });
    return "https://quickchart.io/chart?v=2.9.4&w=" + width + "&h=" + height +
        "&devicePixelRatio=2&bkg=" + encodeURIComponent(C.card) +
        "&c=" + encodeURIComponent(s);
}

function imgTag(url, width, height, alt) {
    return '<img src="' + url + '" width="' + (width || '100%') + '" alt="' + esc(alt) +
        '" style="display:block; width:100%; max-width:' + (width || 880) + 'px; height:auto; border:0; border-radius:6px; margin:0 auto;" />';
}

var axisFont = '#8b949e';
var gridColor = '#30363d';
var CHART_W = 880;

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

// Trend labels for milestone and performance charts (14 days)
var trendLabels = [];
for (di = 0; di < trendDates.length; di++) trendLabels.push(shortDate(trendDates[di]));


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


// Donut Circular Gauge Helper (1:1 with dashboard radial progress ring)
function makeDonutGauge(pctVal, color) {
    var val = Math.min(100, Math.max(0, Number(pctVal || 0)));
    var remain = Math.max(0, 100 - val);
    var cfg = {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [Number(val.toFixed(1)), Number(remain.toFixed(1))],
                backgroundColor: [color, '#27272a'],
                borderWidth: 0
            }]
        },
        options: {
            cutoutPercentage: 75,
            rotation: -0.5 * Math.PI,
            legend: { display: false },
            tooltips: { enabled: false },
            plugins: {
                datalabels: { display: false },
                doughnutlabel: {
                    labels: [
                        { text: val.toFixed(1) + '%', font: { size: 16, weight: 'bold' }, color: '#fafafa' }
                    ]
                }
            }
        }
    };
    return "https://quickchart.io/chart?v=2.9.4&w=100&h=100&devicePixelRatio=2&bkg=transparent&c=" + encodeURIComponent(JSON.stringify(cfg));
}

// All Clusters Breakdown Bar Chart (Grouped bars per cluster)
function makeClusterChart(clusters) {
    var topClusters = (clusters || []).slice(0, 8);
    var labels = [];
    var totData = [], accData = [], depData = [], arrData = [], levData = [];
    if (topClusters.length === 0) {
        labels = ['No Data'];
        totData = [0]; accData = [0]; depData = [0]; arrData = [0]; levData = [0];
    } else {
        for (var i = 0; i < topClusters.length; i++) {
            var c = topClusters[i];
            labels.push(String(c.name || '').replace(/^MC\s+/, ''));
            totData.push(c.total || 0);
            accData.push(c.accepted || 0);
            depData.push(c.depart || 0);
            arrData.push(c.arrive || 0);
            levData.push(c.leave || 0);
        }
    }
    return chartUrl({
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Total', data: totData, backgroundColor: '#ffffff', datalabels: { anchor: 'end', align: 'top', color: '#ffffff', font: { size: 7, weight: 'bold' } } },
                { label: 'Accepted', data: accData, backgroundColor: '#3b82f6', datalabels: { anchor: 'end', align: 'top', color: '#3b82f6', font: { size: 7 } } },
                { label: 'Depart', data: depData, backgroundColor: '#f97316', datalabels: { display: false } },
                { label: 'Arrive', data: arrData, backgroundColor: '#ec4899', datalabels: { display: false } },
                { label: 'Leave', data: levData, backgroundColor: '#34d399', datalabels: { display: false } }
            ]
        },
        options: {
            legend: { position: 'bottom', labels: { fontColor: '#c9d1d9', fontSize: 9, boxWidth: 8, padding: 6 } },
            scales: {
                xAxes: [{ ticks: { fontColor: '#8b949e', fontSize: 8 }, gridLines: { display: false } }],
                yAxes: [{ ticks: { fontColor: '#8b949e', beginAtZero: true }, gridLines: { color: '#27272a' } }]
            }
        }
    }, 430, 260);
}

var clusterChartUrl = makeClusterChart(clusterList);

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

// F. FME Response & Arrival Trend Charts (Dual: Accept Rate & Arrive Rate - Clean Line Charts)
function makeFmeTrendChart(title, lineData, lineColor, gradKey, targetSla, seriesName) {
    var slaData = [];
    for (var k = 0; k < trendDates.length; k++) slaData.push(targetSla);
    return chartUrl({
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [
                {
                    type: 'line', label: 'Target SLA (' + targetSla + '%)', data: slaData,
                    borderColor: '#ef4444', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false,
                    datalabels: { display: false }
                },
                {
                    type: 'line', label: seriesName, data: lineData,
                    borderColor: lineColor, backgroundColor: gradKey, fill: true, lineTension: 0.3,
                    borderWidth: 2.5, pointRadius: 2.5, pointBackgroundColor: lineColor, pointBorderColor: lineColor,
                    datalabels: { anchor: 'end', align: 'top', color: lineColor, font: { size: 7, weight: 'bold' }, formatter: '__F_PCT1__' }
                }
            ]
        },
        options: {
            title: titleCfg(title),
            legend: legendCfg,
            plugins: { datalabels: { display: true } },
            scales: {
                xAxes: [{ ticks: { fontColor: axisFont, fontSize: 8 }, gridLines: { color: gridColor, display: false } }],
                yAxes: [
                    { position: 'left', scaleLabel: { display: true, labelString: 'Rate (%)', fontColor: axisFont },
                        ticks: { fontColor: axisFont, min: 0, max: 100, callback: '__F_PCT__' }, gridLines: { color: gridColor } }
                ]
            }
        }
    }, 430, 240);
}

var fmeAcceptChartUrl = makeFmeTrendChart('Accept Rate', fmeAcceptRates, '#3b82f6', '__G_BLUE__', 90, '% WO Accept Rate_CM');
var fmeArriveChartUrl = makeFmeTrendChart('Arrive Rate', fmeArriveRates, '#ec4899', '__G_PINK__', 25, '% WO Arrive Rate_CM');

// G. Morning Onsite Chart (Khusus Persada)
function makeOnsiteDailyChart(vendorName) {
    var aRates = [], dRates = [], arrRates = [], lRates = [], lineRates = [];
    for (var di = 0; di < trendDates.length; di++) {
        var dItem = onsiteVendorDaily[vendorName][trendDates[di]];
        var tot = dItem.total;
        var aR = tot > 0 ? Number(((dItem.accept / tot) * 100).toFixed(1)) : 0;
        var dR = tot > 0 ? Number(((dItem.depart / tot) * 100).toFixed(1)) : 0;
        var arR = tot > 0 ? Number(((dItem.arrive / tot) * 100).toFixed(1)) : 0;
        var lR = tot > 0 ? Number(((dItem.leave / tot) * 100).toFixed(1)) : 0;
        var arrRate = tot > 0 ? Number((((dItem.arrive + dItem.leave) / tot) * 100).toFixed(1)) : 0;

        aRates.push(aR);
        dRates.push(dR);
        arrRates.push(arR);
        lRates.push(lR);
        lineRates.push(arrRate);
    }
    return chartUrl({
        type: 'bar',
        data: {
            labels: trendLabels,
            datasets: [
                { type: 'bar', label: 'Accepted', data: aRates, backgroundColor: '#3b82f6', datalabels: { anchor: 'end', align: 'top', color: '#3b82f6', font: { size: 7, weight: 'bold' }, formatter: '__F_PCT_BAR__' } },
                { type: 'bar', label: 'Depart', data: dRates, backgroundColor: '#f97316', datalabels: { anchor: 'end', align: 'top', color: '#f97316', font: { size: 7, weight: 'bold' }, formatter: '__F_PCT_BAR__' } },
                { type: 'bar', label: 'Arrive', data: arrRates, backgroundColor: '#ec4899', datalabels: { anchor: 'end', align: 'top', color: '#ec4899', font: { size: 7, weight: 'bold' }, formatter: '__F_PCT_BAR__' } },
                { type: 'bar', label: 'Leave', data: lRates, backgroundColor: '#22c55e', datalabels: { anchor: 'end', align: 'top', color: '#22c55e', font: { size: 7, weight: 'bold' }, formatter: '__F_PCT_BAR__' } },
                {
                    type: 'line', label: 'Arrive Rate', data: lineRates, borderColor: '#38bdf8', backgroundColor: 'transparent',
                    borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#38bdf8',
                    datalabels: { anchor: 'end', align: 'top', color: '#38bdf8', font: { size: 8, weight: 'bold' }, formatter: '__F_PCT_LINE__' }
                }
            ]
        },
        options: {
            title: { display: false },
            legend: { position: 'bottom', labels: { fontColor: '#c9d1d9', fontSize: 9, boxWidth: 9, padding: 6 } },
            scales: {
                xAxes: [{ ticks: { fontColor: axisFont, fontSize: 8 }, gridLines: { color: gridColor, display: false } }],
                yAxes: [{ position: 'left', scaleLabel: { display: true, labelString: 'Percentage', fontColor: axisFont },
                    ticks: { fontColor: axisFont, min: 0, max: 100, callback: '__F_PCT__' }, gridLines: { color: gridColor } }]
            }
        }
    }, CHART_W, 280);
}

var onsitePersadaUrl = makeOnsiteDailyChart('Persada');

// ======================================================================
// 6. HTML BUILDER
// ======================================================================
var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function spacer(h) { return '<tr><td height="' + h + '"></td></tr>'; }

function cardBox(inner) {
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:12px; border-collapse:separate; mso-table-lspace:0pt; mso-table-rspace:0pt;"><tr><td style="padding:16px; border-radius:12px;">' + inner + '</td></tr></table>';
}

function cardHeader(title, subtitle) {
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-bottom:14px;"><tr>' +
        '<td class="cht" style="font-size:14px; font-weight:600; color:' + C.text + ';">' + esc(title) + '</td>' +
        '<td class="chs" align="right" style="font-size:12px; color:' + C.sub + '; text-align:right;">' + esc(subtitle || '') + '</td></tr></table>';
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
    var h = '<tr><th class="ml">' + esc(firstLabel) + '</th>';
    var i;
    for (i = 0; i < dates.length; i++) {
        h += '<th class="mh">' + shortDate(dates[i]) + '</th>';
    }
    return h + '<th class="mh w7" style="color:' + C.text + ';">' + esc(lastLabel) + '</th></tr>';
}
function dateMatrixRow(label, values, grand, color, boldLabel) {
    var r = '<tr><td class="ml' + (boldLabel ? ' w7' : '') + '">' + esc(label) + '</td>';
    var i;
    for (i = 0; i < values.length; i++) {
        r += '<td class="mc' + cc(color) + '">' + values[i] + '</td>';
    }
    return r + '<td class="mc w7' + cc(color) + '">' + grand + '</td></tr>';
}

function milestoneCardCell(label, value, pctVal, color, bgRgba, borderRgba) {
    // Pill inline di samping angka (seperti dashboard: value 28px + pct 13px/600, padding 2px 8px)
    var pill = (pctVal === null) ? '' :
        '&nbsp;&nbsp;<span style="display:inline-block; vertical-align:middle; white-space:nowrap; font-size:13px; line-height:18px; font-weight:600; color:' + color +
        '; background:' + bgRgba + '; border:1px solid ' + borderRgba + '; border-radius:9999px; padding:1px 8px;">' + pctVal + '%</span>';
    return '<td width="19%" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:10px; padding:16px 16px;">' +
        '<div style="font-size:12px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:' + C.sub + '; margin-bottom:12px;">' + label + '</div>' +
        '<div style="white-space:nowrap; font-size:28px; font-weight:700; color:' + C.text + '; line-height:28px;">' + value + pill + '</div></td>';
}

function legendDot(color, label) {
    return '<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:' + color + '; margin-right:6px;"></span>' + label;
}

function buildDocHead(nowTimeStr, runId) {
    var h = [];
    h.push('<!DOCTYPE html><html><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">',
        '<style>',
        'table{border-collapse:collapse;}',
        '.th{padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;background:' + C.head + ';color:' + C.sub + ';}',
        '.td{padding:9px 8px;font-size:12px;color:' + C.text + ';border-bottom:1px solid ' + C.rowLine + ';}',
        '.fme th{padding:8px 6px;font-size:11px;font-weight:700;background:' + C.head + ';color:' + C.sub + ';}',
        '.fme td{padding:7px 6px;font-size:12px;border-bottom:1px solid ' + C.rowLine + ';}',
        '.c0{color:' + C.muted + ';font-size:11px;}',
        '.c1{color:#e4e4e7;font-weight:600;}',
        '.r{text-align:right;}',
        '.cb{color:' + C.blue + ';font-weight:600;text-align:right;}',
        '.co{color:' + C.orange + ';font-weight:600;text-align:right;}',
        '.cp{color:' + C.pink + ';font-weight:600;text-align:right;}',
        '.cg{color:' + C.green + ';font-weight:600;text-align:right;}',
        '.mh{padding:7px 3px;font-size:9px;font-weight:700;background:' + C.head + ';color:' + C.sub + ';text-align:right;}',
        '.mc{padding:7px 3px;font-size:9px;color:' + C.text + ';border-bottom:1px solid ' + C.rowLine + ';text-align:right;}',
        '.ml{padding:7px 6px;font-size:10px;color:' + C.text + ';border-bottom:1px solid ' + C.rowLine + ';text-align:left;white-space:nowrap;}',
        '.w6{font-weight:600;}.w7{font-weight:700;}',
        '.cbx{width:100%;background:' + C.card + ';border:1px solid ' + C.border + ';border-radius:12px;border-collapse:separate;}.cbx td{padding:16px;border-radius:12px;}',
        '.ch{width:100%;margin-bottom:14px;}.cht{font-size:14px;font-weight:600;color:' + C.text + ';}.chs{font-size:12px;color:' + C.sub + ';text-align:right;}',
        '.cs{color:' + C.sub + ';}.cm{color:' + C.muted + ';}.cw{color:#ffffff;}.cl{color:#58a6ff;}.ce{color:#e4e4e7;}',
        '</style>',
        '</head>',
        '<body style="margin:0; padding:0; background:' + C.bg + '; font-family:' + FONT + '; color:#e4e4e7;">',
        '<div style="display:none!important;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">',
        'Mateline Utilization Daily Report &bull; ' + nowTimeStr + ' &bull; ID ' + runId + '&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;',
        '</div>',
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.bg + '; width:100%; min-width:100%;"><tr><td align="center" style="padding:20px 16px;">',
        '<table width="940" cellpadding="0" cellspacing="0" border="0" style="width:940px; max-width:940px; margin:0 auto; border-collapse:collapse;">');
    return h.join('');
}

function buildHeaderSection(targetDate, startDateRange, endDateRange, nowTimeStr) {
    return '<tr><td style="padding-bottom:18px; border-bottom:1px solid ' + C.border + ';">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td align="left" valign="top">' +
        '<div style="font-size:24px; font-weight:700; color:' + C.text + ';">MATELINE UTILIZATION DASHBOARD – PERSADA</div>' +
        '<div style="font-size:14px; color:' + C.sub + '; margin-top:6px;">Daily Mateline utilization and ticket acceptance monitoring (Persada)</div>' +
        '</td>' +
        '<td align="right" valign="top" style="white-space:nowrap;">' +
        '<span style="display:inline-block; font-size:13px; font-weight:700; color:' + C.sub + '; background:' + C.card + '; border:1px solid ' + C.border +
        '; border-radius:8px; padding:8px 14px;">Report Date: <span style="color:#58a6ff;">' + esc(longDateEn(targetDate)) + ' (D-1) &bull; ' + nowTimeStr + ' WIB</span></span>' +
        '</td></tr></table></td></tr>' +
        spacer(16) +
        '<tr><td><span style="display:inline-block; background:' + C.card + '; border:1px solid ' + C.border +
        '; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:600; color:#58a6ff;">Active: ' +
        esc(longDateId(startDateRange)) + ' – ' + esc(longDateId(endDateRange)) + ' | Region: All Region | Party: Persada</span></td></tr>' +
        spacer(20);
}

function buildFmeResponseSection(startDateRange, endDateRange, fmePerfParty, fmeAcceptChartUrl, fmeArriveChartUrl) {
    // 1. Dual Trend Charts (Accept Rate & Arrive Rate)
    var dualChartsHtml = '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr>' +
        '<td width="49%" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:8px; padding:12px;">' +
        '  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr>' +
        '    <td align="left"><span style="display:inline-block; font-size:11px; font-weight:700; color:#58a6ff; background:#18181b; border:1px solid rgba(88,166,255,0.3); border-radius:4px; padding:2px 8px;">Accept Rate</span></td>' +
        '    <td align="right"><span style="font-size:10px; font-weight:700; color:#ef4444; background:#18181b; border:1px solid rgba(239,68,68,0.3); border-radius:4px; padding:2px 8px;">&bull; Target SLA &ge; 90%</span></td>' +
        '  </tr></table>' +
        imgTag(fmeAcceptChartUrl, 430, 240, 'Accept Rate Trend') +
        '</td>' +
        '<td width="2%">&nbsp;</td>' +
        '<td width="49%" valign="top" style="background:' + C.card + '; border:1px solid ' + C.border + '; border-radius:8px; padding:12px;">' +
        '  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr>' +
        '    <td align="left"><span style="display:inline-block; font-size:11px; font-weight:700; color:#ec4899; background:#18181b; border:1px solid rgba(236,72,153,0.3); border-radius:4px; padding:2px 8px;">Arrive Rate</span></td>' +
        '    <td align="right"><span style="font-size:10px; font-weight:700; color:#ef4444; background:#18181b; border:1px solid rgba(239,68,68,0.3); border-radius:4px; padding:2px 8px;">&bull; Target SLA &ge; 25%</span></td>' +
        '  </tr></table>' +
        imgTag(fmeArriveChartUrl, 430, 240, 'Arrive Rate Trend') +
        '</td>' +
        '</tr></table>';

    // 2. Persada KPI Card with Circular Donut Gauges
    var pData = fmePerfParty['Persada'] || { total: 0, accepted: 0, arrived: 0, activeFmes: {} };
    var activeFmeCount = Object.keys(pData.activeFmes || {}).length;
    var pAccRate = pData.total > 0 ? Number(((pData.accepted / pData.total) * 100).toFixed(1)) : 0;
    var pArrRate = pData.total > 0 ? Number(((pData.arrived / pData.total) * 100).toFixed(1)) : 0;
    var accGaugeUrl = makeDonutGauge(pAccRate, '#3b82f6');
    var arrGaugeUrl = makeDonutGauge(pArrRate, '#ec4899');

    var partyCardsHtml = '<div style="background:#131317; border:1px solid ' + C.border + '; border-radius:10px; padding:16px; margin-top:14px;">' +
        '  <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '    <tr>' +
        '      <td align="left" style="font-size:14px; font-weight:700; color:#fafafa;">' +
        '        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#06b6d4; margin-right:8px; vertical-align:middle;"></span>' +
        '        Persada Performance Overview' +
        '      </td>' +
        '      <td align="right" style="font-size:12px; color:' + C.muted + ';">' +
        '        Total Tickets: <b style="color:#fafafa;">' + pData.total + '</b> &bull; Active FME: <b style="color:#fafafa;">' + activeFmeCount + '</b>' +
        '      </td>' +
        '    </tr>' +
        '  </table>' +
        '  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">' +
        '    <tr>' +
        '      <td width="48%" valign="top" style="background:#09090b; border:1px solid ' + C.border + '; border-radius:8px; padding:12px; text-align:center;">' +
        '        <div style="font-size:12px; font-weight:700; color:#58a6ff; margin-bottom:6px;">Accept Rate</div>' +
        '        <img src="' + accGaugeUrl + '" width="90" height="90" alt="Accept ' + pAccRate.toFixed(1) + '%" style="display:block; margin:0 auto; width:90px; height:90px; border:0;" />' +
        '        <div style="font-size:12px; font-weight:700; color:#fafafa; margin-top:6px;">' + pData.accepted + ' / ' + pData.total + ' tickets</div>' +
        '      </td>' +
        '      <td width="4%">&nbsp;</td>' +
        '      <td width="48%" valign="top" style="background:#09090b; border:1px solid ' + C.border + '; border-radius:8px; padding:12px; text-align:center;">' +
        '        <div style="font-size:12px; font-weight:700; color:#ec4899; margin-bottom:6px;">Arrive Rate</div>' +
        '        <img src="' + arrGaugeUrl + '" width="90" height="90" alt="Arrive ' + pArrRate.toFixed(1) + '%" style="display:block; margin:0 auto; width:90px; height:90px; border:0;" />' +
        '        <div style="font-size:12px; font-weight:700; color:#fafafa; margin-top:6px;">' + pData.arrived + ' / ' + pData.total + ' tickets</div>' +
        '      </td>' +
        '    </tr>' +
        '  </table>' +
        '</div>';

    var headerHtml = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr>' +
        '<td align="left" valign="top">' +
        '  <span style="font-size:14px; font-weight:700; color:#fafafa;">FME Response & Arrival Performance – Persada</span>' +
        '  <span style="display:inline-block; font-size:9px; font-weight:700; color:#a1a1aa; background:#18181b; border:1px solid #27272a; border-radius:4px; padding:2px 6px; margin-left:8px; vertical-align:middle; letter-spacing:0.5px;">CORRECTIVE MAINTENANCE</span>' +
        '  <div style="font-size:11px; color:#8b949e; margin-top:4px;">Daily response rate (Accept) and on-site mobility (Arrive) monitoring for Persada across selected date range</div>' +
        '</td>' +
        '<td align="right" valign="top">' +
        '  <span style="display:inline-block; font-size:11px; font-weight:600; color:#a1a1aa; background:#18181b; border:1px solid #27272a; border-radius:6px; padding:5px 12px;">Active Range: <span style="color:#fafafa;">' + esc(longDateId(startDateRange)) + ' – ' + esc(longDateId(endDateRange)) + '</span></span>' +
        '</td></tr></table>';

    return '<tr><td>' + cardBox(
        headerHtml +
        dualChartsHtml +
        partyCardsHtml) + '</td></tr>' + spacer(24);
}

function buildMorningOnsiteSection(startDateRange, endDateRange, onsitePersadaUrl, trendDates, onsiteVendorDaily, onsiteVendorSummary) {
    var persadaSummary = onsiteVendorSummary['Persada'] || { total: 0, arrived: 0, rate: 0 };

    // Daily Arrive Rate Matrix Table (Khusus Persada sesuai permintaan)
    var persadaVals = [];
    for (var di = 0; di < trendDates.length; di++) {
        var dayItem = onsiteVendorDaily['Persada'] ? onsiteVendorDaily['Persada'][trendDates[di]] : null;
        var dayArrived = dayItem ? (dayItem.arrive + dayItem.leave) : 0;
        var dayRate = (dayItem && dayItem.total > 0) ? Number(((dayArrived / dayItem.total) * 100).toFixed(1)) : 0;
        persadaVals.push(dayRate.toFixed(1) + '%');
    }
    var persadaGrandRate = persadaSummary.rate.toFixed(1) + '%';
    var onsiteDailyRows = dateMatrixRow('Persada', persadaVals, persadaGrandRate, C.text, true);

    var onsiteDailyTable = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><thead>' +
        dateMatrixHead('Vendor', trendDates, 'Grand Total') + '</thead><tbody>' + onsiteDailyRows + '</tbody></table>';

    return '<tr><td>' + cardBox(
        cardHeader('Morning Onsite Performance – Persada', 'Period: ' + startDateRange + ' - ' + endDateRange + ' | Total: ' + persadaSummary.total + ' | Arrived: ' + persadaSummary.arrived + ' (' + persadaSummary.rate.toFixed(1) + '%)') +
        imgTag(onsitePersadaUrl, 880, 280, 'Persada Daily Trend') +
        '<div style="font-size:12px; font-weight:700; color:' + C.text + '; margin:18px 0 6px 0;">Daily Arrive Rate Trend – Persada</div>' +
        onsiteDailyTable) + '</td></tr>' + spacer(24);
}

function buildMilestoneCardsSection(ms, targetDate) {
    var titleDate = targetDate ? ' (' + targetDate + ')' : '';
    return '<tr><td style="font-size:14px; font-weight:700; color:' + C.text + '; letter-spacing:0.5px; padding-bottom:12px;">MILESTONE UTILIZATION DASHBOARD – PERSADA' + titleDate + '</td></tr>' +
        '<tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        milestoneCardCell('Total Ticket' + titleDate, ms.total, null, C.text, '', '') + '<td width="1%">&nbsp;</td>' +
        milestoneCardCell('Total Accepted', ms.accepted, Math.round(ms.total > 0 ? ms.accepted / ms.total * 100 : 0), '#58a6ff', 'rgba(88,166,255,0.12)', 'rgba(88,166,255,0.3)') + '<td width="1%">&nbsp;</td>' +
        milestoneCardCell('Total Depart', ms.depart, Math.round(ms.total > 0 ? ms.depart / ms.total * 100 : 0), C.orange, 'rgba(249,115,22,0.12)', 'rgba(249,115,22,0.3)') + '<td width="1%">&nbsp;</td>' +
        milestoneCardCell('Total Arrive', ms.arrive, Math.round(ms.total > 0 ? ms.arrive / ms.total * 100 : 0), C.pink, 'rgba(236,72,153,0.12)', 'rgba(236,72,153,0.3)') + '<td width="1%">&nbsp;</td>' +
        milestoneCardCell('Total Leave', ms.leave, Math.round(ms.total > 0 ? ms.leave / ms.total * 100 : 0), C.green, 'rgba(52,211,153,0.12)', 'rgba(52,211,153,0.3)') +
        '</tr></table></td></tr>' + spacer(20);
}


function buildRangeTimelineSection(startDateRange, endDateRange, rangeUrl, trendDates, rangeMap) {
    var rangeHead = '<tr><th align="left" style="padding:10px 8px; font-size:11px; background:' + C.head + '; color:' + C.text + '; white-space:nowrap;">Milestone Stage</th>';
    var displayDates = trendDates.length > 14 ? trendDates.slice(trendDates.length - 14) : trendDates;
    for (var di = 0; di < displayDates.length; di++) {
        var dSub = displayDates[di].length >= 10 ? displayDates[di].substring(5) : displayDates[di];
        rangeHead += '<th align="center" style="padding:10px 4px; font-size:10px; font-weight:700; background:' + C.head + '; color:' + C.sub + ';">' + dSub + '</th>';
    }
    rangeHead += '<th align="center" style="padding:10px 6px; font-size:11px; font-weight:700; background:' + C.head + '; color:' + C.text + '; white-space:nowrap;">Grand Total</th></tr>';

    function rangeRow(label, field, color, grandVal, isLast) {
        var r = '<tr><td align="left" style="padding:9px 8px; font-size:12px; font-weight:700; color:' + color + ';' +
            (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '; white-space:nowrap;">' + legendDot(color, label) + '</td>';
        for (var k = 0; k < displayDates.length; k++) {
            var dKey = displayDates[k];
            var val = (rangeMap[dKey] && rangeMap[dKey][field]) ? rangeMap[dKey][field] : 0;
            r += '<td align="center" style="padding:9px 4px; font-size:12px; color:' + color + ';' +
                (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '">' + val + '</td>';
        }
        return r + '<td align="center" style="padding:9px 6px; font-size:12px; font-weight:800; color:' + color + ';' +
            (isLast ? '' : ' border-bottom:1px solid ' + C.rowLine + ';') + '">' + grandVal + '</td></tr>';
    }

    var rangeTotalSum = 0, rangeAcceptedSum = 0, rangeDepartSum = 0, rangeArriveSum = 0, rangeLeaveSum = 0;
    for (var d3 = 0; d3 < trendDates.length; d3++) {
        var dk = trendDates[d3];
        if (rangeMap[dk]) {
            rangeTotalSum += rangeMap[dk].total;
            rangeAcceptedSum += rangeMap[dk].accepted;
            rangeDepartSum += rangeMap[dk].depart;
            rangeArriveSum += rangeMap[dk].arrive;
            rangeLeaveSum += rangeMap[dk].leave;
        }
    }

    var rangeTable = '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><thead>' + rangeHead + '</thead><tbody>' +
        rangeRow('Total Ticket', 'total', '#ffffff', rangeTotalSum, false) +
        rangeRow('Accepted', 'accepted', C.blue, rangeAcceptedSum, false) +
        rangeRow('Depart', 'depart', C.orange, rangeDepartSum, false) +
        rangeRow('Arrive', 'arrive', C.pink, rangeArriveSum, false) +
        rangeRow('Leave', 'leave', C.green, rangeLeaveSum, true) +
        '</tbody></table>';

    return '<tr><td>' + cardBox(
        cardHeader('Date Range Timeline – Persada (' + startDateRange + ' - ' + endDateRange + ')', trendDates.length + ' days in range') +
        imgTag(rangeUrl, CHART_W, 340, 'Date Range Timeline') + rangeTable) + '</td></tr>' + spacer(20);
}

function buildClusterSection(clusterList, targetDate, clusterChartUrl) {
    var displayClusters = (clusterList || []).slice(0, 15);
    var clusterRows = '';
    if (displayClusters.length === 0) {
        clusterRows = '<tr><td colspan="6" align="center" style="padding:18px; font-size:12px; color:' + C.muted + ';">No cluster data available.</td></tr>';
    }
    for (var ci = 0; ci < displayClusters.length; ci++) {
        var co = displayClusters[ci];
        clusterRows += '<tr>' +
            '<td style="padding:7px 8px; font-size:11px; font-weight:700; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + esc(co.name) + '</td>' +
            '<td class="r" style="padding:7px 6px; font-size:11px; font-weight:700; color:' + C.text + '; border-bottom:1px solid ' + C.rowLine + ';">' + co.total + '</td>' +
            '<td class="cb" style="padding:7px 6px; font-size:11px; border-bottom:1px solid ' + C.rowLine + ';">' + co.accepted + '</td>' +
            '<td class="co" style="padding:7px 6px; font-size:11px; border-bottom:1px solid ' + C.rowLine + ';">' + co.depart + '</td>' +
            '<td class="cp" style="padding:7px 6px; font-size:11px; border-bottom:1px solid ' + C.rowLine + ';">' + co.arrive + '</td>' +
            '<td class="cg" style="padding:7px 6px; font-size:11px; border-bottom:1px solid ' + C.rowLine + ';">' + co.leave + '</td>' +
            '</tr>';
    }
    var subText = clusterList.length + ' clusters active' + (targetDate ? ' (' + targetDate + ')' : '');

    var tableHtml = '<table width="100%" cellpadding="0" cellspacing="0" border="0"><thead><tr>' +
        th('Cluster', 'left') + th('Total', 'right') + th('Accepted', 'right', C.blue) + th('Depart', 'right', C.orange) +
        th('Arrive', 'right', C.pink) + th('Leave', 'right', C.green) +
        '</tr></thead><tbody>' + clusterRows + '</tbody></table>';

    var chartBoxHtml = '<div style="background:#131317; border:1px solid ' + C.border + '; border-radius:8px; padding:12px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>' +
        '<td align="left" style="font-size:12px; font-weight:700; color:#fafafa;">All Clusters Breakdown (Persada)</td>' +
        '<td align="right" style="font-size:10px; color:' + C.muted + ';">' + esc(targetDate) + ' (' + clusterList.length + ' clusters)</td>' +
        '</tr></table>' +
        imgTag(clusterChartUrl, 430, 260, 'All Clusters Breakdown') +
        '</div>';

    return '<tr><td>' + cardBox(
        cardHeader('Cluster Office Milestone Summary – Persada', subText) +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="49%" valign="top">' + tableHtml + '</td>' +
        '<td width="2%">&nbsp;</td>' +
        '<td width="49%" valign="top">' + chartBoxHtml + '</td>' +
        '</tr></table>') + '</td></tr>' + spacer(20);
}

function buildFmeDetailSection(fmeList, targetDate) {
    var fmeRows = '';
    if (fmeList.length === 0) {
        fmeRows = '<tr><td colspan="6" align="center" style="padding:18px; font-size:13px; color:' + C.muted + ';">No FME data available.</td></tr>';
    }
    for (var fi = 0; fi < fmeList.length; fi++) {
        var fo = fmeList[fi];
        fmeRows += '<tr><td class="c0">' + esc(fo.cluster) + '</td><td class="c1">' + esc(fo.name) +
            '</td><td class="cb">' + fo.accepted + '</td><td class="co">' + fo.depart +
            '</td><td class="cp">' + fo.arrive + '</td><td class="cg">' + fo.leave + '</td></tr>';
    }
    var subText = fmeList.length + ' technicians' + (targetDate ? ' (' + targetDate + ')' : '');
    return '<tr><td>' + cardBox(
        cardHeader('FME Performance Detail – Persada', subText) +
        '<table class="fme" width="100%" cellpadding="0" cellspacing="0" border="0"><thead><tr>' +
        '<th align="left">Cluster</th><th align="left">FME Name</th><th class="r" style="color:' + C.blue + ';">Accepted</th><th class="r" style="color:' + C.orange + ';">Depart</th>' +
        '<th class="r" style="color:' + C.pink + ';">Arrive</th><th class="r" style="color:' + C.green + ';">Leave</th>' +
        '</tr></thead><tbody>' + fmeRows + '</tbody></table>') + '</td></tr>' + spacer(16);
}

function buildFooterSection(targetDate, todayStr, nowTimeStr, runId) {
    return '<tr><td align="center" style="padding:16px 0 8px 0; border-top:1px solid ' + C.border + '; font-size:11px; color:#71717a; line-height:18px;">' +
        '<span style="color:#a1a1aa; font-weight:600;">Huawei OWS Mateline Utilization Platform (Persada)</span> &bull; Data: <span style="color:#e4e4e7;">' + esc(targetDate) + ' (D-1)</span><br/>' +
        'Report generated on ' + esc(longDateEn(todayStr)) + ' at <span style="color:#58a6ff; font-weight:600;">' + nowTimeStr + ' WIB</span> &bull; <span style="color:#52525b;">Ref #' + runId + '</span>' +
        '</td></tr>';
}

function parseEmailArray(raw) {
    if (!raw) return [];
    var str = String(raw).replace(/[\r\n]/g, ",");
    var arr = str.split(/[,;]/);
    var clean = [];
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
        var em = arr[i].trim().replace(/['"<>\s]/g, "");
        if (em && em.indexOf('@') > -1) {
            var lower = em.toLowerCase();
            if (!seen[lower]) {
                seen[lower] = true;
                clean.push(em);
            }
        }
    }
    return clean;
}

// ======================================================================
// 6. RENDER HTML UTAMA
// ======================================================================
var nowTimeStr = (function() {
    var n = new Date();
    var utc = n.getTime() + (n.getTimezoneOffset() * 60000);
    var jkt = new Date(utc + (3600000 * 7));
    return pad2(jkt.getHours()) + ':' + pad2(jkt.getMinutes()) + ':' + pad2(jkt.getSeconds());
})();
var runId = Math.random().toString(36).substring(2, 9);

var html = [
    buildDocHead(nowTimeStr, runId),
    buildHeaderSection(targetDate, startDateRange, endDateRange, nowTimeStr),
    buildFmeResponseSection(startDateRange, endDateRange, fmePerfParty, fmeAcceptChartUrl, fmeArriveChartUrl),
    // buildMorningOnsiteSection(startDateRange, endDateRange, onsitePersadaUrl, trendDates, onsiteVendorDaily, onsiteVendorSummary), // Dihilangkan sementara sesuai permintaan user (siap di-uncomment jika ingin rollback)
    buildMilestoneCardsSection(ms, targetDate),
    buildRangeTimelineSection(startDateRange, endDateRange, rangeUrl, trendDates, rangeMap),
    buildClusterSection(clusterList, targetDate, clusterChartUrl),
    buildFmeDetailSection(fmeList, targetDate),
    buildFooterSection(targetDate, todayStr, nowTimeStr, runId),
    '</table></td></tr></table></body></html>'
].join('');

// ======================================================================
// 7. KIRIM EMAIL (Langsung via ServiceInvoker.post - Tanpa Fallback)
// ======================================================================
var defaultTitle = "[DAILY REPORT] Mateline Utilization - Persada " + dayNameOf(todayStr) + " " + todayStr;
var emailSubject = pick(body.title || body.subject, defaultTitle);

// Helper normalisasi penerima (pecah koma/titik koma/spasi, gabungkan dengan titik koma standar OWS)
function normalizeRecipients(str) {
    if (!str) return "";
    var list = String(str).split(/[\s,;]+/);
    var valid = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
        var em = list[i].trim();
        if (em && em.indexOf('@') > 0) {
            var lower = em.toLowerCase();
            if (!seen[lower]) {
                seen[lower] = true;
                valid.push(em);
            }
        }
    }
    return valid.join(';');
}

// Penerima 1 orang di email_to, CC bisa lebih dari 1 (standar titik koma OWS)
var cleanTo = normalizeRecipients(sendTo);
var cleanCc = normalizeRecipients(CC_RECIPIENTS);
var cleanBcc = normalizeRecipients(body.email_bcc || "");

// 9 field schema wajib System/email/email_send_create
var emailPayload = {
    "title": String(emailSubject),
    "email_to": cleanTo,
    "email_bcc": cleanBcc,
    "email_cc": cleanCc,
    "email_from": body.email_from ? String(body.email_from).trim() : "",
    "content": html,
    "data_type": "text/html;charset=utf-8",
    "attachment": body.attachment ? String(body.attachment).trim() : "",
    "server_id": body.server_id ? String(body.server_id).trim() : ""
};

var result = ServiceInvoker.post(EMAIL_SERVICE, emailPayload);
logInfo("Email sent to " + cleanTo + " (cc: " + cleanCc + "), response=" + JSON.stringify(result));

var isOk = (result === true) || (result && (result.result === true || result.success === true || result.ok === true));

return {
    success: isOk,
    title: emailSubject,
    target_date: targetDate,
    range: startDateRange + " - " + endDateRange,
    recipient: sendTo,
    sent_to: cleanTo,
    sent_cc: cleanCc,
    summary: {
        total_tickets_d1: d1Total,
        accepted_d1: d1Accepted,
        accept_rate_d1: d1Rate + "%"
    },
    send_result: result
};
