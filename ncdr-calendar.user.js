// ==UserScript==
// @name         Google 日曆 - NCDR 六週降雨預報懸停卡片 (Taiwan Rain Forecast)
// @namespace    https://github.com/charles0506/google-calendar-ncdr-rain
// @version      1.0.0
// @description  在 Google 日曆中，將滑鼠移到任意日期格子上，立即浮現當天 NCDR 全台六週降雨預報圖！
// @author       Antigravity
// @match        https://calendar.google.com/calendar/*
// @icon         https://watch.ncdr.nat.gov.tw/icon/watch_icon_02.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      watch.ncdr.nat.gov.tw
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('[NCDR Rain Forecast] 腳本已啟動...');

    // 狀態設定
    let latestRun = null; // 例: { runMonth: '202609', runDate: '2026092100', runTimestamp: ... }
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

    // 插入樣式
    const style = document.createElement('style');
    style.textContent = `
        #ncdr-rain-tooltip {
            position: fixed;
            display: none;
            z-index: 9999999;
            pointer-events: none;
            transition: opacity 0.15s ease-out, transform 0.15s ease-out;
            opacity: 0;
            transform: scale(0.96);
        }
        #ncdr-rain-tooltip.visible {
            display: block;
            opacity: 1;
            transform: scale(1);
        }
        .ncdr-card {
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(0, 0, 0, 0.08);
            width: 230px;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
        }
        .ncdr-header {
            background: linear-gradient(135deg, #1976d2, #0d47a1);
            color: #ffffff;
            padding: 8px 12px;
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
            background: rgba(255, 255, 255, 0.2);
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 500;
        }
        .ncdr-body {
            position: relative;
            background: #f8fafc;
            min-height: 270px;
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
    const cardImg = document.getElementById('ncdr-card-img');
    const cardInfo = document.getElementById('ncdr-card-info');

    // 取得最新 NCDR 執行期數
    function fetchLatestRunDate(callback) {
        // 先檢查快取（快取 1 小時）
        const cached = GM_getValue('ncdr_latest_run', null);
        const cachedTime = GM_getValue('ncdr_cached_time', 0);
        const now = Date.now();

        if (cached && (now - cachedTime < 3600 * 1000)) {
            latestRun = cached;
            if (callback) callback(latestRun);
            return;
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://watch.ncdr.nat.gov.tw/php/list_realtime_date_csv.php?v=CHART_MPAS_45_OPTIMAL&tt=' + now,
            onload: function (response) {
                if (response.status === 200) {
                    const text = response.responseText.trim();
                    const parts = text.split(',');
                    if (parts.length >= 2) {
                        const rawDate = parts[1].trim(); // 例 202609210000
                        const runDate = rawDate.substr(0, 10); // 例 2026092100
                        const runMonth = rawDate.substr(0, 6); // 例 202609
                        
                        // 計算起始基準日
                        const year = parseInt(runDate.substr(0, 4));
                        const month = parseInt(runDate.substr(4, 2)) - 1;
                        const day = parseInt(runDate.substr(6, 2));
                        const baseDate = new Date(year, month, day);

                        latestRun = { runMonth, runDate, baseDateTimestamp: baseDate.getTime() };
                        GM_setValue('ncdr_latest_run', latestRun);
                        GM_setValue('ncdr_cached_time', now);
                        console.log('[NCDR Rain Forecast] 最新期數更新成功:', latestRun);
                        if (callback) callback(latestRun);
                    }
                }
            },
            onerror: function (err) {
                console.warn('[NCDR Rain Forecast] 無法取得最新期數，使用備用計算', err);
            }
        });
    }

    // 立即取得一次期數
    fetchLatestRunDate();

    // 格式化日期為 YYYYMMDD
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

    // 從 Google 日曆 DOM 元素解析日期
    function extractDateFromElement(el) {
        if (!el) return null;

        // 向上尋找包含日期資訊的容器
        let current = el;
        let depth = 0;
        while (current && depth < 6 && current !== document.body) {
            // 1. 檢查 data-date 屬性 (例: 2026-09-30)
            if (current.dataset && current.dataset.date) {
                const parts = current.dataset.date.split('-');
                if (parts.length === 3) {
                    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                }
            }

            // 2. 檢查 aria-label
            const label = current.getAttribute('aria-label') || '';
            if (label) {
                // 中文模式: "2026年9月30日" 或 "9月30日"
                const matchZhFull = label.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
                if (matchZhFull) {
                    return new Date(parseInt(matchZhFull[1]), parseInt(matchZhFull[2]) - 1, parseInt(matchZhFull[3]));
                }

                // 英文模式: "Wednesday, September 30, 2026"
                const matchEn = label.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i);
                if (matchEn) {
                    const parsed = new Date(label);
                    if (!isNaN(parsed.getTime())) return parsed;
                }
            }

            // 3. 檢查 role="gridcell" 或 data-datekey
            if (current.getAttribute('role') === 'gridcell' || current.getAttribute('data-datekey')) {
                // 在該 gridcell 內尋找標題的 aria-label 或子元素文字
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

    // 顯示卡片
    function showForecast(targetDate, mouseX, mouseY) {
        if (!latestRun) {
            fetchLatestRunDate(() => showForecast(targetDate, mouseX, mouseY));
            return;
        }

        const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);
        const diffDays = Math.round((targetDate.getTime() - latestRun.baseDateTimestamp) / (86400 * 1000));

        // NCDR 預報涵蓋 1 ~ 42 天 (未來 6 週)
        if (diffDays < 0 || diffDays > 42) {
            hideForecast();
            return;
        }

        const weekNum = Math.floor(diffDays / 7) + 1;
        cardTitle.textContent = formatDateDisplay(targetDate);
        cardBadge.textContent = `第 ${weekNum} 週預報`;
        cardInfo.textContent = `模式發布：${latestRun.runDate.substr(0, 4)}/${latestRun.runDate.substr(4, 2)}/${latestRun.runDate.substr(6, 2)}`;

        // NCDR 最佳化雨量圖網址 (semw05 最佳化模型)
        const imgUrl = `https://watch.ncdr.nat.gov.tw/00_Wxmap/2F6_MPAS2WRF_45d/${latestRun.runMonth}/${latestRun.runDate}/semw05_qpf_${latestRun.runDate}_${targetYYYYMMDD}.gif`;

        cardLoading.style.display = 'flex';
        cardImg.style.display = 'none';

        // 預載圖片
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

        // 計算定位 (避開滑鼠與螢幕邊緣)
        const cardWidth = 240;
        const cardHeight = 340;
        let posX = mouseX + 16;
        let posY = mouseY + 16;

        if (posX + cardWidth > window.innerWidth) {
            posX = mouseX - cardWidth - 16;
        }
        if (posY + cardHeight > window.innerHeight) {
            posY = mouseY - cardHeight - 16;
        }

        tooltip.style.left = `${posX}px`;
        tooltip.style.top = `${posY}px`;
        tooltip.classList.add('visible');
    }

    // 隱藏卡片
    function hideForecast() {
        tooltip.classList.remove('visible');
        currentHoverDate = null;
    }

    // 監聽滑鼠移動 (含防抖動 Debounce)
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
            // 只微調位置
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

        // 滑鼠停留在該格 150 毫秒後浮出，防止快速滑過時頻繁閃爍
        hoverTimer = setTimeout(() => {
            showForecast(targetDate, e.clientX, e.clientY);
        }, 150);
    });

})();
