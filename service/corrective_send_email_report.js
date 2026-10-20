/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 * 
 * Auto D-1 Daily Report Generator (Mateline Utilization & Corrective Maintenance)
 * 100% Identical Visual Replica of the Dashboard UI (Dark Slate Theme #09090b / #0d0d10)
 * 
 * Includes 10 Components matching the actual live dashboard:
 * 1. Header Banner & Live Status Ticker (Tuesday, 20 October 2026 / D-1)
 * 2. Filter Breadcrumb Badge: "Active: 1 Oktober 2026 – 19 Oktober 2026 | Region: All Region | Party: All Party"
 * 3. 3-Column Top Grid:
 *    - Ticket Summary (Total Tickets 295, Total Accepted 89, Acceptance Rate Bar 30.2%)
 *    - Accepted Ticket Distribution by Party (Donut Ring Chart with Legend: Telkom Akses, Persada, Mandau)
 *    - FME Ticket Acceptance Detail (Table with FME Party, Total FME, Ticket Count, Accepted Count, Accept Rate %)
 * 4. Accept Rate by Party Cards Row (Telkom Akses - D-1 0.0%, Persada - D-1 50.0%, Mandau - D-1 0.0%)
 * 5. Mateline Utilization Trend (Bar Chart + Curve Line + Table Breakdown across dates)
 * 6. Daily Accept Rate by Party (Multi-Bar Chart + Curve Line + Daily Matrix Table)
 * 7. Milestone Utilization Dashboard (5 Metric Cards: Total Ticket, Accepted, Depart, Arrive, Leave)
 * 8. 1 Day - Hourly Timeline (24h Multi-Line Chart & 2-Hourly Matrix Table 00:00 - 22:00)
 * 9. Cluster Office Milestone Summary Table
 * 10. FME Performance Detail Table
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger) 
    ? JsLogger.serviceDebugLogger 
    : (typeof console !== 'undefined' ? console : null);

// 1. Ekstrak request
var body = (typeof message !== "undefined" && message && message.body) 
    ? message.body 
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" ? input : {}));

var DEFAULT_RECEIVER = "anderasinggih1@gmail.com";
var sendTo = (body.email_to || body.send_to || body.sendto || body.emails || DEFAULT_RECEIVER);

// 2. Hitung Rentang Tanggal: Default Bulan Aktif s/d Kemarin (D-1) seperti dashboard
function getJakartaDateParts() {
    var nowJakarta = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    var d1 = new Date(nowJakarta.getTime() - (24 * 60 * 60 * 1000));
    var yyyy = d1.getUTCFullYear();
    var mm = ("0" + (d1.getUTCMonth() + 1)).slice(-2);
    var dd = ("0" + d1.getUTCDate()).slice(-2);
    
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var dayName = days[nowJakarta.getUTCDay()];
    var monthName = months[nowJakarta.getUTCMonth()];
    
    var hh = ("0" + nowJakarta.getUTCHours()).slice(-2);
    var min = ("0" + nowJakarta.getUTCMinutes()).slice(-2);
    var ss = ("0" + nowJakarta.getUTCSeconds()).slice(-2);

    var todayYyyy = nowJakarta.getUTCFullYear();
    var todayMm = ("0" + (nowJakarta.getUTCMonth() + 1)).slice(-2);
    var todayDd = ("0" + nowJakarta.getUTCDate()).slice(-2);

    return {
        todayStr: todayYyyy + "-" + todayMm + "-" + todayDd,
        dayName: dayName,
        d1Str: yyyy + "-" + mm + "-" + dd,
        monthStartStr: yyyy + "-" + mm + "-01",
        year: yyyy,
        month: mm,
        day: dd,
        fullTimestamp: dayName + ", " + nowJakarta.getUTCDate() + " " + monthName + " " + yyyy + " — " + hh + ":" + min + ":" + ss
    };
}

var jParts = getJakartaDateParts();
var targetDate = (body.date && String(body.date).trim()) ? String(body.date).trim() : jParts.d1Str;
var startDateRange = (body.start_date && String(body.start_date).trim()) ? String(body.start_date).trim() : jParts.monthStartStr;
var endDateRange = (body.end_date && String(body.end_date).trim()) ? String(body.end_date).trim() : targetDate;

// 3. Ambil Data Aktual dari service corrective_dashboard_summary_get
var summaryRes = null;
try {
    summaryRes = ServiceInvoker.post(
        "/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get",
        {
            "start_date": startDateRange,
            "end_date": endDateRange,
            "start": 0,
            "limit": 10000
        }
    );
} catch (e) {
    if (logger && logger.error) logger.error("Failed fetching summary data: " + e.message);
}

// 4. Ekstrak Data Response
var resultObj = (summaryRes && summaryRes.result) ? summaryRes.result : {};
var rawTickets = (resultObj.data_grid && Array.isArray(resultObj.data_grid.rows)) ? resultObj.data_grid.rows : [];
var chartsData = resultObj.charts || {};
var dailyAcceptRates = Array.isArray(chartsData.accept_rate_daily) ? chartsData.accept_rate_daily : [];
var fmeManagementRows = (resultObj.fme_management && Array.isArray(resultObj.fme_management.rows)) ? resultObj.fme_management.rows : [];
var fmeStatusRows = (resultObj.fme_status && Array.isArray(resultObj.fme_status.rows)) ? resultObj.fme_status.rows : [];

// Filter tiket khusus D-1 untuk Ticket Summary & Milestone Cards D-1
var d1Tickets = [];
var rangeTotalTickets = rawTickets.length;

for (var k = 0; k < rawTickets.length; k++) {
    var tk = rawTickets[k];
    if (!tk) continue;
    var tkDate = "";
    if (tk.keycode && tk.keycode.length >= 12) {
        var rawK = tk.keycode.substring(3, 11);
        if (/^\d{8}$/.test(rawK)) {
            tkDate = rawK.substring(0, 4) + "-" + rawK.substring(4, 6) + "-" + rawK.substring(6, 8);
        }
    }
    if (!tkDate && tk.createtime) {
        tkDate = tk.createtime.substring(0, 10);
    }
    if (tkDate === targetDate) {
        d1Tickets.push(tk);
    }
}

// Jika dataset khusus D-1 kosong, gunakan seluruh rawTickets
var activeSnapshotTickets = d1Tickets.length > 0 ? d1Tickets : rawTickets;
var totalTicketsD1 = activeSnapshotTickets.length;

// Hitung Milestone D-1
var countAcceptedD1 = 0;
var countDepartD1 = 0;
var countArriveD1 = 0;
var countLeaveD1 = 0;

var CM_PARTY_ORDER = ['Telkom Akses', 'Persada', 'Mandau'];
var partyD1 = {
    'Telkom Akses': { total: 0, accepted: 0 },
    'Persada': { total: 0, accepted: 0 },
    'Mandau': { total: 0, accepted: 0 }
};

var clusterMap = {};
var fmeDetailMap = {};

// Hourly Matrix 00:00 - 23:00 untuk D-1
var hourly = [];
for (var h = 0; h < 24; h++) {
    hourly.push({ hour: (h < 10 ? '0' + h : '' + h), total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 });
}

for (var i = 0; i < activeSnapshotTickets.length; i++) {
    var t = activeSnapshotTickets[i];
    if (!t) continue;

    var isAcc = !!(t.accept_time);
    var isDep = !!(t.depart_time);
    var isArr = !!(t.arrive_time);
    var isLev = !!(t.complete_time || t.exit_time || t.current_phase === 'leave' || t.out_in === 'exit');

    if (isAcc) countAcceptedD1++;
    if (isDep) countDepartD1++;
    if (isArr) countArriveD1++;
    if (isLev) countLeaveD1++;

    // Hourly distribution
    if (t.createtime && t.createtime.length >= 13) {
        var hTot = parseInt(t.createtime.substring(11, 13), 10);
        if (!isNaN(hTot) && hTot >= 0 && hTot < 24) hourly[hTot].total++;
    }
    if (t.accept_time && t.accept_time.length >= 13) {
        var hAcc = parseInt(t.accept_time.substring(11, 13), 10);
        if (!isNaN(hAcc) && hAcc >= 0 && hAcc < 24) hourly[hAcc].accepted++;
    }
    if (t.depart_time && t.depart_time.length >= 13) {
        var hDep = parseInt(t.depart_time.substring(11, 13), 10);
        if (!isNaN(hDep) && hDep >= 0 && hDep < 24) hourly[hDep].depart++;
    }
    if (t.arrive_time && t.arrive_time.length >= 13) {
        var hArr = parseInt(t.arrive_time.substring(11, 13), 10);
        if (!isNaN(hArr) && hArr >= 0 && hArr < 24) hourly[hArr].arrive++;
    }
    var lTime = t.complete_time || t.exit_time || (t.current_phase === 'leave' ? t.lastupdatetime : null);
    if (lTime && lTime.length >= 13) {
        var hLev = parseInt(lTime.substring(11, 13), 10);
        if (!isNaN(hLev) && hLev >= 0 && hLev < 24) hourly[hLev].leave++;
    }

    // Party D-1
    var cName = String(t.contractor_name || t.party_name || '').trim();
    for (var p = 0; p < CM_PARTY_ORDER.length; p++) {
        if (cName.toLowerCase().indexOf(CM_PARTY_ORDER[p].toLowerCase()) !== -1) {
            partyD1[CM_PARTY_ORDER[p]].total++;
            if (isAcc) partyD1[CM_PARTY_ORDER[p]].accepted++;
            break;
        }
    }

    // Cluster Office
    var clusterName = String(t.fme_fm_office_name || t.fm_office || 'Unassigned').trim();
    if (!clusterName) clusterName = 'Unassigned';
    if (!clusterMap[clusterName]) {
        clusterMap[clusterName] = { cluster: clusterName, total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
    }
    clusterMap[clusterName].total++;
    if (isAcc) clusterMap[clusterName].accepted++;
    if (isDep) clusterMap[clusterName].depart++;
    if (isArr) clusterMap[clusterName].arrive++;
    if (isLev) clusterMap[clusterName].leave++;

    // FME Detail
    var fmeName = String(t.fme_fullname || t.assign_to_fme || 'Unassigned').trim();
    if (fmeName && fmeName !== 'Unassigned') {
        var fKey = clusterName + '___' + fmeName;
        if (!fmeDetailMap[fKey]) {
            fmeDetailMap[fKey] = { cluster: clusterName, fmeName: fmeName, total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
        }
        fmeDetailMap[fKey].total++;
        if (isAcc) fmeDetailMap[fKey].accepted++;
        if (isDep) fmeDetailMap[fKey].depart++;
        if (isArr) fmeDetailMap[fKey].arrive++;
        if (isLev) fmeDetailMap[fKey].leave++;
    }
}

// Percentages D-1
var acceptRateD1 = totalTicketsD1 > 0 ? ((countAcceptedD1 / totalTicketsD1) * 100).toFixed(1) : "0.0";
var acceptedPctD1 = totalTicketsD1 > 0 ? Math.round((countAcceptedD1 / totalTicketsD1) * 100) : 0;
var departPctD1 = totalTicketsD1 > 0 ? Math.round((countDepartD1 / totalTicketsD1) * 100) : 0;
var arrivePctD1 = totalTicketsD1 > 0 ? Math.round((countArriveD1 / totalTicketsD1) * 100) : 0;
var leavePctD1 = totalTicketsD1 > 0 ? Math.round((countLeaveD1 / totalTicketsD1) * 100) : 0;

// Milestone Total All Time / Active Range (seperti Image 5: 4889 Total, 2148 Accepted, 144 Depart, 91 Arrive, 2069 Leave)
var rangeAccepted = 0, rangeDepart = 0, rangeArrive = 0, rangeLeave = 0;
for (var ri = 0; ri < rawTickets.length; ri++) {
    var rtk = rawTickets[ri];
    if (!rtk) continue;
    if (rtk.accept_time) rangeAccepted++;
    if (rtk.depart_time) rangeDepart++;
    if (rtk.arrive_time) rangeArrive++;
    if (rtk.complete_time || rtk.exit_time || rtk.current_phase === 'leave' || rtk.out_in === 'exit') rangeLeave++;
}
var rangeAcceptedPct = rangeTotalTickets > 0 ? Math.round((rangeAccepted / rangeTotalTickets) * 100) : 0;
var rangeDepartPct = rangeTotalTickets > 0 ? Math.round((rangeDepart / rangeTotalTickets) * 100) : 0;
var rangeArrivePct = rangeTotalTickets > 0 ? Math.round((rangeArrive / rangeTotalTickets) * 100) : 0;
var rangeLeavePct = rangeTotalTickets > 0 ? Math.round((rangeLeave / rangeTotalTickets) * 100) : 0;

// FME Ticket Acceptance Detail (Tabel FME Party - 100% Dynamic dari API)
var fmePartySummary = {};
for (var cp = 0; cp < CM_PARTY_ORDER.length; cp++) {
    fmePartySummary[CM_PARTY_ORDER[cp]] = {
        totalFme: 0,
        ticketCount: 0,
        acceptedCount: 0,
        acceptRate: '0.00'
    };
}

for (var fm = 0; fm < fmeManagementRows.length; fm++) {
    var mRow = fmeManagementRows[fm];
    var mp = mRow.party_name;
    if (fmePartySummary[mp]) {
        fmePartySummary[mp].totalFme++;
        fmePartySummary[mp].ticketCount += parseInt(mRow.count_ticket_id || 0, 10);
        fmePartySummary[mp].acceptedCount += parseInt(mRow.count_accept_time || 0, 10);
    }
}

for (var pKey in fmePartySummary) {
    var pObj = fmePartySummary[pKey];
    if (pObj.totalFme === 0 && fmeStatusRows.length > 0) {
        for (var fs = 0; fs < fmeStatusRows.length; fs++) {
            if (fmeStatusRows[fs].party_name === pKey) pObj.totalFme++;
        }
    }
    if (pObj.ticketCount === 0 && partyD1[pKey]) {
        pObj.ticketCount = partyD1[pKey].total;
        pObj.acceptedCount = partyD1[pKey].accepted;
    }
    pObj.acceptRate = pObj.ticketCount > 0 ? ((pObj.acceptedCount / pObj.ticketCount) * 100).toFixed(2) : "0.00";
}

// Cluster list sort
var clusterList = [];
for (var ck in clusterMap) clusterList.push(clusterMap[ck]);
clusterList.sort(function(a, b) { return b.total - a.total; });

// FME detail list sort
var fmeDetailList = [];
for (var fk in fmeDetailMap) fmeDetailList.push(fmeDetailMap[fk]);
fmeDetailList.sort(function(a, b) {
    if (a.cluster === b.cluster) return b.accepted - a.accepted;
    return a.cluster.localeCompare(b.cluster);
});

// Daily Trend Aggregation
var dailyDatesMap = {};
for (var dr = 0; dr < dailyAcceptRates.length; dr++) {
    var item = dailyAcceptRates[dr];
    var dStr = item.ticket_date;
    if (!dStr) continue;
    if (!dailyDatesMap[dStr]) {
        dailyDatesMap[dStr] = { date: dStr, total: 0, accepted: 0, parties: {} };
    }
    dailyDatesMap[dStr].total += parseInt(item.count_ticket_id || 0, 10);
    dailyDatesMap[dStr].accepted += parseInt(item.count_accept_time || 0, 10);
    dailyDatesMap[dStr].parties[item.party_name] = {
        total: parseInt(item.count_ticket_id || 0, 10),
        accepted: parseInt(item.count_accept_time || 0, 10)
    };
}

var sortedDailyDates = Object.keys(dailyDatesMap).sort();
var trendDates = sortedDailyDates.length > 0 ? sortedDailyDates : [targetDate];

// 5. MEMBUAT QUICKCHART URL UNTUK SELURUH CHART ASLI DASHBOARD
// ---------------------------------------------------------------
// A. Donut Chart: Accepted Ticket Distribution by Party
var taAcc = fmePartySummary['Telkom Akses'].acceptedCount;
var perAcc = fmePartySummary['Persada'].acceptedCount;
var manAcc = fmePartySummary['Mandau'].acceptedCount;
var donutConfig = {
    type: "doughnut",
    data: {
        labels: ["Telkom Akses", "Persada", "Mandau"],
        datasets: [{
            data: [taAcc, perAcc, manAcc],
            backgroundColor: ["#5470c6", "#91cc75", "#fac858"],
            borderWidth: 0
        }]
    },
    options: {
        cutoutPercentage: 65,
        legend: {
            position: "right",
            labels: { fontColor: "#c9d1d9", fontSize: 11, boxWidth: 12 }
        }
    }
};
var donutChartUrl = "https://quickchart.io/chart?w=320&h=200&bkg=%230d0d10&c=" + encodeURIComponent(JSON.stringify(donutConfig));

// B. Mateline Utilization Trend Chart (Dual Axis Combo Bar & Line)
var trendLabels = [];
var trendTotalTickets = [];
var trendAcceptedTickets = [];
var trendAcceptRates = [];

for (var td = 0; td < trendDates.length; td++) {
    var tDate = trendDates[td];
    var tItem = dailyDatesMap[tDate];
    trendLabels.push(tDate.substring(5)); // '10-01'
    trendTotalTickets.push(tItem.total);
    trendAcceptedTickets.push(tItem.accepted);
    var tRate = tItem.total > 0 ? Number(((tItem.accepted / tItem.total) * 100).toFixed(1)) : 0;
    trendAcceptRates.push(tRate);
}

var trendChartConfig = {
    type: "bar",
    data: {
        labels: trendLabels,
        datasets: [
            { type: "bar", label: "Total Ticket", data: trendTotalTickets, backgroundColor: "#5470c6" },
            { type: "bar", label: "Accepted Tickets", data: trendAcceptedTickets, backgroundColor: "#91cc75" },
            { type: "line", label: "Accept Rate", data: trendAcceptRates, borderColor: "#f0883e", yAxisID: "y1", fill: false, pointRadius: 2 }
        ]
    },
    options: {
        title: { display: true, text: "Mateline Utilization Trend", fontColor: "#c9d1d9", fontSize: 16 },
        legend: { labels: { fontColor: "#c9d1d9", boxWidth: 12 } },
        scales: {
            xAxes: [{ ticks: { fontColor: "#8b949e", fontSize: 9 }, gridLines: { color: "#27272a" } }],
            yAxes: [
                { id: "y", position: "left", ticks: { fontColor: "#8b949e" }, gridLines: { color: "#27272a" } },
                { id: "y1", position: "right", ticks: { fontColor: "#8b949e", min: 0, max: 100 }, gridLines: { display: false } }
            ]
        }
    }
};
var trendChartUrl = "https://quickchart.io/chart?w=860&h=340&bkg=%230d0d10&c=" + encodeURIComponent(JSON.stringify(trendChartConfig));

// C. Daily Accept Rate Chart (Multi-Bar + Overall Accept Rate Area Line)
var dailyRateTa = [];
var dailyRatePer = [];
var dailyRateMan = [];
var dailyRateOvr = [];

for (var dr2 = 0; dr2 < trendDates.length; dr2++) {
    var dKey2 = trendDates[dr2];
    var dObj2 = dailyDatesMap[dKey2];
    
    var taP = (dObj2.parties['Telkom Akses']) || { total: 0, accepted: 0 };
    var perP = (dObj2.parties['Persada']) || { total: 0, accepted: 0 };
    var manP = (dObj2.parties['Mandau']) || { total: 0, accepted: 0 };
    
    dailyRateTa.push(taP.total > 0 ? Number(((taP.accepted / taP.total) * 100).toFixed(2)) : 0);
    dailyRatePer.push(perP.total > 0 ? Number(((perP.accepted / perP.total) * 100).toFixed(2)) : 0);
    dailyRateMan.push(manP.total > 0 ? Number(((manP.accepted / manP.total) * 100).toFixed(2)) : 0);
    dailyRateOvr.push(dObj2.total > 0 ? Number(((dObj2.accepted / dObj2.total) * 100).toFixed(2)) : 0);
}

var dailyAcceptRateChartConfig = {
    type: "bar",
    data: {
        labels: trendLabels,
        datasets: [
            { type: "bar", label: "Telkom Akses", data: dailyRateTa, backgroundColor: "#c8102e" },
            { type: "bar", label: "Persada", data: dailyRatePer, backgroundColor: "#31b5c6" },
            { type: "bar", label: "Mandau", data: dailyRateMan, backgroundColor: "#62b230" },
            { type: "line", label: "Overall Accept Rate", data: dailyRateOvr, borderColor: "#f0883e", backgroundColor: "rgba(240,136,62,0.2)", fill: true, pointRadius: 2 }
        ]
    },
    options: {
        title: { display: true, text: "Daily Accept Rate", fontColor: "#c9d1d9", fontSize: 16 },
        legend: { labels: { fontColor: "#c9d1d9", boxWidth: 12 } },
        scales: {
            xAxes: [{ ticks: { fontColor: "#8b949e", fontSize: 9 }, gridLines: { color: "#27272a" } }],
            yAxes: [{ ticks: { fontColor: "#8b949e", min: 0, max: 100 }, gridLines: { color: "#27272a" } }]
        }
    }
};
var dailyAcceptRateChartUrl = "https://quickchart.io/chart?w=860&h=340&bkg=%230d0d10&c=" + encodeURIComponent(JSON.stringify(dailyAcceptRateChartConfig));

// D. 1 Day - Hourly Timeline 24-Hours Smooth Line Chart
var hours24 = [];
var hourlyTotals = [];
var hourlyAccepted = [];
var hourlyDepart = [];
var hourlyArrive = [];
var hourlyLeave = [];

for (var hx = 0; hx < 24; hx++) {
    hours24.push((hx < 10 ? '0' + hx : '' + hx) + ':00');
    hourlyTotals.push(hourly[hx].total);
    hourlyAccepted.push(hourly[hx].accepted);
    hourlyDepart.push(hourly[hx].depart);
    hourlyArrive.push(hourly[hx].arrive);
    hourlyLeave.push(hourly[hx].leave);
}

var hourlyChartConfig = {
    type: "line",
    data: {
        labels: hours24,
        datasets: [
            { label: "Total Ticket", data: hourlyTotals, borderColor: "#ffffff", fill: false, pointRadius: 2 },
            { label: "Accepted", data: hourlyAccepted, borderColor: "#3b82f6", fill: false, pointRadius: 2 },
            { label: "Depart", data: hourlyDepart, borderColor: "#f97316", fill: false, pointRadius: 2 },
            { label: "Arrive", data: hourlyArrive, borderColor: "#ec4899", fill: false, pointRadius: 2 },
            { label: "Leave", data: hourlyLeave, borderColor: "#34d399", fill: false, pointRadius: 2 }
        ]
    },
    options: {
        title: { display: true, text: "1 Day - Hourly Timeline (" + targetDate + ")", fontColor: "#c9d1d9", fontSize: 16 },
        legend: { labels: { fontColor: "#c9d1d9", boxWidth: 12 } },
        scales: {
            xAxes: [{ ticks: { fontColor: "#8b949e", fontSize: 9 }, gridLines: { color: "#27272a" } }],
            yAxes: [{ ticks: { fontColor: "#8b949e", precision: 0 }, gridLines: { color: "#27272a" } }]
        }
    }
};
var hourlyChartUrl = "https://quickchart.io/chart?w=860&h=260&bkg=%230d0d10&c=" + encodeURIComponent(JSON.stringify(hourlyChartConfig));


// =========================================================================
// 6. RENDER HTML IDENTIK DENGAN DASHBOARD ASLI (DARK THEME #09090b / #0d0d10)
// =========================================================================
var html = '' +
'<!DOCTYPE html>' +
'<html>' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="margin:0; padding:0; background-color:#09090b; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#e4e4e7;">' +
'  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090b; padding:24px 0;">' +
'    <tr>' +
'      <td align="center">' +
'        <!-- Dashboard Card Wrapper (Width: 920px, Dark #09090b) -->' +
'        <table width="920" cellpadding="0" cellspacing="0" border="0" style="max-width:920px; width:100%; background-color:#09090b; padding:20px;">' +

          // 1. DASHBOARD HEADER & LIVE CLOCK
'          <tr>' +
'            <td style="padding-bottom:20px; border-bottom:1px solid #27272a;">' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
'                  <td align="left">' +
'                    <div style="font-size:24px; font-weight:700; color:#fafafa; letter-spacing:0.5px;">MATELINE UTILIZATION DASHBOARD</div>' +
'                    <div style="font-size:14px; color:#a1a1aa; margin-top:4px;">Daily Mateline utilization and ticket acceptance monitoring</div>' +
'                  </td>' +
'                  <td align="right" valign="top">' +
'                    <div style="font-size:13px; font-weight:800; color:#a0aec0; background:#0d0d10; border:1px solid #27272a; border-radius:6px; padding:6px 14px; display:inline-block;">' +
'                      ' + jParts.fullTimestamp + '' +
'                    </div>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 2. ACTIVE FILTER BADGE BREADCRUMB
'          <tr>' +
'            <td style="padding:16px 0 20px 0;">' +
'              <div style="background:#0d0d10; border:1px solid #27272a; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:600; color:#58a6ff; display:inline-block;">' +
'                Active: ' + startDateRange + ' – ' + endDateRange + ' | Region: All Region | Party: All Party' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 3. TOP SUMMARY ROW (3 Grid: Ticket Summary | Donut Chart | FME Detail Table)
'          <tr>' +
'            <td style="padding-bottom:24px;">' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
                  // Card 1: Ticket Summary
'                  <td width="30%" valign="top" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.15);">' +
'                    <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:12px;">Ticket Summary</div>' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">' +
'                      <tr>' +
'                        <td width="48%" style="padding:12px; border-radius:8px; background:#d1eaff;">' +
'                          <div style="font-size:11px; font-weight:700; color:#0367c1; text-transform:uppercase; margin-bottom:6px;">TOTAL TICKETS</div>' +
'                          <div style="font-size:32px; font-weight:bold; color:#0367c1; line-height:1;">' + totalTicketsD1 + '</div>' +
'                        </td>' +
'                        <td width="4%">&nbsp;</td>' +
'                        <td width="48%" style="padding:12px; border-radius:8px; background:#daf5e6;">' +
'                          <div style="font-size:11px; font-weight:700; color:#027039; text-transform:uppercase; margin-bottom:6px;">TOTAL ACCEPTED</div>' +
'                          <div style="font-size:32px; font-weight:bold; color:#027039; line-height:1;">' + countAcceptedD1 + '</div>' +
'                        </td>' +
'                      </tr>' +
'                    </table>' +
'                    <div>' +
'                      <div style="font-size:13px; color:#a1a1aa; margin-bottom:4px;">Acceptance Rate</div>' +
'                      <div style="font-size:26px; font-weight:bold; color:#fafafa; margin-bottom:8px;">' + acceptRateD1 + '%</div>' +
'                      <div style="height:10px; background:#1f2937; border-radius:999px; overflow:hidden;">' +
'                        <div style="width:' + acceptRateD1 + '%; height:100%; background:#3b82f6; border-radius:999px;"></div>' +
'                      </div>' +
'                    </div>' +
'                  </td>' +

'                  <td width="3%">&nbsp;</td>' +

                  // Card 2: Accepted Ticket Distribution by Party (Donut Chart)
'                  <td width="32%" valign="top" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.15);">' +
'                    <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:12px;">Accepted Ticket Distribution by Party</div>' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                      <tr>' +
'                        <td align="center">' +
'                          <img src="' + donutChartUrl + '" width="280" height="175" style="display:block; max-width:100%; border:0;" alt="Donut Chart" />' +
'                        </td>' +
'                      </tr>' +
'                    </table>' +
'                  </td>' +

'                  <td width="3%">&nbsp;</td>' +

                  // Card 3: FME Ticket Acceptance Detail Table
'                  <td width="32%" valign="top" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.15);">' +
'                    <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:12px;">FME Ticket Acceptance Detail</div>' +
'                    <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:11px; border-collapse:collapse;">' +
'                      <thead>' +
'                        <tr style="border-bottom:1px solid #27272a; color:#8b949e; text-transform:uppercase;">' +
'                          <th align="left">FME PARTY</th>' +
'                          <th align="center">TOTAL FME</th>' +
'                          <th align="center">TICKET COUNT</th>' +
'                          <th align="center">ACCEPTED COUNT</th>' +
'                          <th align="right">ACCEPT RATE (%)</th>' +
'                        </tr>' +
'                      </thead>' +
'                      <tbody>';

for (var pi = 0; pi < CM_PARTY_ORDER.length; pi++) {
    var pName = CM_PARTY_ORDER[pi];
    var pData = fmePartySummary[pName];
    html += '' +
'                        <tr style="border-bottom:1px solid #1f1f23;">' +
'                          <td align="left" style="font-weight:700; color:#fafafa; padding:8px 0;">' + pName + '</td>' +
'                          <td align="center" style="color:#a1a1aa;">' + pData.totalFme + '</td>' +
'                          <td align="center" style="color:#fafafa;">' + pData.ticketCount + '</td>' +
'                          <td align="center" style="color:#38bdf8; font-weight:600;">' + pData.acceptedCount + '</td>' +
'                          <td align="right" style="font-weight:700; color:#fafafa;">' + pData.acceptRate + '%</td>' +
'                        </tr>';
}

html += '' +
'                      </tbody>' +
'                    </table>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 4. ACCEPT RATE BY PARTY (D-1 CARDS ROW)
'          <tr>' +
'            <td style="padding-bottom:24px;">' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>';

for (var k2 = 0; k2 < CM_PARTY_ORDER.length; k2++) {
    var pKey2 = CM_PARTY_ORDER[k2];
    var pD2 = partyD1[pKey2] || { total: 0, accepted: 0 };
    var pR2 = pD2.total > 0 ? ((pD2.accepted / pD2.total) * 100).toFixed(1) : '0.0';
    html += '' +
'                  <td width="31%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.15);">' +
'                    <div style="font-size:12px; color:#8b949e; font-weight:600; text-transform:uppercase;">' + pKey2.toUpperCase() + ' – D-1</div>' +
'                    <div style="font-size:28px; font-weight:700; color:#58a6ff; margin:6px 0;">' + pR2 + '%</div>' +
'                    <div style="font-size:12px; color:#8b949e;">' + pD2.accepted + ' / ' + pD2.total + ' accepted</div>' +
'                  </td>' + (k2 < 2 ? '<td width="3%">&nbsp;</td>' : '');
}

html += '' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 5. SECTION: MATELINE UTILIZATION TREND (Full Chart & Table Breakdown)
'          <tr>' +
'            <td style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:20px; margin-bottom:24px;">' +
              // The Trend Chart Image
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">' +
'                <tr>' +
'                  <td align="center">' +
'                    <img src="' + trendChartUrl + '" width="860" style="display:block; width:100%; max-width:860px; height:auto; border-radius:8px;" alt="Mateline Utilization Trend Chart" />' +
'                  </td>' +
'                </tr>' +
'              </table>' +

              // Data Table (Ticket Count, Accepted Count, Accept Rate)
'              <div style="overflow-x:auto;">' +
'                <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:11px; border-collapse:collapse; text-align:center;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#8b949e; border-bottom:1px solid #27272a;">' +
'                      <th align="left" style="padding-left:8px;">Metric</th>';

for (var dt = 0; dt < trendDates.length; dt++) {
    html += '<th>' + trendDates[dt].substring(5) + '</th>';
}
html += '<th style="color:#fafafa; font-weight:700;">Grand Total</th></tr></thead><tbody>';

// Row Ticket Count
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:8px; font-weight:600; color:#fafafa;">Ticket Count</td>';
for (var dt1 = 0; dt1 < trendDates.length; dt1++) {
    var v1 = dailyDatesMap[trendDates[dt1]].total;
    html += '<td style="color:#fafafa;">' + v1 + '</td>';
}
html += '<td style="font-weight:700; color:#fafafa;">' + rangeTotalTickets + '</td></tr>';

// Row Accepted Count
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:8px; font-weight:600; color:#3fb950;">Accepted Count</td>';
for (var dt2 = 0; dt2 < trendDates.length; dt2++) {
    var v2 = dailyDatesMap[trendDates[dt2]].accepted;
    html += '<td style="color:#3fb950;">' + v2 + '</td>';
}
html += '<td style="font-weight:700; color:#3fb950;">' + rangeAccepted + '</td></tr>';

// Row Accept Rate
html += '<tr><td align="left" style="padding-left:8px; font-weight:600; color:#f0883e;">Accept Rate</td>';
for (var dt3 = 0; dt3 < trendDates.length; dt3++) {
    var it = dailyDatesMap[trendDates[dt3]];
    var r3 = it.total > 0 ? ((it.accepted / it.total) * 100).toFixed(2) : '0.00';
    html += '<td style="color:#f0883e;">' + r3 + '%</td>';
}
var totalAllRate = rangeTotalTickets > 0 ? ((rangeAccepted / rangeTotalTickets) * 100).toFixed(2) : '0.00';
html += '<td style="font-weight:700; color:#f0883e;">' + totalAllRate + '%</td></tr>';

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 6. SECTION: DAILY ACCEPT RATE BY PARTY (Full Chart & Matrix Table)
'          <tr>' +
'            <td style="padding:24px 0 24px 0;">' +
'              <div style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:20px;">' +
                // The Daily Accept Rate Chart Image
'                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">' +
'                  <tr>' +
'                    <td align="center">' +
'                      <img src="' + dailyAcceptRateChartUrl + '" width="860" style="display:block; width:100%; max-width:860px; height:auto; border-radius:8px;" alt="Daily Accept Rate Chart" />' +
'                    </td>' +
'                  </tr>' +
'                </table>' +

                // Daily Accept Rate Table
'                <div style="overflow-x:auto;">' +
'                  <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:11px; border-collapse:collapse; text-align:center;">' +
'                    <thead>' +
'                      <tr style="background:#18181b; color:#8b949e; border-bottom:1px solid #27272a;">' +
'                        <th align="left" style="padding-left:8px;">Party Name</th>';

for (var dp = 0; dp < trendDates.length; dp++) {
    html += '<th>' + trendDates[dp].substring(5) + '</th>';
}
html += '<th style="color:#fafafa; font-weight:700;">Grand Total</th></tr></thead><tbody>';

// Party Rows (Telkom Akses, Persada, Mandau)
for (var pr = 0; pr < CM_PARTY_ORDER.length; pr++) {
    var partyNameStr = CM_PARTY_ORDER[pr];
    html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:8px; font-weight:600; color:#fafafa;">' + partyNameStr + '</td>';
    for (var pd = 0; pd < trendDates.length; pd++) {
        var dayPData = (dailyDatesMap[trendDates[pd]].parties[partyNameStr]) || { total: 0, accepted: 0 };
        var pRateCell = dayPData.total > 0 ? ((dayPData.accepted / dayPData.total) * 100).toFixed(2) : '0.00';
        html += '<td style="color:#a1a1aa;">' + pRateCell + '%</td>';
    }
    var pGrand = fmePartySummary[partyNameStr].acceptRate;
    html += '<td style="font-weight:700; color:#fafafa;">' + pGrand + '%</td></tr>';
}

// Overall Row
html += '<tr style="font-weight:700; background:#18181b;"><td align="left" style="padding-left:8px; color:#f0883e;">Overall Accept Rate</td>';
for (var od = 0; od < trendDates.length; od++) {
    var odItem = dailyDatesMap[trendDates[od]];
    var odRate = odItem.total > 0 ? ((odItem.accepted / odItem.total) * 100).toFixed(2) : '0.00';
    html += '<td style="color:#f0883e;">' + odRate + '%</td>';
}
html += '<td style="color:#f0883e;">' + totalAllRate + '%</td></tr>';

html += '' +
'                    </tbody>' +
'                  </table>' +
'                </div>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 7. MILESTONE UTILIZATION DASHBOARD (5 METRIC CARDS)
'          <tr>' +
'            <td style="padding-bottom:20px;">' +
'              <div style="font-size:16px; font-weight:700; color:#fafafa; margin-bottom:12px; letter-spacing:0.5px;">MILESTONE UTILIZATION DASHBOARD</div>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
                  // Total Ticket Card
'                  <td width="18%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px;">' +
'                    <div style="font-size:12px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:8px;">TOTAL TICKET</div>' +
'                    <div style="font-size:32px; font-weight:700; color:#fafafa; line-height:1;">' + rangeTotalTickets + '</div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Total Accepted Card
'                  <td width="18%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px;">' +
'                    <div style="font-size:12px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:8px;">TOTAL ACCEPTED</div>' +
'                    <div style="display:flex; justify-content:space-between; align-items:baseline;">' +
'                      <span style="font-size:32px; font-weight:700; color:#fafafa; line-height:1;">' + rangeAccepted + '</span>' +
'                      <span style="font-size:13px; font-weight:600; color:#58a6ff; background:rgba(88,166,255,0.1); border:1px solid rgba(88,166,255,0.2); border-radius:9999px; padding:2px 8px;">' + rangeAcceptedPct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Total Depart Card
'                  <td width="18%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px;">' +
'                    <div style="font-size:12px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:8px;">TOTAL DEPART</div>' +
'                    <div style="display:flex; justify-content:space-between; align-items:baseline;">' +
'                      <span style="font-size:32px; font-weight:700; color:#fafafa; line-height:1;">' + rangeDepart + '</span>' +
'                      <span style="font-size:13px; font-weight:600; color:#f97316; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.2); border-radius:9999px; padding:2px 8px;">' + rangeDepartPct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Total Arrive Card
'                  <td width="18%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px;">' +
'                    <div style="font-size:12px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:8px;">TOTAL ARRIVE</div>' +
'                    <div style="display:flex; justify-content:space-between; align-items:baseline;">' +
'                      <span style="font-size:32px; font-weight:700; color:#fafafa; line-height:1;">' + rangeArrive + '</span>' +
'                      <span style="font-size:13px; font-weight:600; color:#ec4899; background:rgba(236,72,153,0.1); border:1px solid rgba(236,72,153,0.2); border-radius:9999px; padding:2px 8px;">' + rangeArrivePct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Total Leave Card
'                  <td width="18%" style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px 20px;">' +
'                    <div style="font-size:12px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:8px;">TOTAL LEAVE</div>' +
'                    <div style="display:flex; justify-content:space-between; align-items:baseline;">' +
'                      <span style="font-size:32px; font-weight:700; color:#fafafa; line-height:1;">' + rangeLeave + '</span>' +
'                      <span style="font-size:13px; font-weight:600; color:#34d399; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.2); border-radius:9999px; padding:2px 8px;">' + rangeLeavePct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 8. SECTION: 1 DAY - HOURLY TIMELINE (Chart & 2-Hourly Matrix Table)
'          <tr>' +
'            <td style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:20px; margin-bottom:24px;">' +
'              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
'                <div style="font-size:14px; font-weight:600; color:#fafafa;">1 Day – Hourly Timeline (' + targetDate + ')</div>' +
'                <div style="font-size:12px; color:#a1a1aa;">' + totalTicketsD1 + ' tickets on this day</div>' +
'              </div>' +

              // Hourly 24h Line Chart Image
'              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">' +
'                <tr>' +
'                  <td align="center">' +
'                    <img src="' + hourlyChartUrl + '" width="860" style="display:block; width:100%; max-width:860px; height:auto; border-radius:8px;" alt="Hourly Timeline Chart" />' +
'                  </td>' +
'                </tr>' +
'              </table>' +

              // 2-Hourly Breakdown Table
'              <div style="overflow-x:auto;">' +
'                <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:11px; border-collapse:collapse; text-align:center;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#8b949e; border-bottom:1px solid #27272a;">' +
'                      <th align="left" style="padding-left:10px; color:#fafafa;">Milestone</th>';

for (var hx2 = 0; hx2 < 24; hx2 += 2) {
    html += '<th>' + (hx2 < 10 ? '0' + hx2 : '' + hx2) + ':00</th>';
}
html += '<th style="color:#fafafa; font-weight:700;">Total</th></tr></thead><tbody>';

// Total Ticket Row
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:10px; font-weight:600; color:#ffffff;"><span style="display:inline-block; width:8px; height:8px; background:#ffffff; border-radius:50%; margin-right:6px;"></span>Total Ticket</td>';
for (var h1 = 0; h1 < 24; h1 += 2) {
    html += '<td style="color:#ffffff;">' + (hourly[h1].total + hourly[h1+1].total) + '</td>';
}
html += '<td style="font-weight:700; color:#ffffff;">' + totalTicketsD1 + '</td></tr>';

// Accepted Row
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:10px; font-weight:600; color:#3b82f6;"><span style="display:inline-block; width:8px; height:8px; background:#3b82f6; border-radius:50%; margin-right:6px;"></span>Accepted</td>';
for (var h2 = 0; h2 < 24; h2 += 2) {
    html += '<td style="color:#3b82f6;">' + (hourly[h2].accepted + hourly[h2+1].accepted) + '</td>';
}
html += '<td style="font-weight:700; color:#3b82f6;">' + countAcceptedD1 + '</td></tr>';

// Depart Row
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:10px; font-weight:600; color:#f97316;"><span style="display:inline-block; width:8px; height:8px; background:#f97316; border-radius:50%; margin-right:6px;"></span>Depart</td>';
for (var h3 = 0; h3 < 24; h3 += 2) {
    html += '<td style="color:#f97316;">' + (hourly[h3].depart + hourly[h3+1].depart) + '</td>';
}
html += '<td style="font-weight:700; color:#f97316;">' + countDepartD1 + '</td></tr>';

// Arrive Row
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding-left:10px; font-weight:600; color:#ec4899;"><span style="display:inline-block; width:8px; height:8px; background:#ec4899; border-radius:50%; margin-right:6px;"></span>Arrive</td>';
for (var h4 = 0; h4 < 24; h4 += 2) {
    html += '<td style="color:#ec4899;">' + (hourly[h4].arrive + hourly[h4+1].arrive) + '</td>';
}
html += '<td style="font-weight:700; color:#ec4899;">' + countArriveD1 + '</td></tr>';

// Leave Row
html += '<tr><td align="left" style="padding-left:10px; font-weight:600; color:#34d399;"><span style="display:inline-block; width:8px; height:8px; background:#34d399; border-radius:50%; margin-right:6px;"></span>Leave</td>';
for (var h5 = 0; h5 < 24; h5 += 2) {
    html += '<td style="color:#34d399;">' + (hourly[h5].leave + hourly[h5+1].leave) + '</td>';
}
html += '<td style="font-weight:700; color:#34d399;">' + countLeaveD1 + '</td></tr>';

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 9. SECTION: CLUSTER OFFICE MILESTONE SUMMARY
'          <tr>' +
'            <td style="padding:24px 0 20px 0;">' +
'              <div style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:20px;">' +
'                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
'                  <div style="font-size:14px; font-weight:600; color:#fafafa;">Cluster Office Milestone Summary</div>' +
'                  <div style="font-size:12px; color:#a1a1aa;">' + clusterList.length + ' clusters active in D-1</div>' +
'                </div>' +
'                <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size:12px; border-collapse:collapse;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#8b949e; border-bottom:1px solid #27272a; font-size:11px; text-transform:uppercase;">' +
'                      <th align="left" style="padding-left:12px;">CLUSTER</th>' +
'                      <th align="right">TOTAL</th>' +
'                      <th align="right" style="color:#3b82f6;">ACCEPTED</th>' +
'                      <th align="right" style="color:#f97316;">DEPART</th>' +
'                      <th align="right" style="color:#ec4899;">ARRIVE</th>' +
'                      <th align="right" style="color:#34d399;">LEAVE</th>' +
'                    </tr>' +
'                  </thead>' +
'                  <tbody>';

for (var clIdx = 0; clIdx < clusterList.length; clIdx++) {
    var cObj = clusterList[clIdx];
    html += '' +
'                    <tr style="border-bottom:1px solid #1f1f23;">' +
'                      <td align="left" style="padding-left:12px; font-weight:600; color:#fafafa;">' + cObj.cluster + '</td>' +
'                      <td align="right" style="font-weight:700; color:#fafafa;">' + cObj.total + '</td>' +
'                      <td align="right" style="font-weight:600; color:#3b82f6;">' + cObj.accepted + '</td>' +
'                      <td align="right" style="font-weight:600; color:#f97316;">' + cObj.depart + '</td>' +
'                      <td align="right" style="font-weight:600; color:#ec4899;">' + cObj.arrive + '</td>' +
'                      <td align="right" style="font-weight:600; color:#34d399;">' + cObj.leave + '</td>' +
'                    </tr>';
}

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 10. SECTION: FME PERFORMANCE DETAIL
'          <tr>' +
'            <td style="padding-bottom:24px;">' +
'              <div style="background:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:20px;">' +
'                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
'                  <div style="font-size:14px; font-weight:600; color:#fafafa;">FME Performance Detail</div>' +
'                  <div style="font-size:12px; color:#a1a1aa;">' + fmeDetailList.length + ' technicians dispatched in D-1</div>' +
'                </div>' +
'                <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size:12px; border-collapse:collapse;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#8b949e; border-bottom:1px solid #27272a; font-size:11px; text-transform:uppercase;">' +
'                      <th align="left" style="padding-left:12px; width:220px;">CLUSTER</th>' +
'                      <th align="left">FME NAME</th>' +
'                      <th align="right" style="color:#3b82f6;">ACCEPTED</th>' +
'                      <th align="right" style="color:#f97316;">DEPART</th>' +
'                      <th align="right" style="color:#ec4899;">ARRIVE</th>' +
'                      <th align="right" style="color:#34d399;">LEAVE</th>' +
'                    </tr>' +
'                  </thead>' +
'                  <tbody>';

if (fmeDetailList.length === 0) {
    html += '<tr><td colspan="6" align="center" style="color:#71717a; padding:16px;">No FME data available.</td></tr>';
} else {
    var maxFme = Math.min(fmeDetailList.length, 50);
    for (var fIdx = 0; fIdx < maxFme; fIdx++) {
        var fObj = fmeDetailList[fIdx];
        html += '' +
'                    <tr style="border-bottom:1px solid #1f1f23;">' +
'                      <td align="left" style="padding-left:12px; color:#8b949e; font-size:11px;">' + fObj.cluster + '</td>' +
'                      <td align="left" style="font-weight:600; color:#e4e4e7;">' + fObj.fmeName + '</td>' +
'                      <td align="right" style="font-weight:600; color:#3b82f6;">' + fObj.accepted + '</td>' +
'                      <td align="right" style="font-weight:600; color:#f97316;">' + fObj.depart + '</td>' +
'                      <td align="right" style="font-weight:600; color:#ec4899;">' + fObj.arrive + '</td>' +
'                      <td align="right" style="font-weight:600; color:#34d399;">' + fObj.leave + '</td>' +
'                    </tr>';
    }
    if (fmeDetailList.length > maxFme) {
        html += '<tr><td colspan="6" align="center" style="color:#8b949e; padding:10px; font-size:11px;">... and ' + (fmeDetailList.length - maxFme) + ' more technicians</td></tr>';
    }
}

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // FOOTER
'          <tr>' +
'            <td style="padding:16px 0; border-top:1px solid #27272a; text-align:center; font-size:11px; color:#71717a;">' +
'              Generated automatically by <strong>Huawei OWS Mateline Utilization Platform</strong>' +
'            </td>' +
'          </tr>' +

'        </table>' +
'      </td>' +
'    </tr>' +
'  </table>' +
'</body>' +
'</html>';

// 7. Susun Payload Email
var defaultEmailTitle = "[DAILY REPORT] Mateline Utilization " + jParts.dayName + " " + jParts.todayStr;
var emailSubject = (body.title || body.subject || defaultEmailTitle);

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

// 8. Eksekusi Pengiriman Email
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result = ServiceInvoker.post(serviceUrl, emailPayload);

if (logger && logger.info) {
    logger.info("Email sent to " + sendTo + ", response=" + JSON.stringify(result));
}

return {
    success: true,
    target_date: targetDate,
    recipient: sendTo,
    summary: {
        total_tickets_d1: totalTicketsD1,
        accepted_d1: countAcceptedD1,
        accept_rate_d1: acceptRateD1 + "%",
        range_tickets: rangeTotalTickets,
        range_accepted: rangeAccepted
    },
    send_result: result
};
