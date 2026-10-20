/**
 * OWS Service: corrective_send_email_report / emailreport
 * Direct Service: /adc-service/rest/v1/services/System/email/email_send_create
 * 
 * Hanya 4 field bersih:
 * 1. title
 * 2. email_to
 * 3. content
 * 4. data_type
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger) 
    ? JsLogger.serviceDebugLogger 
    : (typeof console !== 'undefined' ? console : null);

// 1. Ekstrak header dan body dari request
var body = (typeof message !== "undefined" && message && message.body) 
    ? message.body 
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" ? input : {}));

var sendTo = body.email_to || body.send_to || body.sendto || body.emails || "";
var todayStr = new Date().toISOString().substring(0, 10);

// 2. Susun 9 field persis sama dengan payload yang SUKSES kamu tes di debugger OWS
var emailPayload = {
    "title": String(body.title || body.subject || ("【Report】Corrective Maintenance & Mateline Dashboard - " + todayStr)),
    "email_to": String(sendTo),
    "email_bcc": String(body.email_bcc || ""),
    "email_cc": String(body.email_cc || ""),
    "email_from": String(body.email_from || ""),
    "content": String(body.content || "Report monitoring Mateline Utilization"),
    "data_type": String(body.data_type || ""),
    "attachment": String(body.attachment || ""),
    "server_id": String(body.server_id || "")
};

// 3. Eksekusi menggunakan ServiceInvoker.invoke (standar OWS internal service)
var serviceUrl = "/adc-service/rest/v1/services/System/email/email_send_create";
var result;
try {
    result = ServiceInvoker.invoke(serviceUrl, emailPayload);
} catch (e) {
    if (logger && logger.error) logger.error("invoke error, trying post: " + e.message);
    result = ServiceInvoker.post(serviceUrl, emailPayload);
}

if (logger && logger.info) {
    logger.info("email_send_create response=" + JSON.stringify(result));
}

return result;
