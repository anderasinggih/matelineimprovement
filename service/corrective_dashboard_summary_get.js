function normalizeText(value) {
    if (value === null || typeof value === "undefined") {
        return "";
    }
    return String(value).trim();
}

function toNumber(value) {
    var numberValue = parseFloat(value);
    if (isNaN(numberValue)) {
        return 0;
    }
    return numberValue;
}

function getRows(response) {
    if (response === null || typeof response === "undefined") {
        return [];
    }
    if (response.result && response.result._values && typeof response.result._values.length === "number") {
        return response.result._values;
    }
    if (response.result && response.result.results && typeof response.result.results.length === "number") {
        return response.result.results;
    }
    if (response._values && typeof response._values.length === "number") {
        return response._values;
    }
    if (response.results && typeof response.results.length === "number") {
        return response.results;
    }
    if (response.data && typeof response.data.length === "number") {
        return response.data;
    }
    return [];
}

function queryByTql(tql, parameters, start, limit) {
    var request = {};
    var response;
    request.start = start;
    request.limit = limit;
    request.page_size = limit;
    request.tql = tql;
    request.query_type = "NORMAL";
    request.parameters = parameters;
    response = ServiceInvoker.post(
        "/adc-model/rest/v1/model-instances/query-by-tql",
        request
    );
    return getRows(response);
}

function addNameValue(target, name, value) {
    var normalizedName = normalizeText(name);
    var numericValue = toNumber(value);
    var i;
    if (normalizedName === "") {
        normalizedName = "Unknown";
    }
    for (i = 0; i < target.length; i++) {
        if (target[i].name === normalizedName) {
            target[i].value += numericValue;
            return;
        }
    }
    target.push({
        name: normalizedName,
        value: numericValue
    });
}

function addUniqueString(target, value) {
    var normalizedValue = normalizeText(value);
    var i;
    if (normalizedValue === "") {
        normalizedValue = "Unknown";
    }
    for (i = 0; i < target.length; i++) {
        if (target[i] === normalizedValue) {
            return;
        }
    }
    target.push(normalizedValue);
}

function addPhaseRow(target, row) {
    var currentPhase = normalizeText(row.current_phase);
    var phase = normalizeText(row.operate_phase);
    var total = toNumber(row.total);
    var avgAging = toNumber(row.avg_aging_days);
    var i;
    if (currentPhase !== "") {
        phase = currentPhase;
    }
    if (phase === "") {
        phase = "Unknown";
    }
    for (i = 0; i < target.length; i++) {
        if (target[i].phase === phase) {
            target[i].total += total;
            target[i].b1 += toNumber(row.b1);
            target[i].b2 += toNumber(row.b2);
            target[i].b3 += toNumber(row.b3);
            target[i].b4 += toNumber(row.b4);
            target[i].aging_sum += avgAging * total;
            return;
        }
    }
    target.push({
        phase: phase,
        total: total,
        b1: toNumber(row.b1),
        b2: toNumber(row.b2),
        b3: toNumber(row.b3),
        b4: toNumber(row.b4),
        aging_sum: avgAging * total
    });
}

function finalizePhaseRows(source) {
    var result = [];
    var avgAging;
    var i;
    for (i = 0; i < source.length; i++) {
        avgAging = 0;
        if (source[i].total > 0) {
            avgAging = source[i].aging_sum / source[i].total;
        }
        result.push({
            phase: source[i].phase,
            total: source[i].total,
            b1: source[i].b1,
            b2: source[i].b2,
            b3: source[i].b3,
            b4: source[i].b4,
            avg_aging_days: avgAging
        });
    }
    return result;
}

function addRegionRow(target, row) {
    var regionName = normalizeText(row.region);
    var i;
    if (regionName === "") {
        regionName = "Unknown";
    }
    for (i = 0; i < target.length; i++) {
        if (target[i].region === regionName) {
            target[i].total += toNumber(row.total);
            target[i].open += toNumber(row.open);
            target[i].pending += toNumber(row.pending);
            target[i].closed += toNumber(row.closed);
            return;
        }
    }
    target.push({
        region: regionName,
        total: toNumber(row.total),
        open: toNumber(row.open),
        pending: toNumber(row.pending),
        closed: toNumber(row.closed)
    });
}

function formatWeeklyRange(startDate) {
    if (!startDate) return '';

    var start = new Date(startDate.replace(/-/g, '/'));
    var end = new Date(start);

    end.setDate(end.getDate() + 6);

    return start.getDate() + ' ' +
        start.toLocaleString('en-US', { month: 'short' }) +
        ' - ' +
        end.getDate() + ' ' +
        end.toLocaleString('en-US', { month: 'short' });
}

function getWeekStartThursday(dateValue) {
    var date = new Date(dateValue.replace(/-/g, '/'));
    var day = date.getDay();
    var diff = (day + 3) % 7;

    date.setDate(date.getDate() - diff);

    return date.getFullYear() + "-" +
        ("0" + (date.getMonth() + 1)).slice(-2) + "-" +
        ("0" + date.getDate()).slice(-2);
}

function getUtcBoundaryFromJakartaDate(dateValue, nextDay) {
    if (!dateValue) {
        return "";
    }

    var parts = dateValue.split("-");
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);

    if (nextDay) {
        day += 1;
    }

    // 00:00 Jakarta = hari sebelumnya 17:00 UTC
    var utcMillis = Date.UTC(year, month, day, 0, 0, 0) - (7 * 60 * 60 * 1000);
    var date = new Date(utcMillis);

    return date.getUTCFullYear() + "-" +
        ("0" + (date.getUTCMonth() + 1)).slice(-2) + "-" +
        ("0" + date.getUTCDate()).slice(-2) + " " +
        ("0" + date.getUTCHours()).slice(-2) + ":" +
        ("0" + date.getUTCMinutes()).slice(-2) + ":" +
        ("0" + date.getUTCSeconds()).slice(-2);
}

function formatKeycodeDate(value) {
    var text = normalizeText(value);

    if (/^\d{8}$/.test(text)) {
        return text.substring(0, 4) + "-" +
            text.substring(4, 6) + "-" +
            text.substring(6, 8);
    }

    return text;
}

var input = _message.Input;
var startDate;
var endDate;
var region;
var party;
var fmOffice;
var startTime;
var endTime;
var parameters;
var dataStart;
var dataLimit;

var modelUri = "\"/CorrectiveMaintenance/CorrectiveMaintenance/" +
    "cm_wfm_corrective_maintenance\"";
var fmeScheduleUri = "\"/WFMBase/fme_service/fme_schedule\"";
var cmdbContractorUri = "\"/datahub/cmdb/cmdb_contractor\"";
var fmOfficeUri = "\"/datahub/cmdb/cmdb_fm_office\"";

var summaryTql;
var faultTypeTql;
var rootCauseTql;
var phaseStatusTql;
var regionSummaryTql;
var weeklyTrendTql;
var regionOptionsTql;
var partyOptionsTql;
var fmOfficeOptionsTql;
var alldataGridTql;
var dataGridTotalTql;
var acceptRatePartyAllTimeTql;
var acceptRateDailyTql;
var acceptRateWeeklyTql;
var fmeManagementTql;
var fmeStatusTql;

var summaryRows = [];
var faultRows = [];
var rootRows = [];
var phaseRows = [];
var regionRows = [];
var weeklyRows = [];
var regionOptionRows = [];
var partyOptionRows = [];
var fmOfficeOptionRows = [];
var alldataGridRows = [];
var dataGridTotalRows = [];
var acceptRatePartyAllTimeRows = [];
var acceptRateDailyRows = [];
var acceptRateWeeklyRows = [];
var fmeManagementRows = [];
var fmeStatusRows = [];

var summaryRow;
var summary;
var dataGridTotalRow;
var dataGridTotal;

var faultType = [];
var rootCause = [];
var phaseWorking = [];
var phaseStatus = [];
var regionSummary = [];
var weeklyTrend = [];
var regionOptions = [];
var partyOptions = [];
var fmOfficeOptions = [];
var acceptRatePartyAllTime = [];
var acceptRateDaily = [];
var acceptRateWeekly = [];
var fmeManagement = [];
var fmeStatus = [];

var i;
var row;

if (input === null || typeof input === "undefined" || typeof input !== "object") {
    input = _message;
}
if (input._values && typeof input._values.length === "number" && input._values.length > 0) {
    input = input._values[0];
}

startDate = normalizeText(input.start_date);
endDate = normalizeText(input.end_date);
region = normalizeText(input.region);
dataStart = parseInt(input.start, 10);
dataLimit = parseInt(input.limit, 10);

if (isNaN(dataStart) || dataStart < 0) {
    dataStart = 0;
}
if (isNaN(dataLimit) || dataLimit <= 0) {
    dataLimit = 20;
}
if (dataLimit > 10000) {
    dataLimit = 10000;
}
if (region.toUpperCase() === "ALL" || region.toUpperCase() === "ALL REGION") {
    region = "";
}

party = normalizeText(input.party);
if (party.toUpperCase() === "ALL" || party.toUpperCase() === "ALL PARTY") {
    party = "";
}

fmOffice = normalizeText(input.fm_office);

if (fmOffice.toUpperCase() === "ALL" || fmOffice.toUpperCase() === "ALL FM OFFICE") {
    fmOffice = "";
}

if ((startDate !== "" && endDate === "") || (startDate === "" && endDate !== "")) {
    throw new ScriptError(
        "Start Date and End Date must be provided together."
    );
}
if (startDate !== "" && startDate.search(/^\d{4}-\d{2}-\d{2}$/) !== 0) {
    throw new ScriptError(
        "Start Date must use yyyy-MM-dd format."
    );
}
if (endDate !== "" && endDate.search(/^\d{4}-\d{2}-\d{2}$/) !== 0) {
    throw new ScriptError(
        "End Date must use yyyy-MM-dd format."
    );
}
if (startDate !== "" && startDate > endDate) {
    throw new ScriptError(
        "Start Date cannot be later than End Date."
    );
}

startTime = startDate === ""
    ? ""
    : getUtcBoundaryFromJakartaDate(startDate, false);

endTime = endDate === ""
    ? ""
    : getUtcBoundaryFromJakartaDate(endDate, true);

parameters = {
    start_time: startTime,
    end_time: endTime,
    region: region,
    party: party,
    fm_office: fmOffice
};

function buildWhereClause(options) {
    var sql = "where 1 = 1 ";

    sql += "and cc.contractor_name in ('Telkom Akses','Persada','Mandau') ";

    if (options.activeOnly) {
        sql += "and cm.active = true ";
    }
    if (options.notClosedOnly) {
        sql += "and (cm.current_phase is null or cm.current_phase != 'close') ";
    }
    if (options.createtimeNotNull) {
        sql += "and cm.createtime is not null ";
    }
    if (startTime !== "") {
        sql += "and cm.createtime >= $!start_time ";
    }
    if (endTime !== "") {
        sql += "and cm.createtime < $!end_time ";
    }
    if (region !== "" && options.includeRegion !== false) {
        sql += "and cm.region_name = $!region ";
    }
    if (party !== "" && options.includeParty !== false) {
        sql += "and cc.contractor_name = $!party ";
    }
    return sql;
}

summaryTql = "select " +
    "count(1) as total, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 1 " +
    "else 0 end) as closed, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 0 " +
    "when cm.complete_time is not null " +
    "or cm.depart_time is not null " +
    "or cm.arrive_time is not null " +
    "or cm.dispatch_time is not null " +
    "or cm.accept_time is not null " +
    "then 1 else 0 end) as pending, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 0 " +
    "when cm.complete_time is not null " +
    "or cm.depart_time is not null " +
    "or cm.arrive_time is not null " +
    "or cm.dispatch_time is not null " +
    "or cm.accept_time is not null " +
    "then 0 else 1 end) as open " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true });

faultTypeTql = "select " +
    "cm.fault_type as name, " +
    "count(1) as value " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({}) +
    " group by cm.fault_type " +
    "order by value desc " +
    "limit 100";

rootCauseTql = "select " +
    "cm.root_cause as name, " +
    "count(1) as value " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({}) +
    " group by cm.root_cause " +
    "order by value desc " +
    "limit 20";

phaseStatusTql = "select " +
    "cm.operate_phase, " +
    "cm.current_phase, " +
    "count(1) as total, " +
    "sum(case " +
    "when datediff(current_timestamp, cm.createtime) <= 7 " +
    "then 1 else 0 end) as b1, " +
    "sum(case " +
    "when datediff(current_timestamp, cm.createtime) > 7 " +
    "and datediff(current_timestamp, cm.createtime) <= 15 " +
    "then 1 else 0 end) as b2, " +
    "sum(case " +
    "when datediff(current_timestamp, cm.createtime) > 15 " +
    "and datediff(current_timestamp, cm.createtime) <= 21 " +
    "then 1 else 0 end) as b3, " +
    "sum(case " +
    "when datediff(current_timestamp, cm.createtime) > 21 " +
    "then 1 else 0 end) as b4, " +
    "avg(datediff(current_timestamp, cm.createtime)) " +
    "as avg_aging_days " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ notClosedOnly: true }) +
    " group by cm.operate_phase, cm.current_phase " +
    "order by total desc " +
    "limit 100";

regionSummaryTql = "select " +
    "cm.region_name as region, " +
    "count(1) as total, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 1 " +
    "else 0 end) as closed, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 0 " +
    "when cm.complete_time is not null " +
    "or cm.depart_time is not null " +
    "or cm.arrive_time is not null " +
    "or cm.dispatch_time is not null " +
    "or cm.accept_time is not null " +
    "then 1 else 0 end) as pending, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 0 " +
    "when cm.complete_time is not null " +
    "or cm.depart_time is not null " +
    "or cm.arrive_time is not null " +
    "or cm.dispatch_time is not null " +
    "or cm.accept_time is not null " +
    "then 0 else 1 end) as open " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true }) +
    " group by cm.region_name " +
    "order by total desc " +
    "limit 500";

weeklyTrendTql =
    "select " +
    "substring(cm.keycode, 4, 8) as create_date, " +
    "count(1) as new_cm, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 1 " +
    "else 0 end) as closed_cm, " +
    "sum(case " +
    "when cm.current_phase = 'close' then 0 " +
    "when cm.complete_time is not null " +
    "or cm.depart_time is not null " +
    "or cm.arrive_time is not null " +
    "or cm.dispatch_time is not null " +
    "or cm.accept_time is not null " +
    "then 1 else 0 end) as pending_cm " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({
        activeOnly: true,
        createtimeNotNull: true
    }) +
    "group by substring(cm.keycode, 4, 8) " +
    "order by create_date asc " +
    "limit 500";

regionOptionsTql = "select " +
    "cm.region_name as region, " +
    "count(1) as total " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true, includeRegion: false, includeParty: false }) +
    " group by cm.region_name " +
    "order by cm.region_name asc " +
    "limit 500";

partyOptionsTql =
    "select " +
    "cc.contractor_name as party_name, " +
    "count(1) as total " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true, includeParty: false }) +
    " group by cc.contractor_name " +
    "order by cc.contractor_name asc " +
    "limit 100";

fmOfficeOptionsTql =
    "select " +
    "fo.id as fm_office_id, " +
    "fo.fm_office_name as fm_office_name " +
    "from " + fmeScheduleUri + " fs " +
    "left join " + fmOfficeUri + " fo " +
    "on fo.id = fs.default_fm_office " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    "where 1=1 " +
    "and cc.contractor_name in ('Telkom Akses','Persada','Mandau') " +
    (party !== "" ? "and cc.contractor_name = $!party " : "") +
    "group by fo.id, fo.fm_office_name " +
    "order by fo.fm_office_name asc " +
    "limit 500";

alldataGridTql = "select " +
    "cm.keycode, " +
    "cm.orderid, " +
    "cm.assign_to_fme, " +
    "cm.task_status, " +
    "cm.current_phase, " +
    "cm.operate_phase, " +
    "cm.title, " +
    "cm.region_name, " +
    "cm.fm_office, " +
    "cm.fault_type, " +
    "cm.root_cause, " +
    "cm.createtime, " +
    "cm.dispatch_time, " +
    "cm.accept_time, " +
    "cm.depart_time, " +
    "cm.arrive_time, " +
    "cm.complete_time, " +
    "cm.closetime, " +
    "fs.user_id as fme_user_id, " +
    "fs.username as fme_username, " +
    "fs.fullname as fme_fullname, " +
    "fs.contractor as contractor_id, " +
    "cc.contractor_name, " +
    "fo.fm_office_name as fme_fm_office_name " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on cm.assign_to_fme = fs.username " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    "left join " + fmOfficeUri + " fo " +
    "on fo.id = fs.default_fm_office " +
    buildWhereClause({ activeOnly: true }) +
    " order by cm.createtime desc";

dataGridTotalTql = "select " +
    "count(1) as total " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true });

acceptRateDailyTql =
    "select " +
    "ticket_date, " +
    "party_name, " +
    "count_ticket_id, " +
    "count_dispatch_time, " +
    "count_accept_time, " +
    "count_close_time, " +
    "round(100.0 * count_accept_time / nullif(count_ticket_id, 0), 2) as accept_rate_pct " +
    "from ( " +
    "select " +
    "substring(cm.keycode, 4, 8) as ticket_date, " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end as party_name, " +
    "count(cm.keycode) as count_ticket_id, " +
    "sum(case when cm.dispatch_time is not null then 1 else 0 end) as count_dispatch_time, " +
    "sum(case when cm.accept_time is not null then 1 else 0 end) as count_accept_time, " +
    "sum(case when cm.closetime is not null then 1 else 0 end) as count_close_time " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true }) +
    " group by " +
    "substring(cm.keycode, 4, 8), " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end " +
    ") t " +
    "order by ticket_date desc, party_name";

acceptRateWeeklyTql =
    "select " +
    "create_date, " +
    "party_name, " +
    "count_ticket_id, " +
    "count_dispatch_time, " +
    "count_accept_time, " +
    "count_close_time, " +
    "round(100.0 * count_accept_time / nullif(count_ticket_id, 0), 2) as accept_rate_pct " +
    "from ( " +
    "select " +
    "substring(cm.keycode, 4, 8) as create_date, " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end as party_name, " +
    "count(cm.keycode) as count_ticket_id, " +
    "sum(case when cm.dispatch_time is not null then 1 else 0 end) as count_dispatch_time, " +
    "sum(case when cm.accept_time is not null then 1 else 0 end) as count_accept_time, " +
    "sum(case when cm.closetime is not null then 1 else 0 end) as count_close_time " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true }) +
    " group by " +
    "substring(cm.keycode, 4, 8), " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end " +
    ") t " +
    "order by create_date desc, party_name";

acceptRatePartyAllTimeTql =
    "select " +
    "party_name, " +
    "count_ticket_id, " +
    "count_dispatch_time, " +
    "count_accept_time, " +
    "round(100.0 * count_accept_time / nullif(count_ticket_id, 0), 2) as accept_rate_pct " +
    "from ( " +
    "select " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end as party_name, " +
    "count(cm.keycode) as count_ticket_id, " +
    "sum(case when cm.dispatch_time is not null then 1 else 0 end) as count_dispatch_time, " +
    "sum(case when cm.accept_time is not null then 1 else 0 end) as count_accept_time " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true }) +
    " group by " +
    "case " +
    "when cc.contractor_name = 'Telkom Akses' then 'Telkom Akses' " +
    "when cc.contractor_name = 'Persada' then 'Persada' " +
    "when cc.contractor_name = 'Mandau' then 'Mandau' " +
    "else null " +
    "end " +
    ") t " +
    "order by party_name";

fmeManagementTql =
    "select " +
    "fullname, " +
    "party_name, " +
    "count_ticket_id, " +
    "count_accept_time, " +
    "count_dispatch_time, " +
    "round(100.0 * count_accept_time / nullif(count_ticket_id, 0), 2) as accept_rate_pct " +
    "from ( " +
    "select " +
    "fs.fullname as fullname, " +
    "cc.contractor_name as party_name, " +
    "count(cm.keycode) as count_ticket_id, " +
    "sum(case when cm.dispatch_time is not null then 1 else 0 end) as count_dispatch_time, " +
    "sum(case when cm.accept_time is not null then 1 else 0 end) as count_accept_time " +
    "from " + modelUri + " cm " +
    "left join " + fmeScheduleUri + " fs " +
    "on fs.username = cm.assign_to_fme " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    buildWhereClause({ activeOnly: true }) +
    " group by " +
    "fs.fullname, " +
    "cc.contractor_name " +
    ") t " +
    "order by fullname";

fmeStatusTql =
    "select " +
    "fs.fullname as fullname, " +
    "fs.username as username, " +
    "fs.fme_status as status, " +
    "cc.contractor_name as party_name, " +
    "fo.id as fm_office_id, " +
    "fo.fm_office_name as fm_office_name " +
    "from " + fmeScheduleUri + " fs " +
    "left join " + cmdbContractorUri + " cc " +
    "on cc.id = fs.contractor " +
    "left join " + fmOfficeUri + " fo " +
    "on fo.id = fs.default_fm_office " +
    "where 1 = 1 " +
    (party !== "" ? "and cc.contractor_name = $!party " : "") +
    "and cc.contractor_name in ('Telkom Akses','Persada','Mandau') " +
    (fmOffice !== "" ? "and fo.id = $!fm_office " : "");

try {
    try {
        summaryRows = queryByTql(summaryTql, parameters, 0, 10);
    } catch (e) {
        throw new Error("summaryTql failed: " + e.message);
    }
    try {
        faultRows = queryByTql(faultTypeTql, parameters, 0, 100);
    } catch (e) {
        throw new Error("faultTypeTql failed: " + e.message);
    }
    try {
        rootRows = queryByTql(rootCauseTql, parameters, 0, 20);
    } catch (e) {
        throw new Error("rootCauseTql failed: " + e.message);
    }
    try {
        phaseRows = queryByTql(phaseStatusTql, parameters, 0, 100);
    } catch (e) {
        throw new Error("phaseStatusTql failed: " + e.message);
    }
    try {
        regionRows = queryByTql(regionSummaryTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("regionSummaryTql failed: " + e.message);
    }
    try {
        weeklyRows = queryByTql(weeklyTrendTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("weeklyTrendTql failed: " + e.message);
    }
    try {
        regionOptionRows = queryByTql(
            regionOptionsTql,
            { start_time: startTime, end_time: endTime },
            0,
            500
        );
    } catch (e) {
        throw new Error("regionOptionsTql failed: " + e.message);
    }
    try {
        partyOptionRows = queryByTql(
            partyOptionsTql,
            { start_time: startTime, end_time: endTime, region: region },
            0,
            100
        );
    } catch (e) {
        throw new Error("partyOptionsTql failed: " + e.message);
    }
    try {
        fmOfficeOptionRows = queryByTql(
            fmOfficeOptionsTql,
            {
                party: party
            },
            0,
            500
        );
    } catch (e) {
        throw new Error("fmOfficeOptionsTql failed: " + e.message);
    }
    try {
        dataGridTotalRows = queryByTql(dataGridTotalTql, parameters, 0, 1);
    } catch (e) {
        throw new Error("dataGridTotalTql failed: " + e.message);
    }
    try {
        alldataGridRows = queryByTql(alldataGridTql, parameters, dataStart, dataLimit);
    } catch (e) {
        throw new Error("alldataGridTql failed: " + e.message);
    }
    try {
        fmeManagementRows = queryByTql(fmeManagementTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("fmeManagementTql failed: " + e.message);
    }
    try {
        fmeStatusRows = queryByTql(fmeStatusTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("fmeStatusTql failed: " + e.message);
    }
    try {
        acceptRateDailyRows = queryByTql(acceptRateDailyTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("acceptRateDailyTql failed: " + e.message);
    }
    try {
        acceptRateWeeklyRows = queryByTql(acceptRateWeeklyTql, parameters, 0, 500);
    } catch (e) {
        throw new Error("acceptRateWeeklyTql failed: " + e.message);
    }
    try {
        acceptRatePartyAllTimeRows = queryByTql(acceptRatePartyAllTimeTql, parameters, 0, 100);
    } catch (e) {
        throw new Error("acceptRatePartyAllTimeTql failed: " + e.message);
    }
} catch (error) {
    throw new ScriptError(
        "Failed to query Corrective Maintenance dashboard data: " + error.message
    );
}

summaryRow = {};
if (summaryRows && summaryRows.length > 0) {
    summaryRow = summaryRows[0];
}
summary = {
    total: toNumber(summaryRow.total),
    open: toNumber(summaryRow.open),
    pending: toNumber(summaryRow.pending),
    closed: toNumber(summaryRow.closed)
};

dataGridTotalRow = {};
if (dataGridTotalRows && dataGridTotalRows.length > 0) {
    dataGridTotalRow = dataGridTotalRows[0];
}
dataGridTotal = toNumber(dataGridTotalRow.total);

for (i = 0; faultRows && i < faultRows.length; i++) {
    row = faultRows[i];
    addNameValue(faultType, row.name, row.value);
}

for (i = 0; rootRows && i < rootRows.length; i++) {
    row = rootRows[i];
    addNameValue(rootCause, row.name, row.value);
}
rootCause.sort(function (a, b) {
    return b.value - a.value;
});
if (rootCause.length > 10) {
    rootCause = rootCause.slice(0, 10);
}

for (i = 0; phaseRows && i < phaseRows.length; i++) {
    addPhaseRow(phaseWorking, phaseRows[i]);
}
phaseStatus = finalizePhaseRows(phaseWorking);
phaseStatus.sort(function (a, b) {
    return b.total - a.total;
});

for (i = 0; regionRows && i < regionRows.length; i++) {
    addRegionRow(regionSummary, regionRows[i]);
}
regionSummary.sort(function (a, b) {
    return b.total - a.total;
});

for (i = 0; weeklyRows && i < weeklyRows.length; i++) {
    row = weeklyRows[i];

    if (row.create_date !== null && typeof row.create_date !== "undefined") {
        var createDate = formatKeycodeDate(row.create_date);
        var weekStart = getWeekStartThursday(createDate);
        var exists = false;

        for (var j = 0; j < weeklyTrend.length; j++) {
            if (weeklyTrend[j].week_key === weekStart) {
                weeklyTrend[j].new_cm += toNumber(row.new_cm);
                weeklyTrend[j].pending_cm += toNumber(row.pending_cm);
                weeklyTrend[j].closed_cm += toNumber(row.closed_cm);
                exists = true;
                break;
            }
        }

        if (!exists) {
            weeklyTrend.push({
                week_key: weekStart,
                week_label: formatWeeklyRange(weekStart),
                new_cm: toNumber(row.new_cm),
                pending_cm: toNumber(row.pending_cm),
                closed_cm: toNumber(row.closed_cm)
            });
        }
    }
}

weeklyTrend.sort(function (a, b) {
    return a.week_key.localeCompare(b.week_key);
});

for (i = 0; acceptRateDailyRows && i < acceptRateDailyRows.length; i++) {
    row = acceptRateDailyRows[i];
    acceptRateDaily.push({
        ticket_date: formatKeycodeDate(row.ticket_date),
        party_name: normalizeText(row.party_name),
        count_ticket_id: toNumber(row.count_ticket_id),
        count_dispatch_time: toNumber(row.count_dispatch_time),
        count_accept_time: toNumber(row.count_accept_time),
        count_close_time: toNumber(row.count_close_time),
        accept_rate_pct: toNumber(row.accept_rate_pct)
    });
}

for (i = 0; acceptRateWeeklyRows && i < acceptRateWeeklyRows.length; i++) {
    row = acceptRateWeeklyRows[i];

    if (row.create_date !== null && typeof row.create_date !== "undefined") {

        var createDate = formatKeycodeDate(row.create_date);
        var weekStart = getWeekStartThursday(createDate);
        var found = false;

        for (var j = 0; j < acceptRateWeekly.length; j++) {
            if (acceptRateWeekly[j].week_key === weekStart &&
                acceptRateWeekly[j].party_name === normalizeText(row.party_name)) {

                acceptRateWeekly[j].count_ticket_id += toNumber(row.count_ticket_id);
                acceptRateWeekly[j].count_dispatch_time += toNumber(row.count_dispatch_time);
                acceptRateWeekly[j].count_accept_time += toNumber(row.count_accept_time);
                acceptRateWeekly[j].count_close_time += toNumber(row.count_close_time);

                acceptRateWeekly[j].accept_rate_pct =
                    acceptRateWeekly[j].count_ticket_id > 0
                        ? (acceptRateWeekly[j].count_accept_time /
                            acceptRateWeekly[j].count_ticket_id * 100)
                        : 0;

                found = true;
                break;
            }
        }

        if (!found) {
            var dispatchCount = toNumber(row.count_dispatch_time);
            var acceptCount = toNumber(row.count_accept_time);
            var ticketCount = toNumber(row.count_ticket_id);

            acceptRateWeekly.push({
                week_key: weekStart,
                week_start: weekStart,
                week_label: formatWeeklyRange(weekStart),
                party_name: normalizeText(row.party_name),
                count_ticket_id: ticketCount,
                count_dispatch_time: dispatchCount,
                count_accept_time: acceptCount,
                count_close_time: toNumber(row.count_close_time),
                accept_rate_pct: ticketCount > 0
                    ? (acceptCount / ticketCount * 100)
                    : 0
            });
        }
    }
}

acceptRateWeekly.sort(function (a, b) {
    return a.week_key.localeCompare(b.week_key);
});

for (i = 0; acceptRatePartyAllTimeRows && i < acceptRatePartyAllTimeRows.length; i++) {
    row = acceptRatePartyAllTimeRows[i];

    acceptRatePartyAllTime.push({
        party_name: normalizeText(row.party_name),
        count_ticket_id: toNumber(row.count_ticket_id),
        count_dispatch_time: toNumber(row.count_dispatch_time),
        count_accept_time: toNumber(row.count_accept_time),
        accept_rate_pct: toNumber(row.accept_rate_pct)
    });
}

for (i = 0; fmeManagementRows && i < fmeManagementRows.length; i++) {
    row = fmeManagementRows[i];
    fmeManagement.push({
        fullname: normalizeText(row.fullname),
        party_name: normalizeText(row.party_name),
        count_ticket_id: toNumber(row.count_ticket_id),
        count_dispatch_time: toNumber(row.count_dispatch_time),
        count_accept_time: toNumber(row.count_accept_time),
        accept_rate_pct: toNumber(row.accept_rate_pct)
    });
}

fmeManagement.sort(function (a, b) {
    return b.accept_rate_pct - a.accept_rate_pct;
});

for (i = 0; fmeStatusRows && i < fmeStatusRows.length; i++) {
    row = fmeStatusRows[i];

    fmeStatus.push({
        fullname: normalizeText(row.fullname),
        username: normalizeText(row.username),
        status: normalizeText(row.status),
        party_name: normalizeText(row.party_name),
        fm_office_id: normalizeText(row.fm_office_id),
        fm_office_name: normalizeText(row.fm_office_name)
    });
}

for (i = 0; regionOptionRows && i < regionOptionRows.length; i++) {
    addUniqueString(regionOptions, regionOptionRows[i].region);
}
regionOptions.sort();

for (i = 0; partyOptionRows && i < partyOptionRows.length; i++) {
    addUniqueString(partyOptions, partyOptionRows[i].party_name);
}
partyOptions.sort();

for (i = 0; fmOfficeOptionRows && i < fmOfficeOptionRows.length; i++) {
    row = fmOfficeOptionRows[i];

    fmOfficeOptions.push({
        id: normalizeText(row.fm_office_id),
        name: normalizeText(row.fm_office_name)
    });
}

return {
    result: {
        success: true,
        message: "Corrective Maintenance dashboard data successfully loaded.",
        applied_filters: {
            start_date: startDate,
            end_date: endDate,
            region: region,
            party: party,
            fm_office: fmOffice
        },
        summary: summary,
        charts: {
            fault_type: faultType,
            root_cause: rootCause,
            phase_status: phaseStatus,
            region_summary: regionSummary,
            weekly_trend: weeklyTrend,
            accept_rate_daily: acceptRateDaily,
            accept_rate_weekly: acceptRateWeekly,
            accept_rate_party_all_time: acceptRatePartyAllTime
        },
        fme_management: {
            rows: fmeManagement
        },
        fme_status: {
            rows: fmeStatus
        },
        filters: {
            regions: regionOptions,
            parties: partyOptions,
            fm_offices: fmOfficeOptions
        },
        data_grid: {
            start: dataStart,
            limit: dataLimit,
            total: dataGridTotal,
            rows: alldataGridRows
        }
    }
};