window.cmDashboardState = {
    allTickets: [],
    filtered: [],
    ticketSummary: {},
};

window.cmTicketsPagination = {
    tickets: [],
    currentPage: 1,
    pageSize: 10
};

window.cmAcceptRateState = {
    daily: [],
    weekly: [],
    mode: 'daily',
    isFiltered: false,
    selectedDate: ''
};

window.cmFmeUsersState = {
    rows: [],
    filtered: [],
    currentPage: 1,
    pageSize: 10,
    partySummary: []
};

window.cmFmeStatusState = {
    rows: [],
    summary: {
        total: 0,
        idle: 0,
        busy: 0,
        offline: 0,
        available: 0,
        availability: 0
    },
    byParty: []
};

window.cmFmeDetailState = {
    party: '',
    rows: []
};

window.cmChartDateDrilldown = {
    activeDate: '',
    previousStart: '',
    previousEnd: ''
};

window.cmFmePartyExpandState = {};

window.cmSnapshotMode = 'd1';

var CM_PARTY_ORDER = ['Telkom Akses', 'Persada', 'Mandau'];

function getTicketParty(item) {
    if (!item) return '';
    var party = String(item.party_name || '').trim();
    if (CM_PARTY_ORDER.indexOf(party) === -1) return '';
    return party;
}

function getTicketRegion(item) {
    if (!item) return 'Unknown';
    var region = item.region_name || item.fm_office || '';
    region = String(region).trim();
    return region || 'Unknown';
}

function getCmTicketStatus(item) {
    if (!item) return 'Open';
    var phase = String(item.current_phase || '').toLowerCase();
    if (phase === 'close') return 'Closed';
    if (item.complete_time || item.depart_time || item.arrive_time || item.dispatch_time || item.accept_time) return 'Pending';
    return 'Open';
}

function buildFmeStatusSummary(rows) {
    var result = {
        total: 0,
        idle: 0,
        busy: 0,
        offline: 0,
        available: 0,
        availability: 0
    };

    if (!rows || rows.length === 0) {
        return result;
    }

    result.total = rows.length;

    rows.forEach(function (row) {
        var status = String(row.status || '').toLowerCase();

        if (status === 'idle' || status === 'waiting_depart') {
            result.idle++;
        } else if (
            status === 'busy' ||
            status === 'on_site' ||
            status === 'on_way'
        ) {
            result.busy++;
        } else if (status === 'offline') {
            result.offline++;
        }
    });

    result.available = result.idle + result.busy;

    result.availability = result.total > 0
        ? (result.available / result.total * 100)
        : 0;

    return result;
}

function buildFmeStatusByParty(rows) {

    var result = {};

    CM_PARTY_ORDER.forEach(function (party) {
        result[party] = {
            party: party,
            total: 0,
            idle: 0,
            busy: 0,
            offline: 0,
            availability: 0
        };
    });

    rows.forEach(function (row) {

        var party = row.party_name;

        if (!result[party]) {
            return;
        }

        result[party].total++;

        var status = String(row.status || '').toLowerCase();

        if (status === 'idle' || status === 'waiting_depart') {
            result[party].idle++;
        } else if (
            status === 'busy' ||
            status === 'on_site' ||
            status === 'on_way'
        ) {
            result[party].busy++;
        } else if (status === 'offline') {
            result[party].offline++;
        }
    });

    Object.keys(result).forEach(function (party) {

        var item = result[party];

        item.availability = item.total > 0
            ? ((item.idle + item.busy) / item.total * 100)
            : 0;

    });

    return CM_PARTY_ORDER.map(function (party) {
        return result[party];
    });
}

function calculateCmAgingDays(createTimeStr, completeTimeStr, lastUpdateTimeStr, currentPhase) {
    if (!createTimeStr || typeof createTimeStr !== 'string') return 0;
    var start = new Date(createTimeStr.replace(/-/g, '/'));
    var end = new Date();

    var phaseLower = String(currentPhase || '').toLowerCase();
    if (phaseLower === 'close') {
        var endStr = completeTimeStr || lastUpdateTimeStr;
        if (endStr && typeof endStr === 'string') {
            end = new Date(endStr.replace(/-/g, '/'));
        }
    }

    var diffMs = end - start;
    if (isNaN(diffMs) || diffMs < 0) return 0;
    return diffMs / (1000 * 60 * 60 * 24);
}

function loadCmTickets() {
    var container = document.querySelector('#cmTicketContainer');
    if (container) {
        container.innerHTML = '';
        var loadingDiv = document.createElement('div');
        loadingDiv.style.color = '#6c757d';
        loadingDiv.style.padding = '12px';
        loadingDiv.textContent = 'Memuat data real dari server...';
        container.appendChild(loadingDiv);
    }

    var defaultRange = getCmDefaultDateRange();

    var requestData = {
        "start_date": defaultRange.start,
        "end_date": defaultRange.end,
        "start": 0,
        "limit": 10000
    };

    if (typeof MessageProcessor !== 'undefined') {
        MessageProcessor.process({
            serviceId: '/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get',
            data: requestData,
            success: function (res) {
                console.log('FULL RESPONSE', res);
                console.log('FILTERS', res && res.result && res.result.filters);

                parseAndRenderCm(res);
            },
            error: function (err) {
                showCmError('Gagal memuat data: ' + (err.message || 'Error Service'));
            }
        });
    } else {
        showCmError('MessageProcessor OWS tidak ditemukan di browser context.');
    }
}

function parseAndRenderCm(res) {
    try {
        var rawTickets = [];
        if (res && res.result && res.result._values) rawTickets = res.result._values;
        else if (res && res.result && res.result.results) rawTickets = res.result.results;
        else if (res && res.results) rawTickets = res.results;
        else if (res && res._values) rawTickets = res._values;
        else if (res && res.data) rawTickets = res.data;
        else if (Array.isArray(res)) rawTickets = res;

        window.cmDashboardState.allTickets = rawTickets;

        if (res && res.result) {

            var charts = res.result.charts || {};

            window.cmAcceptRateState.daily =
                charts.accept_rate_daily || [];

            window.cmAcceptRateState.weekly =
                charts.accept_rate_weekly || [];

            window.cmFmeUsersState.rows =
                (res.result.fme_management || {}).rows || [];

            window.cmFmeUsersState.partySummary =
                buildCmFmePartySummary(
                    window.cmFmeUsersState.rows
                );

            window.cmFmeStatusState.rows =
                (res.result.fme_status || {}).rows || [];

            window.cmFmeStatusState.summary =
                buildFmeStatusSummary(window.cmFmeStatusState.rows);

            window.cmFmeStatusState.byParty =
                buildFmeStatusByParty(window.cmFmeStatusState.rows);

            window.cmAcceptRateState.allTime =
                charts.accept_rate_party_all_time || [];
        }

        var regions = [];

        if (
            res &&
            res.result &&
            res.result.filters &&
            res.result.filters.regions
        ) {
            regions = res.result.filters.regions;
        }

        populateCmRegionFilterOptions(regions);

        applyCmFilters(true);

    } catch (e) {
        showCmError('[parseAndRenderCm ERROR]: ' + e.message);
        console.error('[CRITICAL] parseAndRenderCm crashed:', e);
    }
}

function populateCmRegionFilterOptions(regionList) {

    var select = document.querySelector('.cm-filter-region-input');

    if (!select) {
        return;
    }

    regionList = regionList || [];

    var currentValue = select.value || 'ALL';

    var html = '<option value="ALL">All Region</option>';

    regionList.forEach(function (r) {
        html += '<option value="' + r + '">' + r + '</option>';
    });

    select.innerHTML = html;

    var hasValue = regionList.indexOf(currentValue) !== -1;

    select.value = hasValue
        ? currentValue
        : 'ALL';
}

function populateCmPartyFilterOptions() {
    var select = document.querySelector('.cm-filter-party-input');
    if (!select) return;
    var html = '<option value="ALL">All Party</option>';
    CM_PARTY_ORDER.forEach(function (p) {
        html += '<option value="' + p + '">' + p + '</option>';
    });
    select.innerHTML = html;
}

function applyCmFilters(isReset) {
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');
    var regionEl = document.querySelector('.cm-filter-region-input');
    var partyEl = document.querySelector('.cm-filter-party-input');
    var startInput = startEl ? startEl.value : '';
    var endInput = endEl ? endEl.value : '';
    var regionInput = regionEl ? regionEl.value : 'ALL';
    var partyInput = partyEl ? partyEl.value : 'ALL';

    if ((startInput && !endInput) || (!startInput && endInput)) {
        alert('Please select both Start Date and End Date to filter by date range.');
        return;
    }

    var allTickets = window.cmDashboardState.allTickets || [];
    var filtered = allTickets;

    if (startInput && endInput) {
        var startDateObj = new Date(startInput);
        var endDateObj = new Date(endInput);
        if (startDateObj > endDateObj) {
            alert('Start Date cannot be later than End Date.');
            return;
        }
        var startMs = new Date((startInput + ' 00:00:00').replace(/-/g, '/')).getTime();
        var endMs = new Date((endInput + ' 23:59:59').replace(/-/g, '/')).getTime();
        filtered = filtered.filter(function (t) {
            if (!t.createtime) return false;
            var tMs = new Date(t.createtime.replace(/-/g, '/')).getTime();
            return tMs >= startMs && tMs <= endMs;
        });
    }

    if (regionInput && regionInput !== 'ALL') {
        filtered = filtered.filter(function (t) {
            return getTicketRegion(t) === regionInput;
        });
    }

    if (partyInput && partyInput !== 'ALL') {
        filtered = filtered.filter(function (t) {
            return getTicketParty(t) === partyInput;
        });
    }

    window.cmDashboardState.filtered = filtered;

    var activeEl = document.querySelector('.cm-filter-active-range');
    if (activeEl) {
        var dateText = (startInput && endInput)
            ? (formatIndonesianDateCm(startInput) + ' - ' + formatIndonesianDateCm(endInput))
            : 'Today';
        var regionText = (regionInput === 'ALL') ? 'All Region' : regionInput;
        var partyText = (partyInput === 'ALL') ? 'All Party' : partyInput;
        activeEl.innerText = 'Active: ' + dateText + ' | Region: ' + regionText + ' | Party: ' + partyText;
    }

    window.cmAcceptRateState.selectedDate = '';

    if (isReset) {
        window.cmSnapshotMode = 'd1';
    } else {
        window.cmSnapshotMode = 'range';
    }

    renderCmSnapshotToggle();

    renderCmDashboard(filtered);
    loadCmAcceptRateData();
    loadCmFmeUsersData();
    renderCmTicketSummary();
}

function resetCmFilters() {
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');
    var regionEl = document.querySelector('.cm-filter-region-input');
    var partyEl = document.querySelector('.cm-filter-party-input');

    var defaultRange = getCmDefaultDateRange();

    if (startEl) startEl.value = defaultRange.start;
    if (endEl) endEl.value = defaultRange.end;
    if (regionEl) regionEl.value = 'ALL';
    if (partyEl) partyEl.value = 'ALL';

    var activeEl = document.querySelector('.cm-filter-active-range');
    if (activeEl) activeEl.innerText = 'Active: All Time | Region: All Region | Party: All Party';

    applyCmFilters(true);
}

function exportCmTickets() {
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');
    var regionEl = document.querySelector('.cm-filter-region-input');
    var partyEl = document.querySelector('.cm-filter-party-input');
    var button = document.getElementById('cmExportButton');
    var startDate = startEl ? startEl.value : '';
    var endDate = endEl ? endEl.value : '';
    var region = regionEl && regionEl.value !== 'ALL' ? regionEl.value : '';
    var party = partyEl && partyEl.value !== 'ALL' ? partyEl.value : '';

    function toXmlText(value) {
        var text = value === null || typeof value === 'undefined'
            ? ''
            : String(value);

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function resetButton() {
        if (button) {
            button.disabled = false;
            button.innerText = 'Export';
        }
    }

    function downloadExcel(tickets) {
        var rows = [];
        var xml;
        var blob;
        var url;
        var link;
        var fileName;
        var i;
        var j;
        var ticket;

        rows.push([
            'Ticket ID',
            'Create Time',
            'Dispatch Time',
            'Accept Time',
            'Assigned FME',
            'FME Party',
            'Title'
        ]);

        for (i = 0; i < tickets.length; i++) {
            ticket = tickets[i];
            rows.push([
                ticket.ticket_id || '',
                ticket.create_time || '',
                ticket.dispatch_time || '',
                ticket.accept_time || '',
                ticket.assign_to_fme || '',
                ticket.fme_party || '',
                ticket.title || ''
            ]);
        }

        xml = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<?mso-application progid="Excel.Sheet"?>' +
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
            'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +

            '<Styles>' +

            '<Style ss:ID="Default">' +
            '<Font ss:FontName="Calibri" ss:Size="11"/>' +
            '</Style>' +

            '<Style ss:ID="Header">' +
            '<Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>' +
            '<Interior ss:Color="#CCFFFF" ss:Pattern="Solid"/>' +
            '<Alignment ss:Horizontal="Center"/>' +
            '<Borders>' +
            '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '</Borders>' +
            '</Style>' +

            '<Style ss:ID="Data">' +
            '<Font ss:FontName="Calibri" ss:Size="11"/>' +
            '<Borders>' +
            '<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>' +
            '</Borders>' +
            '</Style>' +

            '</Styles>' +

            '<Worksheet ss:Name="cm_dashboard_export_sheet">' +
            '<Table>' +

            '<Column ss:Width="191"/>' +
            '<Column ss:Width="167"/>' +
            '<Column ss:Width="193"/>' +
            '<Column ss:Width="174"/>' +
            '<Column ss:Width="177"/>' +
            '<Column ss:Width="128"/>' +
            '<Column ss:Width="192"/>';

        for (i = 0; i < rows.length; i++) {
            xml += '<Row>';

            for (j = 0; j < rows[i].length; j++) {
                xml += '<Cell' + (i === 0 ? ' ss:StyleID="Header"' : '') +
                    '><Data ss:Type="String">' +
                    toXmlText(rows[i][j]) +
                    '</Data></Cell>';
            }

            xml += '</Row>';
        }

        xml += '</Table></Worksheet></Workbook>';
        fileName = 'CM_MatelineUtilization_Tickets_' + startDate + '_' + endDate + '.xls';
        blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        url = URL.createObjectURL(blob);
        link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(function () {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    }

    if (!startDate || !endDate) {
        alert('Please select both Start Date and End Date before exporting.');
        return;
    }

    if (startDate > endDate) {
        alert('Start Date cannot be later than End Date.');
        return;
    }

    if (typeof MessageProcessor === 'undefined') {
        alert('MessageProcessor OWS tidak ditemukan di browser context.');
        return;
    }

    if (button && button.disabled) {
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerText = 'Exporting...';
    }

    MessageProcessor.process({
        serviceId: '/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_export_get',
        data: {
            region: region,
            start_date: startDate,
            end_date: endDate,
            party: party
        },
        success: function (res) {
            var result = res && res.result ? res.result : null;
            var tickets = result && Array.isArray(result.rows) ? result.rows : [];

            resetButton();

            if (!result || result.success !== true) {
                alert('Failed to load ticket data for export.');
                return;
            }

            if (tickets.length === 0) {
                alert('No ticket data available for export.');
                return;
            }

            downloadExcel(tickets);
        },
        error: function () {
            resetButton();
            alert('Failed to load ticket data for export.');
        }
    });
}

function selectCmDashboardDate(date) {
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');
    var state = window.cmChartDateDrilldown;

    if (!date || !startEl || !endEl) {
        return;
    }

    if (state.activeDate === date) {
        startEl.value = state.previousStart;
        endEl.value = state.previousEnd;

        state.activeDate = '';
        state.previousStart = '';
        state.previousEnd = '';

        applyCmFilters(false);
        return;
    }

    if (!state.activeDate) {
        state.previousStart = startEl.value;
        state.previousEnd = endEl.value;
    }

    state.activeDate = date;

    startEl.value = date;
    endEl.value = date;

    applyCmFilters(false);
}

function renderCmDashboard(tickets) {
    updateCmStatCards(tickets);
    renderCmFmeStatusOverview();
    renderCmFmeKpiSummary();
    renderCmFmePartyTable();
    renderCmFaultTypeChart(tickets);
    renderCmRootCauseChart(tickets);
    renderCmPhaseOverviewTable(tickets);
    renderCmRegionSummaryTable(tickets);

    window.cmTicketsPagination.tickets = tickets || [];
    window.cmTicketsPagination.currentPage = 1;
    renderCmCurrentTicketsPage();

    renderCmTicketDistributionChart(tickets);

    renderCmWeeklyTicketTrend();
    renderCmWeeklyAchievementSummary();
    renderCmWeeklyPartyTrend();
}

function updateCmStatCards(tickets) {
    var open = 0, pending = 0, closed = 0;
    for (var i = 0; i < tickets.length; i++) {
        var st = getCmTicketStatus(tickets[i]);
        if (st === 'Open') open++;
        else if (st === 'Pending') pending++;
        else closed++;
    }
    setCmCardValue('cmStatTotal', tickets.length);
    setCmCardValue('cmStatOpen', open);
    setCmCardValue('cmStatPending', pending);
    setCmCardValue('cmStatClosed', closed);
}

function setCmCardValue(id, val) {
    var el = document.querySelector('#' + id);
    if (el) el.innerText = val;
}

function showCmError(msg) {
    var container = document.querySelector('#cmTicketContainer');
    if (container) {
        container.innerHTML = '';
        var errDiv = document.createElement('div');
        errDiv.style.color = '#dc3545';
        errDiv.style.padding = '12px';
        errDiv.textContent = msg;
        container.appendChild(errDiv);
    }
}

function renderCmFaultTypeChart(tickets) {
    if (typeof echarts === 'undefined') {
        setTimeout(function () { renderCmFaultTypeChart(tickets); }, 500);
        return;
    }
    var counts = {};
    tickets.forEach(function (t) {
        var val = String(t.fault_type || 'Unknown').trim() || 'Unknown';
        counts[val] = (counts[val] || 0) + 1;
    });
    drawCmDonut('cmChartFaultType', counts);
}

function renderCmTicketDistributionChart(tickets) {

    var container = document.getElementById('cmTicketDistributionContainer');

    if (!container) {
        return;
    }

    var rows = (window.cmAcceptRateState.daily || []).slice();

    var selectedDate = window.cmAcceptRateState.selectedDate;

    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');

    var startInput = startEl ? startEl.value : '';
    var endInput = endEl ? endEl.value : '';

    if (selectedDate) {

        rows = rows.filter(function (row) {
            return row.ticket_date === selectedDate;
        });

    } else if (window.cmSnapshotMode === 'd1') {

        var defaultRange = getCmDefaultDateRange();

        rows = rows.filter(function (row) {
            return row.ticket_date === defaultRange.end;
        });

    } else if (startInput && endInput) {

        rows = rows.filter(function (row) {
            return row.ticket_date >= startInput &&
                row.ticket_date <= endInput;
        });
    }

    var counts = {};
    var totalAccepted = 0;

    CM_PARTY_ORDER.forEach(function (party) {
        counts[party] = 0;
    });

    rows.forEach(function (row) {

        var party = row.party_name;

        if (!counts.hasOwnProperty(party)) {
            return;
        }

        counts[party] += Number(row.count_accept_time || 0);
        totalAccepted += Number(row.count_accept_time || 0);

    });

    container.innerHTML =
        '<div class="custom-container">' +
        '<div style="font-weight:600;margin-bottom:12px;">Accepted Ticket Distribution by Party</div>' +
        '<div id="cmTicketDistributionDonut" style="height:220px;width:100%;"></div>' +
        '</div>';

    if (totalAccepted === 0) {
        document.getElementById('cmTicketDistributionDonut').innerHTML =
            '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#8b949e;">' +
            'No accepted tickets found.' +
            '</div>';
        return;
    }

    drawCmDonut('cmTicketDistributionDonut', counts);
}

function renderCmAcceptanceGauge() {

    var container = document.getElementById(
        'cmAcceptanceGaugeContainer'
    );

    if (!container) {
        return;
    }

    if (typeof echarts === 'undefined') {
        setTimeout(function () {
            renderCmAcceptanceGauge();
        }, 500);
        return;
    }

    container.innerHTML =
        '<div class="custom-container">' +
        '<div style="font-weight:600;margin-bottom:12px;">Acceptance Rate</div>' +
        '<div id="cmAcceptanceGauge" style="height:220px;width:100%;"></div>' +
        '</div>';

    var dom = document.getElementById(
        'cmAcceptanceGauge'
    );

    var chart = echarts.getInstanceByDom(dom);

    if (chart) {
        chart.dispose();
    }

    chart = echarts.init(dom);

    var mode = window.cmAcceptRateState.mode || 'daily';

    var source =
        mode === 'weekly'
            ? window.cmAcceptRateState.weekly
            : window.cmAcceptRateState.daily;

    var totalDispatch = 0;
    var totalAccepted = 0;

    source.forEach(function (row) {
        totalDispatch += Number(row.count_dispatch_time || 0);
        totalAccepted += Number(row.count_accept_time || 0);
    });

    var rate = 0;

    if (totalDispatch > 0) {
        rate = (totalAccepted / totalDispatch) * 100;
    }

    chart.setOption({
        series: [{
            type: 'gauge',
            min: 0,
            max: 100,
            data: [{
                value: rate
            }]
        }]
    });
}

function renderCmRootCauseChart(tickets) {
    if (typeof echarts === 'undefined') {
        setTimeout(function () { renderCmRootCauseChart(tickets); }, 500);
        return;
    }
    var counts = {};
    tickets.forEach(function (t) {
        var val = String(t.root_cause || 'Unknown').trim() || 'Unknown';
        counts[val] = (counts[val] || 0) + 1;
    });
    drawCmHorizontalBar('cmChartRootCause', counts);
}

function renderCmWeeklyTicketTrend() {
    if (typeof echarts === 'undefined') {
        return;
    }

    var container = document.getElementById('cmWeeklyTrendContainer');
    if (!container) {
        return;
    }

    container.innerHTML =
        '<div class="custom-container">' +
        '<div style="font-weight:600;margin-bottom:12px;">Weekly Trend (Daily)</div>' +
        '<div id="cmWeeklyTicketTrendChart" style="min-height:320px;"></div>' +
        '</div>';

    var chartDom = document.getElementById('cmWeeklyTicketTrendChart');

    var weeklyRows = window.cmAcceptRateState.weekly || [];
    var agg = aggregateCmAcceptRateByBucket(weeklyRows, 'weekly');

    var chart = echarts.getInstanceByDom(chartDom);
    if (chart) {
        chart.dispose();
    }

    chart = echarts.init(chartDom);

    chart.setOption({
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: ['Dispatch', 'Accepted', 'Acceptance Rate']
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '8%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: agg.labels
        },
        yAxis: [
            {
                type: 'value',
                name: 'Ticket'
            },
            {
                type: 'value',
                name: '%',
                min: 0,
                max: 100
            }
        ],
        series: [
            {
                name: 'Dispatch',
                type: 'line',
                yAxisIndex: 0,
                data: agg.dispatchCounts
            },
            {
                name: 'Accepted',
                type: 'line',
                yAxisIndex: 0,
                data: agg.acceptCounts
            },
            {
                name: 'Acceptance Rate',
                type: 'line',
                yAxisIndex: 1,
                data: agg.ratePct
            }
        ]
    });
}

function renderCmWeeklyAchievementSummary() {

    var container = document.getElementById('cmWeeklyAchievementContainer');

    if (!container) {
        return;
    }

    var rows = (window.cmAcceptRateState.weekly || []).slice();
    var agg = aggregateCmAcceptRateByBucket(rows, 'weekly');

    var startIndex = Math.max(0, agg.labels.length - 6);
    var sourceRows = [];
    var displayRows = [];
    var i;

    for (i = startIndex; i < agg.labels.length; i++) {
        sourceRows.push({
            label: agg.labels[i],
            dispatch: agg.dispatchCounts[i],
            accept: agg.acceptCounts[i],
            rate: agg.ratePct[i]
        });
    }

    for (i = 0; i < sourceRows.length; i++) {
        displayRows.push({
            label: sourceRows[i].label,
            dispatch: sourceRows[i].dispatch,
            accept: sourceRows[i].accept,
            rate: sourceRows[i].rate,
            delta: i > 0
                ? sourceRows[i].rate - sourceRows[i - 1].rate
                : null
        });
    }

    if (displayRows.length > 5) {
        displayRows = displayRows.slice(displayRows.length - 5);
    }

    var html =
        '<div class="custom-container" style="height:320px;display:flex;flex-direction:column;">' +
        '<div style="font-weight:600;margin-bottom:12px;">Week to Week Achievement</div>' +
        '<table class="custom-noc-table" style="width:100%;flex:1;">' +
        '<thead>' +
        '<tr style="height:20%;">' +
        '<th>Week</th>' +
        '<th>Dispatch</th>' +
        '<th>Accepted</th>' +
        '<th>Acceptance Rate</th>' +
        '<th>vs Previous Week</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody style="height:100%;">';

    for (i = 0; i < displayRows.length; i++) {

        var current = displayRows[i];
        var deltaText = '-';
        var deltaClass = '';

        if (current.delta !== null) {
            if (current.delta > 0) {
                deltaText = '▲ ' + current.delta.toFixed(2) + '%';
                deltaClass = 'weekly-summary-up';
            } else if (current.delta < 0) {
                deltaText = '▼ ' + Math.abs(current.delta).toFixed(2) + '%';
                deltaClass = 'weekly-summary-down';
            } else {
                deltaText = '▲ 0.00%';
                deltaClass = 'weekly-summary-up';
            }
        }

        html +=
            '<tr>' +
            '<td>' + current.label + '</td>' +
            '<td>' + current.dispatch + '</td>' +
            '<td>' + current.accept + '</td>' +
            '<td>' + current.rate.toFixed(2) + '%</td>' +
            '<td class="' + deltaClass + '">' + deltaText + '</td>' +
            '</tr>';
    }

    html +=
        '</tbody>' +
        '</table>' +
        '</div>';

    container.innerHTML = html;
}

function renderCmWeeklyPartyTrend() {

    var wrapper = document.getElementById('cmWeeklyPartyTrendContainer');

    if (!wrapper) {
        return;
    }

    if (typeof echarts === 'undefined') {
        setTimeout(renderCmWeeklyPartyTrend, 500);
        return;
    }

    var rows = (window.cmAcceptRateState.weekly || []).slice();

    var partyMap = {};

    rows.forEach(function (item) {
        var party = getTicketParty(item);

        if (!partyMap[party]) {
            partyMap[party] = {
                accepted: 0,
                dispatch: 0
            };
        }

        partyMap[party].accepted += Number(item.accepted || 0);
        partyMap[party].dispatch += Number(item.dispatch || 0);
    });

    var labels = CM_PARTY_ORDER;

    var rates = labels.map(function (party) {
        var data = partyMap[party] || {
            accepted: 0,
            dispatch: 0
        };

        return data.dispatch > 0
            ? (data.accepted / data.dispatch) * 100
            : 0;
    });

    wrapper.innerHTML =
        '<div class="custom-container">' +
        '<div style="font-weight:600;margin-bottom:12px;">Parties Weekly Achievement (Acceptance Rate)</div>' +
        '<div id="cmWeeklyPartyTrendChart" style="width:100%;min-height:320px;"></div>' +
        '</div>';

    var chartDom = document.getElementById('cmWeeklyPartyTrendChart');

    var existing = echarts.getInstanceByDom(chartDom);

    if (existing) {
        existing.dispose();
    }

    var chart = echarts.init(chartDom);

    chart.setOption({
        tooltip: {
            trigger: 'axis',
            formatter: function (params) {
                if (!params || !params.length) return '';

                return params[0].axisValue +
                    '<br>Acceptance Rate: ' +
                    Number(params[0].value || 0).toFixed(2) + '%';
            }
        },

        legend: {
            data: ['Acceptance Rate'],
            bottom: 0
        },

        grid: {
            top: 35,
            left: 50,
            right: 30,
            bottom: 60,
            containLabel: true
        },

        xAxis: {
            type: 'category',
            boundaryGap: true,
            data: labels
        },

        yAxis: {
            type: 'value',
            name: 'Acceptance Rate',
            min: 0,
            max: 100,
            axisLabel: {
                formatter: '{value}%'
            }
        },

        series: [{
            name: 'Acceptance Rate',
            type: 'line',
            data: rates,
            smooth: false,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: {
                width: 3
            },
            areaStyle: {
                opacity: 0.12
            },
            label: {
                show: true,
                position: 'top',
                formatter: function (params) {
                    return Number(params.value || 0).toFixed(1) + '%';
                }
            }
        }]
    });
}

function drawCmDonut(containerId, counts) {

    var chartDom = document.querySelector('#' + containerId);

    if (!chartDom) return;

    var existing = echarts.getInstanceByDom(chartDom);

    if (existing) existing.dispose();

    var myChart = echarts.init(chartDom);

    var data = Object.keys(counts).map(function (k) {
        return { name: k, value: counts[k] };
    });

    var option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: {
            orient: 'vertical', right: 30, top: 'center',
            itemGap: 10,
            textStyle: { color: '#c9d1d9', fontSize: 13 }
        },
        series: [{
            type: 'pie',
            radius: ['48%', '70%'],
            center: ['28%', '50%'],
            label: { show: false },
            labelLine: { show: false },
            data: data
        }]
    };
    myChart.setOption(option);

    window.onresize = function () {
        myChart.resize();
    };
}

function drawCmHorizontalBar(containerId, counts) {
    var chartDom = document.querySelector('#' + containerId);
    if (!chartDom) return;
    var existing = echarts.getInstanceByDom(chartDom);
    if (existing) existing.dispose();
    var myChart = echarts.init(chartDom);

    var entries = Object.keys(counts).map(function (k) {
        return { name: k, value: counts[k] };
    }).sort(function (a, b) { return a.value - b.value; });

    var yAxisData = entries.map(function (e) { return e.name; });
    var seriesData = entries.map(function (e) { return e.value; });

    var option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { top: '5%', left: '3%', right: '15%', bottom: '5%', containLabel: true },
        xAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: '#30363d' } },
            axisLabel: { color: '#8b949e' },
            splitLine: { lineStyle: { color: '#30363d' } }
        },
        yAxis: {
            type: 'category', data: yAxisData,
            axisLine: { lineStyle: { color: '#30363d' } },
            axisLabel: { color: '#c9d1d9', fontSize: 10 }
        },
        series: [{
            type: 'bar',
            data: seriesData,
            itemStyle: { color: '#58a6ff', borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: 'right', color: '#c9d1d9', fontSize: 9 }
        }]
    };
    myChart.setOption(option);
}

function renderCmPhaseOverviewTable(tickets) {
    var wrapper = document.querySelector('#cmTablePhaseOverview');
    if (!wrapper) return;

    var rows = {};
    tickets.forEach(function (t) {
        if (getCmTicketStatus(t) === 'Closed') return;
        var phase = String(t.operate_phase || t.current_phase || 'Unknown').trim() || 'Unknown';
        if (!rows[phase]) {
            rows[phase] = { phase: phase, total: 0, b1: 0, b2: 0, b3: 0, b4: 0, agingSum: 0 };
        }
        var aging = calculateCmAgingDays(t.createtime, t.complete_time, t.lastupdatetime, t.current_phase);
        rows[phase].total++;
        rows[phase].agingSum += aging;
        if (aging > 21) rows[phase].b4++;
        else if (aging > 15) rows[phase].b3++;
        else if (aging > 7) rows[phase].b2++;
        else rows[phase].b1++;
    });

    var phaseList = Object.keys(rows).map(function (k) { return rows[k]; })
        .sort(function (a, b) { return b.total - a.total; });

    var html = '<table class="custom-phase-table">';
    html += '<thead><tr><th style="text-align:left;">Phase</th><th>0-7</th><th>8-15</th><th>16-21</th><th>&gt; 21</th><th>Total</th><th>Avg Aging (Days)</th></tr></thead><tbody>';

    var totalPT = 0, totalB1 = 0, totalB2 = 0, totalB3 = 0, totalB4 = 0, weightedSum = 0;
    phaseList.forEach(function (row) {
        var avg = row.total ? (row.agingSum / row.total) : 0;
        totalPT += row.total; totalB1 += row.b1; totalB2 += row.b2; totalB3 += row.b3; totalB4 += row.b4;
        weightedSum += row.agingSum;

        html += '<tr>';
        html += '<td class="custom-phase-name-col">' + row.phase + '</td>';
        html += '<td class="custom-heatmap-cell custom-heatmap-0-7">' + (row.b1 || '-') + '</td>';
        html += '<td class="custom-heatmap-cell custom-heatmap-8-15">' + (row.b2 || '-') + '</td>';
        html += '<td class="custom-heatmap-cell custom-heatmap-16-21">' + (row.b3 || '-') + '</td>';
        html += '<td class="custom-heatmap-cell custom-heatmap-sla">' + (row.b4 || '-') + '</td>';
        html += '<td class="custom-total-val">' + row.total + '</td>';
        html += '<td class="custom-avg-val">' + avg.toFixed(1) + '</td>';
        html += '</tr>';
    });

    var totalAvg = totalPT ? (weightedSum / totalPT).toFixed(1) : '0.0';
    html += '<tr class="custom-total-row">';
    html += '<td style="text-align:left;">TOTAL</td>';
    html += '<td class="custom-heatmap-cell custom-heatmap-0-7">' + (totalB1 || '-') + '</td>';
    html += '<td class="custom-heatmap-cell custom-heatmap-8-15">' + (totalB2 || '-') + '</td>';
    html += '<td class="custom-heatmap-cell custom-heatmap-16-21">' + (totalB3 || '-') + '</td>';
    html += '<td class="custom-heatmap-cell custom-heatmap-sla">' + (totalB4 || '-') + '</td>';
    html += '<td class="custom-total-val">' + totalPT + '</td>';
    html += '<td class="custom-avg-val">' + totalAvg + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    wrapper.innerHTML = html;
}

function renderCmRegionSummaryTable(tickets) {
    var wrapper = document.querySelector('#cmTableRegionSummary');
    if (!wrapper) return;

    var rows = {};
    tickets.forEach(function (t) {
        var region = getTicketRegion(t);
        if (!rows[region]) rows[region] = { region: region, total: 0, open: 0, pending: 0, closed: 0 };
        rows[region].total++;
        var st = getCmTicketStatus(t);
        if (st === 'Open') rows[region].open++;
        else if (st === 'Pending') rows[region].pending++;
        else rows[region].closed++;
    });

    var regionList = Object.keys(rows).map(function (k) { return rows[k]; })
        .sort(function (a, b) { return b.total - a.total; });

    var html = '<table class="custom-compliance-table">';
    html += '<thead><tr><th style="text-align:left;">Region</th><th>Total</th><th>Open</th><th>Pending</th><th>Closed</th></tr></thead><tbody>';

    var totalAll = 0, totalOpen = 0, totalPending = 0, totalClosed = 0;
    regionList.forEach(function (row) {
        totalAll += row.total; totalOpen += row.open; totalPending += row.pending; totalClosed += row.closed;
        html += '<tr>';
        html += '<td class="custom-party-name">' + row.region + '</td>';
        html += '<td>' + row.total + '</td>';
        html += '<td style="color:#ff7b72; font-weight:700;">' + row.open + '</td>';
        html += '<td style="color:#e3b341; font-weight:700;">' + row.pending + '</td>';
        html += '<td style="color:#56d364; font-weight:700;">' + row.closed + '</td>';
        html += '</tr>';
    });

    html += '<tr class="custom-total-row">';
    html += '<td style="text-align:left;">TOTAL</td>';
    html += '<td>' + totalAll + '</td>';
    html += '<td style="color:#ff7b72; font-weight:700;">' + totalOpen + '</td>';
    html += '<td style="color:#e3b341; font-weight:700;">' + totalPending + '</td>';
    html += '<td style="color:#56d364; font-weight:700;">' + totalClosed + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    wrapper.innerHTML = html;
}

function getWeekLabelCm(dateStr) {
    if (!dateStr) return null;
    var cleanDateStr = dateStr.replace(/\//g, '-');
    var parts = cleanDateStr.split(' ')[0].split('-');
    if (parts.length < 3) return null;
    var yr = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10) - 1;
    var dy = parseInt(parts[2], 10);
    var d = new Date(yr, mo, dy);
    if (isNaN(d.getTime())) return null;
    var dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return 'W' + weekNo;
}

function loadCmAcceptRateData() {
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');
    var regionEl = document.querySelector('.cm-filter-region-input');
    var partyEl = document.querySelector('.cm-filter-party-input');
    var startInput = startEl ? startEl.value : '';
    var endInput = endEl ? endEl.value : '';
    var regionInput = regionEl ? regionEl.value : 'ALL';
    var partyInput = partyEl ? partyEl.value : 'ALL';

    window.cmAcceptRateState.isFiltered = !!(startInput && endInput);

    var requestData = {
        start_date: startInput,
        end_date: endInput,
        region: regionInput,
        party: partyInput,
        start: 0,
        limit: 1
    };

    if (typeof MessageProcessor === 'undefined') return;

    console.log('Accept Rate Request', requestData);

    MessageProcessor.process({
        serviceId: '/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get',
        data: requestData,
        success: function (res) {
            var result = (res && res.result) ? res.result : res;
            var charts = (result && result.charts) ? result.charts : {};
            window.cmAcceptRateState.daily = charts.accept_rate_daily || [];
            window.cmAcceptRateState.weekly = charts.accept_rate_weekly || [];
            renderCmTicketSummary();
            renderCmAcceptRateSection();
        },
        error: function (err) {
            console.error('[CM Accept Rate] failed to load:', err);
        }
    });
}

function loadCmFmeUsersData(selectedDate) {

    var regionEl = document.querySelector('.cm-filter-region-input');
    var partyEl = document.querySelector('.cm-filter-party-input');
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');

    var partyInput = partyEl
        ? partyEl.value
        : 'ALL';

    var startDate = startEl ? startEl.value : '';
    var endDate = endEl ? endEl.value : '';

    if (!startDate && !endDate) {
        var defaultRange = getCmDefaultDateRange();
        startDate = defaultRange.start;
        endDate = defaultRange.end;
    }

    if (!selectedDate && window.cmSnapshotMode === 'd1') {
        var defaultRange = getCmDefaultDateRange();
        startDate = defaultRange.end;
        endDate = defaultRange.end;
    }

    var requestData = {
        region: regionEl ? regionEl.value : 'ALL',
        party: partyInput,
        start_date: selectedDate || startDate,
        end_date: selectedDate || endDate,
        start: 0,
        limit: 500
    };

    console.log('FME REQUEST', requestData);

    MessageProcessor.process({
        serviceId: '/adc-service/rest/v1/services/gde_dashboard/corrective_maintenance_dashboard/corrective_dashboard_summary_get',
        data: requestData,
        success: function (res) {

            var rows = [];

            if (
                res &&
                res.result &&
                res.result.fme_management &&
                res.result.fme_management.rows
            ) {
                rows = res.result.fme_management.rows;
            }

            window.cmFmeUsersState.rows = rows;

            window.cmFmeUsersState.partySummary =
                buildCmFmePartySummary(
                    window.cmFmeUsersState.rows
                );

            renderCmFmeUsersTable();
        },
        error: function (err) {
            console.error(err);
        }
    });
}

function getCmAcceptRateLatestBucketRows(rows, mode) {
    var latest = null;
    var i, key;
    for (i = 0; i < rows.length; i++) {
        key = mode === 'weekly' ? rows[i].week_key : rows[i].ticket_date;
        if (key === null || typeof key === 'undefined') continue;
        if (latest === null || key > latest) latest = key;
    }
    if (latest === null) return [];
    return rows.filter(function (r) {
        var k = mode === 'weekly' ? r.week_key : r.ticket_date;
        return k === latest;
    });
}

function renderCmAcceptRateCards() {
    var wrapper = document.querySelector('#cmAcceptRateCards');
    if (!wrapper) return;

    var state = window.cmAcceptRateState;
    var mode = state.mode;
    var rows = (state.daily || []).slice();
    var labelSuffix;

    var selectedDate = state.selectedDate;

    if (selectedDate) {

        rows = rows.filter(function (row) {
            return row.ticket_date === selectedDate;
        });

        labelSuffix = selectedDate;

    } else if (window.cmSnapshotMode === 'd1') {

        var defaultRange = getCmDefaultDateRange();

        rows = rows.filter(function (row) {
            return row.ticket_date === defaultRange.end;
        });

        labelSuffix = 'D-1';

    } else {

        var startEl = document.querySelector('.cm-filter-start-input');
        var endEl = document.querySelector('.cm-filter-end-input');

        var startInput = startEl ? startEl.value : '';
        var endInput = endEl ? endEl.value : '';

        rows = rows.filter(function (row) {
            return row.ticket_date >= startInput &&
                row.ticket_date <= endInput;
        });

        labelSuffix = mode === 'weekly'
            ? 'Selected Weeks'
            : 'Selected Days';
    }

    var byParty = {};

    CM_PARTY_ORDER.forEach(function (p) {
        byParty[p] = {
            count_ticket_id: 0,
            count_dispatch_time: 0,
            count_accept_time: 0
        };
    });

    rows.forEach(function (r) {
        if (!byParty[r.party_name]) return;

        byParty[r.party_name].count_ticket_id +=
            Number(r.count_ticket_id || 0);

        byParty[r.party_name].count_dispatch_time +=
            Number(r.count_dispatch_time || 0);

        byParty[r.party_name].count_accept_time +=
            Number(r.count_accept_time || 0);
    });

    var html = '';

    CM_PARTY_ORDER.forEach(function (party) {
        var d = byParty[party];

        var rate = d.count_ticket_id > 0
            ? (d.count_accept_time / d.count_ticket_id * 100)
            : 0;

        html += '<div class="custom-filter-card" style="flex:1; min-width:180px; margin-right:12px;">';
        html += '  <div style="font-size:12px; color:#8b949e; font-weight:600; text-transform:uppercase;">' + party + ' - ' + labelSuffix + '</div>';
        html += '  <div style="font-size:28px; font-weight:700; color:#58a6ff; margin-top:6px;">' + rate.toFixed(1) + '%</div>';
        html += '  <div style="font-size:12px; color:#8b949e; margin-top:4px;">' + d.count_accept_time + ' / ' + d.count_ticket_id + ' accepted</div>';
        html += '</div>';
    });

    wrapper.innerHTML = html;
}

function renderCmTicketSummary() {

    var container = document.getElementById('cmTicketSummaryContainer');

    if (!container) {
        return;
    }

    var source = (window.cmAcceptRateState.daily || []).slice();

    var selectedDate = window.cmAcceptRateState.selectedDate;

    if (selectedDate) {

        source = source.filter(function (row) {
            return row.ticket_date === selectedDate;
        });

    } else if (window.cmSnapshotMode === 'd1') {

        var defaultRange = getCmDefaultDateRange();

        source = source.filter(function (row) {
            return row.ticket_date === defaultRange.end;
        });

    } else {

        var startEl = document.querySelector('.cm-filter-start-input');
        var endEl = document.querySelector('.cm-filter-end-input');

        var startInput = startEl ? startEl.value : '';
        var endInput = endEl ? endEl.value : '';

        source = source.filter(function (row) {
            return row.ticket_date >= startInput &&
                row.ticket_date <= endInput;
        });
    }

    var totalTicket = 0;
    var totalAccepted = 0;

    source.forEach(function (row) {
        totalTicket += Number(row.count_ticket_id || 0);
        totalAccepted += Number(row.count_accept_time || 0);
    });

    var acceptRate = 0;

    if (totalTicket > 0) {
        acceptRate = (totalAccepted / totalTicket) * 100;
    }

    var progressWidth = acceptRate;

    if (progressWidth > 100) {
        progressWidth = 100;
    }

    container.innerHTML =
        '<div class="custom-container">' +
        '<div style="font-weight:600;margin-bottom:12px;">Ticket Summary</div>' +

        '<div style="display:flex;gap:10px;margin-bottom:12px;margin-inline:4px;">' +

        '<div style="flex:1;padding:12px;border-radius:8px;background:#d1eaff;">' +
        '<div style="margin-bottom:16px;font-weight:600;color:#0367c1;">Total Tickets</div>' +
        '<div style="font-size:28px;font-weight:bold;color:#0367c1;">' +
        totalTicket +
        '</div>' +
        '</div>' +

        '<div style="flex:1;padding:12px;border-radius:8px;background:#daf5e6;">' +
        '<div style="margin-bottom:16px;font-weight:600;color:#027039;">Total Accepted</div>' +
        '<div style="font-size:28px;font-weight:bold;color:#027039;">' +
        totalAccepted +
        '</div>' +
        '</div>' +

        '</div>' +

        '<div class="custom-container" style="margin-top:16px">' +
        '<div>Acceptance Rate</div>' +
        '<div style="font-size:28px;font-weight:bold;margin-bottom:8px">' +
        acceptRate.toFixed(1) +
        '%' +
        '</div>' +

        '<div style="height:10px;background:#1f2937;border-radius:999px;overflow:hidden;">' +
        '<div style="width:' + progressWidth + '%;height:100%;background:#3b82f6;border-radius:999px;"></div>' +
        '</div>' +
        '</div>' +
        '</div>';
}

function buildCmFmePartySummary(rows) {

    var result = {};

    CM_PARTY_ORDER.forEach(function (party) {
        result[party] = {
            party: party,
            totalFme: 0,
            ticketCount: 0,
            acceptedCount: 0,
            acceptRate: 0,
            fmes: []
        };
    });

    rows.forEach(function (row) {

        var party = row.party_name;

        if (!result[party]) {
            return;
        }

        result[party].totalFme++;

        result[party].ticketCount += Number(row.count_ticket_id || 0);

        result[party].acceptedCount += Number(row.count_accept_time || 0);

        result[party].fmes.push({
            fullname: row.fullname,
            ticketCount: Number(row.count_ticket_id || 0),
            acceptedCount: Number(row.count_accept_time || 0),
            acceptRate: Number(row.accept_rate_pct || 0)
        });

    });

    return CM_PARTY_ORDER.map(function (party) {

        var item = result[party];

        item.acceptRate = item.ticketCount > 0
            ? (item.acceptedCount / item.ticketCount) * 100
            : 0;

        return item;

    });
}

function renderCmFmeUsersTable() {
    var wrapper = document.getElementById('cmFmeUsersTable');

    if (!wrapper) {
        return;
    }

    var rows = window.cmFmeUsersState.partySummary || [];

    var html = '<div style="font-weight:600;margin-bottom:12px;">FME Ticket Acceptance Detail</div>';

    html += '<div class="custom-noc-table-wrapper">';
    html += '<table class="custom-noc-table">';

    html += '<thead>';
    html += '<tr>';
    html += '<th>FME Party</th>';
    html += '<th>Total FME</th>';
    html += '<th>Ticket Count</th>';
    html += '<th>Accepted Count</th>';
    html += '<th>Accept Rate (%)</th>';
    html += '</tr>';
    html += '</thead>';

    html += '<tbody>';

    rows.forEach(function (row) {

        var expanded =
            window.cmFmePartyExpandState[row.party] || false;

        html += '<tr>';

        html += '<td style="font-weight:bold;cursor:pointer;" onclick="toggleCmFmeParty(\'' + row.party + '\')">' +
            row.party +
            '</td>';

        html += '<td style="cursor:pointer;" onclick="toggleCmFmeParty(\'' + row.party + '\')">' +
            row.totalFme +
            '</td>';

        html += '<td>' + row.ticketCount + '</td>';

        html += '<td>' + row.acceptedCount + '</td>';

        html += '<td style="font-weight:bold;">' + row.acceptRate.toFixed(2) + '%</td>';

        html += '</tr>';

        if (expanded) {

            row.fmes.forEach(function (fme) {

                html += '<tr>';

                html += '<td style="padding-left:40px;color:#8b949e;">' +
                    (fme.fullname || '-') +
                    '</td>';

                html += '<td></td>';

                html += '<td>' +
                    fme.ticketCount +
                    '</td>';

                html += '<td>' +
                    fme.acceptedCount +
                    '</td>';

                html += '<td style="font-weight:bold;">' +
                    fme.acceptRate.toFixed(2) +
                    '%' +
                    '</td>';

                html += '</tr>';

            });

        }

    });

    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    wrapper.innerHTML = html;
}

function toggleCmSnapshotMode() {

    if (window.cmSnapshotMode === 'd1') {
        window.cmSnapshotMode = 'range';
    } else {
        window.cmSnapshotMode = 'd1';
    }

    renderCmSnapshotToggle();

    window.cmAcceptRateState.selectedDate = '';

    renderCmAcceptRateCards();
    renderCmTicketSummary();
    renderCmTicketDistributionChart();
    loadCmFmeUsersData();
}

function renderCmSnapshotToggle() {

    var container = document.getElementById('cmSnapshotToggle');

    if (!container) {
        return;
    }

    var isRange = window.cmSnapshotMode === 'range';

    container.innerHTML =
        '<div class="custom-snapshot-switch-wrapper">' +
        '<span class="custom-snapshot-switch-label">Use Date Range</span>' +
        '<label class="custom-snapshot-switch">' +
        '<input type="checkbox" ' +
        (isRange ? 'checked ' : '') +
        'onchange="toggleCmSnapshotMode()">' +
        '<span class="custom-snapshot-switch-slider"></span>' +
        '</label>' +
        '</div>';
}

function toggleCmFmeParty(party) {

    window.cmFmePartyExpandState[party] =
        !window.cmFmePartyExpandState[party];

    renderCmFmeUsersTable();
}

window.toggleCmFmeParty = toggleCmFmeParty;

function renderCmFmeStatusOverview() {

    var container = document.getElementById('cmFmeStatusOverview');

    if (!container) {
        return;
    }

    var summary = window.cmFmeStatusState.summary || {};

    var idlePct = summary.total > 0
        ? (summary.idle / summary.total * 100).toFixed(1)
        : 0;

    var busyPct = summary.total > 0
        ? (summary.busy / summary.total * 100).toFixed(1)
        : 0;

    var offlinePct = summary.total > 0
        ? (summary.offline / summary.total * 100).toFixed(1)
        : 0;

    container.innerHTML =
        '<div class="custom-container">' +

        '<div style="font-weight:600;margin-bottom:12px;">FME Status</div>' +

        '<div style="display:flex;gap:16px;height:100%;">' +

        '<div style="flex:1;min-height:72px;padding:16px;border-radius:10px;background:#d1f0d1;">' +
        '<div style="font-size:14px;color:#3d3d3d;margin-bottom:16px;">Idle</div>' +
        '<div style="font-size:32px;font-weight:700;color:#3d3d3d;">' +
        (summary.idle || 0) +
        '</div>' +
        '<div style="font-size:14px;color:#3d3d3d;margin-top:8px;">' +
        idlePct + '%' +
        '</div>' +
        '<div style="height:6px;background:#e5e7eb;border-radius:10px;margin-top:8px;">' +
        '<div style="width:' + idlePct + '%;height:100%;background:#10b981;border-radius:10px;"></div>' +
        '</div>' +
        '</div>' +

        '<div style="flex:1;min-height:72px;padding:16px;border-radius:10px;background:#f6c29c;">' +
        '<div style="font-size:14px;color:#3d3d3d;margin-bottom:16px;">Busy</div>' +
        '<div style="font-size:32px;font-weight:700;color:#3d3d3d;">' +
        (summary.busy || 0) +
        '</div>' +
        '<div style="font-size:14px;color:#3d3d3d;margin-top:8px;">' +
        busyPct + '%' +
        '</div>' +
        '<div style="height:6px;background:#e5e7eb;border-radius:10px;margin-top:8px;">' +
        '<div style="width:' + busyPct + '%;height:100%;background:#3d3d3d;border-radius:10px;"></div>' +
        '</div>' +
        '</div>' +

        '<div style="flex:1;min-height:72px;padding:16px;border-radius:10px;background:#f1f1f3;">' +
        '<div style="font-size:14px;color:#3d3d3d;margin-bottom:16px;">Offline</div>' +
        '<div style="font-size:32px;font-weight:700;color:#3d3d3d;">' +
        (summary.offline || 0) +
        '</div>' +
        '<div style="font-size:14px;color:#3d3d3d;margin-top:8px;">' +
        offlinePct + '%' +
        '</div>' +
        '<div style="height:6px;background:#e5e7eb;border-radius:10px;margin-top:8px;">' +
        '<div style="width:' + offlinePct + '%;height:100%;background:#5d5f6a;border-radius:10px;"></div>' +
        '</div>' +
        '</div>' +

        '</div>' +

        '</div>';
}

function renderCmFmeKpiSummary() {

    var container = document.getElementById('cmFmeKpiSummary');

    if (!container) {
        return;
    }

    var summary = window.cmFmeStatusState.summary || {};

    container.innerHTML =

        '<div class="custom-small-kpi-container" style="flex:1;">' +

        '<div style="font-size:12px;color:#666;">Total FME</div>' +
        '<div style="font-size:28px;font-weight:700;">' +
        (summary.total || 0) +
        '</div>' +

        '</div>' +

        '<div class="custom-small-kpi-container" style="flex:1;">' +

        '<div style="font-size:12px;color:#666;">Available FME</div>' +
        '<div style="font-size:28px;font-weight:700;">' +
        (summary.available || 0) +
        '</div>' +

        '</div>' +

        '<div class="custom-small-kpi-container" style="flex:1;">' +

        '<div style="font-size:12px;color:#666;">Busy Ratio</div>' +
        '<div style="font-size:28px;font-weight:700;">' +
        (
            summary.total > 0
                ? (summary.busy / summary.total * 100).toFixed(2)
                : 0
        ) +
        '%' +
        '</div>' +

        '</div>' +

        '<div class="custom-small-kpi-container" style="flex:1;">' +

        '<div style="font-size:12px;color:#666;">Availability</div>' +
        '<div style="font-size:28px;font-weight:700;">' +
        (summary.availability || 0).toFixed(2) +
        '%' +
        '</div>' +

        '</div>';
}

function renderCmFmePartyTable() {

    var container = document.getElementById('cmFmePartyTable');

    if (!container) {
        return;
    }

    var rows = window.cmFmeStatusState.byParty || [];

    var html =
        '<div class="custom-container" style="height:100%;">' +
        '<div style="font-weight:600;margin-bottom:12px;">FMEs by Party</div>' +

        '<table class="custom-noc-table">' +
        '<thead>' +
        '<tr>' +
        '<th>Party</th>' +
        '<th>Total FME</th>' +
        '<th>Idle</th>' +
        '<th>Busy</th>' +
        '<th>Offline</th>' +
        '<th>Availability</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>';

    var total = {
        total: 0,
        idle: 0,
        busy: 0,
        offline: 0
    };

    rows.forEach(function (row) {

        total.total += row.total;
        total.idle += row.idle;
        total.busy += row.busy;
        total.offline += row.offline;

        html +=
            '<tr>' +
            '<td style="font-weight:600;">' + row.party + '</td>' +
            '<td>' + row.total + '</td>' +
            '<td>' + row.idle + '</td>' +
            '<td>' + row.busy + '</td>' +
            '<td>' + row.offline + '</td>' +
            '<td style="font-weight:700;color:#56d364;">' +
            row.availability.toFixed(2) +
            '%' +
            '</td>' +
            '</tr>';

    });

    var totalAvailability =
        total.total > 0
            ? ((total.idle + total.busy) / total.total * 100)
            : 0;

    html +=
        '<tr class="custom-total-row">' +
        '<td style="font-weight:600;">Total</td>' +
        '<td style="font-weight:600;">' + total.total + '</td>' +
        '<td style="font-weight:600;">' + total.idle + '</td>' +
        '<td style="font-weight:600;">' + total.busy + '</td>' +
        '<td style="font-weight:600;">' + total.offline + '</td>' +
        '<td style="font-weight:600;">' + totalAvailability.toFixed(2) + '%</td>' +
        '</tr>';

    html +=
        '</tbody>' +
        '</table>' +
        '</div>';

    container.innerHTML = html;
}

function getCmChartDateRange() {

    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');

    var startInput = startEl ? startEl.value : '';
    var endInput = endEl ? endEl.value : '';

    if (startInput && endInput) {
        return {
            start: startInput,
            end: endInput
        };
    }

    return getCmDefaultDateRange();
}

function getCmTicketSummaryWeekRange() {
    var now = new Date();
    var day = now.getDay();
    var daysSinceThursday = (day - 4 + 7) % 7;

    var start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    start.setDate(start.getDate() - daysSinceThursday);

    var end = new Date(start);
    end.setDate(start.getDate() + 6);

    return {
        start: formatDateLocalCm(start),
        end: formatDateLocalCm(end)
    };
}

function aggregateCmAcceptRateByBucket(rows, forceMode, dateRange) {

    var mode = forceMode || window.cmAcceptRateState.mode;
    var map = {};
    var order = [];

    rows.forEach(function (r) {

        var key = mode === 'weekly' ? r.week_key : r.ticket_date;
        var label = mode === 'weekly' ? r.week_key : r.ticket_date;

        if (key === null || typeof key === 'undefined') return;

        if (!map[key]) {
            map[key] = {
                label: label,
                ticket: 0,
                dispatch: 0,
                accept: 0
            };
            order.push(key);
        }

        map[key].ticket += Number(r.count_ticket_id || 0);
        map[key].dispatch += Number(r.count_dispatch_time || 0);
        map[key].accept += Number(r.count_accept_time || 0);
    });

    if (mode === 'daily' && dateRange) {

        var current = new Date(dateRange.start.replace(/-/g, '/'));
        var end = new Date(dateRange.end.replace(/-/g, '/'));

        while (current <= end) {

            var key =
                current.getFullYear() +
                '-' +
                String(current.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(current.getDate()).padStart(2, '0');

            if (!map[key]) {
                map[key] = {
                    label: key,
                    ticket: 0,
                    dispatch: 0,
                    accept: 0
                };

                order.push(key);
            }

            current.setDate(current.getDate() + 1);
        }
    }

    order.sort(function (a, b) {
        return a > b ? 1 : -1;
    });

    var labels = [];
    var ticketCounts = [];
    var dispatchCounts = [];
    var acceptCounts = [];
    var ratePct = [];

    order.forEach(function (k) {

        var row = map[k];

        labels.push(row.label);
        ticketCounts.push(row.ticket);
        dispatchCounts.push(row.dispatch);
        acceptCounts.push(row.accept);

        ratePct.push(
            row.ticket > 0
                ? Number(((row.accept / row.ticket) * 100).toFixed(2))
                : 0
        );
    });

    return {
        labels: labels,
        ticketCounts: ticketCounts,
        dispatchCounts: dispatchCounts,
        acceptCounts: acceptCounts,
        ratePct: ratePct
    };
}

function aggregateCmDailyTrend(rows) {
    var map = {};
    var order = [];

    rows.forEach(function (row) {

        var key = row.ticket_date;

        if (!map[key]) {
            map[key] = {
                dispatch: 0,
                accept: 0,
                ticket: 0
            };
            order.push(key);
        }

        map[key].ticket += Number(row.count_ticket_id || 0);
        map[key].dispatch += Number(row.count_dispatch_time || 0);
        map[key].accept += Number(row.count_accept_time || 0);
    });

    order.sort();

    var result = {
        labels: [],
        dispatch: [],
        accepted: [],
        rate: []
    };

    order.forEach(function (date) {

        var data = map[date];

        result.labels.push(date);
        result.dispatch.push(data.dispatch);
        result.accepted.push(data.accept);

        result.rate.push(
            data.dispatch > 0
                ? Number(((data.accept / data.dispatch) * 100).toFixed(2))
                : 0
        );
    });

    return result;
}

function formatDateLocalCm(date) {
    return date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0');
}

function getCmDefaultDateRange() {

    var now = new Date();

    var start;
    var end;

    if (now.getDate() === 1) {

        start = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );

        end = new Date(
            now.getFullYear(),
            now.getMonth(),
            0
        );

    } else {

        start = new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        );

        end = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 1
        );

    }

    return {
        start: formatDateLocalCm(start),
        end: formatDateLocalCm(end)
    };
}

function renderCmAcceptRateTrendChart() {
    if (typeof echarts === 'undefined') {
        setTimeout(renderCmAcceptRateTrendChart, 500);
        return;
    }

    var chartDom = document.querySelector('#cmChartAcceptRateTrend');
    if (!chartDom) return;

    var rows = (window.cmAcceptRateState.daily || []).slice();
    var range = getCmChartDateRange();

    rows = rows.filter(function (row) {
        return row.ticket_date >= range.start &&
            row.ticket_date <= range.end;
    });

    var agg = aggregateCmAcceptRateByBucket(
        rows,
        'daily',
        range
    );

    renderCmAcceptRateTrendTable(agg);

    var existing = echarts.getInstanceByDom(chartDom);
    if (existing) existing.dispose();

    var myChart = echarts.init(chartDom);

    var option = {
        backgroundColor: 'transparent',

        title: {
            text: 'Mateline Utilization Trend',
            left: 'center',
            top: 6,
            textStyle: {
                color: '#c9d1d9',
                fontSize: 20,
                fontWeight: 700
            }
        },

        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },
            formatter: function (params) {
                var result = params[0].axisValue + '<br/>';

                params.forEach(function (item) {
                    var value = item.value;

                    if (item.seriesName === 'Accept Rate') {
                        value = value + '%';
                    }

                    result += item.marker + ' ' + item.seriesName + ' ';
                    result += '<span style="float:right; margin-left:20px;">' + value + '</span><br/>';
                });

                return result;
            }
        },

        legend: {
            data: ['Total Ticket', 'Accepted Tickets', 'Accept Rate'],
            textStyle: {
                color: '#c9d1d9',
                fontSize: 12
            },
            bottom: 36
        },

        grid: {
            top: 72,
            left: '3%',
            right: '4%',
            bottom: 84,
            containLabel: true
        },

        xAxis: [{
            type: 'category',
            data: agg.labels,
            axisLine: {
                lineStyle: {
                    color: '#30363d'
                }
            },
            axisLabel: {
                color: '#8b949e'
            }
        }],

        yAxis: [
            {
                type: 'value',
                name: 'Count',
                axisLine: {
                    lineStyle: {
                        color: '#30363d'
                    }
                },
                axisLabel: {
                    color: '#8b949e'
                },
                splitLine: {
                    lineStyle: {
                        color: '#30363d'
                    }
                }
            },
            {
                type: 'value',
                name: 'Accept Rate',
                min: 0,
                max: 100,
                axisLine: {
                    lineStyle: {
                        color: '#30363d'
                    }
                },
                axisLabel: {
                    color: '#8b949e',
                    formatter: '{value}%'
                },
                splitLine: {
                    show: false
                }
            }
        ],

        series: [
            {
                name: 'Total Ticket',
                type: 'bar',
                yAxisIndex: 0,
                data: agg.ticketCounts,
                itemStyle: {
                    color: '#58a6ff',
                    borderRadius: [4, 4, 0, 0]
                },
                barWidth: '25%',
                label: {
                    show: true,
                    position: 'top',
                    color: '#c9d1d9',
                    fontSize: 11,
                    formatter: function (params) {
                        return params.value;
                    }
                }
            },
            {
                name: 'Accepted Tickets',
                type: 'bar',
                yAxisIndex: 0,
                data: agg.acceptCounts,
                itemStyle: {
                    color: '#3fb950',
                    borderRadius: [4, 4, 0, 0]
                },
                barWidth: '25%',
                label: {
                    show: true,
                    position: 'top',
                    color: '#c9d1d9',
                    fontSize: 11,
                    formatter: function (params) {
                        return params.value;
                    }
                }
            },
            {
                name: 'Accept Rate',
                type: 'line',
                yAxisIndex: 1,
                data: agg.ratePct,
                smooth: true,
                symbol: 'circle',
                symbolSize: 5,
                itemStyle: {
                    color: '#f0883e'
                },
                lineStyle: {
                    width: 3,
                    color: '#f0883e'
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(
                        0, 0, 0, 1,
                        [
                            { offset: 0, color: 'rgba(240, 136, 62, 0.35)' },
                            { offset: 1, color: 'rgba(240, 136, 62, 0.03)' }
                        ]
                    )
                },
                label: {
                    show: true,
                    position: 'top',
                    color: '#f0883e',
                    fontSize: 11,
                    formatter: function (params) {
                        return Number(params.value || 0).toFixed(1) + '%';
                    }
                }
            }
        ],

        dataZoom: [
            {
                type: 'inside',
                xAxisIndex: 0,
                start: 0,
                end: 100
            },
            {
                type: 'slider',
                xAxisIndex: 0,
                start: 0,
                end: 100,
                height: 10,
                bottom: 8,
                borderColor: '#30363d',
                backgroundColor: '#0d1117',
                fillerColor: 'rgba(88,166,255,0.18)',
                handleStyle: {
                    color: '#58a6ff',
                    borderColor: '#58a6ff'
                },
                textStyle: {
                    color: '#8b949e'
                }
            }
        ]
    };

    myChart.setOption(option);

    myChart.on('click', function (params) {
        if (
            !params ||
            !params.name ||
            params.componentType !== 'series'
        ) {
            return;
        }

        selectCmDashboardDate(
            String(params.name)
        );
    });
}

function renderCmAcceptRateTrendTable(agg) {
    var container = document.getElementById('cmChartAcceptRateTrendTable');

    if (!container) {
        return;
    }

    var totalTickets = 0;
    var totalAccepted = 0;
    var totalAcceptRate = 0;

    agg.ticketCounts.forEach(function (value) {
        totalTickets += Number(value || 0);
    });

    agg.acceptCounts.forEach(function (value) {
        totalAccepted += Number(value || 0);
    });

    if (totalTickets > 0) {
        totalAcceptRate = (totalAccepted / totalTickets) * 100;
    }

    var html =
        '<div id="cmAcceptRateTrendTableScroll" class="custom-accept-rate-table-scroll">' +
        '<table class="custom-noc-table">' +
        '<thead>' +
        '<tr>' +
        '<th></th>';

    agg.labels.forEach(function (label) {
        html += '<th>' + label + '</th>';
    });

    html += '<th>Grand Total</th>';

    html += '</tr></thead><tbody>';

    html += '<tr>';
    html += '<td>Ticket Count</td>';

    agg.ticketCounts.forEach(function (value) {
        html += '<td>' + value + '</td>';
    });

    html += '<td style="font-weight:700;">' + totalTickets + '</td>';
    html += '</tr>';

    html += '<tr>';
    html += '<td>Accepted Count</td>';

    agg.acceptCounts.forEach(function (value) {
        html += '<td>' + value + '</td>';
    });

    html += '<td style="font-weight:700;">' + totalAccepted + '</td>';
    html += '</tr>';

    html += '<tr>';
    html += '<td>Accept Rate</td>';

    agg.ratePct.forEach(function (value) {
        html += '<td>' + value.toFixed(2) + '%</td>';
    });

    html += '<td style="font-weight:700;">' +
        totalAcceptRate.toFixed(2) +
        '%' +
        '</td>';

    html += '</tr>';

    html += '</tbody></table>';
    html += '</div>';

    container.innerHTML = html;

    var scrollContainer = document.getElementById(
        'cmAcceptRateTrendTableScroll'
    );

    if (scrollContainer) {
        scrollContainer.scrollLeft =
            scrollContainer.scrollWidth;
    }
}

function renderCmDailyAcceptRateStackedChart() {
    if (typeof echarts === 'undefined') {
        setTimeout(renderCmDailyAcceptRateStackedChart, 500);
        return;
    }

    var chartDom = document.querySelector('#cmChartDailyAcceptRateStacked');

    if (!chartDom) {
        return;
    }

    var rows = (window.cmAcceptRateState.daily || []).slice();
    var range = getCmChartDateRange();

    rows = rows.filter(function (row) {
        return row.ticket_date >= range.start &&
            row.ticket_date <= range.end;
    });

    var dateMap = {};
    var dateOrder = [];

    rows.forEach(function (row) {
        var date = row.ticket_date;
        var party = getTicketParty(row);

        if (!date || !party) {
            return;
        }

        if (!dateMap[date]) {
            dateMap[date] = {
                totalTicket: 0,
                totalAccepted: 0,
                parties: {}
            };

            CM_PARTY_ORDER.forEach(function (partyName) {
                dateMap[date].parties[partyName] = {
                    ticket: 0,
                    accepted: 0
                };
            });

            dateOrder.push(date);
        }

        dateMap[date].totalTicket +=
            Number(row.count_ticket_id || 0);

        dateMap[date].totalAccepted +=
            Number(row.count_accept_time || 0);

        dateMap[date].parties[party].ticket +=
            Number(row.count_ticket_id || 0);

        dateMap[date].parties[party].accepted +=
            Number(row.count_accept_time || 0);
    });

    var current = new Date(range.start.replace(/-/g, '/'));
    var end = new Date(range.end.replace(/-/g, '/'));

    while (current <= end) {
        var dateKey = formatDateLocalCm(current);

        if (!dateMap[dateKey]) {
            dateMap[dateKey] = {
                totalTicket: 0,
                totalAccepted: 0,
                parties: {}
            };

            CM_PARTY_ORDER.forEach(function (partyName) {
                dateMap[dateKey].parties[partyName] = {
                    ticket: 0,
                    accepted: 0
                };
            });

            dateOrder.push(dateKey);
        }

        current.setDate(current.getDate() + 1);
    }

    dateOrder.sort();

    var partySeriesData = {};
    var overallRates = [];

    CM_PARTY_ORDER.forEach(function (party) {
        partySeriesData[party] = [];
    });

    dateOrder.forEach(function (date) {
        var item = dateMap[date];

        CM_PARTY_ORDER.forEach(function (party) {
            var partyData = item.parties[party];

            var partyRate = partyData.ticket > 0
                ? (partyData.accepted / partyData.ticket) * 100
                : 0;

            partySeriesData[party].push(
                Number(partyRate.toFixed(2))
            );
        });

        overallRates.push(
            item.totalTicket > 0
                ? Number(
                    (
                        item.totalAccepted /
                        item.totalTicket *
                        100
                    ).toFixed(2)
                )
                : 0
        );
    });

    renderCmDailyAcceptRateTable(
        dateOrder,
        partySeriesData,
        overallRates,
        dateMap
    );

    var existing = echarts.getInstanceByDom(chartDom);

    if (existing) {
        existing.dispose();
    }

    var chart = echarts.init(chartDom);

    var partyColors = {
        'Telkom Akses': '#c8102e',
        'Persada': '#31b5c6',
        'Mandau': '#62b230'
    };

    var series = [];

    CM_PARTY_ORDER.forEach(function (party) {
        series.push({
            name: party,
            type: 'bar',
            data: partySeriesData[party],
            itemStyle: {
                color: partyColors[party],
                borderRadius: [4, 4, 0, 0]
            },
            emphasis: {
                focus: 'series'
            },
            barWidth: '25%',
            label: {
                show: true,
                position: 'top',
                color: '#c9d1d9',
                fontSize: 11,
                formatter: function (params) {
                    return params.value;
                }
            }
        });
    });

    series.push({
        name: 'Overall Accept Rate',
        type: 'line',
        data: overallRates,
        symbol: 'circle',
        symbolSize: 7,
        smooth: true,
        lineStyle: {
            width: 3,
            color: '#f0883e'
        },
        itemStyle: {
            color: '#f0883e'
        },
        areaStyle: {
            color: new echarts.graphic.LinearGradient(
                0, 0, 0, 1,
                [
                    { offset: 0, color: 'rgba(240, 136, 62, 0.35)' },
                    { offset: 1, color: 'rgba(240, 136, 62, 0.03)' }
                ]
            )
        },
        label: {
            show: true,
            position: 'top',
            color: '#f0883e',
            formatter: function (params) {
                return Number(params.value || 0).toFixed(2) + '%';
            }
        }
    });

    chart.setOption({
        backgroundColor: 'transparent',

        title: {
            text: 'Daily Accept Rate',
            left: 'center',
            top: 6,
            textStyle: {
                color: '#c9d1d9',
                fontSize: 20,
                fontWeight: 700
            }
        },

        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },
            formatter: function (params) {
                if (!params || !params.length) {
                    return '';
                }

                var date = params[0].axisValue;
                var item = dateMap[date];
                var result = date + '<br/>';

                CM_PARTY_ORDER.forEach(function (party) {
                    var partyData = item.parties[party];

                    var partyRate = partyData.ticket > 0
                        ? (
                            partyData.accepted /
                            partyData.ticket *
                            100
                        )
                        : 0;

                    result +=
                        party +
                        ': ' +
                        partyRate.toFixed(2) +
                        '%' +
                        '<br/>';
                });

                var overallRate = item.totalTicket > 0
                    ? (
                        item.totalAccepted /
                        item.totalTicket *
                        100
                    )
                    : 0;

                result +=
                    '<strong>Overall Accept Rate: ' +
                    overallRate.toFixed(2) +
                    '%</strong>';

                return result;
            }
        },

        legend: {
            data: [
                'Telkom Akses',
                'Persada',
                'Mandau',
                'Overall Accept Rate'
            ],
            textStyle: {
                color: '#c9d1d9',
                fontSize: 12
            },
            bottom: 32
        },

        grid: {
            top: 72,
            left: '3%',
            right: '4%',
            bottom: 84,
            containLabel: true
        },

        xAxis: {
            type: 'category',
            data: dateOrder,
            axisLine: {
                lineStyle: {
                    color: '#30363d'
                }
            },
            axisLabel: {
                color: '#8b949e'
            }
        },

        yAxis: {
            type: 'value',
            name: 'Accept Rate',
            min: 0,
            max: 100,
            axisLine: {
                lineStyle: {
                    color: '#30363d'
                }
            },
            axisLabel: {
                color: '#8b949e',
                formatter: '{value}%'
            },
            splitLine: {
                lineStyle: {
                    color: '#30363d'
                }
            }
        },

        dataZoom: [
            {
                type: 'inside',
                xAxisIndex: 0,
                start: 0,
                end: 100
            },
            {
                type: 'slider',
                xAxisIndex: 0,
                start: 0,
                end: 100,
                height: 10,
                bottom: 8,
                borderColor: '#30363d',
                backgroundColor: '#0d1117',
                fillerColor: 'rgba(88,166,255,0.18)',
                handleStyle: {
                    color: '#58a6ff',
                    borderColor: '#58a6ff'
                },
                textStyle: {
                    color: '#8b949e'
                }
            }
        ],

        series: series
    });

    chart.on('click', function (params) {
        if (
            !params ||
            !params.name ||
            params.componentType !== 'series'
        ) {
            return;
        }

        selectCmDashboardDate(
            String(params.name)
        );
    });
}

function renderCmDailyAcceptRateTable(
    dateOrder,
    partySeriesData,
    overallRates,
    dateMap
) {
    var container = document.getElementById(
        'cmDailyAcceptRateTable'
    );

    if (!container) {
        return;
    }

    var totalTickets = 0;
    var totalAccepted = 0;
    var partyTicketTotals = {};
    var partyAcceptedTotals = {};

    CM_PARTY_ORDER.forEach(function (party) {
        partyTicketTotals[party] = 0;
        partyAcceptedTotals[party] = 0;
    });

    dateOrder.forEach(function (date) {
        var item = dateMap[date];

        if (!item) {
            return;
        }

        totalTickets += Number(item.totalTicket || 0);
        totalAccepted += Number(item.totalAccepted || 0);

        CM_PARTY_ORDER.forEach(function (party) {
            partyTicketTotals[party] +=
                Number(item.parties[party].ticket || 0);

            partyAcceptedTotals[party] +=
                Number(item.parties[party].accepted || 0);
        });
    });

    var html =
        '<div id="cmDailyAcceptRateTableScroll" class="custom-accept-rate-table-scroll">' +
        '<table class="custom-noc-table">' +
        '<thead>' +
        '<tr>' +
        '<th></th>';

    dateOrder.forEach(function (date) {
        html += '<th>' + date + '</th>';
    });

    html += '<th>Grand Total</th>';

    html += '</tr></thead><tbody>';

    CM_PARTY_ORDER.forEach(function (party) {
        var partyGrandTotal = partyTicketTotals[party] > 0
            ? (
                partyAcceptedTotals[party] /
                partyTicketTotals[party] *
                100
            )
            : 0;

        html += '<tr>';
        html += '<td>' + party + '</td>';

        partySeriesData[party].forEach(function (value) {
            html += '<td>' +
                Number(value || 0).toFixed(2) +
                '%' +
                '</td>';
        });

        html +=
            '<td style="font-weight:700;">' +
            partyGrandTotal.toFixed(2) +
            '%' +
            '</td>';

        html += '</tr>';
    });

    var overallGrandTotal = totalTickets > 0
        ? (
            totalAccepted /
            totalTickets *
            100
        )
        : 0;

    html += '<tr style="font-weight:700;">';
    html += '<td>Overall Accept Rate</td>';

    overallRates.forEach(function (value) {
        html += '<td>' +
            Number(value || 0).toFixed(2) +
            '%' +
            '</td>';
    });

    html +=
        '<td style="font-weight:700;">' +
        overallGrandTotal.toFixed(2) +
        '%' +
        '</td>';

    html += '</tr>';

    html += '</tbody></table>';
    html += '</div>';

    container.innerHTML = html;

    var scrollContainer = document.getElementById(
        'cmDailyAcceptRateTableScroll'
    );

    if (scrollContainer) {
        scrollContainer.scrollLeft =
            scrollContainer.scrollWidth;
    }
}

function setCmAcceptRateMode(mode) {
    window.cmAcceptRateState.mode = mode;
    renderCmTicketSummary();
    renderCmAcceptRateSection();
}

function renderCmAcceptRateToggleButtons() {
    var wrapper = document.querySelector('#cmAcceptRateToggle');
    if (!wrapper) return;

    injectCmAcceptRateToggleStyles();

    var mode = window.cmAcceptRateState.mode;
    var dailyClass = mode === 'daily' ? 'cm-toggle-segment cm-toggle-active' : 'cm-toggle-segment';
    var weeklyClass = mode === 'weekly' ? 'cm-toggle-segment cm-toggle-active' : 'cm-toggle-segment';
    var calendarIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';

    wrapper.className = 'cm-toggle-pill';
    wrapper.innerHTML =
        '<button onclick="setCmAcceptRateMode(\'daily\')" class="' + dailyClass + '">' + calendarIcon + 'Daily</button>' +
        '<button onclick="setCmAcceptRateMode(\'weekly\')" class="' + weeklyClass + '">' + calendarIcon + 'Weekly</button>';
}

function renderCmAcceptRateSection() {
    renderCmAcceptRateToggleButtons();
    renderCmAcceptRateCards();
    renderCmAcceptRateTrendChart();
    renderCmDailyAcceptRateStackedChart();
    renderCmTicketDistributionChart(window.cmDashboardState.filtered);
    renderCmWeeklyAchievementSummary();
    renderCmWeeklyPartyTrend();
}

function initCmAcceptRateDOM() {
    var container = document.getElementById('cmAcceptRateContainer');
    if (!container) return;

    container.innerHTML =
        '<div class="custom-filter-card" style="margin-bottom:16px;">' +
        '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">' +
        '    <div class="custom-filter-title" style="margin-bottom:0;">Accept Rate by Party</div>' +
        '    <div id="cmAcceptRateToggle" style="display:flex; gap:8px;"></div>' +
        '  </div>' +
        '  <div id="cmAcceptRateCards" style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px;"></div>' +
        '  <div id="cmChartAcceptRateTrend" style="width:100%; height:480px;"></div>' +
        '  <div id="cmChartAcceptRateTrendTable"></div>' +
        '</div>';
}

function initCmDailyAcceptRateStackedDOM() {
    var container = document.getElementById('cmDailyAcceptRateStackedContainer');

    if (!container) {
        return;
    }

    container.innerHTML =
        '<div id="cmChartDailyAcceptRateStacked" style="width:100%;height:420px;margin-top:24px;"></div>' +
        '<div id="cmDailyAcceptRateTable"></div>';
}

function initCmFmeUsersDOM() {
    var container = document.getElementById('cmFmeUsersContainer');
    if (!container) {
        return;
    }

    container.innerHTML =
        '<div class="custom-container">' +
        '   <div id="cmFmeUsersTable"></div>' +
        '</div>';
}

function initCmFmeStatusDOM() {

    var container = document.getElementById('cmFmeStatusContainer');

    if (!container) {
        return;
    }

    container.innerHTML =
        '<div style="display:flex;gap:16px;align-items:stretch;">' +

        '<div style="flex:1;display:flex;flex-direction:column;gap:16px;">' +

        '<div id="cmFmeStatusOverview"></div>' +

        '<div id="cmFmeKpiSummary" style="display:flex;gap:12px;"></div>' +

        '</div>' +

        '<div style="flex:2;">' +
        '<div id="cmFmePartyTable"></div>' +
        '</div>' +

        '</div>';
}

function renderCmCurrentTicketsPage() {
    var container = document.querySelector('#cmTicketContainer');
    if (!container) return;

    var pag = window.cmTicketsPagination;
    var tickets = pag.tickets || [];

    if (tickets.length === 0) {
        container.innerHTML = '<div style="color: #6c757d; padding: 12px;">No tickets found for the selected filter.</div>';
        return;
    }

    var startIdx = (pag.currentPage - 1) * pag.pageSize;
    var endIdx = Math.min(startIdx + pag.pageSize, tickets.length);
    var pageTickets = tickets.slice(startIdx, endIdx);

    var html = '<table class="custom-noc-table">';
    html += '<thead><tr>';
    html += '<th style="width: 50px; text-align: center;">No.</th>';
    html += '<th>Ticket ID</th><th>Title</th><th>Region</th><th>Fault Type</th>';
    html += '<th>Root Cause</th><th>Current Phase</th><th>Aging</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < pageTickets.length; i++) {
        var item = pageTickets[i];
        var id = item.orderid || item.id || 'CM';
        var title = item.title || 'Tanpa Judul';
        var region = getTicketRegion(item);
        var faultType = item.fault_type || '-';
        var rc = item.root_cause || '-';
        var phase = item.operate_phase || item.current_phase || '-';
        var aging = calculateCmAgingDays(item.createtime, item.complete_time, item.lastupdatetime, item.current_phase);
        var status = getCmTicketStatus(item);

        var statusClass = 'custom-badge-open';
        if (status === 'Pending') statusClass = 'custom-badge-pending';
        else if (status === 'Closed') statusClass = 'custom-badge-closed';

        var displayNo = startIdx + i + 1;
        html += '<tr onclick="showCmTicketDetailModal(\'' + id + '\')">';
        html += '<td style="text-align: center; color: #8b949e; font-weight: 600;">' + displayNo + '</td>';
        html += '<td style="font-family: monospace; font-weight: bold; color: #58a6ff;">' + id + '</td>';
        html += '<td style="text-align: left; font-weight: 500;">' + title + '</td>';
        html += '<td>' + region + '</td>';
        html += '<td>' + faultType + '</td>';
        html += '<td style="font-weight: 600; text-transform: uppercase;">' + rc + '</td>';
        html += '<td>' + phase + '</td>';
        html += '<td style="font-weight: 600;">' + parseFloat(aging).toFixed(1) + ' Days</td>';
        html += '<td><span class="custom-badge-status ' + statusClass + '">' + status + '</span></td>';
        html += '</tr>';
    }
    html += '</tbody></table>';

    var totalPages = Math.ceil(tickets.length / pag.pageSize);
    var paginationHtml = '<div class="custom-pagination-wrapper">';
    paginationHtml += '  <span class="custom-pagination-total">Total ' + tickets.length + '</span>';
    paginationHtml += '  <select onchange="changeCmTicketsPageSize(parseInt(this.value))" class="custom-pagesize-select">';
    [10, 20, 50, 100].forEach(function (size) {
        var selected = pag.pageSize === size ? 'selected' : '';
        paginationHtml += '    <option value="' + size + '" ' + selected + '>' + size + '/page</option>';
    });
    paginationHtml += '  </select>';

    var prevDisabled = pag.currentPage === 1 ? 'disabled' : '';
    paginationHtml += '  <button onclick="prevCmTicketsPage()" class="custom-page-num-btn ' + prevDisabled + '" ' + prevDisabled + '>&lt;</button>';

    var pageNumbers = getPageNumbersCm(pag.currentPage, totalPages);
    pageNumbers.forEach(function (p) {
        if (p === '...') {
            paginationHtml += '  <span class="custom-pagination-ellipsis">...</span>';
        } else {
            var activeClass = pag.currentPage === p ? 'active' : '';
            paginationHtml += '  <button onclick="gotoCmTicketsPage(' + p + ')" class="custom-page-num-btn ' + activeClass + '">' + p + '</button>';
        }
    });

    var nextDisabled = pag.currentPage === totalPages ? 'disabled' : '';
    paginationHtml += '  <button onclick="nextCmTicketsPage()" class="custom-page-num-btn ' + nextDisabled + '" ' + nextDisabled + '>&gt;</button>';
    paginationHtml += '  <div class="custom-page-jump-wrapper"><span>Go to</span>';
    paginationHtml += '    <input type="number" min="1" max="' + totalPages + '" value="' + pag.currentPage + '" onkeydown="if(event.key===\'Enter\') gotoCmTicketsPage(parseInt(this.value))" class="custom-page-jump-input">';
    paginationHtml += '  </div></div>';

    html += paginationHtml;
    container.innerHTML = html;
}

function getPageNumbersCm(current, total) {
    var pages = [];
    if (total <= 7) {
        for (var i = 1; i <= total; i++) pages.push(i);
    } else if (current <= 4) {
        pages = [1, 2, 3, 4, 5, '...', total];
    } else if (current >= total - 3) {
        pages = [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    } else {
        pages = [1, '...', current - 1, current, current + 1, '...', total];
    }
    return pages;
}

function prevCmTicketsPage() {
    if (window.cmTicketsPagination.currentPage > 1) {
        window.cmTicketsPagination.currentPage--;
        renderCmCurrentTicketsPage();
    }
}

function nextCmTicketsPage() {
    var totalPages = Math.ceil(window.cmTicketsPagination.tickets.length / window.cmTicketsPagination.pageSize);
    if (window.cmTicketsPagination.currentPage < totalPages) {
        window.cmTicketsPagination.currentPage++;
        renderCmCurrentTicketsPage();
    }
}

function gotoCmTicketsPage(page) {
    var totalPages = Math.ceil(window.cmTicketsPagination.tickets.length / window.cmTicketsPagination.pageSize);
    if (page >= 1 && page <= totalPages) {
        window.cmTicketsPagination.currentPage = page;
        renderCmCurrentTicketsPage();
    }
}

function changeCmTicketsPageSize(size) {
    window.cmTicketsPagination.pageSize = size;
    window.cmTicketsPagination.currentPage = 1;
    renderCmCurrentTicketsPage();
}

function formatIndonesianDateCm(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    var year = parts[0];
    var monthIndex = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    var months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return day + ' ' + months[monthIndex] + ' ' + year;
}

function formatWeekRange(startDate) {
    if (!startDate) return '-';

    var start = new Date(startDate.replace(/-/g, '/'));
    var end = new Date(start);

    end.setDate(start.getDate() + 6);

    return start.getDate() + ' ' +
        start.toLocaleString('en-US', { month: 'short' }) +
        ' - ' +
        end.getDate() + ' ' +
        end.toLocaleString('en-US', { month: 'short' }) +
        ' ' +
        start.getFullYear();
}

function initCmDetailModalDOM() {
    if (document.getElementById('cmDetailModal')) return;

    var dynamicStyle = document.createElement('style');
    dynamicStyle.innerHTML =
        '.cm-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; z-index: 99999; } ' +
        '.cm-modal-backdrop { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); } ' +
        '.cm-modal-content { position: relative; background-color: #0d0d10; border: 1px solid #27272a; border-radius: 12px; width: 90%; max-width: 650px; max-height: 85vh; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; color: #e4e4e7; z-index: 100000; } ' +
        '.cm-modal-header { padding: 16px 20px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; } ' +
        '.cm-modal-title { margin: 0; font-size: 16px; font-weight: 700; color: #fafafa; } ' +
        '.cm-modal-close { font-size: 24px; color: #a1a1aa; cursor: pointer; } ' +
        '.cm-modal-body { padding: 20px; overflow-y: auto; font-size: 14px; line-height: 1.5; } ' +
        '.cm-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; } ' +
        '@media (max-width: 500px) { .cm-detail-grid { grid-template-columns: 1fr !important; } } ' +
        '.cm-detail-item { display: flex; flex-direction: column; gap: 4px; } ' +
        '.cm-detail-label { font-size: 12px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; } ' +
        '.cm-detail-value { font-size: 14px; color: #e4e4e7; font-weight: 500; }';
    document.head.appendChild(dynamicStyle);

    var modalDiv = document.createElement('div');
    modalDiv.id = 'cmDetailModal';
    modalDiv.className = 'cm-modal';
    modalDiv.style.display = 'none';
    modalDiv.innerHTML =
        '<div class="cm-modal-backdrop" onclick="closeCmTicketDetailModal()"></div>' +
        '<div class="cm-modal-content">' +
        '  <div class="cm-modal-header">' +
        '    <h3 class="cm-modal-title">Corrective Maintenance Ticket Details</h3>' +
        '    <span class="cm-modal-close" onclick="closeCmTicketDetailModal()">&times;</span>' +
        '  </div>' +
        '  <div class="cm-modal-body" id="cmModalBodyContent"></div>' +
        '</div>';
    document.body.appendChild(modalDiv);
}

function initCmFmeDetailModalDOM() {

    if (document.getElementById('cmFmeDetailModal')) {
        return;
    }

    var div = document.createElement('div');

    div.id = 'cmFmeDetailModal';
    div.className = 'cm-modal';

    div.innerHTML =
        '<div class="cm-modal-backdrop" onclick="closeCmFmeDetailModal()"></div>' +
        '<div class="cm-modal-content">' +
        '<div class="cm-modal-header">' +
        '<h3 class="cm-modal-title" id="cmFmeDetailTitle"></h3>' +
        '<span class="cm-modal-close" onclick="closeCmFmeDetailModal()">&times;</span>' +
        '</div>' +
        '<div class="cm-modal-body" id="cmFmeDetailBody"></div>' +
        '</div>';

    document.body.appendChild(div);
}

function showCmFmeDetailModal(title, html) {

    document.getElementById('cmFmeDetailTitle').innerText =
        title + ' FME Detail';

    document.getElementById('cmFmeDetailBody').innerHTML =
        html;

    document.getElementById('cmFmeDetailModal').style.display = 'flex';
}

function closeCmFmeDetailModal() {

    document.getElementById('cmFmeDetailModal').style.display = 'none';
}

function injectCmAcceptRateToggleStyles() {
    if (document.getElementById('cmAcceptRateToggleStyles')) return;

    var style = document.createElement('style');
    style.id = 'cmAcceptRateToggleStyles';
    style.innerHTML =
        '.cm-toggle-pill { display: inline-flex; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; background: #0d1117; } ' +
        '.cm-toggle-segment { padding: 8px 20px; font-size: 13px; font-weight: 600; color: #8b949e; background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: color .15s ease, background-color .15s ease; } ' +
        '.cm-toggle-segment + .cm-toggle-segment { border-left: 1px solid #30363d; } ' +
        '.cm-toggle-segment:hover { color: #c9d1d9; } ' +
        '.cm-toggle-segment.cm-toggle-active { color: #58a6ff; background: rgba(88, 166, 255, 0.1); } ' +
        '.cm-toggle-segment svg { width: 14px; height: 14px; flex-shrink: 0; }';
    document.head.appendChild(style);
}

function showCmTicketDetailModal(ticketId) {
    var tickets = (window.cmTicketsPagination && window.cmTicketsPagination.tickets) || [];
    var ticket = null;
    for (var i = 0; i < tickets.length; i++) {
        var idVal = tickets[i].orderid || tickets[i].id;
        if (String(idVal) === String(ticketId)) {
            ticket = tickets[i];
            break;
        }
    }
    if (!ticket) return;

    var bodyContent = document.getElementById('cmModalBodyContent');
    if (!bodyContent) return;

    var status = getCmTicketStatus(ticket);
    var statusClass = 'custom-badge-open';
    if (status === 'Pending') statusClass = 'custom-badge-pending';
    else if (status === 'Closed') statusClass = 'custom-badge-closed';

    var aging = calculateCmAgingDays(ticket.createtime, ticket.complete_time, ticket.lastupdatetime, ticket.current_phase);

    var html = '<div style="margin-bottom:16px;"><h4 style="margin:0 0 6px 0; color:#f0f6fc; font-size:15px; font-weight:600;">' + (ticket.title || 'No Title') + '</h4></div>';
    html += '<div class="cm-detail-grid">';
    html += detailItemCm('TICKET ID', ticket.orderid || ticket.id || '-');
    html += '<div class="cm-detail-item"><span class="cm-detail-label">STATUS</span><span><span class="custom-badge-status ' + statusClass + '">' + status + '</span></span></div>';
    html += detailItemCm('CURRENT PHASE', ticket.operate_phase || ticket.current_phase || '-');
    html += detailItemCm('FAULT TYPE', ticket.fault_type || '-');
    html += detailItemCm('ROOT CAUSE', ticket.root_cause || '-');
    html += detailItemCm('SUB ROOT CAUSE', ticket.sub_root_cause || '-');
    html += detailItemCm('AGING DAYS', parseFloat(aging).toFixed(2) + ' Days');
    html += detailItemCm('REGION', getTicketRegion(ticket));
    html += detailItemCm('SITE', ticket.site_name || '-');
    html += detailItemCm('FM OFFICE', ticket.fm_office || '-');
    html += detailItemCm('CURRENT OPERATOR', ticket.currentoperator || '-');
    html += detailItemCm('ORIGINATOR', ticket.originator || '-');
    html += detailItemCm('CREATE TIME', ticket.createtime || '-');
    html += detailItemCm('LAST UPDATE TIME', ticket.lastupdatetime || '-');
    html += detailItemCm('COMPLETE TIME', ticket.complete_time || '-');
    html += detailItemCm('FAULT LEVEL (RAW CODE)', ticket.cm_fault_level || '-');
    html += '</div>';

    html += '<div style="border-top: 1px solid #27272a; padding-top: 16px; margin-top: 16px;">';
    html += '  <span class="cm-detail-label" style="display:block; margin-bottom:6px;">ENTER REASON</span>';
    html += '  <div style="background:#0d1117; border:1px solid #30363d; border-radius:6px; padding:12px; font-size:13px; color:#c9d1d9; white-space:pre-wrap; word-break:break-word;">' + (ticket.enter_reason || '-') + '</div>';
    html += '</div>';

    bodyContent.innerHTML = html;

    var modal = document.getElementById('cmDetailModal');
    if (modal) modal.style.display = 'flex';
}

function showCmFmePartyDetailModal(party) {

    var statusRows = window.cmFmeStatusState.rows || [];
    var performanceRows = window.cmFmeUsersState.rows || [];

    var html =
        '<table class="custom-noc-table">' +
        '<thead>' +
        '<tr>' +
        '<th>FME</th>' +
        '<th>Status</th>' +
        '<th>Dispatch</th>' +
        '<th>Accepted</th>' +
        '<th>Accept Rate</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>';

    statusRows.forEach(function (statusRow) {

        if (statusRow.party_name !== party) {
            return;
        }

        var performance = null;

        performanceRows.forEach(function (item) {

            if (item.fullname === statusRow.fullname) {
                performance = item;
            }

        });

        html +=
            '<tr>' +
            '<td>' + statusRow.fullname + '</td>' +
            '<td>' + statusRow.status + '</td>' +
            '<td>' + (performance ? performance.count_dispatch_time : 0) + '</td>' +
            '<td>' + (performance ? performance.count_accept_time : 0) + '</td>' +
            '<td>' + (performance ? performance.accept_rate_pct.toFixed(2) : 0) + '%</td>' +
            '</tr>';

    });

    html += '</tbody></table>';

    showCmFmeDetailModal(party, html);
}

function detailItemCm(label, value) {
    return '<div class="cm-detail-item"><span class="cm-detail-label">' + label + '</span><span class="cm-detail-value">' + value + '</span></div>';
}

function closeCmTicketDetailModal() {
    var modal = document.getElementById('cmDetailModal');
    if (modal) modal.style.display = 'none';
}

function initCmFilterDOM() {
    var container = document.getElementById('cmFilterContainer');
    if (!container) return;

    container.innerHTML = '<div class="custom-filter-card">' +
        '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">' +
        '  </div>' +
        '  <div class="custom-filter-inputs">' +
        '    <div class="custom-filter-field"><label>Start Date</label><input type="date" class="cm-filter-start-input"></div>' +
        '    <div class="custom-filter-field"><label>End Date</label><input type="date" class="cm-filter-end-input"></div>' +
        '    <div class="custom-filter-field"><label>Region</label>' +
        '      <select class="cm-filter-region-input" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 6px; color: #e4e4e7; padding: 8px 12px; font-size: 13px; outline: none; width: 180px; color-scheme: dark;">' +
        '        <option value="ALL">All Region</option>' +
        '      </select>' +
        '    </div>' +
        '    <div class="custom-filter-field"><label>Party</label>' +
        '      <select class="cm-filter-party-input" style="background-color: #09090b; border: 1px solid #27272a; border-radius: 6px; color: #e4e4e7; padding: 8px 12px; font-size: 13px; outline: none; width: 180px; color-scheme: dark;">' +
        '        <option value="ALL">All Party</option>' +
        '      </select>' +
        '    </div>' +
        '    <div class="custom-filter-actions">' +
        '      <button onclick="applyCmFilters()" class="custom-btn custom-btn-primary">Search</button>' +
        '      <button onclick="resetCmFilters()" class="custom-btn custom-btn-secondary">Reset Filters</button>' +
        '      <button id="cmExportButton" onclick="exportCmTickets()" class="custom-btn custom-btn-secondary">Export</button>' +
        '    </div>' +

        '    <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
        '      <div class="cm-filter-active-range" style="font-size:14px; font-weight:600; color:#58a6ff; background:rgba(88,166,255,0.1); padding:6px 14px; border-radius:15px; border:1px solid rgba(88,166,255,0.2); white-space:nowrap;">Active: All Time | Region: All Region</div>' +
        '      <div id="cmSnapshotToggle"></div>' +
        '    </div>' +
        '</div>';

    populateCmPartyFilterOptions();

    var defaultRange = getCmDefaultDateRange();
    var startEl = document.querySelector('.cm-filter-start-input');
    var endEl = document.querySelector('.cm-filter-end-input');

    if (startEl) {
        startEl.value = defaultRange.start;
    }

    if (endEl) {
        endEl.value = defaultRange.end;
    }

    renderCmSnapshotToggle();
}

function startCmLiveClock() {
    function updateClock() {
        var el = document.getElementById('cmLiveTickerClock');
        if (!el) return;
        var now = new Date();
        var hrsStr = now.getHours() < 10 ? '0' + now.getHours() : now.getHours();
        var minsStr = now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes();
        var secsStr = now.getSeconds() < 10 ? '0' + now.getSeconds() : now.getSeconds();
        var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        el.innerText = days[now.getDay()] + ', ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear() + ' — ' + hrsStr + ':' + minsStr + ':' + secsStr;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

function initCmDashboard() {
    var retryCount = 0;

    function tryInit() {
        var container = document.getElementById('cmFilterContainer');

        if (container) {
            initCmFilterDOM();
            initCmDetailModalDOM();
            initCmFmeDetailModalDOM();
            initCmAcceptRateDOM();
            initCmDailyAcceptRateStackedDOM();
            initCmFmeUsersDOM();
            initCmFmeStatusDOM();
            startCmLiveClock();
            loadCmTickets();
        } else if (retryCount < 100) {
            retryCount++;
            setTimeout(tryInit, 50);
        } else {
            initCmDetailModalDOM();
            initCmFmeDetailModalDOM();
            initCmAcceptRateDOM();
            initCmDailyAcceptRateStackedDOM();
            initCmFmeUsersDOM();
            initCmFmeStatusDOM();
            startCmLiveClock();
            loadCmTickets();
        }
    }

    tryInit();
}

if (typeof U !== 'undefined' && typeof U.ready === 'function') {
    U.ready(initCmDashboard);
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCmDashboard);
} else {
    initCmDashboard();
}

window.applyCmFilters = applyCmFilters;
window.resetCmFilters = resetCmFilters;
window.exportCmTickets = exportCmTickets;
window.selectCmDashboardDate = selectCmDashboardDate;
window.prevCmTicketsPage = prevCmTicketsPage;
window.nextCmTicketsPage = nextCmTicketsPage;
window.gotoCmTicketsPage = gotoCmTicketsPage;
window.changeCmTicketsPageSize = changeCmTicketsPageSize;
window.showCmTicketDetailModal = showCmTicketDetailModal;
window.closeCmTicketDetailModal = closeCmTicketDetailModal;
window.setCmAcceptRateMode = setCmAcceptRateMode;
window.toggleCmSnapshotMode = toggleCmSnapshotMode;