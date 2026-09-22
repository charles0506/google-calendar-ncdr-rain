(function () {
    'use strict';

    console.log('[NCDR Rain Forecast Extension] 啟動中...');

    let latestRun = null;
    let hoverTimer = null;
    let currentHoverDate = null;

    // 建立浮動卡片 DOM
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
                    <span>取得雨量圖中...</span>
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
    const cardImg = document.getElementById('ncdr-card-img');
    const cardInfo = document.getElementById('ncdr-card-info');

    // 取得最新 NCDR 執行期數
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
                    
                    const year = parseInt(runDate.substr(0, 4));
                    const month = parseInt(runDate.substr(4, 2)) - 1;
                    const day = parseInt(runDate.substr(6, 2));
                    const baseDate = new Date(year, month, day);

                    latestRun = { runMonth, runDate, baseDateTimestamp: baseDate.getTime() };
                    localStorage.setItem('ncdr_latest_run', JSON.stringify(latestRun));
                    localStorage.setItem('ncdr_cached_time', now.toString());
                    console.log('[NCDR Extension] 最新期數更新成功:', latestRun);
                    if (callback) callback(latestRun);
                }
            })
            .catch(err => {
                console.warn('[NCDR Extension] 無法取得最新期數:', err);
            });
    }

    fetchLatestRunDate();

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

        let current = el;
        let depth = 0;
        while (current && depth < 6 && current !== document.body) {
            if (current.dataset && current.dataset.date) {
                const parts = current.dataset.date.split('-');
                if (parts.length === 3) {
                    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                }
            }

            const label = current.getAttribute('aria-label') || '';
            if (label) {
                const matchZhFull = label.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                if (matchZhFull) {
                    return new Date(parseInt(matchZhFull[1]), parseInt(matchZhFull[2]) - 1, parseInt(matchZhFull[3]));
                }

                const matchEn = label.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i);
                if (matchEn) {
                    const parsed = new Date(label);
                    if (!isNaN(parsed.getTime())) return parsed;
                }
            }

            if (current.getAttribute('role') === 'gridcell' || current.getAttribute('data-datekey')) {
                const heading = current.querySelector('h2, [aria-label*="月"], [aria-label*="日"]');
                if (heading) {
                    const hLabel = heading.getAttribute('aria-label') || '';
                    const match = hLabel.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/) ||
                                  hLabel.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                    if (match) {
                        const year = match.length === 4 ? parseInt(match[1]) : new Date().getFullYear();
                        const month = match.length === 4 ? parseInt(match[2]) - 1 : parseInt(match[1]) - 1;
                        const day = match.length === 4 ? parseInt(match[3]) : parseInt(match[2]);
                        return new Date(year, month, day);
                    }
                }
            }

            current = current.parentElement;
            depth++;
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
                cardLoading.innerHTML = '<span style="color:#ef4444;">無此日期預報圖</span>';
            }
        };
        img.src = imgUrl;

        const cardWidth = 240;
        const cardHeight = 340;
        let posX = mouseX + 16;
        let posY = mouseY + 16;

        if (posX + cardWidth > window.innerWidth) posX = mouseX - cardWidth - 16;
        if (posY + cardHeight > window.innerHeight) posY = mouseY - cardHeight - 16;

        tooltip.style.left = `${posX}px`;
        tooltip.style.top = `${posY}px`;
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
            if (posX + 240 > window.innerWidth) posX = e.clientX - 240 - 16;
            if (posY + 340 > window.innerHeight) posY = e.clientY - 340 - 16;
            tooltip.style.left = `${posX}px`;
            tooltip.style.top = `${posY}px`;
            return;
        }

        currentHoverDate = dateStr;
        if (hoverTimer) clearTimeout(hoverTimer);

        hoverTimer = setTimeout(() => {
            showForecast(targetDate, e.clientX, e.clientY);
        }, 150);
    });

})();
