// TableGrab Pro - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const emptyState = document.getElementById('emptyState');
  const tablesView = document.getElementById('tablesView');
  const tableSelect = document.getElementById('tableSelect');
  const previewTable = document.getElementById('previewTable');
  const previewTitle = document.getElementById('previewTitle');
  const rowCountBadge = document.getElementById('rowCountBadge');
  const openDemoBtn = document.getElementById('openDemoBtn');

  // Export buttons
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const copyClipboardBtn = document.getElementById('copyClipboardBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');

  // Upgrade Modal elements
  const upgradeBtn = document.getElementById('upgradeBtn');
  const proUpgradeLink = document.getElementById('proUpgradeLink');
  const upgradeModal = document.getElementById('upgradeModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const startCheckoutBtn = document.getElementById('startCheckoutBtn');

  let detectedTables = [];
  let currentActiveTabId = null;
  let activeTableFullData = [];
  const ROW_LIMIT_FREE = 25;

  // Check Pro Status from chrome.storage
  let isProUser = false;
  if (chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get(['tablegrab_is_pro']);
    isProUser = !!res.tablegrab_is_pro;
    if (isProUser) {
      document.querySelector('.badge-pro').innerText = 'PRO ACTIVE';
      upgradeBtn.style.display = 'none';
      document.querySelector('.pro-banner').innerHTML = '<span>⭐ Pro Member: Unlimited Exports Active</span>';
    }
  }

  // Open upgrade modal
  function showUpgrade() {
    upgradeModal.style.display = 'flex';
  }
  function hideUpgrade() {
    upgradeModal.style.display = 'none';
  }

  upgradeBtn.addEventListener('click', showUpgrade);
  proUpgradeLink.addEventListener('click', (e) => {
    e.preventDefault();
    showUpgrade();
  });
  modalCloseBtn.addEventListener('click', hideUpgrade);

  startCheckoutBtn.addEventListener('click', () => {
    // In production, open your Lemon Squeezy / ExtensionPay link:
    // chrome.tabs.create({ url: 'https://yourcheckoutlink.lemonsqueezy.com/checkout/buy/...' });
    
    // For local testing, we provide a 1-click test unlock:
    if (confirm('Simulate purchasing TableGrab Pro for $4.99 and activate lifetime license?')) {
      chrome.storage.local.set({ tablegrab_is_pro: true }, () => {
        alert('🎉 TableGrab Pro unlocked! Enjoy unlimited exports.');
        location.reload();
      });
    }
  });

  // Open sample demo page
  openDemoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo-test.html') });
  });

  // Query Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusText.innerText = 'Cannot access current tab.';
    emptyState.style.display = 'block';
    return;
  }
  currentActiveTabId = tab.id;

  // Function to scan tables via content script
  function requestScan() {
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_TABLES' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.tables || response.tables.length === 0) {
        statusText.innerText = '0 tables found on this page.';
        emptyState.style.display = 'block';
        return;
      }

      detectedTables = response.tables;
      statusText.innerText = `⚡ ${detectedTables.length} Table${detectedTables.length > 1 ? 's' : ''} ready to export`;
      renderTableSelector();
      loadTableData(0);
      emptyState.style.display = 'none';
      tablesView.style.display = 'flex';
    });
  }

  // Ensure content script is running on the tab
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    requestScan();
  } catch (err) {
    // If scripting is blocked (e.g. chrome:// internal pages)
    requestScan();
  }

  // Populate Table Dropdown
  function renderTableSelector() {
    tableSelect.innerHTML = '';
    detectedTables.forEach((tbl, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.text = `Table #${idx + 1} (${tbl.rowCount} rows × ${tbl.colCount} cols)`;
      tableSelect.appendChild(opt);
    });

    tableSelect.addEventListener('change', () => {
      loadTableData(parseInt(tableSelect.value, 10));
    });
  }

  // Fetch full data for chosen table
  function loadTableData(tableIndex) {
    chrome.tabs.sendMessage(currentActiveTabId, { type: 'GET_TABLE_DATA', tableIndex: tableIndex }, (res) => {
      if (res && res.success && res.data) {
        activeTableFullData = res.data;
        renderPreview(activeTableFullData);
      }
    });
  }

  // Render preview table
  function renderPreview(data) {
    previewTable.innerHTML = '';
    if (!data || data.length === 0) return;

    rowCountBadge.innerText = `${data.length} rows total`;

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = data[0];
    headers.forEach((h, i) => {
      const th = document.createElement('th');
      th.innerText = h || `Col ${i + 1}`;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    previewTable.appendChild(thead);

    // Body (show top 5 rows)
    const tbody = document.createElement('tbody');
    const previewRows = data.slice(1, 6);
    previewRows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.innerText = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    previewTable.appendChild(tbody);
  }

  // Utilities
  function getSanitizedData() {
    if (!activeTableFullData || activeTableFullData.length === 0) return [];
    if (isProUser) return activeTableFullData;
    // Free tier limitation
    if (activeTableFullData.length > ROW_LIMIT_FREE + 1) {
      alert(`⚠️ Free Tier Notice: Exporting first ${ROW_LIMIT_FREE} rows. Upgrade to Pro ($4.99) for unlimited rows.`);
      return activeTableFullData.slice(0, ROW_LIMIT_FREE + 1);
    }
    return activeTableFullData;
  }

  function toCSV(data) {
    return data.map(row => 
      row.map(val => {
        const escaped = ('' + val).replace(/"/g, '""');
        if (escaped.search(/("|,|\n|\r)/g) >= 0) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',')
    ).join('\r\n');
  }

  function toTSV(data) {
    return data.map(row => row.join('\t')).join('\n');
  }

  function triggerDownload(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Export CSV
  exportCsvBtn.addEventListener('click', () => {
    const data = getSanitizedData();
    if (data.length === 0) return;
    const csv = toCSV(data);
    triggerDownload(csv, `tablegrab_export_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  });

  // Copy to Clipboard (TSV)
  copyClipboardBtn.addEventListener('click', () => {
    const data = getSanitizedData();
    if (data.length === 0) return;
    const tsv = toTSV(data);
    navigator.clipboard.writeText(tsv).then(() => {
      const orig = copyClipboardBtn.innerHTML;
      copyClipboardBtn.innerHTML = '<span>✅</span><span>Copied!</span>';
      setTimeout(() => copyClipboardBtn.innerHTML = orig, 1800);
    });
  });

  // Export JSON
  exportJsonBtn.addEventListener('click', () => {
    const data = getSanitizedData();
    if (data.length === 0) return;
    const headers = data[0].map((h, i) => h || `Column_${i + 1}`);
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });
    const jsonStr = JSON.stringify(rows, null, 2);
    triggerDownload(jsonStr, `tablegrab_export_${Date.now()}.json`, 'application/json');
  });
});
