/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 * 
 * Schema:
 * *title    : string (mandatory)
 * *content  : string (mandatory)
 * email_to  : string
 * data_type : string ("text/html;charset=utf-8")
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger) 
    ? JsLogger.serviceDebugLogger 
    : (typeof console !== 'undefined' ? console : null);

// 1. Ekstrak header dan body dari request
var body = (typeof message !== "undefined" && message && message.body) 
    ? message.body 
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" ? input : {}));

var todayStr = new Date().toISOString().substring(0, 10);

// 2. Susun payload persis sesuai schema System/email/email_send_create
var emailPayload = {
    // Mandatory (*)
    title: (body.title || body.subject || ("【Report】Corrective Maintenance & Mateline Dashboard - " + todayStr)),
    content: body.content || "<p>Dear Team,<br><br>Berikut adalah ringkasan monitoring Mateline Utilization Dashboard.<br>Report ini dibuat secara otomatis dari OWS System.</p>",
    
    // Target Receiver
    email_to: (body.email_to || body.emails || "andera.singgih.pratama@h-partners.com"),
    data_type: body.data_type || "text/html;charset=utf-8"
};

// Optional fields - hanya sertakan jika ada nilainya
if (body.email_cc) emailPayload.email_cc = String(body.email_cc).trim();
if (body.email_bcc) emailPayload.email_bcc = String(body.email_bcc).trim();
if (body.email_from) emailPayload.email_from = String(body.email_from).trim();
if (body.server_id) emailPayload.server_id = parseInt(body.server_id, 10);
if (body.attachment) emailPayload.attachment = body.attachment;

// 3. Eksekusi langsung ke endpoint System/email/email_send_create
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result = ServiceInvoker.post(serviceUrl, emailPayload);

if (logger && logger.info) {
    logger.info("email_send_create response=" + JSON.stringify(result));
}

return result;
