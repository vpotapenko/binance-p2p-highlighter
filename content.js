// Binance P2P Highlighter with advertiser-quality filters
// - Green highlight for "Available / Order Limit" when range overlaps AND advertiser is good (completion ≥95% & orders ≥300)
// - Orange highlight around Price text when <= maxPrice AND row is green
// - Gold outline hugging “orders | completion” only when orders ≥450 & completion ≥97% AND row is green
// - Bold text "100.00% completion"
// - Sound + blink on best Price
// - Cleans up stale highlights (handles virtualized rows & text updates via MutationObserver)
// - Logs matched offers (Price <= MaxPrice) to Chrome Storage (Max 10 entries)
// - Auto-clears matched offers log if >12h passed since last match

(() => {
  // --- sound (безопасен с политикой автовоспроизведения Chrome) ---
  const priceSound = new Audio(chrome.runtime.getURL('ding.mp3'));
  priceSound.volume = 1.0; // Устанавливаем громкость

  let pagesToCheck = 2; // Количество страниц для автоматической проверки (значение по умолчанию)

  // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ АНАЛИЗА ЦЕН ---
  let priceHistory = [];      // Накапливает цены
  let averagePriceLog = [];   // Хранит историю расчетов {timestamp, average}
  let matchedOffersLog = [];  // Хранит историю найденных совпадений {timestamp, price, offerText}
  
  // Ключи для сохранения данных в Chrome Storage
  const PRICE_HISTORY_KEY = 'p2pPriceHistory';
  const AVG_PRICE_LOG_KEY = 'p2pAveragePriceLog';
  const MATCHED_OFFERS_KEY = 'p2pMatchedOffersLog';


  /**
   * Вспомогательная функция форматирования даты для логов
   */
  function formatDateForLog(timestamp) {
      const date = new Date(timestamp);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = months[date.getMonth()];
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day}-${month} ${hours}:${minutes}`;
  }

  /**
   * Форматирует массив средних цен для вывода в консоль.
   */
  function formatAveragePriceLog() {
      if (!averagePriceLog.length) return '[]';
      
      return '[\n' + averagePriceLog.map(item => {
          const dateTime = formatDateForLog(item.timestamp);
          return `  {${dateTime}, price: ${item.average.toFixed(2)} UAH}`;
      }).join(',\n') + '\n]';
  }

  /**
   * Форматирует лог совпадений цен для вывода в консоль
   */
  function formatMatchedOffersLog() {
      if (!matchedOffersLog.length) return '[]';

      return '[\n' + matchedOffersLog.map(item => {
          const dateTime = formatDateForLog(item.timestamp);
          return `  ${dateTime}, price: ${item.price.toFixed(2)} UAH, offer: ${item.offerText}`;
      }).join(',\n') + '\n]';
  }

  // --- ФУНКЦИИ УПРАВЛЕНИЯ ХРАНИЛИЩЕМ (PERSISTENCE) ---
  

/**
   * Загружает данные из chrome.storage.sync при запуске скрипта.
   */
  function loadDataFromStorage(callback) {
      chrome.storage.sync.get([PRICE_HISTORY_KEY, AVG_PRICE_LOG_KEY, MATCHED_OFFERS_KEY], (data) => {
          // Загружаем данные
          priceHistory = data[PRICE_HISTORY_KEY] || [];
          averagePriceLog = data[AVG_PRICE_LOG_KEY] || [];
          matchedOffersLog = data[MATCHED_OFFERS_KEY] || [];
          
          const now = Date.now();

          // --- 1. ЛОГИКА ОЧИСТКИ PRICE HISTORY (ОБНОВЛЕНО) ---
          // Если последняя запись анализа (averagePriceLog) старше 4 часов:
          // 1. Очищаем priceHistory
          // 2. Добавляем запись с ценой 0 в averagePriceLog (чтобы не очищать повторно при перезагрузке)
          if (averagePriceLog.length > 0) {
              const lastAvgEntry = averagePriceLog[averagePriceLog.length - 1];
              const fourHoursMs = 4 * 60 * 60 * 1000; // 4 часа

              if (now - lastAvgEntry.timestamp > fourHoursMs) {
                  console.log('[P2P-Extension] Last Average Price Log is stale (>4h). Clearing accumulated PriceHistory & Adding reset entry...');
                  
                  // Сброс истории цен
                  priceHistory = []; 
                  chrome.storage.sync.set({ [PRICE_HISTORY_KEY]: [] }); 

                  // Добавление технической записи "сброса", чтобы обновить таймер
                  const resetEntry = {
                      timestamp: now,
                      average: 0.0,
                      totalPrices: 0,
                      pricesCounted: 0
                  };
                  averagePriceLog.push(resetEntry);
                  
                  // Ограничиваем размер лога, если нужно (например, держим последние 40)
                  const MAX_LOG_ENTRIES = 40;
                  if (averagePriceLog.length > MAX_LOG_ENTRIES) {
                      averagePriceLog = averagePriceLog.slice(-MAX_LOG_ENTRIES);
                  }

                  chrome.storage.sync.set({ [AVG_PRICE_LOG_KEY]: averagePriceLog });
              }
          }

          // --- 2. ЛОГИКА ОЧИСТКИ MATCHED OFFERS (СУЩЕСТВУЮЩЕЕ) ---
          if (matchedOffersLog.length > 0) {
              const lastEntry = matchedOffersLog[matchedOffersLog.length - 1]; 
              const twelveHoursMs = 12 * 60 * 60 * 1000; // 12 часов

              if (now - lastEntry.timestamp > twelveHoursMs) {
                  console.log('[P2P-Extension] Matched Offers Log is stale (>12h since last match). Clearing...');
                  matchedOffersLog = []; 
                  chrome.storage.sync.set({ [MATCHED_OFFERS_KEY]: [] }); 
              }
          }
          // ---------------------------------------

          console.log(`[P2P-Extension] Loaded: PriceHistory(${priceHistory.length}), AvgLog(${averagePriceLog.length}), MatchedLog(${matchedOffersLog.length}).`);
          
          // Вывод логов в консоль
          console.log(`[P2P-Extension] Average Price Log: ${formatAveragePriceLog()}`);
          console.log(`[P2P-Extension] Matched Offers Log: ${formatMatchedOffersLog()}`);
          
          if (callback) callback();
      });
  }

  /**
   * Сохраняет текущий массив priceHistory.
   */
  function savePriceHistory() {
      chrome.storage.sync.set({ [PRICE_HISTORY_KEY]: priceHistory });
  }
  
  /**
   * Сохраняет текущий массив averagePriceLog.
   */
  function saveAveragePriceLog() {
      chrome.storage.sync.set({ [AVG_PRICE_LOG_KEY]: averagePriceLog });
  }

  /**
   * Сохраняет массив matchedOffersLog.
   */
  function saveMatchedOffersLog() {
      chrome.storage.sync.set({ [MATCHED_OFFERS_KEY]: matchedOffersLog });
  }
  
  /**
   * Воспроизводит звук уведомления о цене.
   */
  function playPriceSound() {
    try {
      //console.log('[P2P-Extension] Attempting to play sound…');
      priceSound.play();
    } catch (e) {
      console.error('[P2P-Extension] Sound play() threw exception:', e);
    }
  }


  // --- CSS + логика мигания Price ---
  const blinkStyle = document.createElement('style');
  blinkStyle.textContent = `
@keyframes p2pBlink {
  0%   { background-color: rgba(255, 159, 67, 0.25); }
  50%  { background-color: rgba(255, 159, 67, 0.65); }
  100% { background-color: rgba(255, 159, 67, 0.25); }
}
.p2p-price-blink {
  animation: p2pBlink 0.5s ease-in-out 6;
}
`;
  (document.head || document.documentElement).appendChild(blinkStyle);

  function blinkPriceCell(el) {
    if (!el) return;
    el.classList.add('p2p-price-blink');
    setTimeout(() => {
      el.classList.remove('p2p-price-blink');
    }, 3000);
  }

  // --- ЛОГИКА РАСЧЕТА И УПРАВЛЕНИЯ ПЕРСИСТЕНТНОСТЬЮ ---

  function executePriceAnalysis() {
      const MIN_PRICES_FOR_ANALYSIS = 50;
      const PERCENTAGE_TO_TAKE = 0.35;
      const MAX_LOG_ENTRIES = 40;

      if (priceHistory.length <= MIN_PRICES_FOR_ANALYSIS) {
          console.log(`[P2P-Extension] Price analysis skipped: only ${priceHistory.length} prices accumulated (< ${MIN_PRICES_FOR_ANALYSIS}).`);
          return;
      }

      const sortedPrices = [...priceHistory].sort((a, b) => a - b);
      const count = Math.ceil(sortedPrices.length * PERCENTAGE_TO_TAKE);
      const lowestPrices = sortedPrices.slice(0, count);
      const sum = lowestPrices.reduce((acc, price) => acc + price, 0);
      const average = sum / count;

      const now = Date.now();
      const logEntry = {
          timestamp: now,
          average: average,
          totalPrices: priceHistory.length,
          pricesCounted: count
      };
      averagePriceLog.push(logEntry);

      if (averagePriceLog.length > MAX_LOG_ENTRIES) {
          averagePriceLog = averagePriceLog.slice(-MAX_LOG_ENTRIES); 
          console.log(`[P2P-Extension] Average Price Log trimmed to last ${MAX_LOG_ENTRIES} entries.`);
      }

      saveAveragePriceLog();

      const date = new Date(now);
      const time = String(date.getHours()).padStart(2, '0') + ':' + 
                   String(date.getMinutes()).padStart(2, '0');
      console.log(`[P2P-Extension] [${time}] Price Analysis Completed: 
        Total Prices: ${logEntry.totalPrices}, 
        Lowest ${PERCENTAGE_TO_TAKE * 100}% (${logEntry.pricesCounted} items) Average Price: ${average.toFixed(4)}`);

      priceHistory = []; 
  }

  // --- Логика автообновления и переключения страниц при бездействии ---
  (function () {
    let lastMove = Date.now();

    document.addEventListener('mousemove', () => { lastMove = Date.now(); });
    document.addEventListener('keydown', () => { lastMove = Date.now(); });
    document.addEventListener('scroll', () => { lastMove = Date.now(); });

    let autoReloadEnabled = true;
    let currentPage = null;

    function detectCurrentPage() {
      const ariaEl = document.querySelector('[aria-current="page"]');
      if (ariaEl) {
        const n = parseInt(ariaEl.textContent.trim(), 10);
        if (!Number.isNaN(n)) return n;
      }
      const activeEl = document.querySelector('.bn-pagination .active');
      if (activeEl) {
        const n = parseInt(activeEl.textContent.trim(), 10);
        if (!Number.isNaN(n)) return n;
      }
      return null;
    }

    function goToPage(page) {
      const targetText = String(page);
      const btn = Array.from(document.querySelectorAll('button, a')).find(
        (el) => el.textContent && el.textContent.trim() === targetText
      );

      if (btn) {
        console.log(`[P2P-Extension] Idle -> go to page ${page} of total ${pagesToCheck}`);
        
        executePriceAnalysis(); 
        savePriceHistory(); 

        btn.click();
        return true;
      }

      console.log(`[P2P-Extension] Page ${page} button not found, fallback reload`);
      return false;
    }
    

    setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastMove;
      
      const isDetailPage = location.href.includes("/en/fiatOrderDetail");

      if (!isDetailPage && autoReloadEnabled && idleMs > 15000) {
        const domPage = detectCurrentPage();
        if (domPage != null) {
          currentPage = domPage;
        } else if (currentPage == null) {
          currentPage = 1;
        }

        if (currentPage < pagesToCheck) {
          const nextPage = currentPage + 1;
          const switched = goToPage(nextPage);
          if (switched) {
            currentPage = nextPage;
            lastMove = Date.now();
          } else {
            console.log('[P2P-Extension] Fallback -> full reload');
            executePriceAnalysis(); 
            savePriceHistory(); 
            location.reload();
          }
        } else {
          console.log(`[P2P-Extension] Idle on page ${pagesToCheck} -> full reload`);
          executePriceAnalysis(); 
          savePriceHistory(); 
          location.reload();
        }
      }
    }, 3000);
  })();

  // ---------- utils (Вспомогательные функции) ----------
  
  function parseNumber(str) {
    if (!str) return null;
    let s = String(str).replace(/\s/g, '');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma && hasDot) s = s.replace(/,/g, '');
    else if (hasComma && !hasDot) s = s.replace(/,/g, '.');

    s = s.replace(/[^0-9.]/g, '');
    const firstDot = s.indexOf('.');
    if (firstDot !== -1) {
      const before = s.slice(0, firstDot + 1);
      const after = s.slice(firstDot + 1).replace(/\./g, '');
      s = before + after;
    }

    const num = parseFloat(s);
    return Number.isFinite(num) ? num : null;
  }

  function parseRange(text, userCurrency) {
    const regex = new RegExp(
      `([\\d.,\\s]+)\\s*${userCurrency}\\s*-\\s*([\\d.,\\s]+)`,
      'i'
    );
    const m = text.match(regex);
    if (!m) return null;

    const min = parseNumber(m[1]);
    const max = parseNumber(m[2]);

    if (min == null || max == null) return null;
    return { min, max };
  }

  function rangesOverlap(userMin, userMax, offerMin, offerMax) {
    if (userMin == null || userMax == null) return false;
    return offerMin <= userMax && offerMax >= userMin;
  }

  function getAdvertiserCell(row) {
    return (
      row.querySelector('td[aria-colindex="1"][role="cell"]') ||
      row.querySelector('td:nth-child(1)')
    );
  }

  function getAdvertiserStats(row) {
    const advCell = getAdvertiserCell(row);
    if (!advCell) return { completion: null, orders: null, advCell: null };

    const statsEl = getStatsElement(advCell);
    const text = statsEl
      ? (statsEl.innerText || '')
      : (advCell.innerText || '');

    const cm = text.match(/(\d{1,3}(?:\.\d+)?)%\s+completion/i);
    const completion = cm ? parseFloat(cm[1]) : null;

    const om = text.match(/(\d+)\s+orders\b/i);
    let orders = null;
    if (om) {
      const raw = om[1].replace(/[^\d]/g, '');
      if (raw) orders = parseInt(raw, 10);
    }

    return { completion, orders, advCell };
  }

  function advertiserEligible(stats) {
    const { completion, orders } = stats;
    if (completion == null || orders == null) return false;
    return completion >= 95 && orders >= 300;
  }

  function advertiserVIP(stats) {
    const { completion, orders } = stats;
    if (completion == null || orders == null) return false;
    return completion >= 97 && orders >= 450;
  }

  function getStatsElement(advCell) {
    if (!advCell) return null;
    const nodes = Array.from(advCell.querySelectorAll('*'));

    const combined = nodes.filter((n) => {
      const t = (n.innerText || '').trim();
      return /\borders\b/i.test(t) && /%/.test(t);
    });

    if (combined.length) {
      combined.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
      return combined[0];
    }

    const orderNode = nodes.find((n) => /\borders\b/i.test((n.innerText || '').trim()));
    const percentNode = nodes.find((n) => /%/.test((n.innerText || '').trim()));

    if (orderNode && percentNode) {
      let a = orderNode;
      while (a) {
        if (a.contains(percentNode)) return a;
        a = a.parentElement;
      }
    }
    return null;
  }

  function wrapTextNodeIfNeeded(cell, className) {
    let span = cell.querySelector('.' + className);
    if (!span && cell.childNodes.length === 1 && cell.firstChild.nodeType === Node.TEXT_NODE) {
      const originalText = cell.textContent;
      cell.textContent = '';
      span = document.createElement('span');
      span.className = className;
      span.textContent = originalText;
      cell.appendChild(span);
    }
    return span || cell;
  }

  // ---------- VIP Outline + cleanup ----------

  function updateVipOutline(row, stats, isRowGreen) {
    const advCell = getAdvertiserCell(row);
    if (!advCell) return;

    const statsEl = getStatsElement(advCell);
    const needVip = isRowGreen && advertiserVIP(stats);

    if (!statsEl) {
      advCell.querySelectorAll('.p2p-stats-outline').forEach((w) => w.remove());
      row.dataset.uahVipApplied = '0';
      return;
    }

    let wrap = statsEl.querySelector('.p2p-stats-outline');

    if (needVip) {
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'p2p-stats-outline';
        while (statsEl.firstChild) wrap.appendChild(statsEl.firstChild);
        statsEl.appendChild(wrap);
        statsEl.style.display = 'contents';
      }

      wrap.style.display = 'inline-flex';
      wrap.style.width = 'max-content';
      wrap.style.maxWidth = 'max-content';
      wrap.style.alignItems = 'center';
      wrap.style.border = '2px solid rgba(255, 215, 0, 0.9)';
      wrap.style.borderRadius = '8px';
      wrap.style.padding = '2px 8px';
      wrap.style.background = 'transparent';
      wrap.style.boxSizing = 'border-box';
      row.dataset.uahVipApplied = '1';

      const nodes = Array.from(wrap.querySelectorAll('*')).concat([wrap]);
      nodes.forEach((n) => {
        if (n.innerText && n.innerText.includes('100.00% completion')) {
          n.innerHTML = n.innerHTML.replace(
            /(100\.00% completion)/g,
            '<b style="font-weight:700;color:#fff;">$1</b>'
          );
        }
      });
    } else {
      advCell.querySelectorAll('.p2p-stats-outline').forEach((w) => {
        if (statsEl && w.parentElement === statsEl) {
          while (w.firstChild) statsEl.appendChild(w.firstChild);
        }
        w.remove();
      });
      row.dataset.uahVipApplied = '0';
    }
  }

  // ---------- main (Основная логика) ----------

  function highlightOffers(userSettings, root = document) {
    const { minAmount, maxAmount, currency, maxPrice } = userSettings || {};
    const hasAmountRange = minAmount != null && maxAmount != null && !!currency;

    // --- 1. Подсветка диапазона (зеленый) ---
    if (hasAmountRange) {
      const elements = (root || document).querySelectorAll('div, span, td');
      elements.forEach((el) => {
        if (el.dataset.uahChecked === '1') return;
        el.dataset.uahChecked = '1';

        const text = el.textContent || '';
        if (!text.toUpperCase().includes(String(currency).toUpperCase())) return;

        const range = parseRange(text, currency);
        if (!range) return;

        const row = el.closest('tr');
        if (!row) return;

        const stats = getAdvertiserStats(row);
        const eligible = advertiserEligible(stats);

        updateVipOutline(row, stats, false);

        if (eligible && rangesOverlap(minAmount, maxAmount, range.min, range.max)) {
          if (range.max >= 20000) {
            el.style.backgroundColor = 'rgba(46, 189, 133, 0.25)';
          } else {
            el.style.backgroundColor = 'rgba(46, 189, 133, 0.08)';
          }

          if (range.max > 25000) {
              el.style.fontWeight = 'bold';
          }
          
          el.style.borderRadius = '6px';
          el.style.boxShadow = '0 0 0 1px rgba(46, 189, 133, 0.8)';
          row.dataset.uahMatched = '1'; 
          
          row.dataset.uahOfferText = text.replace(/\s+/g, ' ').trim(); 

          updateVipOutline(row, stats, true);
        } else {
          row.dataset.uahMatched = '0';
        }
      });
    }

    // --- 2. Подсветка цены (оранжевый) ---
    if (maxPrice != null) {
      const priceCells = (root || document).querySelectorAll(
        'tbody.bn-web-table-tbody td[aria-colindex="2"][role="cell"], td[aria-colindex="2"][role="cell"]'
      );
      priceCells.forEach((cell) => {
        const row = cell.closest('tr');
        if (!row || row.dataset.uahMatched !== '1') return;

        const text = cell.textContent || '';
        const price = parseNumber(text);
        if (price == null) return;
        
        if (row.dataset.uahPriceAdded !== '1') {
             priceHistory.push(price);
             row.dataset.uahPriceAdded = '1';
        }

        // Если цена <= максимальной цене пользователя
        if (price <= maxPrice) {
          const badge = wrapTextNodeIfNeeded(cell, 'p2p-price-highlight');
          badge.style.backgroundColor = 'rgba(255, 159, 67, 0.25)';
          badge.style.borderRadius = '4px';
          badge.style.boxShadow = '0 0 0 1px rgba(255, 159, 67, 0.8)';
          badge.style.padding = '0 4px';
          badge.style.display = 'inline-block';

          // --- ЛОГИРОВАНИЕ СОВПАДЕНИЯ (MATCH) ---
          if (!cell.dataset.uahLogAdded) {
              const matchEntry = {
                  timestamp: Date.now(),
                  price: price,
                  offerText: row.dataset.uahOfferText || 'N/A'
              };
              
              matchedOffersLog.push(matchEntry);
              
              if (matchedOffersLog.length > 10) {
                  matchedOffersLog = matchedOffersLog.slice(-10);
              }
              
              saveMatchedOffersLog();
              
              console.log(`[P2P-Extension] Matched Offer Logged: ${matchEntry.price} UAH`);
              
              cell.dataset.uahLogAdded = '1'; 
          }

          if (!cell.dataset.uahPriceSoundPlayed) {
            const now = new Date();
            const time = now.getHours().toString().padStart(2, '0') + ":" +
              now.getMinutes().toString().padStart(2, '0');

            console.log("Highlighted price:", price, "-", time);

            blinkPriceCell(badge);
            flashTabTitle(сurrentPage(), price);
            flashTabAlertIcon();
            playPriceSound();

            cell.dataset.uahPriceSoundPlayed = '1';
          }
        }
      });
    }
  }

  function сurrentPage() {
    const ariaEl = document.querySelector('[aria-current="page"]');
    if (ariaEl) {
      const n = parseInt(ariaEl.textContent.trim(), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  
  function flashTabAlertIcon() {
    const originalLink = document.querySelector("link[rel~='icon']");
    const originalHref = originalLink ? originalLink.href : "";

    const alertIcon = "data:image/svg+xml," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FFD54F"/>
            <stop offset="100%" stop-color="#FFA000"/>
          </linearGradient>
        </defs>
        <polygon points="32,4 4,60 60,60" fill="url(#g)" stroke="#000" stroke-width="3"/>
        <rect x="29" y="20" width="6" height="20" rx="2" fill="#000"/>
        <circle cx="32" cy="47" r="3" fill="#000"/>
      </svg>
    `);

    function setFavicon(href) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = href;
    }

    let toggle = false;

    const interval = setInterval(() => {
      if (toggle) {
        setFavicon(alertIcon);
      } else {
        if (originalHref) {
          setFavicon(originalHref);
        } else {
          setFavicon(alertIcon);
        }
      }
      toggle = !toggle;
    }, 400);

    setTimeout(() => {
      clearInterval(interval);
      if (originalHref) {
        setFavicon(originalHref);
      } else {
        setFavicon(alertIcon);
      }
    }, 6000);
  }

  /**
   * Заставляет заголовок вкладки мигать с указанием страницы и цены.
   * @param {number | null} page Номер страницы.
   * @param {number} price Цена.
   */
  function flashTabTitle(page, price) {
    const original = document.title;
    const msg = `🔥${page}: ${price}`; // Сообщение для мигания
    let flip = true;

    // document.title = msg; // Можно сразу установить

    const interval = setInterval(() => {
      // document.title = flip ? msg : original;
      document.title = msg; // Оставляем только "🔥X: YYY"
      // flip = !flip;
    }, 1000);

    // Останавливаем мигание через ~6 секунд
    setTimeout(() => {
      clearInterval(interval);
      document.title = original; // Возвращаем оригинальный заголовок
    }, 6000);
  }


  function startHighlighting() {
      chrome.storage.sync.get(
        ['minAmount', 'maxAmount', 'currency', 'maxPrice', 'pagesToCheck'],
        (settings) => {
          if (!settings) return;

          pagesToCheck = settings.pagesToCheck ?? 2;

          highlightOffers(settings);

          const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
              if (m.type === 'characterData') {
                const row =
                  m.target.parentElement && m.target.parentElement.closest
                    ? m.target.parentElement.closest('tr')
                    : null;
                if (row) {
                  highlightOffers(settings, row);
                  continue;
                }
              }
              if (m.type === 'attributes') {
                const row = m.target.closest && m.target.closest('tr');
                if (row) {
                  highlightOffers(settings, row);
                  continue;
                }
              }
              m.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const row = node.closest && node.closest('tr');
                  highlightOffers(settings, row || node);
                }
              });
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
          });

          setInterval(() => highlightOffers(settings, document.body), 4000);
        }
      );
  }

  loadDataFromStorage(startHighlighting);
})();