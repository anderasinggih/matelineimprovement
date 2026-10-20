/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 * 
 * Auto D-1 Daily Report Generator (Mateline Utilization & Corrective Maintenance)
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
    // Offset GMT+7 (Jakarta)
    var nowJakarta = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    // D-1
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

// 4. Proses Aggregasi Metrik Data
var rawTickets = [];
if (summaryRes && summaryRes.result && summaryRes.result.data_grid && Array.isArray(summaryRes.result.data_grid.rows)) {
    rawTickets = summaryRes.result.data_grid.rows;
}

var totalTickets = rawTickets.length;
var countAccepted = 0;
var countDepart = 0;
var countArrive = 0;
var countLeave = 0;

var fmeSet = {};
var clusterMap = {};
var partyMap = {
    "PERSADA": { total: 0, accepted: 0 },
    "HUAWEI": { total: 0, accepted: 0 },
    "TELKOSINDO": { total: 0, accepted: 0 },
    "OTHERS": { total: 0, accepted: 0 }
};

for (var i = 0; i < totalTickets; i++) {
    var t = rawTickets[i];
    if (!t) continue;

    // Milestone flags
    var isAccepted = !!(t.accept_time);
    var isDepart = !!(t.depart_time);
    var isArrive = !!(t.arrive_time);
    var isLeave = !!(t.complete_time || t.exit_time || t.current_phase === 'leave' || t.out_in === 'exit');

    if (isAccepted) countAccepted++;
    if (isDepart) countDepart++;
    if (isArrive) countArrive++;
    if (isLeave) countLeave++;

    // FME Active Tracker
    var fme = t.fme_name || t.engineer_name || t.handler || t.user_name || "";
    if (fme && String(fme).trim()) {
        fmeSet[String(fme).trim()] = true;
    }

    // Party Aggregation
    var party = String(t.party_name || t.contractor_name || "OTHERS").toUpperCase().trim();
    var matchedParty = "OTHERS";
    if (party.indexOf("PERSADA") !== -1) matchedParty = "PERSADA";
    else if (party.indexOf("HUAWEI") !== -1) matchedParty = "HUAWEI";
    else if (party.indexOf("TELKOSINDO") !== -1) matchedParty = "TELKOSINDO";

    partyMap[matchedParty].total++;
    if (isAccepted) partyMap[matchedParty].accepted++;

    // Cluster Aggregation
    var cluster = t.cluster || t.cluster_name || t.mc_cluster || t.region || "Unassigned";
    if (!clusterMap[cluster]) {
        clusterMap[cluster] = { total: 0, accepted: 0, depart: 0, arrive: 0, leave: 0 };
    }
    clusterMap[cluster].total++;
    if (isAccepted) clusterMap[cluster].accepted++;
    if (isDepart) clusterMap[cluster].depart++;
    if (isArrive) clusterMap[cluster].arrive++;
    if (isLeave) clusterMap[cluster].leave++;
}

var activeFmeCount = Object.keys(fmeSet).length;
var acceptRate = totalTickets > 0 ? ((countAccepted / totalTickets) * 100).toFixed(1) : "0.0";
var departRate = totalTickets > 0 ? ((countDepart / totalTickets) * 100).toFixed(1) : "0.0";
var arriveRate = totalTickets > 0 ? ((countArrive / totalTickets) * 100).toFixed(1) : "0.0";
var leaveRate = totalTickets > 0 ? ((countLeave / totalTickets) * 100).toFixed(1) : "0.0";

// Sort Top Clusters
var clusterList = [];
for (var cKey in clusterMap) {
    clusterList.push({
        name: cKey,
        total: clusterMap[cKey].total,
        accepted: clusterMap[cKey].accepted,
        depart: clusterMap[cKey].depart,
        arrive: clusterMap[cKey].arrive,
        leave: clusterMap[cKey].leave
    });
}
clusterList.sort(function(a, b) { return b.total - a.total; });
var topClusters = clusterList.slice(0, 5);

// 5. Susun Template HTML Email Yang Responsif, Elegan & Standar Enterprise
function getStatusBadge(pct) {
    var num = parseFloat(pct);
    if (num >= 90) return '<span style="background:#15803d; color:#ffffff; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">GOOD</span>';
    if (num >= 80) return '<span style="background:#b45309; color:#ffffff; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">FAIR</span>';
    return '<span style="background:#b91c1c; color:#ffffff; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">LOW</span>';
}

var htmlContent = '' +
'<!DOCTYPE html>' +
'<html>' +
'<head>' +
'<meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="margin:0; padding:0; background-color:#0f172a; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif; color:#f8fafc;">' +
'  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f172a; padding:24px 0;">' +
'    <tr>' +
'      <td align="center">' +
'        <table width="680" cellpadding="0" cellspacing="0" border="0" style="max-width:680px; width:100%; background-color:#1e293b; border-radius:12px; overflow:hidden; border:1px solid #334155; box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);">' +
          
          // Header Banner
'          <tr>' +
'            <td style="padding:28px 32px; background:linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); border-bottom:1px solid #334155;">' +
'              <div style="font-size:11px; font-weight:700; color:#38bdf8; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:6px;">Huawei OWS Automation Monitoring</div>' +
'              <div style="font-size:22px; font-weight:800; color:#ffffff; margin-bottom:6px;">MATELINE UTILIZATION DAILY REPORT</div>' +
'              <div style="font-size:13px; color:#94a3b8;">Periode Evaluasi: <strong style="color:#f1f5f9;">' + targetDate + ' (D-1)</strong> | Scope: Daily Corrective Maintenance</div>' +
'            </td>' +
'          </tr>' +

          // Section 1: Executive KPI Cards
'          <tr>' +
'            <td style="padding:24px 32px 16px 32px;">' +
'              <div style="font-size:14px; font-weight:700; color:#cbd5e1; margin-bottom:14px; text-transform:uppercase; letter-spacing:0.5px;">1. Executive KPI Summary</div>' +
'              <table width="100%" cellpadding="0" cellspacing="0" border="0">' +
'                <tr>' +
                  // Total Ticket Card
'                  <td width="23%" style="background:#0f172a; padding:16px 14px; border-radius:8px; border:1px solid #334155; text-align:center;">' +
'                    <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Total Tickets</div>' +
'                    <div style="font-size:24px; font-weight:800; color:#ffffff; margin:6px 0;">' + totalTickets + '</div>' +
'                    <div style="font-size:11px; color:#64748b;">Dispatched D-1</div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Accept Rate Card
'                  <td width="23%" style="background:#0f172a; padding:16px 14px; border-radius:8px; border:1px solid #334155; text-align:center;">' +
'                    <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Accept Rate</div>' +
'                    <div style="font-size:24px; font-weight:800; color:#38bdf8; margin:6px 0;">' + acceptRate + '%</div>' +
'                    <div>' + getStatusBadge(acceptRate) + '</div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Active FME Card
'                  <td width="23%" style="background:#0f172a; padding:16px 14px; border-radius:8px; border:1px solid #334155; text-align:center;">' +
'                    <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Active FME</div>' +
'                    <div style="font-size:24px; font-weight:800; color:#34d399; margin:6px 0;">' + activeFmeCount + '</div>' +
'                    <div style="font-size:11px; color:#64748b;">On-duty FME</div>' +
'                  </td>' +
'                  <td width="2%">&nbsp;</td>' +
                  // Leave Site Card
'                  <td width="23%" style="background:#0f172a; padding:16px 14px; border-radius:8px; border:1px solid #334155; text-align:center;">' +
'                    <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Leave Rate</div>' +
'                    <div style="font-size:24px; font-weight:800; color:#a78bfa; margin:6px 0;">' + leaveRate + '%</div>' +
'                    <div style="font-size:11px; color:#64748b;">' + countLeave + ' Resolved</div>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // Section 2: Milestone Funnel Pipeline
'          <tr>' +
'            <td style="padding:16px 32px;">' +
'              <div style="font-size:14px; font-weight:700; color:#cbd5e1; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">2. Mateline Milestone Adherence Funnel</div>' +
'              <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#0f172a; border-radius:8px; border:1px solid #334155; font-size:12px;">' +
'                <thead>' +
'                  <tr style="border-bottom:1px solid #334155; color:#94a3b8; text-transform:uppercase; font-size:11px;">' +
'                    <th align="left" style="padding-left:16px;">Milestone Phase</th>' +
'                    <th align="center">Ticket Count</th>' +
'                    <th align="center">Percentage</th>' +
'                    <th align="left" width="40%">Visual Funnel Progress</th>' +
'                  </tr>' +
'                </thead>' +
'                <tbody>' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#f1f5f9;">1. Total Dispatched</td>' +
'                    <td align="center" style="font-weight:700; color:#ffffff;">' + totalTickets + '</td>' +
'                    <td align="center" style="font-weight:700; color:#ffffff;">100%</td>' +
'                    <td><div style="background:#334155; border-radius:4px; height:8px; width:100%;"><div style="background:#ffffff; height:8px; border-radius:4px; width:100%;"></div></div></td>' +
'                  </tr>' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#38bdf8;">2. Accepted (Mateline)</td>' +
'                    <td align="center" style="font-weight:700; color:#38bdf8;">' + countAccepted + '</td>' +
'                    <td align="center" style="font-weight:700; color:#38bdf8;">' + acceptRate + '%</td>' +
'                    <td><div style="background:#334155; border-radius:4px; height:8px; width:100%;"><div style="background:#38bdf8; height:8px; border-radius:4px; width:' + acceptRate + '%;"></div></div></td>' +
'                  </tr>' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#fb923c;">3. Depart to Site</td>' +
'                    <td align="center" style="font-weight:700; color:#fb923c;">' + countDepart + '</td>' +
'                    <td align="center" style="font-weight:700; color:#fb923c;">' + departRate + '%</td>' +
'                    <td><div style="background:#334155; border-radius:4px; height:8px; width:100%;"><div style="background:#fb923c; height:8px; border-radius:4px; width:' + departRate + '%;"></div></div></td>' +
'                  </tr>' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#f472b6;">4. Arrive on Site</td>' +
'                    <td align="center" style="font-weight:700; color:#f472b6;">' + countArrive + '</td>' +
'                    <td align="center" style="font-weight:700; color:#f472b6;">' + arriveRate + '%</td>' +
'                    <td><div style="background:#334155; border-radius:4px; height:8px; width:100%;"><div style="background:#f472b6; height:8px; border-radius:4px; width:' + arriveRate + '%;"></div></div></td>' +
'                  </tr>' +
'                  <tr>' +
'                    <td style="padding-left:16px; font-weight:600; color:#34d399;">5. Leave / Resolved</td>' +
'                    <td align="center" style="font-weight:700; color:#34d399;">' + countLeave + '</td>' +
'                    <td align="center" style="font-weight:700; color:#34d399;">' + leaveRate + '%</td>' +
'                    <td><div style="background:#334155; border-radius:4px; height:8px; width:100%;"><div style="background:#34d399; height:8px; border-radius:4px; width:' + leaveRate + '%;"></div></div></td>' +
'                  </tr>' +
'                </tbody>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // Section 3: Partner Performance
'          <tr>' +
'            <td style="padding:16px 32px;">' +
'              <div style="font-size:14px; font-weight:700; color:#cbd5e1; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">3. Performance by Partner (Contractor)</div>' +
'              <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#0f172a; border-radius:8px; border:1px solid #334155; font-size:12px;">' +
'                <thead>' +
'                  <tr style="border-bottom:1px solid #334155; color:#94a3b8; text-transform:uppercase; font-size:11px;">' +
'                    <th align="left" style="padding-left:16px;">Partner Name</th>' +
'                    <th align="center">Total TT</th>' +
'                    <th align="center">Accepted TT</th>' +
'                    <th align="center">Accept Rate (%)</th>' +
'                    <th align="center">Status</th>' +
'                  </tr>' +
'                </thead>' +
'                <tbody>';

var pOrder = ["PERSADA", "HUAWEI", "TELKOSINDO", "OTHERS"];
for (var pIdx = 0; pIdx < pOrder.length; pIdx++) {
    var pName = pOrder[pIdx];
    var pData = partyMap[pName];
    if (pData.total === 0 && pName === "OTHERS") continue;
    var pRate = pData.total > 0 ? ((pData.accepted / pData.total) * 100).toFixed(1) : "0.0";

    htmlContent += '' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#f1f5f9;">' + pName + '</td>' +
'                    <td align="center" style="color:#ffffff;">' + pData.total + '</td>' +
'                    <td align="center" style="color:#38bdf8; font-weight:600;">' + pData.accepted + '</td>' +
'                    <td align="center" style="font-weight:700; color:#ffffff;">' + pRate + '%</td>' +
'                    <td align="center">' + getStatusBadge(pRate) + '</td>' +
'                  </tr>';
}

htmlContent += '' +
'                </tbody>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // Section 4: Top 5 Highest Incident Clusters
'          <tr>' +
'            <td style="padding:16px 32px 28px 32px;">' +
'              <div style="font-size:14px; font-weight:700; color:#cbd5e1; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">4. Top 5 Clusters with Highest Incidents (D-1)</div>' +
'              <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background:#0f172a; border-radius:8px; border:1px solid #334155; font-size:12px;">' +
'                <thead>' +
'                  <tr style="border-bottom:1px solid #334155; color:#94a3b8; text-transform:uppercase; font-size:11px;">' +
'                    <th align="left" style="padding-left:16px;">Cluster Name</th>' +
'                    <th align="center">Total TT</th>' +
'                    <th align="center" style="color:#38bdf8;">Accepted</th>' +
'                    <th align="center" style="color:#fb923c;">Depart</th>' +
'                    <th align="center" style="color:#f472b6;">Arrive</th>' +
'                    <th align="center" style="color:#34d399;">Leave</th>' +
'                  </tr>' +
'                </thead>' +
'                <tbody>';

if (topClusters.length === 0) {
    htmlContent += '<tr><td colspan="6" align="center" style="color:#64748b; padding:16px;">No cluster ticket data for this date.</td></tr>';
} else {
    for (var cIdx = 0; cIdx < topClusters.length; cIdx++) {
        var cl = topClusters[cIdx];
        htmlContent += '' +
'                  <tr style="border-bottom:1px solid #1e293b;">' +
'                    <td style="padding-left:16px; font-weight:600; color:#f1f5f9;">' + (cIdx + 1) + '. ' + cl.name + '</td>' +
'                    <td align="center" style="font-weight:700; color:#ffffff;">' + cl.total + '</td>' +
'                    <td align="center" style="color:#38bdf8;">' + cl.accepted + '</td>' +
'                    <td align="center" style="color:#fb923c;">' + cl.depart + '</td>' +
'                    <td align="center" style="color:#f472b6;">' + cl.arrive + '</td>' +
'                    <td align="center" style="color:#34d399;">' + cl.leave + '</td>' +
'                  </tr>';
    }
}

htmlContent += '' +
'                </tbody>' +
'              </table>' +
'            </td>' +
'          </tr>' +

          // Footer
'          <tr>' +
'            <td style="padding:20px 32px; background-color:#0f172a; border-top:1px solid #334155; text-align:center; font-size:11px; color:#64748b;">' +
'              <div>This report was automatically generated by <strong>Huawei OWS Automation Platform</strong>.</div>' +
'              <div style="margin-top:4px;">Please do not reply directly to this automated email.</div>' +
'            </td>' +
'          </tr>' +

'        </table>' +
'      </td>' +
'    </tr>' +
'  </table>' +
'</body>' +
'</html>';

// 6. Susun Payload Akhir untuk dikirim lewat email_send_create
var emailSubject = (body.title || body.subject || ("【Daily Report】Mateline Utilization & CM - " + targetDate));

var emailPayload = {
    "title": String(emailSubject),
    "email_to": String(sendTo),
    "email_bcc": "",
    "email_cc": "",
    "email_from": "",
    "content": htmlContent,
    "data_type": "text/html;charset=utf-8",
    "attachment": "",
    "server_id": ""
};

// 7. Eksekusi pengiriman email
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
        accept_rate: acceptRate + "%",
        active_fme: activeFmeCount,
        depart_rate: departRate + "%",
        arrive_rate: arriveRate + "%",
        leave_rate: leaveRate + "%"
    },
    send_result: result
};
