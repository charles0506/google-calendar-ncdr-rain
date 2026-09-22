// ==UserScript==
// @name         Google 日曆 - NCDR 六週降雨預報懸停卡片 (Taiwan Rain Forecast)
// @namespace    https://github.com/charles0506/google-calendar-ncdr-rain
// @version      1.4.0
// @description  在 Google 日曆中，將滑鼠移到任意日期格子上，立即浮現當天 NCDR 全台六週降雨預報圖！含 ON/OFF 開關。
// @author       Antigravity
// @match        *://calendar.google.com/*
// @icon         https://watch.ncdr.nat.gov.tw/icon/watch_icon_02.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      watch.ncdr.nat.gov.tw
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast] 腳本啟動成功！v1.4.0 (含 ON/OFF 開關)', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

    // 狀態設定
    let latestRun = null;
    let hoverTimer = null;
    let currentHoverDate = null;
    let isEnabled = true;

    try {
        const stored = GM_getValue('ncdr_enabled', null);
        if (stored !== null) isEnabled = stored;
        else isEnabled = localStorage.getItem('ncdr_enabled') !== 'false';
    } catch (e) {
        isEnabled = localStorage.getItem('ncdr_enabled') !== 'false';
    }

    // 1. 建立右下角可開關的標籤
    const badge = document.createElement('div');
    badge.id = 'ncdr-status-badge';
    document.body.appendChild(badge);

    function updateBadgeUI() {
        if (isEnabled) {
            badge.innerHTML = `🌧️ 降雨預報 <span class="ncdr-toggle-on">ON</span>`;
            badge.title = '點擊切換為 [OFF] 關閉懸停卡片';
            badge.classList.remove('disabled');
        } else {
            badge.innerHTML = `🌧️ 降雨預報 <span class="ncdr-toggle-off">OFF</span>`;
            badge.title = '點擊切換為 [ON] 開啟懸停卡片';
            badge.classList.add('disabled');
        }
    }

    updateBadgeUI();

    badge.addEventListener('click', function (e) {
        e.stopPropagation();
        isEnabled = !isEnabled;
        try {
            GM_setValue('ncdr_enabled', isEnabled);
        } catch (err) {}
        localStorage.setItem('ncdr_enabled', isEnabled.toString());
        updateBadgeUI();
        if (!isEnabled) hideForecast();
    });

    // 2. 建立浮動卡片 DOM
    const tooltip = document.createElement('div');
    tooltip.id = 'ncdr-rain-tooltip';
    tooltip.innerHTML = `
        <div class="ncdr-card">
            <div class="ncdr-header">
                <span class="ncdr-title" id="ncdr-card-title">📅 載入中...</span>
                <span class="ncdr-badge" id="ncdr-card-badge">NCDR 預報</span>
            </div>
            <div class="ncdr-body">
                <div class="ncdr-loading" id="ncdr-card-loading">
                    <div class="ncdr-spinner"></div>
                    <span id="ncdr-card-status">取得雨量圖中...</span>
                </div>
                <img id="ncdr-card-img" class="ncdr-img" alt="降雨預報圖" style="display:none;" />
            </div>
            <div class="ncdr-footer">
                <span id="ncdr-card-info">資料來源：國家災害防救科技中心</span>
            </div>
        </div>
    `;
    document.body.appendChild(tooltip);

    // 插入樣式
    const style = document.createElement('style');
    style.textContent = `
        #ncdr-status-badge {
            position: fixed;
            bottom: 18px;
            right: 18px;
            background: linear-gradient(135deg, #1976d2, #0d47a1);
            color: #ffffff;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            z-index: 9999999;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        #ncdr-status-badge.disabled {
            background: #94a3b8 !important;
            opacity: 0.75;
        }
        #ncdr-status-badge:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
        }
        .ncdr-toggle-on {
            background: #22c55e;
            color: #ffffff;
            padding: 1px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 700;
        }
        .ncdr-toggle-off {
            background: #f1f5f9;
            color: #475569;
            padding: 1px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 700;
        }
        #ncdr-rain-tooltip {
            position: fixed;
            display: none;
            z-index: 999999999 !important;
            pointer-events: none;
            transition: opacity 0.12s ease-out, transform 0.12s ease-out;
            opacity: 0;
            transform: scale(0.96);
        }
        #ncdr-rain-tooltip.visible {
            display: block !important;
            opacity: 1 !important;
            transform: scale(1) !important;
        }
        .ncdr-card {
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.32), 0 2px 10px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(0, 0, 0, 0.1);
            width: 245px;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
        }
        .ncdr-header {
            background: linear-gradient(135deg, #1976d2, #0d47a1);
            color: #ffffff;
            padding: 9px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .ncdr-title {
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.2px;
        }
        .ncdr-badge {
            font-size: 10px;
            background: rgba(255, 255, 255, 0.25);
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 500;
        }
        .ncdr-body {
            position: relative;
            background: #f8fafc;
            min-height: 290px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .ncdr-img {
            width: 100%;
            height: auto;
            display: block;
        }
        .ncdr-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: #64748b;
            font-size: 12px;
            padding: 20px 0;
        }
        .ncdr-spinner {
            width: 24px;
            height: 24px;
            border: 3px solid #e2e8f0;
            border-top: 3px solid #1976d2;
            border-radius: 50%;
            animation: ncdr-spin 0.8s linear infinite;
        }
        @keyframes ncdr-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .ncdr-footer {
            background: #ffffff;
            padding: 6px 12px;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #f1f5f9;
            text-align: right;
        }
    `;
    document.head.appendChild(style);

    const cardTitle = document.getElementById('ncdr-card-title');
    const cardBadge = document.getElementById('ncdr-card-badge');
    const cardLoading = document.getElementById('ncdr-card-loading');
    const cardStatus = document.getElementById('ncdr-card-status');
    const cardImg = document.getElementById('ncdr-card-img');
    const cardInfo = document.getElementById('ncdr-card-info');

    // 預設備用期數
    function getDefaultRun() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return {
            runMonth: `${y}${m}`,
            runDate: `${y}${m}${d}00`,
            baseDateTimestamp: new Date(y, now.getMonth(), now.getDate()).getTime()
        };
    }

    // 取得 NCDR 最新期數
    function fetchLatestRunDate(callback) {
        let cached = null;
        let cachedTime = 0;
        try {
            cached = GM_getValue('ncdr_latest_run', null);
            cachedTime = GM_getValue('ncdr_cached_time', 0);
        } catch (e) {
            const raw = localStorage.getItem('ncdr_latest_run');
            if (raw) cached = JSON.parse(raw);
            cachedTime = parseInt(localStorage.getItem('ncdr_cached_time') || '0', 10);
        }

        const now = Date.now();
        if (cached && (now - cachedTime < 3600 * 1000)) {
            latestRun = cached;
            if (callback) callback(latestRun);
            return;
        }

        const handleSuccess = function (text) {
            const parts = text.trim().split(',');
            if (parts.length >= 2) {
                const rawDate = parts[1].trim();
                const runDate = rawDate.substr(0, 10);
                const runMonth = rawDate.substr(0, 6);
                
                const year = parseInt(runDate.substr(0, 4), 10);
                const month = parseInt(runDate.substr(4, 2), 10) - 1;
                const day = parseInt(runDate.substr(6, 2), 10);
                const baseDate = new Date(year, month, day);

                latestRun = { runMonth, runDate, baseDateTimestamp: baseDate.getTime() };
                try {
                    GM_setValue('ncdr_latest_run', latestRun);
                    GM_setValue('ncdr_cached_time', now);
                } catch (e) {
                    localStorage.setItem('ncdr_latest_run', JSON.stringify(latestRun));
                    localStorage.setItem('ncdr_cached_time', now.toString());
                }
                if (callback) callback(latestRun);
            }
        };

        const targetUrl = 'https://watch.ncdr.nat.gov.tw/php/list_realtime_date_csv.php?v=CHART_MPAS_45_OPTIMAL&tt=' + now;

        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: targetUrl,
                onload: function (res) {
                    if (res.status === 200) handleSuccess(res.responseText);
                    else {
                        latestRun = getDefaultRun();
                        if (callback) callback(latestRun);
                    }
                },
                onerror: function () {
                    latestRun = getDefaultRun();
                    if (callback) callback(latestRun);
                }
            });
        } else {
            fetch(targetUrl)
                .then(r => r.text())
                .then(handleSuccess)
                .catch(() => {
                    latestRun = getDefaultRun();
                    if (callback) callback(latestRun);
                });
        }
    }

    fetchLatestRunDate();

    // 解碼 Google 日曆專屬 data-datekey
    function decodeGoogleDateKey(key) {
        const num = parseInt(key, 10);
        if (isNaN(num)) return null;
        const year = Math.floor(num / 512) + 1970;
        const rem = num % 512;
        const month = Math.floor(rem / 32);
        const day = rem % 32;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
            return new Date(year, month - 1, day);
        }
        return null;
    }

    function getCurrentCalendarHeaderYearMonth() {
        const h1 = document.querySelector('header h1, div[role="heading"], div[aria-level="1"]');
        if (h1) {
            const text = h1.textContent || '';
            const matchZh = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
            if (matchZh) {
                return { year: parseInt(matchZh[1], 10), month: parseInt(matchZh[2], 10) - 1 };
            }
            const matchEn = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
            if (matchEn) {
                const d = new Date(text);
                if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() };
            }
        }
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    }

    function formatDateToYYYYMMDD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    function formatDateDisplay(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        return `${y}-${m}-${d} (${days[date.getDay()]})`;
    }

    function detectDateUnderPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);
        if (!elements || elements.length === 0) return null;

        for (const el of elements) {
            if (el.closest('#ncdr-rain-tooltip') || el.closest('#ncdr-status-badge')) continue;

            const dateKeyEl = el.closest('[data-datekey]');
            if (dateKeyEl) {
                const key = dateKeyEl.getAttribute('data-datekey');
                const decoded = decodeGoogleDateKey(key);
                if (decoded) return decoded;
            }

            const dateAttrEl = el.closest('[data-date]');
            if (dateAttrEl && dateAttrEl.dataset && dateAttrEl.dataset.date) {
                const parts = dateAttrEl.dataset.date.split('-');
                if (parts.length === 3) {
                    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                }
            }

            let checkNode = el;
            for (let d = 0; d < 4 && checkNode && checkNode !== document.body; d++) {
                const label = checkNode.getAttribute('aria-label') || '';
                if (label) {
                    const mZhFull = label.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                    if (mZhFull) {
                        return new Date(parseInt(mZhFull[1], 10), parseInt(mZhFull[2], 10) - 1, parseInt(mZhFull[3], 10));
                    }
                    const mZhShort = label.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                    if (mZhShort) {
                        const ym = getCurrentCalendarHeaderYearMonth();
                        return new Date(ym.year, parseInt(mZhShort[1], 10) - 1, parseInt(mZhShort[2], 10));
                    }
                    const mEn = label.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})?/i);
                    if (mEn) {
                        const parsed = new Date(label);
                        if (!isNaN(parsed.getTime())) return parsed;
                    }
                }
                checkNode = checkNode.parentElement;
            }

            const text = el.textContent ? el.textContent.trim() : '';
            if (/^([1-9]|[12]\d|3[01])$/.test(text) && el.tagName && (el.tagName === 'SPAN' || el.tagName === 'H2' || el.tagName === 'DIV')) {
                const ym = getCurrentCalendarHeaderYearMonth();
                const dayNum = parseInt(text, 10);
                return new Date(ym.year, ym.month, dayNum);
            }
        }

        return null;
    }

    function getCandidateRuns() {
        const runs = [];
        if (latestRun && latestRun.runDate) {
            runs.push(latestRun.runDate);
        }
        const now = new Date();
        for (let i = 0; i <= 4; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const runStr = `${y}${m}${day}00`;
            if (!runs.includes(runStr)) runs.push(runStr);
        }
        return runs;
    }

    function showForecast(targetDate, mouseX, mouseY) {
        if (!isEnabled) return;

        const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);
        const baseTimestamp = latestRun ? latestRun.baseDateTimestamp : Date.now();
        const diffDays = Math.round((targetDate.getTime() - baseTimestamp) / (86400 * 1000));

        if (diffDays < -2 || diffDays > 45) {
            hideForecast();
            return;
        }

        const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
        cardTitle.textContent = formatDateDisplay(targetDate);
        cardBadge.textContent = `第 ${weekNum} 週預報`;

        cardLoading.style.display = 'flex';
        cardStatus.textContent = '取得雨量圖中...';
        cardImg.style.display = 'none';

        const candidates = getCandidateRuns();
        let candidateIndex = 0;

        function tryNextCandidate() {
            if (candidateIndex >= candidates.length) {
                if (currentHoverDate === targetYYYYMMDD) {
                    cardStatus.textContent = '無此日期之模式圖';
                }
                return;
            }

            const tryRun = candidates[candidateIndex++];
            const tryMonth = tryRun.substr(0, 6);
            const imgUrl = `https://watch.ncdr.nat.gov.tw/00_Wxmap/2F6_MPAS2WRF_45d/${tryMonth}/${tryRun}/semw05_qpf_${tryRun}_${targetYYYYMMDD}.gif`;

            const testImg = new Image();
            testImg.onload = function () {
                if (currentHoverDate === targetYYYYMMDD && isEnabled) {
                    cardInfo.textContent = `模式發布：${tryRun.substr(0, 4)}/${tryRun.substr(4, 2)}/${tryRun.substr(6, 2)}`;
                    cardImg.src = imgUrl;
                    cardLoading.style.display = 'none';
                    cardImg.style.display = 'block';
                }
            };
            testImg.onerror = function () {
                tryNextCandidate();
            };
            testImg.src = imgUrl;
        }

        tryNextCandidate();

        const cardWidth = 250;
        const cardHeight = 360;
        let posX = mouseX + 16;
        let posY = mouseY + 16;

        if (posX + cardWidth > window.innerWidth) posX = mouseX - cardWidth - 16;
        if (posY + cardHeight > window.innerHeight) posY = mouseY - cardHeight - 16;

        tooltip.style.left = `${Math.max(10, posX)}px`;
        tooltip.style.top = `${Math.max(10, posY)}px`;
        tooltip.classList.add('visible');
    }

    function hideForecast() {
        tooltip.classList.remove('visible');
        currentHoverDate = null;
    }

    document.addEventListener('mousemove', function (e) {
        if (!isEnabled) {
            hideForecast();
            return;
        }

        const targetDate = detectDateUnderPoint(e.clientX, e.clientY);

        if (!targetDate) {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            hideForecast();
            return;
        }

        const dateStr = formatDateToYYYYMMDD(targetDate);
        if (dateStr === currentHoverDate) {
            let posX = e.clientX + 16;
            let posY = e.clientY + 16;
            if (posX + 250 > window.innerWidth) posX = e.clientX - 250 - 16;
            if (posY + 360 > window.innerHeight) posY = e.clientY - 360 - 16;
            tooltip.style.left = `${Math.max(10, posX)}px`;
            tooltip.style.top = `${Math.max(10, posY)}px`;
            return;
        }

        currentHoverDate = dateStr;
        if (hoverTimer) clearTimeout(hoverTimer);

        hoverTimer = setTimeout(() => {
            showForecast(targetDate, e.clientX, e.clientY);
        }, 100);
    });

})();
