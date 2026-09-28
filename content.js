// TableGrab Pro - Content Script (Clean Minimalist Edition)

(function () {
  let activeTable = null;
  let badgeElement = null;
  let hideTimeout = null;

  // Clean cell text
  function cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  // Parse table element to 2D array
  function parseTable(tableEl) {
    const rows = [];
    const trElements = Array.from(tableEl.querySelectorAll('tr'));
    const targetRows = trElements.length > 0 
      ? trElements 
      : Array.from(tableEl.querySelectorAll('[role="row"]'));

    targetRows.forEach((tr) => {
      const rowData = [];
      const cells = Array.from(tr.querySelectorAll('th, td, [role="columnheader"], [role="cell"]'));
      cells.forEach((cell) => {
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('script, style, noscript, svg').forEach(s => s.remove());
        rowData.push(cleanText(clone.innerText || clone.textContent));
      });
      if (rowData.length > 0 && rowData.some(c => c.length > 0)) {
        rows.push(rowData);
      }
    });

    return rows;
  }

  // Convert 2D array to CSV
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

  // Convert 2D array to TSV
  function toTSV(data) {
    return data.map(row => row.join('\t')).join('\n');
  }

  // Trigger file download
  function downloadFile(content, fileName, mimeType) {
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

  // Show Toast
  function showToast(message) {
    const existing = document.getElementById('tablegrab-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'tablegrab-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 2400);
  }

  // Floating Action Badge on Table Hover
  function createBadge() {
    if (badgeElement) return badgeElement;

    badgeElement = document.createElement('div');
    badgeElement.id = 'tablegrab-badge';
    badgeElement.innerHTML = `
      <div class="tablegrab-badge-info" id="tablegrab-badge-text">Table</div>
      <button class="tablegrab-btn" id="tablegrab-csv-btn">Export CSV</button>
      <button class="tablegrab-btn tablegrab-btn-secondary" id="tablegrab-copy-btn">Copy</button>
    `;

    badgeElement.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
    });

    badgeElement.addEventListener('mouseleave', () => {
      hideBadge();
    });

    badgeElement.querySelector('#tablegrab-csv-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeTable) return;
      const data = parseTable(activeTable);
      const csv = toCSV(data);
      const host = window.location.hostname.replace(/\./g, '_') || 'page';
      downloadFile(csv, `tablegrab_${host}_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
      showToast(`Exported ${data.length} rows to CSV`);
    });

    badgeElement.querySelector('#tablegrab-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeTable) return;
      const data = parseTable(activeTable);
      const tsv = toTSV(data);
      navigator.clipboard.writeText(tsv).then(() => {
        showToast(`Copied ${data.length} rows to clipboard`);
      });
    });

    document.body.appendChild(badgeElement);
    return badgeElement;
  }

  function positionBadge(tableEl) {
    const badge = createBadge();
    const rect = tableEl.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const top = Math.max(8, scrollY + rect.top - 36);
    const left = Math.max(8, scrollX + rect.left + 4);

    badge.style.top = `${top}px`;
    badge.style.left = `${left}px`;
    badge.style.display = 'flex';

    const rowCount = tableEl.querySelectorAll('tr, [role="row"]').length;
    const colCount = tableEl.querySelector('tr, [role="row"]')?.children.length || 0;
    document.getElementById('tablegrab-badge-text').innerText = `${rowCount} × ${colCount}`;
  }

  function hideBadge() {
    if (activeTable) {
      activeTable.classList.remove('tablegrab-highlight');
      activeTable = null;
    }
    if (badgeElement) {
      badgeElement.style.display = 'none';
    }
  }

  // Hover detection on <table>
  document.addEventListener('mouseover', (e) => {
    const table = e.target.closest('table, [role="table"]');
    if (table && table !== activeTable) {
      clearTimeout(hideTimeout);
      if (activeTable) activeTable.classList.remove('tablegrab-highlight');
      activeTable = table;
      activeTable.classList.add('tablegrab-highlight');
      positionBadge(activeTable);
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    const table = e.target.closest('table, [role="table"]');
    if (table && table === activeTable) {
      hideTimeout = setTimeout(() => {
        hideBadge();
      }, 300);
    }
  }, true);

  // Message listener for Popup communication
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SCAN_TABLES') {
      const allTables = Array.from(document.querySelectorAll('table, [role="table"]'));
      const tableSummaries = allTables.map((tbl, index) => {
        const rows = parseTable(tbl);
        const headers = rows.length > 0 ? rows[0] : [];
        const preview = rows.slice(0, 5);
        return {
          id: index,
          rowCount: rows.length,
          colCount: headers.length,
          headers: headers,
          preview: preview
        };
      }).filter(t => t.rowCount > 0);

      sendResponse({ tables: tableSummaries, url: window.location.href, title: document.title });
      return true;
    }

    if (request.type === 'GET_TABLE_DATA') {
      const allTables = Array.from(document.querySelectorAll('table, [role="table"]'));
      const targetTable = allTables[request.tableIndex];
      if (targetTable) {
        const data = parseTable(targetTable);
        sendResponse({ success: true, data: data });
      } else {
        sendResponse({ success: false, error: 'Table not found' });
      }
      return true;
    }
  });
})();
