(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast Extension] 擴充功能啟動成功！v1.2.0', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

    let latestRun = null;
    let hoverTimer = null;
    let currentHoverDate = null;

    const badge = document.createElement('div');
    badge.id = 'ncdr-status-badge';
    badge.innerHTML = `🌧️ NCDR 預報已就緒 <span style="font-size:11px;opacity:0.8;">(點我測試)</span>`;
    badge.title = '點擊可立即測試彈出最新降雨預報圖';
    document.body.appendChild(badge);

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

    const style = document.createElement('style');
    style.textContent = `
        #ncdr-status-badge {
            position: fixed;
            bottom: 18px;
            right: 18px;
            background: linear-gradient(135deg, #1976d2, #0d47a1);
            color: #ffffff;
            padding: 7px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            z-index: 9999999;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
        }
        #ncdr-status-badge:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
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

    badge.addEventListener('click', function () {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() + 3);
        showForecast(testDate, window.innerWidth - 280, window.innerHeight - 420);
        setTimeout(() => {
            const clickOutside = () => {
                hideForecast();
                document.removeEventListener('click', clickOutside);
            };
            document.addEventListener('click', clickOutside);
        }, 100);
    });

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

    function fetchLatestRunDate(callback) {
        const cached = localStorage.getItem('ncdr_latest_run');
        const cachedTime = parseInt(localStorage.getItem('ncdr_cached_time') || '0', 10);
        const now = Date.now();

        if (cached && (now - cachedTime < 3600 * 1000)) {
            try {
                latestRun = JSON.parse(cached);
                if (callback) callback(latestRun);
                return;
            } catch (e) {}
        }

        fetch('https://watch.ncdr.nat.gov.tw/php/list_realtime_date_csv.php?v=CHART_MPAS_45_OPTIMAL&tt=' + now)
            .then(res => res.text())
            .then(text => {
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
                    localStorage.setItem('ncdr_latest_run', JSON.stringify(latestRun));
                    localStorage.setItem('ncdr_cached_time', now.toString());
                    console.log('[NCDR Extension] 最新期數更新成功:', latestRun);
                    if (callback) callback(latestRun);
                }
            })
            .catch(() => {
                latestRun = getDefaultRun();
                if (callback) callback(latestRun);
            });
    }

    fetchLatestRunDate();

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

    function showForecast(targetDate, mouseX, mouseY) {
        if (!latestRun) {
            fetchLatestRunDate(() => showForecast(targetDate, mouseX, mouseY));
            return;
        }

        const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);
        const diffDays = Math.round((targetDate.getTime() - latestRun.baseDateTimestamp) / (86400 * 1000));

        if (diffDays < -1 || diffDays > 45) {
            hideForecast();
            return;
        }

        const weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
        cardTitle.textContent = formatDateDisplay(targetDate);
        cardBadge.textContent = `第 ${weekNum} 週預報`;
        cardInfo.textContent = `模式發布：${latestRun.runDate.substr(0, 4)}/${latestRun.runDate.substr(4, 2)}/${latestRun.runDate.substr(6, 2)}`;

        const imgUrl = `https://watch.ncdr.nat.gov.tw/00_Wxmap/2F6_MPAS2WRF_45d/${latestRun.runMonth}/${latestRun.runDate}/semw05_qpf_${latestRun.runDate}_${targetYYYYMMDD}.gif`;

        cardLoading.style.display = 'flex';
        cardStatus.textContent = '取得雨量圖中...';
        cardImg.style.display = 'none';

        const img = new Image();
        img.onload = function () {
            cardImg.src = imgUrl;
            cardLoading.style.display = 'none';
            cardImg.style.display = 'block';
        };
        img.onerror = function () {
            cardStatus.textContent = '無此日期之數值模式圖';
        };
        img.src = imgUrl;

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
