/**
 * OWS Service: corrective_send_email_report / emailreport
 * Platform Notice Email Service (Official OWS Notification Engine)
 * 
 * Input Parameters (Body):
 * {
 *   "title": "Judul Email (optional)",
 *   "content": "Isi email format HTML (required)",
 *   "email_to": "andera.singgih.pratama@h-partners.com (optional/comma separated)"
 * }
 */

var logger = (typeof JsLogger !== 'undefined' && JsLogger && JsLogger.serviceDebugLogger) 
    ? JsLogger.serviceDebugLogger 
    : (typeof console !== 'undefined' ? console : null);

// 1. Ekstrak header dan body dari request
var header = (typeof message !== "undefined" && message && message.header) ? message.header : {};
var body = (typeof message !== "undefined" && message && message.body) 
    ? message.body 
    : ((typeof input !== "undefined" && input && input.body) ? input.body : (typeof input !== "undefined" ? input : {}));

// Ambil tenantId dari context runtime OWS
var tenantId = (header && header.commonValues && header.commonValues.currentTenant) 
    ? header.commonValues.currentTenant 
    : "default";

var noticeUrl = "/notice:notice/rest/plat/rnsvc/v1/email/action?action-id=forward&userSource=GAM&tenantId=" + tenantId;

// 2. Mapping parameter input
var todayStr = new Date().toISOString().substring(0, 10);
var subject = (body.title || body.subject || ("【Report】Corrective Maintenance & Mateline Dashboard - " + todayStr));
var content = body.content || "<p>No content provided</p>";
var rawEmail = (body.email_to || body.emails || "andera.singgih.pratama@h-partners.com");

// Parse daftar email (bisa berupa Array atau String dipisah koma/titik koma)
var emailList = [];
if (Array.isArray(rawEmail)) {
    emailList = rawEmail;
} else if (typeof rawEmail === "string") {
    var rawSplits = rawEmail.split(/[,;]/);
    for (var i = 0; i < rawSplits.length; i++) {
        var em = rawSplits[i].trim();
        if (em) emailList.push(em);
    }
}

// 3. Susun request payload OWS Notice
var request = {
    agreeFlag: true,
    subject: subject,
    content: content,
    userInfo: "OWS Email Center",
    emails: emailList
};

// 4. Eksekusi via ServiceInvoker
var response = ServiceInvoker.invoke(noticeUrl, request);

if (logger && logger.info) {
    logger.info("OWS Notice email response=" + JSON.stringify(response));
}

return response;


