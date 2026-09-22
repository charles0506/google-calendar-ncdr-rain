// ==UserScript==
// @name         Google 日曆 - NCDR 六週降雨預報懸停卡片 (Taiwan Rain Forecast)
// @namespace    https://github.com/charles0506/google-calendar-ncdr-rain
// @version      1.1.0
// @description  在 Google 日曆中，將滑鼠移到任意日期格子上，立即浮現當天 NCDR 全台六週降雨預報圖！
// @author       Antigravity
// @match        https://calendar.google.com/*
// @icon         https://watch.ncdr.nat.gov.tw/icon/watch_icon_02.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      watch.ncdr.nat.gov.tw
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log('%c[NCDR Rain Forecast] 腳本已啟動！正在監聽 Google 日曆...', 'background: #1976d2; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;');

    // 狀態設定
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
        #ncdr-rain-tooltip {
            position: fixed;
            display: none;
            z-index: 999999999 !important;
            pointer-events: none;
            transition: opacity 0.15s ease-out, transform 0.15s ease-out;
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
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12);
            border: 1px solid rgba(0, 0, 0, 0.1);
            width: 240px;
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
            background: rgba(255, 255, 255, 0.25);
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: 500;
        }
        .ncdr-body {
            position: relative;
            background: #f8fafc;
            min-height: 280px;
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

    // 預設期數 (備用)
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

    // 取得最新 NCDR 執行期數
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
                const rawDate = parts[1].trim(); // 例 202609210000
                const runDate = rawDate.substr(0, 10); // 例 2026092100
                const runMonth = rawDate.substr(0, 6); // 例 202609
                
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
                console.log('[NCDR Rain Forecast] 期數更新成功:', latestRun);
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

    // 解析 Google 日曆核心的 data-datekey 演算法 (數學公式精準解碼)
    // Formula: datekey = (year - 1970) * 512 + month * 32 + day
    function decodeGoogleDateKey(key) {
        const num = parseInt(key, 10);
        if (isNaN(num)) return null;
        const year = Math.floor(num / 512) + 1970;
        const rem = num % 512;
        const month = Math.floor(rem / 32); // 1 ~ 12
        const day = rem % 32;               // 1 ~ 31
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
            return new Date(year, month - 1, day);
        }
        return null;
    }

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

    // 從游標下的 DOM 元素精準提取日期
    function extractDateFromElement(el) {
        if (!el) return null;

        let cur = el;
        for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
            // 1. 【最精準】直接尋找 data-datekey (Google 日曆全視圖通用)
            const dateKey = cur.getAttribute('data-datekey');
            if (dateKey) {
                const decoded = decodeGoogleDateKey(dateKey);
                if (decoded) return decoded;
            }

            // 2. 尋找子節點的 data-datekey
            if (cur.querySelector) {
                const childWithKey = cur.querySelector('[data-datekey]');
                if (childWithKey) {
                    const decoded = decodeGoogleDateKey(childWithKey.getAttribute('data-datekey'));
                    if (decoded) return decoded;
                }
            }

            // 3. 檢查 data-date (例如 "2026-09-30")
            if (cur.dataset && cur.dataset.date) {
                const parts = cur.dataset.date.split('-');
                if (parts.length === 3) {
                    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                }
            }

            // 4. 檢查 aria-label (中文/英文)
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

    // 顯示卡片
    function showForecast(targetDate, mouseX, mouseY) {
        if (!latestRun) {
            fetchLatestRunDate(() => showForecast(targetDate, mouseX, mouseY));
            return;
        }

        const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);
        const diffDays = Math.round((targetDate.getTime() - latestRun.baseDateTimestamp) / (86400 * 1000));

        // NCDR 預報涵蓋 1 ~ 42 天
        if (diffDays < 0 || diffDays > 42) {
            hideForecast();
            return;
        }

        const weekNum = Math.floor(diffDays / 7) + 1;
        cardTitle.textContent = formatDateDisplay(targetDate);
        cardBadge.textContent = `第 ${weekNum} 週預報`;
        cardInfo.textContent = `模式發布：${latestRun.runDate.substr(0, 4)}/${latestRun.runDate.substr(4, 2)}/${latestRun.runDate.substr(6, 2)}`;

        // NCDR 最佳化雨量圖網址 (semw05 模型)
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

        // 計算卡片位置 (避開滑鼠與螢幕邊緣)
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

    // 監聽全局滑鼠移動
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
            // 微調位置
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
