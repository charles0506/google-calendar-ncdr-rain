# Google 日曆 - NCDR 六週降雨預報懸停卡片 🌧️

在 Google 日曆（Google Calendar）中，只要將滑鼠游標移到任意日期格子上，立即浮現當天由國家災害防救科技中心（NCDR）發布的全台六週降雨數值模式預報圖（MPAS 模式）！

![Demo Preview](https://watch.ncdr.nat.gov.tw/icon/watch_DM_2017_2.jpg)

## ✨ 特色亮點

* 🖱️ **滑鼠懸停即看（Hover Preview）**：在月視圖中滑鼠移到特定日期（例如 9月30日），畫面立即浮出當日降雨預報圖。
* 🔄 **自動追蹤最新期數**：自動對接 NCDR API，每日動態取得最新模式資料（涵蓋未來 42 天 / 6 週）。
* ⚡ **防抖動與快取設計**：游標快速滑過不閃爍，期數本機快取 1 小時，載入極速無負擔。
* 📱 **避邊緣智慧定位**：自動判斷視窗邊緣，卡片絕不超出螢幕。
* 🐒 **支援雙棲安裝**：提供 Tampermonkey 竄改猴腳本 與 Chrome 擴充套件雙版本。

---

## 🚀 快速安裝與使用

### 方法 A：使用 Tampermonkey（推薦，最快速！）

1. 打開瀏覽器的 **Tampermonkey（竄改猴）** 圖示，點擊 **「新增腳本」**。
2. 將本專案中的 [`ncdr-calendar.user.js`](./ncdr-calendar.user.js) 內容完整複製並貼上到編輯器中。
3. 按下鍵盤 `Ctrl + S` 儲存腳本。
4. 打開 [Google 日曆](https://calendar.google.com/)，重新整理網頁。
5. 將滑鼠游標移到未來的任一日期格子上，即刻看到降雨預報浮動卡片！🎉

---

### 方法 B：載入為 Chrome 擴充套件

1. 在 Chrome 網址列輸入 `chrome://extensions` 並按下 Enter。
2. 開啟右上角的 **「開發人員模式」（Developer mode）**。
3. 點擊左上角的 **「載入未封裝項目」（Load unpacked）**。
4. 選擇本專案資料夾即可完成安裝。

---

## 📂 專案結構

```
google-calendar-ncdr-rain/
├── ncdr-calendar.user.js    # 竄改猴 (Tampermonkey) 腳本
├── manifest.json            # Chrome 擴充套件設定 (Manifest V3)
├── content.js               # Chrome 擴充套件內容腳本
├── style.css                # 浮動卡片樣式
└── README.md                # 說明文件
```

## 🌐 資料來源

* 國家災害防救科技中心（NCDR）氣象組
* 氣候降雨展望：[https://watch.ncdr.nat.gov.tw/watch_rain_6weeks](https://watch.ncdr.nat.gov.tw/watch_rain_6weeks)

## 📄 授權條款

MIT License
