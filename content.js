(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast Extension] 擴充功能啟動成功！v1.3.0', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

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

    const cardTitle = document.getElementById('ncdr-card-title');
    const cardBadge = document.getElementById('ncdr-card-badge');
    const cardLoading = document.getElementById('ncdr-card-loading');
    const cardStatus = document.getElementById('ncdr-card-status');
    const cardImg = document.getElementById('ncdr-card-img');
    const cardInfo = document.getElementById('ncdr-card-info');

    badge.addEventListener('click', function () {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() + 5);
        showForecast(testDate, window.innerWidth - 280, window.innerHeight - 420);
        setTimeout(() => {
            const clickOutside = () => {
                hideForecast();
                document.removeEventListener('click', clickOutside);
            };
            document.addEventListener('click', clickOutside);
        }, 100);
    });

    // 產生候選期數列表 (今天、昨天、前天... 避免 404)
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

    // 透過 background service worker 取得 NCDR 最新發布期數
    function fetchLatestRunDate(callback) {
        const cached = localStorage.getItem('ncdr_latest_run');
        const cachedTime = parseInt(localStorage.getItem('ncdr_cached_time') || '0', 10);
        const now = Date.now();

        if (cached && (now - cachedTime < 1800 * 1000)) {
            try {
                latestRun = JSON.parse(cached);
                if (callback) callback(latestRun);
                return;
            } catch (e) {}
        }

        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'fetchLatestRun' }, (response) => {
                if (response && response.success && response.text) {
                    const parts = response.text.trim().split(',');
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
                        console.log('[NCDR Extension] 透過後台取得最新期數:', latestRun);
                        if (callback) callback(latestRun);
                        return;
                    }
                }
                fallbackRun(callback);
            });
        } else {
            fallbackRun(callback);
        }
    }

    function fallbackRun(callback) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        latestRun = {
            runMonth: `${y}${m}`,
            runDate: `${y}${m}${d}00`,
            baseDateTimestamp: new Date(y, now.getMonth(), now.getDate()).getTime()
        };
        if (callback) callback(latestRun);
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

        // 智慧候選期數回退機制 (Candidate Fallback)
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
                if (currentHoverDate === targetYYYYMMDD) {
                    cardInfo.textContent = `模式發布：${tryRun.substr(0, 4)}/${tryRun.substr(4, 2)}/${tryRun.substr(6, 2)}`;
                    cardImg.src = imgUrl;
                    cardLoading.style.display = 'none';
                    cardImg.style.display = 'block';
                }
            };
            testImg.onerror = function () {
                // 若此期數無圖片 (404)，立即嘗試前一期！
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
        }, 80);
    });

})();
