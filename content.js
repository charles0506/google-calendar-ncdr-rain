(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast Extension] 擴充功能啟動成功！v1.6.0 (含 ON/OFF 開關)', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

    let latestRun = null;
    let hoverTimer = null;
    let currentHoverDate = null;
    let isEnabled = localStorage.getItem('ncdr_enabled') !== 'false';

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
        localStorage.setItem('ncdr_enabled', isEnabled.toString());
        updateBadgeUI();
        if (!isEnabled) hideForecast();
    });

    const tooltip = document.createElement('div');
    tooltip.id = 'ncdr-rain-tooltip';
    tooltip.innerHTML = `
        <div class="ncdr-card">
            <div class="ncdr-header">
                <span class="ncdr-title" id="ncdr-card-title">📅 載入中...</span>
                <span class="ncdr-badge" id="ncdr-card-badge">NCDR 預報</span>
            </div>
            <div class="ncdr-body">
                <div class="ncdr-cwa" id="ncdr-card-obs"></div>
                <div class="ncdr-cwa" id="ncdr-card-cwa"></div>
                <div class="ncdr-col ncdr-col-main">
                    <div class="ncdr-caption">NCDR 六週預報</div>
                    <div class="ncdr-loading" id="ncdr-card-loading">
                        <div class="ncdr-spinner"></div>
                        <span id="ncdr-card-status">取得雨量圖中...</span>
                    </div>
                    <img id="ncdr-card-img" class="ncdr-img" alt="降雨預報圖" style="display:none;" />
                </div>
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
    const cardCwa = document.getElementById('ncdr-card-cwa');
    const cardObs = document.getElementById('ncdr-card-obs');

    // 中央氣象署定量降水預報 (QPF)：未來 48 小時，有 12 小時一張與 6 小時一張兩組圖
    const CWA_IMG_BASE = 'https://www.cwa.gov.tw/Data/fcst_img/QPF_ChFcstPrecip_';
    const CWA_DAY_START = 8;
    const CWA_DAY_END = 20;
    const TPE_OFFSET = 8 * 3600 * 1000;
    const COL_WIDTH = 230;
    let cwaInfo = null;
    let cwaFetchedAt = 0;
    let cwaColCount = 0;
    let obsColCount = 0;
    let cwaIssueText = '';
    let ncdrInfoText = '資料來源：國家災害防救科技中心';
    let lastMouse = { x: 0, y: 0 };

    // 氣象署每日 05:30、11:30、17:30、23:30 發布，首張有效時間自 08、14、20、02 時起算；
    // 由圖檔上傳時間推回各張的有效時段（Date 的 UTC 欄位在此代表臺灣時間）
    function buildCwaInfo(uploadMs) {
        const start = new Date(uploadMs + TPE_OFFSET);
        start.setUTCMinutes(0, 0, 0);
        do {
            start.setUTCHours(start.getUTCHours() + 1);
        } while (start.getUTCHours() % 6 !== 2);

        const pad = n => String(n).padStart(2, '0');
        const md = d => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
        const hm = d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        const issue = new Date(start.getTime() - 2.5 * 3600 * 1000);
        const periods = [];
        [12, 6].forEach((hours) => {
            for (let end = hours; end <= 48; end += hours) {
                const from = new Date(start.getTime() + (end - hours) * 3600 * 1000);
                const to = new Date(from.getTime() + hours * 3600 * 1000);
                periods.push({
                    file: `${hours}_${pad(end)}`,
                    hours,
                    fromHour: from.getUTCHours(),
                    dateKey: `${from.getUTCFullYear()}${pad(from.getUTCMonth() + 1)}${pad(from.getUTCDate())}`,
                    label: `${md(from)} ${hm(from)}～${md(to) === md(from) ? '' : md(to) + ' '}${hm(to)}`
                });
            }
        });
        return { issueLabel: `${md(issue)} ${hm(issue)}`, periods };
    }

    // 只取白天 (08～20 時)：有剛好涵蓋整個白天的 12 小時圖就用它，
    // 否則 (02/14 時起算的發布時次) 改用落在白天內的 6 小時圖
    function pickDaytimePeriods(info, targetYYYYMMDD) {
        const sameDay = info.periods.filter(p => p.dateKey === targetYYYYMMDD);
        const whole = sameDay.filter(p => p.hours === 12 && p.fromHour === CWA_DAY_START);
        if (whole.length) return whole;
        return sameDay.filter(p => p.hours === 6 && p.fromHour >= CWA_DAY_START && p.fromHour + 6 <= CWA_DAY_END);
    }

    function fetchCwaInfo(callback) {
        const now = Date.now();
        if (cwaInfo && (now - cwaFetchedAt < 600 * 1000)) {
            callback(cwaInfo);
            return;
        }
        const done = function (uploadMs) {
            cwaInfo = buildCwaInfo(uploadMs);
            cwaFetchedAt = now;
            callback(cwaInfo);
        };
        // 取不到上傳時間時，以目前時刻推算最近一次發布
        const fallback = () => done(now - 3.5 * 3600 * 1000);
        const handle = function (lastModified) {
            const ms = Date.parse(lastModified || '');
            if (isNaN(ms)) fallback();
            else done(ms);
        };
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'fetchCwaQpfTime' }, (response) => {
                handle(response && response.success ? response.lastModified : '');
            });
        } else {
            fallback();
        }
    }

    function updateFooter() {
        cardInfo.textContent = [cwaIssueText, ncdrInfoText].filter(Boolean).join('｜');
    }

    function renderCwa(info, targetYYYYMMDD) {
        const periods = pickDaytimePeriods(info, targetYYYYMMDD);
        const stamp = Math.floor(Date.now() / 600000);
        cwaColCount = periods.length;
        cardCwa.innerHTML = periods.map(p => `
            <div class="ncdr-col">
                <div class="ncdr-caption">氣象署預報 ${p.label}</div>
                <img class="ncdr-img" alt="定量降水預報圖" src="${CWA_IMG_BASE}${p.file}.png?T=${stamp}" />
            </div>`).join('');
        cwaIssueText = periods.length ? `氣象署發布：${info.issueLabel}` : '';
        updateFooter();
        positionTooltip();
    }

    // 中央氣象署日累積雨量圖 (實測)：過去的日期用隔日 00:00 的全日圖，今天用最近的半小時圖
    const CWA_OBS_BASE = 'https://www.cwa.gov.tw/Data/rainfall/';
    const CWA_OBS_DAYS_BACK = 2;

    function getObservedCandidates(targetYYYYMMDD) {
        const pad = n => String(n).padStart(2, '0');
        const key = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
        const fileDate = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        const now = new Date(Date.now() + TPE_OFFSET);
        const target = new Date(Date.UTC(
            parseInt(targetYYYYMMDD.substr(0, 4), 10),
            parseInt(targetYYYYMMDD.substr(4, 2), 10) - 1,
            parseInt(targetYYYYMMDD.substr(6, 2), 10)
        ));
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const daysBack = Math.round((today.getTime() - target.getTime()) / (86400 * 1000));
        if (daysBack < 0 || daysBack > CWA_OBS_DAYS_BACK) return [];

        const md = `${pad(target.getUTCMonth() + 1)}/${pad(target.getUTCDate())}`;
        if (daysBack > 0) {
            const next = new Date(target.getTime() + 86400 * 1000);
            return [{ file: `${fileDate(next)}_0000`, label: `${md} 全日` }];
        }

        // 圖檔約晚幾分鐘上架，往回多試幾個半小時
        const candidates = [];
        const slot = new Date(now);
        slot.setUTCMinutes(now.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
        for (let i = 0; i < 4; i++) {
            const t = new Date(slot.getTime() - i * 1800 * 1000);
            if (key(t) !== targetYYYYMMDD || (t.getUTCHours() === 0 && t.getUTCMinutes() === 0)) break;
            const hhmm = `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}`;
            candidates.push({
                file: `${fileDate(t)}_${hhmm}`,
                label: `${md} 00:00～${hhmm.substr(0, 2)}:${hhmm.substr(2)}`
            });
        }
        return candidates;
    }

    function renderObserved(targetYYYYMMDD) {
        const candidates = getObservedCandidates(targetYYYYMMDD);
        let index = 0;

        function tryNext() {
            if (index >= candidates.length) return;
            const c = candidates[index++];
            const imgUrl = `${CWA_OBS_BASE}${c.file}.QZJ8.jpg`;
            const testImg = new Image();
            testImg.onload = function () {
                if (currentHoverDate !== targetYYYYMMDD || !isEnabled) return;
                obsColCount = 1;
                cardObs.innerHTML = `
            <div class="ncdr-col">
                <div class="ncdr-caption">氣象署實測 ${c.label}</div>
                <img class="ncdr-img" alt="日累積雨量圖" src="${imgUrl}" />
            </div>`;
                positionTooltip();
            };
            testImg.onerror = tryNext;
            testImg.src = imgUrl;
        }

        tryNext();
    }

    function positionTooltip() {
        const cardWidth = (obsColCount + cwaColCount + 1) * COL_WIDTH + 20;
        const cardHeight = Math.max(380, tooltip.offsetHeight);
        let posX = lastMouse.x + 16;
        let posY = lastMouse.y + 16;

        if (posX + cardWidth > window.innerWidth) posX = lastMouse.x - cardWidth - 16;
        if (posY + cardHeight > window.innerHeight) posY = lastMouse.y - cardHeight - 16;

        tooltip.style.left = `${Math.max(10, posX)}px`;
        tooltip.style.top = `${Math.max(10, posY)}px`;
    }

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

        cwaColCount = 0;
        obsColCount = 0;
        cwaIssueText = '';
        cardCwa.innerHTML = '';
        cardObs.innerHTML = '';
        renderObserved(targetYYYYMMDD);
        lastMouse = { x: mouseX, y: mouseY };
        fetchCwaInfo((info) => {
            if (currentHoverDate === targetYYYYMMDD && isEnabled) renderCwa(info, targetYYYYMMDD);
        });

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
                    ncdrInfoText = `NCDR 模式發布：${tryRun.substr(0, 4)}/${tryRun.substr(4, 2)}/${tryRun.substr(6, 2)}`;
                    updateFooter();
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

        positionTooltip();
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
            lastMouse = { x: e.clientX, y: e.clientY };
            positionTooltip();
            return;
        }

        currentHoverDate = dateStr;
        if (hoverTimer) clearTimeout(hoverTimer);

        hoverTimer = setTimeout(() => {
            showForecast(targetDate, e.clientX, e.clientY);
        }, 100);
    });

})();
