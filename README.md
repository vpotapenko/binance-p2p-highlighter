# Binance P2P Best Price!

![Version](https://img.shields.io/badge/version-1.9-blue) ![Chrome Extension](https://img.shields.io/badge/platform-Chrome-google)

**Binance P2P Best Price** is a powerful Chrome extension that automates the search for profitable P2P offers on Binance. It filters advertisers by reliability, highlights offers matching your amount range, and alerts you when a price hits your target.

## 🚀 Key Features

### 1. Smart Offer Highlighting
The extension visually modifies the P2P table based on your settings:
* **✅ Safe Matches (Green):** Rows are highlighted in green if the advertiser has **≥95% completion** and **≥300 orders**, and your desired amount falls within their limits.
* **💎 VIP Advertisers (Gold Outline):** A special gold border wraps the statistics of top-tier merchants (**≥97% completion** & **≥450 orders**).
* **🎯 Price Alerts (Orange):** If an offer's price is less than or equal to your `Max Price`, the price cell blinks and gets an orange highlight.

### 2. Audio & Visual Alerts
Never miss a deal while working in another tab:
* **🔊 Sound Notification:** Plays a "ding" sound when a target price is found.
* **⚡ Tab Flashing:** The browser tab title blinks with the price (e.g., `🔥Page 1: 39.50`).
* **🚨 Favicon Alert:** The tab icon changes to an alert symbol to grab attention.

### 3. Automation & Logic
* **🔄 Auto-Pagination:** If you are idle for more than 15 seconds, the extension automatically scans subsequent pages (configurable limit) to find better offers.
* **📊 Market Analysis:** Calculates the average price based on the lowest 35% of offers and logs match history to Chrome Storage (auto-clears logs older than 12h).

---

## ⚙️ Configuration

Click the extension icon to open the **Options Page** and configure your filters:

| Setting | Description |
| :--- | :--- |
| **Minimum Amount** | Your minimum transaction amount (e.g., 1000). |
| **Maximum Amount** | Your maximum transaction amount (e.g., 5000). |
| **Currency Code** | The fiat currency to scan for (e.g., `UAH`, `USD`). |
| **Max Price** | **Important:** You will only be alerted for prices at or below this value. |
| **Pages to Check** | Number of pages to auto-scan when idle (Default: 2). |

> **Note:** Click **Save** to apply changes. The extension updates in real-time or on the next page refresh.

---

## 🛠 Installation

Since this is a custom tool, install it via **Developer Mode**:

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the project folder containing `manifest.json`.

---

## 🎨 Color Legend

* <span style="background-color: rgba(46, 189, 133, 0.25); border-radius: 4px; padding: 2px 5px;">**Green Row**</span>: Advertiser meets safety criteria (95%+/300+) AND limit matches your Amount.
* <span style="background-color: rgba(255, 159, 67, 0.25); border-radius: 4px; padding: 2px 5px;">**Orange Price**</span>: Price is ≤ your "Max Price".
* <span style="border: 2px solid gold; border-radius: 4px; padding: 2px 5px;">**Gold Border**</span>: VIP Merchant (97%+/450+).

## ⚠️ Disclaimer

This tool is for informational purposes only. Always verify the price, limits, and advertiser reputation manually on the Binance platform before initiating a trade.
