// Binance P2P Highlighter with advertiser-quality filters
// - Green highlight for "Available / Order Limit" when range overlaps AND advertiser is good (completion ≥95% & orders ≥300)
// - Orange highlight around Price text when <= maxPrice AND row is green
// - Gold outline hugging “orders | completion” only when orders ≥450 & completion ≥97% AND row is green
// - Bold text "100.00% completion"
// - Sound + blink on best Price
// - Cleans up stale highlights (handles virtualized rows & text updates via MutationObserver)

(() => {
  // --- sound (safe with Chrome autoplay policy) ---
  const priceSound = new Audio(chrome.runtime.getURL('ding.mp3'));
  priceSound.volume = 1.0;

  let pagesToCheck = 2; // default fallback

function playPriceSound() {
  try {
    console.log('[P2P-Extension] Attempting to play sound…');
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
  animation: p2pBlink 0.5s ease-in-out 6; /* 6 цикла = 3 секунды */
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

  (function () {
    let lastMove = Date.now();

    document.addEventListener('mousemove', () => {
      lastMove = Date.now();
    });

    document.addEventListener('keydown', () => {
      lastMove = Date.now();
    });

    document.addEventListener('scroll', () => {
      lastMove = Date.now();
    });

    function formatIdle(ms) {
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;

      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}m ${s}s`;
    }

    let autoReloadEnabled = true;
    let currentPage = null; // текущая страница P2P (1–5)

    // Пытаемся считать текущую страницу из пагинации
    function detectCurrentPage() {
      // чаще всего у активной страницы есть aria-current="page"
      const ariaEl = document.querySelector('[aria-current="page"]');
      if (ariaEl) {
        const n = parseInt(ariaEl.textContent.trim(), 10);
        if (!Number.isNaN(n)) return n;
      }

      // запасной вариант – элемент с классом .active внутри пагинации
      const activeEl = document.querySelector('.bn-pagination .active');
      if (activeEl) {
        const n = parseInt(activeEl.textContent.trim(), 10);
        if (!Number.isNaN(n)) return n;
      }

      return null;
    }

    // Клик по кнопке с номером страницы
    function goToPage(page) {
      const targetText = String(page);
      const btn = Array.from(document.querySelectorAll('button, a')).find(
        (el) => el.textContent && el.textContent.trim() === targetText
      );

      if (btn) {
        console.log(`[P2P-Extension] Idle -> go to page ${page} of total ${pagesToCheck}`);
        btn.click();
        return true;
      }

      console.log(`[P2P-Extension] Page ${page} button not found, fallback reload`);
      return false;
    }

    setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastMove;

      //console.log(`Idle: ${formatIdle(idleMs)}`);
      console.log(`[${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}] Idle: ${formatIdle(idleMs)}`);

      // --- Do NOT reload on fiatOrderDetail page ---
      const isDetailPage = location.href.includes("/en/fiatOrderDetail");

      if (!isDetailPage && autoReloadEnabled && idleMs > 15000) {
        // обновляем текущую страницу по DOM, если возможно
        const domPage = detectCurrentPage();
        if (domPage != null) {
          currentPage = domPage;
        } else if (currentPage == null) {
          currentPage = 1; // по умолчанию считаем, что мы на странице 1
        }

        if (currentPage < pagesToCheck) {
          const nextPage = currentPage + 1;
          const switched = goToPage(nextPage);
          if (switched) {
            currentPage = nextPage;
            // сбрасываем таймер неактивности, чтобы новые 15 сек шли уже на новой странице
            lastMove = Date.now();
          } else {
            // если не смогли найти кнопку страницы – безопасный fallback
            console.log('[P2P-Extension] Fallback -> full reload');
            location.reload();
          }
        } else {
          // если уже страница последняя — делаем полный reload
          console.log(`[P2P-Extension] Idle on page ${pagesToCheck} -> full reload`);
          location.reload();
        }
      }

    }, 3000);

  })();

  // ---------- utils ----------
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
    
    //console.log(`offerMin: ${offerMin}, offerMax: ${offerMax}`);

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
    const raw = om[1].replace(/[^\d]/g, ''); // убираем пробелы/нецифры
    if (raw) orders = parseInt(raw, 10);
  }
  
  //console.log(`Text: ${text}`);
  //console.log(`In Parcing completion: ${completion}, orders: ${orders}`);

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
    //console.log(`completion: ${completion}, orders: ${orders}`);
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

    // Remove any legacy wrappers if statsEl gone (DOM reshuffle)
    if (!statsEl) {
      advCell.querySelectorAll('.p2p-stats-outline').forEach((w) => w.remove());
      row.dataset.uahVipApplied = '0';
      return;
    }

    // find or create wrapper
    let wrap = statsEl.querySelector('.p2p-stats-outline');

    if (needVip) {
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'p2p-stats-outline';
        while (statsEl.firstChild) wrap.appendChild(statsEl.firstChild);
        statsEl.appendChild(wrap);
        // makes the border hug content width
        statsEl.style.display = 'contents';
      }

      // Tight gold border styling
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

      // Bold exact "100.00% completion"
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
      // Remove ALL outlines for non-VIP (handles row reuse)
      advCell.querySelectorAll('.p2p-stats-outline').forEach((w) => {
        // unwrap back into statsEl (if still present)
        if (statsEl && w.parentElement === statsEl) {
          while (w.firstChild) statsEl.appendChild(w.firstChild);
        }
        w.remove();
      });
      row.dataset.uahVipApplied = '0';
    }
  }

  // ---------- main ----------
  function highlightOffers(userSettings, root = document) {
    const { minAmount, maxAmount, currency, maxPrice } = userSettings || {};
    const hasAmountRange = minAmount != null && maxAmount != null && !!currency;

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

        // always run once to cleanup VIP on reused rows
        updateVipOutline(row, stats, false);

        if (eligible && rangesOverlap(minAmount, maxAmount, range.min, range.max)) {
          // green highlight on this amount cell
          if (range.max >= 20000) {
            el.style.backgroundColor = 'rgba(46, 189, 133, 0.25)';
          } else {
            el.style.backgroundColor = 'rgba(46, 189, 133, 0.08)';
          }

          //console.log(`offerMin: ${range.min}, offerMax: ${range.max}`);
          
          el.style.borderRadius = '6px';
          el.style.boxShadow = '0 0 0 1px rgba(46, 189, 133, 0.8)';
          row.dataset.uahMatched = '1';

          // VIP outline (if qualifies)
          updateVipOutline(row, stats, true);
        } else {
          row.dataset.uahMatched = '0';
        }
      });
    }

    // Price highlight (orange)
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

        if (price <= maxPrice) {
          const badge = wrapTextNodeIfNeeded(cell, 'p2p-price-highlight');
          badge.style.backgroundColor = 'rgba(255, 159, 67, 0.25)';
          badge.style.borderRadius = '4px';
          badge.style.boxShadow = '0 0 0 1px rgba(255, 159, 67, 0.8)';
          badge.style.padding = '0 4px';
          badge.style.display = 'inline-block';

          // ---- play sound + blink when price highlight triggers (once per cell) ----
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
      // чаще всего у активной страницы есть aria-current="page"
      const ariaEl = document.querySelector('[aria-current="page"]');
      if (ariaEl) {
        const n = parseInt(ariaEl.textContent.trim(), 10);
        if (!Number.isNaN(n)) return n;
      }
    }

 function flashTabAlertIcon() {
  // запоминаем оригинальный favicon, если он есть
  const originalLink = document.querySelector("link[rel~='icon']");
  const originalHref = originalLink ? originalLink.href : "";

  // жёлтый треугольник с чёрной рамкой и восклицательным знаком
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
    // мигаем между ALERT-иконкой и оригинальным (если был)
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
  }, 400); // скорость мигания (мс)

  // через 5 секунд перестаём мигать и возвращаем оригинальный favicon
  setTimeout(() => {
    clearInterval(interval);
    if (originalHref) {
      setFavicon(originalHref);
    } else {
      setFavicon(alertIcon); // если не было своего, оставим ALERT
    }
  }, 6000);
}
 

  function flashTabTitle(page, price) {
    const original = document.title;
    const msg = `🔥${page}: ${price}`;
    let flip = true;

    //document.title = msg;
    
    const interval = setInterval(() => {
      document.title = flip ? msg : original;
      //flip = !flip;
    }, 1000);

    // stop after ~5 seconds
    setTimeout(() => {
      clearInterval(interval);
      //document.title = original;
    }, 6000);
    
  }

  function flashTabColor() {
    const original = document.querySelector("link[rel='icon']")?.href || "";
    
    const redIcon = "data:image/svg+xml," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" fill="red"/>
      </svg>
    `);
    
    const yellowIcon = "data:image/svg+xml," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" fill="yellow"/>
      </svg>
    `);

    let toggle = false;

    const interval = setInterval(() => {
      const link = document.querySelector("link[rel='icon']") || document.createElement("link");
      link.rel = "icon";
      link.href = toggle ? redIcon : yellowIcon;
      document.head.appendChild(link);
      toggle = !toggle;
    }, 400);

    setTimeout(() => {
      clearInterval(interval);
      if (original) {
        const link = document.querySelector("link[rel='icon']");
        if (link) link.href = original;
      }
    }, 5000);
  }


  function startHighlighting() {
    chrome.storage.sync.get(
      ['minAmount', 'maxAmount', 'currency', 'maxPrice', 'pagesToCheck'],
      (settings) => {
        if (!settings) return;
        
        pagesToCheck = settings.pagesToCheck ?? 2;
        
        // initial scan
        highlightOffers(settings);

        // Observe DOM updates incl. text changes (virtualized list)
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'characterData') {
              const row =
                m.target.parentElement && m.target.parentElement.closest
                  ? m.target.parentElement.closest('tr')
                  : null;
              if (row) {
                // Re-scan just this row for speed
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
            // handle newly added nodes
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
          characterData: true,   // watch text updates
          attributes: true       // watch class/style updates on reused nodes
        });

        // Safety net: periodic light rescan (throttled)
        setInterval(() => highlightOffers(settings, document.body), 4000);
      }
    );
  }

  startHighlighting();
})();
