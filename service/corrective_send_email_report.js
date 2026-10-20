/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 * 
 * Auto D-1 Daily Report Generator (Mateline Utilization & Corrective Maintenance)
 * Designed to MATCH 100% with the Mateline Utilization Dashboard UI Dark Theme & Components:
 * - Header Banner (Mateline Utilization Dashboard + Live Ticker style)
 * - Top Row Summary (Total Tickets & Total Accepted blue/green cards + Acceptance Rate bar + Accept Rate by Party cards)
 * - Mateline Milestone 5 Metric Cards (Total, Accepted, Depart, Arrive, Leave)
 * - Milestone Hourly Timeline Matrix Table (00:00 - 23:00)
 * - Cluster Office Milestone Summary Table
 * - FME Performance Detail Table
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

// 2. Hitung Tanggal D-1 (Kemarin)
function getD1DateString() {
    var nowJakarta = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    var d1 = new Date(nowJakarta.getTime() - (24 * 60 * 60 * 1000));
    var yyyy = d1.getUTCFullYear();
    var mm = ("0" + (d1.getUTCMonth() + 1)).slice(-2);
    var dd = ("0" + d1.getUTCDate()).slice(-2);
    return yyyy + "-" + mm + "-" + dd;
}

var targetDate = (body.date && String(body.date).trim()) ? String(body.date).trim() : getD1DateString();

// 3. Ambil Data Aktual dari service corrective_dashboard_summary_get
var summaryRes = null;
try {
    summaryRes = ServiceInvoker.post(
        "/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get",
        {
            "start_date": targetDate,
            "end_date": targetDate,
            "start": 0,
            "limit": 10000
        }
    );
} catch (e) {
    if (logger && logger.error) logger.error("Failed fetching summary data for " + targetDate + ": " + e.message);
}

// 4. Proses Aggregasi Data
var rawTickets = [];
if (summaryRes && summaryRes.result && summaryRes.result.data_grid && Array.isArray(summaryRes.result.data_grid.rows)) {
    rawTickets = summaryRes.result.data_grid.rows;
}

var totalTickets = rawTickets.length;
var countAccepted = 0;
var countDepart = 0;
var countArrive = 0;
var countLeave = 0;

// Hourly breakdown (00 s/d 23)
var hourly = [];
for (var h = 0; h < 24; h++) {
    hourly.push({ hour: (h < 10 ? '0' + h : '' + h), total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 });
}

// Party breakdown (sesuai CM_PARTY_ORDER di dashboard: Telkom Akses, Persada, Mandau, Others)
var CM_PARTY_ORDER = ['Telkom Akses', 'Persada', 'Mandau'];
var partyMap = {
    'Telkom Akses': { total: 0, accepted: 0 },
    'Persada': { total: 0, accepted: 0 },
    'Mandau': { total: 0, accepted: 0 },
    'Others': { total: 0, accepted: 0 }
};

var clusterMap = {};
var fmeMap = {};

for (var i = 0; i < totalTickets; i++) {
    var t = rawTickets[i];
    if (!t) continue;

    var isAccepted = !!(t.accept_time);
    var isDepart = !!(t.depart_time);
    var isArrive = !!(t.arrive_time);
    var isLeave = !!(t.complete_time || t.exit_time || t.current_phase === 'leave' || t.out_in === 'exit');

    if (isAccepted) countAccepted++;
    if (isDepart) countDepart++;
    if (isArrive) countArrive++;
    if (isLeave) countLeave++;

    // Hourly aggregation
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

    // Party Aggregation
    var rawParty = String(t.party_name || t.contractor_name || '').trim();
    var matchedParty = 'Others';
    for (var p = 0; p < CM_PARTY_ORDER.length; p++) {
        if (rawParty.toLowerCase().indexOf(CM_PARTY_ORDER[p].toLowerCase()) !== -1) {
            matchedParty = CM_PARTY_ORDER[p];
            break;
        }
    }
    if (!partyMap[matchedParty]) partyMap[matchedParty] = { total: 0, accepted: 0 };
    partyMap[matchedParty].total++;
    if (isAccepted) partyMap[matchedParty].accepted++;

    // Cluster Aggregation
    var clusterName = String(t.cluster || t.cluster_name || t.mc_cluster || t.region || 'Unassigned').trim();
    if (!clusterMap[clusterName]) {
        clusterMap[clusterName] = { cluster: clusterName, total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
    }
    clusterMap[clusterName].total++;
    if (isAccepted) clusterMap[clusterName].accepted++;
    if (isDepart) clusterMap[clusterName].depart++;
    if (isArrive) clusterMap[clusterName].arrive++;
    if (isLeave) clusterMap[clusterName].leave++;

    // FME Aggregation
    var fmeName = String(t.fme_name || t.engineer_name || t.handler || t.user_name || '').trim();
    if (fmeName) {
        var fmeKey = clusterName + '___' + fmeName;
        if (!fmeMap[fmeKey]) {
            fmeMap[fmeKey] = { cluster: clusterName, fmeName: fmeName, accepted: 0, depart: 0, arrive: 0, leave: 0, total: 0 };
        }
        fmeMap[fmeKey].total++;
        if (isAccepted) fmeMap[fmeKey].accepted++;
        if (isDepart) fmeMap[fmeKey].depart++;
        if (isArrive) fmeMap[fmeKey].arrive++;
        if (isLeave) fmeMap[fmeKey].leave++;
    }
}

// Percentages
var acceptedPct = totalTickets > 0 ? Math.round((countAccepted / totalTickets) * 100) : 0;
var departPct = totalTickets > 0 ? Math.round((countDepart / totalTickets) * 100) : 0;
var arrivePct = totalTickets > 0 ? Math.round((countArrive / totalTickets) * 100) : 0;
var leavePct = totalTickets > 0 ? Math.round((countLeave / totalTickets) * 100) : 0;
var acceptRateOverall = totalTickets > 0 ? ((countAccepted / totalTickets) * 100).toFixed(1) : "0.0";

// Sort Clusters by total descending
var clusterList = [];
for (var cK in clusterMap) clusterList.push(clusterMap[cK]);
clusterList.sort(function(a, b) { return b.total - a.total; });

// Sort FME by cluster then total
var fmeList = [];
for (var fK in fmeMap) fmeList.push(fmeMap[fK]);
fmeList.sort(function(a, b) {
    if (a.cluster === b.cluster) return b.accepted - a.accepted;
    return a.cluster.localeCompare(b.cluster);
});

// 5. Susun Template HTML yang 100% Mengadopsi CSS Dashboard OWS
var html = '' +
'<!DOCTYPE html>' +
'<html>' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="margin:0; padding:0; background-color:#09090b; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; color:#e4e4e7;">' +
'  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090b; padding:20px 0;">' +
'    <tr>' +
'      <td align="center">' +
'        <!-- Main Container (Dark Slate #09090b) -->' +
'        <table width="820" cellpadding="0" cellspacing="0" border="0" style="max-width:820px; width:100%; background-color:#09090b; border-radius:12px; overflow:hidden;">' +

          // 1. HEADER (Persis custom-dashboard-header)
'          <tr>' +
'            <td style="padding:16px 20px 20px 20px; border-bottom:1px solid #27272a;">' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
'                  <td align="left">' +
'                    <div style="font-size:22px; font-weight:700; color:#fafafa; letter-spacing:0.5px;">MATELINE UTILIZATION DASHBOARD</div>' +
'                    <div style="font-size:13px; color:#a1a1aa; margin-top:4px;">Daily Mateline utilization and ticket acceptance monitoring</div>' +
'                  </td>' +
'                  <td align="right" valign="top">' +
'                    <div style="background:#18181b; border:1px solid #27272a; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; color:#a0aec0; display:inline-block;">' +
'                      Report Date: <span style="color:#58a6ff;">' + targetDate + ' (D-1)</span>' +
'                    </div>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 2. TOP SUMMARY ROW (Ticket Summary & Accept Rate by Party)
'          <tr>' +
'            <td style="padding:20px 20px 10px 20px;">' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
                  // Left Card: Ticket Summary (Total Tickets + Total Accepted + Progress Bar)
'                  <td width="48%" valign="top" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:16px;">' +
'                    <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:14px;">Ticket Summary</div>' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">' +
'                      <tr>' +
'                        <td width="48%" style="padding:12px; border-radius:8px; background:#d1eaff;">' +
'                          <div style="font-size:11px; font-weight:600; color:#0367c1; text-transform:uppercase; margin-bottom:8px;">Total Tickets</div>' +
'                          <div style="font-size:26px; font-weight:bold; color:#0367c1;">' + totalTickets + '</div>' +
'                        </td>' +
'                        <td width="4%">&nbsp;</td>' +
'                        <td width="48%" style="padding:12px; border-radius:8px; background:#daf5e6;">' +
'                          <div style="font-size:11px; font-weight:600; color:#027039; text-transform:uppercase; margin-bottom:8px;">Total Accepted</div>' +
'                          <div style="font-size:26px; font-weight:bold; color:#027039;">' + countAccepted + '</div>' +
'                        </td>' +
'                      </tr>' +
'                    </table>' +
'                    <div style="margin-top:12px;">' +
'                      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#a1a1aa; margin-bottom:6px;">' +
'                        <span>Acceptance Rate</span>' +
'                        <span style="color:#fafafa; font-size:16px; font-weight:700;">' + acceptRateOverall + '%</span>' +
'                      </div>' +
'                      <div style="height:10px; background:#1f2937; border-radius:999px; overflow:hidden;">' +
'                        <div style="width:' + acceptRateOverall + '%; height:100%; background:#3b82f6; border-radius:999px;"></div>' +
'                      </div>' +
'                    </div>' +
'                  </td>' +

'                  <td width="4%">&nbsp;</td>' +

                  // Right Cards: Accept Rate by Party
'                  <td width="48%" valign="top">' +
'                    <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:10px;">Accept Rate by Party (D-1)</div>' +
'                    <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                      <tr>';

var partyCols = CM_PARTY_ORDER.slice(0, 3);
for (var pi = 0; pi < partyCols.length; pi++) {
    var pKey = partyCols[pi];
    var pD = partyMap[pKey] || { total: 0, accepted: 0 };
    var pRate = pD.total > 0 ? ((pD.accepted / pD.total) * 100).toFixed(1) : '0.0';
    html += '' +
'                        <td width="31%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:12px 10px; text-align:center;">' +
'                          <div style="font-size:10px; color:#8b949e; font-weight:600; text-transform:uppercase; margin-bottom:4px;">' + pKey + '</div>' +
'                          <div style="font-size:22px; font-weight:700; color:#58a6ff;">' + pRate + '%</div>' +
'                          <div style="font-size:10px; color:#8b949e; margin-top:4px;">' + pD.accepted + '/' + pD.total + ' acc</div>' +
'                        </td>' + (pi < 2 ? '<td width="3%">&nbsp;</td>' : '');
}

html += '' +
'                      </tr>' +
'                    </table>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 3. MILESTONE UTILIZATION 5 CARDS (Persis custom-ml-card)
'          <tr>' +
'            <td style="padding:16px 20px;">' +
'              <div style="font-size:14px; font-weight:700; color:#fafafa; margin-bottom:12px; letter-spacing:0.5px;">MILESTONE UTILIZATION DASHBOARD</div>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
                  // Total Ticket Card
'                  <td width="18%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:14px 16px;">' +
'                    <div style="font-size:11px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:6px;">Total Ticket</div>' +
'                    <div style="font-size:26px; font-weight:700; color:#fafafa;">' + totalTickets + '</div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Accepted Card
'                  <td width="18%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:14px 16px;">' +
'                    <div style="font-size:11px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:6px;">Total Accepted</div>' +
'                    <div style="font-size:26px; font-weight:700; color:#fafafa;">' + countAccepted + ' ' +
'                      <span style="font-size:12px; font-weight:600; color:#58a6ff; background:rgba(88,166,255,0.1); border:1px solid rgba(88,166,255,0.2); border-radius:9999px; padding:2px 6px;">' + acceptedPct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Depart Card
'                  <td width="18%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:14px 16px;">' +
'                    <div style="font-size:11px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:6px;">Total Depart</div>' +
'                    <div style="font-size:26px; font-weight:700; color:#fafafa;">' + countDepart + ' ' +
'                      <span style="font-size:12px; font-weight:600; color:#f97316; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.2); border-radius:9999px; padding:2px 6px;">' + departPct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Arrive Card
'                  <td width="18%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:14px 16px;">' +
'                    <div style="font-size:11px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:6px;">Total Arrive</div>' +
'                    <div style="font-size:26px; font-weight:700; color:#fafafa;">' + countArrive + ' ' +
'                      <span style="font-size:12px; font-weight:600; color:#ec4899; background:rgba(236,72,153,0.1); border:1px solid rgba(236,72,153,0.2); border-radius:9999px; padding:2px 6px;">' + arrivePct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Leave Card
'                  <td width="18%" style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:14px 16px;">' +
'                    <div style="font-size:11px; font-weight:600; color:#a1a1aa; text-transform:uppercase; margin-bottom:6px;">Total Leave</div>' +
'                    <div style="font-size:26px; font-weight:700; color:#fafafa;">' + countLeave + ' ' +
'                      <span style="font-size:12px; font-weight:600; color:#34d399; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.2); border-radius:9999px; padding:2px 6px;">' + leavePct + '%</span>' +
'                    </div>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // 4. HOURLY TIMELINE DISTRIBUTION TABLE (00:00 - 23:00)
'          <tr>' +
'            <td style="padding:16px 20px;">' +
'              <div style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:18px;">' +
'                <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:4px;">1 Day - Hourly Timeline (' + targetDate + ')</div>' +
'                <div style="font-size:12px; color:#a1a1aa; margin-bottom:14px;">Distribution of tickets across 24 hours</div>' +
'                <div style="overflow-x:auto;">' +
'                  <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size:11px; border-collapse:collapse; text-align:center;">' +
'                    <thead>' +
'                      <tr style="background:#18181b; color:#a1a1aa; border-bottom:1px solid #27272a;">' +
'                        <th align="left" style="padding:8px 10px; color:#fafafa;">Milestone</th>';

for (var hr = 0; hr < 24; hr += 2) { // Tampilkan 2 jam sekali agar pas di email desktop/mobile
    html += '<th style="padding:8px 4px;">' + (hr < 10 ? '0' + hr : '' + hr) + ':00</th>';
}
html += '<th style="padding:8px 6px; color:#fafafa;">Total</th></tr></thead><tbody>';

// Row Total Ticket
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding:8px 10px; font-weight:600; color:#ffffff;"><span style="display:inline-block; width:8px; height:8px; background:#ffffff; border-radius:50%; margin-right:6px;"></span>Total Ticket</td>';
for (var h1 = 0; h1 < 24; h1 += 2) {
    var sumTot = hourly[h1].total + hourly[h1+1].total;
    html += '<td style="color:#ffffff;">' + sumTot + '</td>';
}
html += '<td style="font-weight:700; color:#ffffff;">' + totalTickets + '</td></tr>';

// Row Accepted
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding:8px 10px; font-weight:600; color:#3b82f6;"><span style="display:inline-block; width:8px; height:8px; background:#3b82f6; border-radius:50%; margin-right:6px;"></span>Accepted</td>';
for (var h2 = 0; h2 < 24; h2 += 2) {
    var sumAcc = hourly[h2].accepted + hourly[h2+1].accepted;
    html += '<td style="color:#3b82f6;">' + sumAcc + '</td>';
}
html += '<td style="font-weight:700; color:#3b82f6;">' + countAccepted + '</td></tr>';

// Row Depart
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding:8px 10px; font-weight:600; color:#f97316;"><span style="display:inline-block; width:8px; height:8px; background:#f97316; border-radius:50%; margin-right:6px;"></span>Depart</td>';
for (var h3 = 0; h3 < 24; h3 += 2) {
    var sumDep = hourly[h3].depart + hourly[h3+1].depart;
    html += '<td style="color:#f97316;">' + sumDep + '</td>';
}
html += '<td style="font-weight:700; color:#f97316;">' + countDepart + '</td></tr>';

// Row Arrive
html += '<tr style="border-bottom:1px solid #1f1f23;"><td align="left" style="padding:8px 10px; font-weight:600; color:#ec4899;"><span style="display:inline-block; width:8px; height:8px; background:#ec4899; border-radius:50%; margin-right:6px;"></span>Arrive</td>';
for (var h4 = 0; h4 < 24; h4 += 2) {
    var sumArr = hourly[h4].arrive + hourly[h4+1].arrive;
    html += '<td style="color:#ec4899;">' + sumArr + '</td>';
}
html += '<td style="font-weight:700; color:#ec4899;">' + countArrive + '</td></tr>';

// Row Leave
html += '<tr><td align="left" style="padding:8px 10px; font-weight:600; color:#34d399;"><span style="display:inline-block; width:8px; height:8px; background:#34d399; border-radius:50%; margin-right:6px;"></span>Leave</td>';
for (var h5 = 0; h5 < 24; h5 += 2) {
    var sumLev = hourly[h5].leave + hourly[h5+1].leave;
    html += '<td style="color:#34d399;">' + sumLev + '</td>';
}
html += '<td style="font-weight:700; color:#34d399;">' + countLeave + '</td></tr>';

html += '' +
'                    </tbody>' +
'                  </table>' +
'                </div>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 5. CLUSTER OFFICE MILESTONE SUMMARY (Persis custom-ml-cluster-table)
'          <tr>' +
'            <td style="padding:16px 20px;">' +
'              <div style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:18px;">' +
'                <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:4px;">Cluster Office Milestone Summary</div>' +
'                <div style="font-size:12px; color:#a1a1aa; margin-bottom:14px;">' + clusterList.length + ' clusters active in D-1</div>' +
'                <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size:12px; border-collapse:collapse;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#a1a1aa; border-bottom:1px solid #27272a; font-size:11px; text-transform:uppercase;">' +
'                      <th align="left" style="padding-left:12px;">Cluster</th>' +
'                      <th align="right">Total</th>' +
'                      <th align="right" style="color:#3b82f6;">Accepted</th>' +
'                      <th align="right" style="color:#f97316;">Depart</th>' +
'                      <th align="right" style="color:#ec4899;">Arrive</th>' +
'                      <th align="right" style="color:#34d399;">Leave</th>' +
'                    </tr>' +
'                  </thead>' +
'                  <tbody>';

if (clusterList.length === 0) {
    html += '<tr><td colspan="6" align="center" style="color:#71717a; padding:16px;">No cluster ticket data.</td></tr>';
} else {
    for (var ci = 0; ci < clusterList.length; ci++) {
        var cl = clusterList[ci];
        html += '' +
'                    <tr style="border-bottom:1px solid #1f1f23;">' +
'                      <td align="left" style="padding-left:12px; font-weight:600; color:#fafafa;">' + cl.cluster + '</td>' +
'                      <td align="right" style="font-weight:700; color:#fafafa;">' + cl.total + '</td>' +
'                      <td align="right" style="font-weight:600; color:#3b82f6;">' + cl.accepted + '</td>' +
'                      <td align="right" style="font-weight:600; color:#f97316;">' + cl.depart + '</td>' +
'                      <td align="right" style="font-weight:600; color:#ec4899;">' + cl.arrive + '</td>' +
'                      <td align="right" style="font-weight:600; color:#34d399;">' + cl.leave + '</td>' +
'                    </tr>';
    }
}

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 6. FME PERFORMANCE DETAIL TABLE (Persis custom-ml-fme-table)
'          <tr>' +
'            <td style="padding:16px 20px 24px 20px;">' +
'              <div style="background-color:#0d0d10; border:1px solid #27272a; border-radius:10px; padding:18px;">' +
'                <div style="font-size:14px; font-weight:600; color:#fafafa; margin-bottom:4px;">FME Performance Detail</div>' +
'                <div style="font-size:12px; color:#a1a1aa; margin-bottom:14px;">' + fmeList.length + ' technicians dispatched in D-1</div>' +
'                <table width="100%" cellpadding="8" cellspacing="0" border="0" style="font-size:12px; border-collapse:collapse;">' +
'                  <thead>' +
'                    <tr style="background:#18181b; color:#a1a1aa; border-bottom:1px solid #27272a; font-size:11px; text-transform:uppercase;">' +
'                      <th align="left" style="padding-left:12px; width:180px;">Cluster</th>' +
'                      <th align="left">FME Name</th>' +
'                      <th align="right" style="color:#3b82f6;">Accepted</th>' +
'                      <th align="right" style="color:#f97316;">Depart</th>' +
'                      <th align="right" style="color:#ec4899;">Arrive</th>' +
'                      <th align="right" style="color:#34d399;">Leave</th>' +
'                    </tr>' +
'                  </thead>' +
'                  <tbody>';

if (fmeList.length === 0) {
    html += '<tr><td colspan="6" align="center" style="color:#71717a; padding:16px;">No FME data available.</td></tr>';
} else {
    // Tampilkan FME terdaftar (maksimal 30 teratas agar email tidak terlalu berat)
    var displayFmeCount = Math.min(fmeList.length, 40);
    for (var fi = 0; fi < displayFmeCount; fi++) {
        var fm = fmeList[fi];
        html += '' +
'                    <tr style="border-bottom:1px solid #1f1f23;">' +
'                      <td align="left" style="padding-left:12px; color:#8b949e; font-size:11px;">' + fm.cluster + '</td>' +
'                      <td align="left" style="font-weight:600; color:#e4e4e7;">' + fm.fmeName + '</td>' +
'                      <td align="right" style="font-weight:600; color:#3b82f6;">' + fm.accepted + '</td>' +
'                      <td align="right" style="font-weight:600; color:#f97316;">' + fm.depart + '</td>' +
'                      <td align="right" style="font-weight:600; color:#ec4899;">' + fm.arrive + '</td>' +
'                      <td align="right" style="font-weight:600; color:#34d399;">' + fm.leave + '</td>' +
'                    </tr>';
    }
    if (fmeList.length > displayFmeCount) {
        html += '<tr><td colspan="6" align="center" style="color:#8b949e; padding:10px; font-size:11px;">... and ' + (fmeList.length - displayFmeCount) + ' more FME technicians</td></tr>';
    }
}

html += '' +
'                  </tbody>' +
'                </table>' +
'              </div>' +
'            </td>' +
'          </tr>' +

          // 7. FOOTER
'          <tr>' +
'            <td style="padding:16px 20px; border-top:1px solid #27272a; text-align:center; font-size:11px; color:#71717a;">' +
'              <div>Generated by <strong>Mateline Utilization Dashboard</strong> - Huawei OWS Automation Platform</div>' +
'            </td>' +
'          </tr>' +

'        </table>' +
'      </td>' +
'    </tr>' +
'  </table>' +
'</body>' +
'</html>';

// 6. Susun Payload Email
var emailSubject = (body.title || body.subject || ("【Report】Mateline Utilization Dashboard - " + targetDate));

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

// 7. Eksekusi Pengiriman Email
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result = ServiceInvoker.post(serviceUrl, emailPayload);

if (logger && logger.info) {
    logger.info("Daily Report Email sent for " + targetDate + ", response=" + JSON.stringify(result));
}

return {
    success: true,
    target_date: targetDate,
    recipient: sendTo,
    summary: {
        total_tickets: totalTickets,
        accept_rate: acceptRateOverall + "%",
        depart_rate: departPct + "%",
        arrive_rate: arrivePct + "%",
        leave_rate: leavePct + "%",
        clusters_count: clusterList.length,
        fme_count: fmeList.length
    },
    send_result: result
};
