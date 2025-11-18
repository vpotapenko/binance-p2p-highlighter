// Load saved settings when the options page opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['minAmount', 'maxAmount', 'currency', 'maxPrice'], (data) => {
    document.getElementById('minAmount').value = data.minAmount ?? '';
    document.getElementById('maxAmount').value = data.maxAmount ?? '';
    document.getElementById('currency').value = data.currency || 'UAH';
    document.getElementById('maxPrice').value = data.maxPrice ?? '';
    document.getElementById('pagesToCheck').value = data.pagesToCheck ?? 2;
  });
});

// Save settings
document.getElementById('save').addEventListener('click', () => {
  const minAmountRaw = parseFloat(document.getElementById('minAmount').value);
  const maxAmountRaw = parseFloat(document.getElementById('maxAmount').value);
  const maxPriceRaw  = parseFloat(document.getElementById('maxPrice').value);
  const currency = document.getElementById('currency').value.trim().toUpperCase();
  const pagesToCheckRaw = parseInt(document.getElementById('pagesToCheck').value, 10);


  const minAmount = Number.isFinite(minAmountRaw) ? minAmountRaw : null;
  const maxAmount = Number.isFinite(maxAmountRaw) ? maxAmountRaw : null;
  const maxPrice  = Number.isFinite(maxPriceRaw)  ? maxPriceRaw  : null;
  const pagesToCheck = Number.isFinite(pagesToCheckRaw) ? pagesToCheckRaw : 2;

  chrome.storage.sync.set({ minAmount, maxAmount, currency, maxPrice, pagesToCheck}, () => {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved!';
    setTimeout(() => (status.textContent = ''), 2000);
  });
});
