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

var todayStr = new Date().toISOString().substring(0, 10);

// Default target penerima: kirim ke email kantor & email gmail
var defaultEmailTo = "andera.singgih.pratama@h-partners.com,anderasinggih1@gmail.com";

// 2. Susun payload persis sesuai struktur yang terbukti sukses 100%
var emailPayload = {
    "title": body.title || body.subject || ("【Report】Corrective Maintenance & Mateline Dashboard - " + todayStr),
    "email_to": body.email_to || body.emails || defaultEmailTo,
    "email_bcc": body.email_bcc || "",
    "email_cc": body.email_cc || "",
    "email_from": body.email_from || "",
    "content": body.content || "<p>Dear Team,<br><br>Berikut adalah ringkasan monitoring Mateline Utilization Dashboard.<br>Report ini dibuat secara otomatis dari OWS System.</p>",
    "data_type": body.data_type || "text/html;charset=utf-8",
    "attachment": body.attachment || "",
    "server_id": body.server_id || ""
};

// 3. Eksekusi ke service System/email/email_send_create
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result = ServiceInvoker.post(serviceUrl, emailPayload);

if (logger && logger.info) {
    logger.info("email_send_create response=" + JSON.stringify(result));
}

return result;
