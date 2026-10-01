// Chrome Extension Service Worker (Manifest V3)
// 負責跨網域取得 NCDR 最新發布期數，不受頁面 CORS 限制

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchLatestRun') {
        const url = 'https://watch.ncdr.nat.gov.tw/php/list_realtime_date_csv.php?v=CHART_MPAS_45_OPTIMAL&tt=' + Date.now();
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(text => {
                sendResponse({ success: true, text });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.toString() });
            });
        return true; // 保持異步通道
    }

    if (request.action === 'fetchCwaQpfTime') {
        // 氣象署定量降水預報圖的上傳時間，用來推算各張圖的有效時段
        const url = 'https://www.cwa.gov.tw/Data/fcst_img/QPF_ChFcstPrecip_12_12.png?T=' + Date.now();
        fetch(url, { method: 'HEAD' })
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                sendResponse({ success: true, lastModified: res.headers.get('last-modified') });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }
});
