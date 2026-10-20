/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger) 
    ? JsLogger.serviceDebugLogger 
    : (typeof console !== 'undefined' ? console : null);

// 1. Ekstrak header dan body dari request
var body = (typeof message !== "undefined" && message && message.body) 
    ? message.body 
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" ? input : {}));

// Ambil input sendto / email_to manual dari user (prioritas utama)
var sendTo = body.email_to || body.send_to || body.sendto || body.emails || "";
var todayStr = new Date().toISOString().substring(0, 10);

// 2. Susun payload dasar yang wajib & pasti ada isinya
var emailPayload = {
    "title": body.title || body.subject || ("【Report】Corrective Maintenance & Mateline Dashboard - " + todayStr),
    "email_to": sendTo,
    "content": body.content || "<p>Dear Team,<br><br>Berikut adalah ringkasan monitoring Mateline Utilization Dashboard.<br>Report ini dibuat secara otomatis dari OWS System.</p>",
    "data_type": body.data_type || "text/html;charset=utf-8"
};

// Hanya tambahkan field opsional jika benar-benar ada isinya (HINDARI string kosong "")
if (body.email_cc && String(body.email_cc).trim()) emailPayload.email_cc = String(body.email_cc).trim();
if (body.email_bcc && String(body.email_bcc).trim()) emailPayload.email_bcc = String(body.email_bcc).trim();
if (body.email_from && String(body.email_from).trim()) emailPayload.email_from = String(body.email_from).trim();
if (body.attachment && String(body.attachment).trim()) emailPayload.attachment = body.attachment;
if (body.server_id && !isNaN(parseInt(body.server_id, 10))) emailPayload.server_id = parseInt(body.server_id, 10);

// 3. Eksekusi ke service System/email/email_send_create
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result = ServiceInvoker.post(serviceUrl, emailPayload);

if (logger && logger.info) {
    logger.info("email_send_create response=" + JSON.stringify(result));
}

return result;
