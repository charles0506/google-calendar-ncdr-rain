(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast Extension] 啟動中...', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

    let latestRun = null;
    let hoverTimer = null;
    let currentHoverDate = null;

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

    // Google 日曆 data-datekey 數學解碼公式
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

    function extractDateFromElement(el) {
        if (!el) return null;

        let cur = el;
        for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
            const dateKey = cur.getAttribute('data-datekey');
            if (dateKey) {
                const decoded = decodeGoogleDateKey(dateKey);
                if (decoded) return decoded;
            }

            if (cur.querySelector) {
                const childWithKey = cur.querySelector('[data-datekey]');
                if (childWithKey) {
                    const decoded = decodeGoogleDateKey(childWithKey.getAttribute('data-datekey'));
                    if (decoded) return decoded;
                }
            }

            if (cur.dataset && cur.dataset.date) {
                const parts = cur.dataset.date.split('-');
                if (parts.length === 3) {
                    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                }
            }

            const label = cur.getAttribute('aria-label') || '';
            if (label) {
                const mZhFull = label.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                if (mZhFull) {
                    return new Date(parseInt(mZhFull[1], 10), parseInt(mZhFull[2], 10) - 1, parseInt(mZhFull[3], 10));
                }
                const mEn = label.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i);
                if (mEn) {
                    const d = new Date(label);
                    if (!isNaN(d.getTime())) return d;
                }
            }

            cur = cur.parentElement;
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

        if (diffDays < 0 || diffDays > 42) {
            hideForecast();
            return;
        }

        const weekNum = Math.floor(diffDays / 7) + 1;
        cardTitle.textContent = formatDateDisplay(targetDate);
        cardBadge.textContent = `第 ${weekNum} 週預報`;
        cardInfo.textContent = `模式發布：${latestRun.runDate.substr(0, 4)}/${latestRun.runDate.substr(4, 2)}/${latestRun.runDate.substr(6, 2)}`;

        const imgUrl = `https://watch.ncdr.nat.gov.tw/00_Wxmap/2F6_MPAS2WRF_45d/${latestRun.runMonth}/${latestRun.runDate}/semw05_qpf_${latestRun.runDate}_${targetYYYYMMDD}.gif`;

        cardLoading.style.display = 'flex';
        cardStatus.textContent = '取得雨量圖中...';
        cardImg.style.display = 'none';

        const img = new Image();
        img.onload = function () {
            if (currentHoverDate === targetYYYYMMDD) {
                cardImg.src = imgUrl;
                cardLoading.style.display = 'none';
                cardImg.style.display = 'block';
            }
        };
        img.onerror = function () {
            if (currentHoverDate === targetYYYYMMDD) {
                cardStatus.textContent = '無此日期之模式圖';
            }
        };
        img.src = imgUrl;

        const cardWidth = 245;
        const cardHeight = 350;
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
        const target = e.target;
        const targetDate = extractDateFromElement(target);

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
            if (posX + 245 > window.innerWidth) posX = e.clientX - 245 - 16;
            if (posY + 350 > window.innerHeight) posY = e.clientY - 350 - 16;
            tooltip.style.left = `${Math.max(10, posX)}px`;
            tooltip.style.top = `${Math.max(10, posY)}px`;
            return;
        }

        currentHoverDate = dateStr;
        if (hoverTimer) clearTimeout(hoverTimer);

        hoverTimer = setTimeout(() => {
            showForecast(targetDate, e.clientX, e.clientY);
        }, 120);
    });

})();
