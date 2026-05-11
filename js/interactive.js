/**
 * BudgetTools Interactive Features Module
 * Shared utilities: CSV export, undo/redo, keyboard shortcuts, JSON backup/restore, print
 */
(function() {

  // ── UNDO / REDO ────────────────────────────────────────
  const MAX_HISTORY = 40;
  let _history = [];
  let _historyIdx = -1;
  let _getState = null;
  let _setState = null;

  const Undo = {
    init(getStateFn, setStateFn) {
      _getState = getStateFn;
      _setState = setStateFn;
      _history = [JSON.stringify(getStateFn())];
      _historyIdx = 0;
    },
    push() {
      if (!_getState) return;
      const snap = JSON.stringify(_getState());
      if (_history[_historyIdx] === snap) return;
      _history = _history.slice(0, _historyIdx + 1);
      _history.push(snap);
      if (_history.length > MAX_HISTORY) _history.shift();
      _historyIdx = _history.length - 1;
    },
    undo() {
      if (_historyIdx <= 0) { BT_Interactive.toast('Nothing to undo'); return false; }
      _historyIdx--;
      _setState(JSON.parse(_history[_historyIdx]));
      BT_Interactive.toast('Undo');
      return true;
    },
    redo() {
      if (_historyIdx >= _history.length - 1) { BT_Interactive.toast('Nothing to redo'); return false; }
      _historyIdx++;
      _setState(JSON.parse(_history[_historyIdx]));
      BT_Interactive.toast('Redo');
      return true;
    },
    canUndo() { return _historyIdx > 0; },
    canRedo() { return _historyIdx < _history.length - 1; }
  };

  // ── CSV EXPORT ─────────────────────────────────────────
  function exportCSV(headers, rows, filename) {
    const escape = v => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [headers.map(escape).join(',')]
      .concat(rows.map(r => r.map(escape).join(',')))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'export.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── JSON BACKUP / RESTORE ──────────────────────────────
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'backup.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function importJSON(callback) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          callback(data);
        } catch (err) {
          BT_Interactive.toast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ── TOAST NOTIFICATIONS ────────────────────────────────
  let _toastTimer = null;
  function toast(msg, type) {
    let el = document.getElementById('bt-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bt-toast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);z-index:9999;padding:10px 20px;border-radius:10px;font-family:"Plus Jakarta Sans",sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.15);transition:all 0.25s ease;opacity:0;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#16a34a' : '#1e293b';
    el.style.color = '#fff';
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2000);
  }

  // ── SORT HELPER ────────────────────────────────────────
  function sortArray(arr, field, dir) {
    if (!field) return arr;
    return [...arr].sort((a, b) => {
      let va = a[field], vb = b[field];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function sortIcon(currentField, sortField, sortDir) {
    if (currentField !== sortField) return '<span style="opacity:0.3;font-size:11px">⇅</span>';
    return sortDir === 'asc'
      ? '<span style="font-size:11px;color:currentColor">↑</span>'
      : '<span style="font-size:11px;color:currentColor">↓</span>';
  }

  // ── KEYBOARD SHORTCUTS ─────────────────────────────────
  let _shortcuts = {};
  function registerShortcuts(map) {
    _shortcuts = { ..._shortcuts, ...map };
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) {
      if (e.key === 'Escape' && _shortcuts['Escape']) { _shortcuts['Escape'](); e.preventDefault(); }
      return;
    }
    const key = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.key;
    if (_shortcuts[key]) { _shortcuts[key](); e.preventDefault(); }
    else if (_shortcuts[e.key]) { _shortcuts[e.key](); e.preventDefault(); }
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault(); Undo.undo();
    }
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault(); Undo.redo();
    }
  });

  // ── PRINT ──────────────────────────────────────────────
  function addPrintCSS() {
    if (document.getElementById('bt-print-css')) return;
    const style = document.createElement('style');
    style.id = 'bt-print-css';
    style.textContent = `
      @media print {
        body { background: white !important; font-size: 11px !important; }
        nav, aside, #demo-banner, #landing, #landing-page, .no-print,
        #bt-save-banner, #bt-upgrade-modal, #bt-toast, #bt-shortcuts-modal,
        button:not(.print-keep), .modal-overlay { display: none !important; }
        main, #app, [role="main"] { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl, .shadow-2xl { box-shadow: none !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── SHORTCUTS HELP MODAL ───────────────────────────────
  function showShortcutsHelp(shortcuts) {
    const existing = document.getElementById('bt-shortcuts-modal');
    if (existing) { existing.remove(); return; }
    const modal = document.createElement('div');
    modal.id = 'bt-shortcuts-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:400px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h3 style="font-family:'Noto Serif',serif;font-size:18px;font-weight:600;margin:0;">Keyboard Shortcuts</h3>
          <button onclick="document.getElementById('bt-shortcuts-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#94a3b8;">×</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${shortcuts.map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:13px;color:#475569;">${s.desc}</span>
              <kbd style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;font-size:12px;font-family:monospace;color:#334155;">${s.key}</kbd>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  // ── LOGIN CHOICE MODAL ──────────────────────────────────
  function showLoginChoice(onContinueWithout) {
    const existing = document.getElementById('bt-login-choice');
    if (existing) existing.remove();

    const redirectPath = encodeURIComponent(window.location.pathname + window.location.search);

    const modal = document.createElement('div');
    modal.id = 'bt-login-choice';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:white;border-radius:20px;padding:36px;max-width:440px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <span class="material-symbols-outlined" style="font-size:28px;color:#16a34a;">person</span>
          </div>
          <h2 style="font-family:'Noto Serif',serif;font-size:22px;color:#0f172a;margin:0 0 8px;">How would you like to start?</h2>
          <p style="color:#64748b;font-size:14px;margin:0;line-height:1.5;">Sign in to unlock Pro access and save your data across devices with cloud sync.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <a href="/auth.html?mode=signup&next=${redirectPath}" id="bt-lc-signin" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#0f172a;color:white;border:none;border-radius:12px;padding:14px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;text-align:center;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <span class="material-symbols-outlined" style="font-size:20px;">login</span>
            Sign In / Create Account
          </a>
          <button id="bt-lc-continue" style="display:flex;flex-direction:column;align-items:center;background:none;border:2px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;transition:all 0.15s;font-family:inherit;" onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
            <span style="font-weight:600;font-size:14px;color:#334155;">Try Demo Instead</span>
            <span style="font-size:12px;color:#94a3b8;margin-top:2px;">Explore with sample data</span>
          </button>
        </div>
        <p style="text-align:center;margin:16px 0 0;font-size:12px;color:#94a3b8;">Unlock Pro to save your own data and sync across devices.</p>
      </div>
    `;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#bt-lc-continue').addEventListener('click', () => {
      modal.remove();
      if (onContinueWithout) onContinueWithout();
    });

    document.body.appendChild(modal);
  }

  async function handleStartFree(onSetup, onDemo) {
    if (window.BT_AUTH?.isLoggedIn()) {
      if (window.BT_STORAGE?.hasProAccess) {
        const hasPro = await window.BT_STORAGE.hasProAccess();
        if (hasPro) { onSetup(); return; }
      }
      const templateKey = (window.TEMPLATE_KEY || '').replace('bt_', '').replace(/_v\d+$/, '');
      showSubscribeChoice(templateKey || 'all', onDemo || onSetup);
    } else {
      showLoginChoice(onDemo || onSetup);
    }
  }

  function showSubscribeChoice(templateKey, onDemo) {
    const existing = document.getElementById('bt-subscribe-choice');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bt-subscribe-choice';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:white;border-radius:20px;padding:36px;max-width:440px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);font-family:'Plus Jakarta Sans',sans-serif;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#dbeafe,#bfdbfe);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <span class="material-symbols-outlined" style="font-size:28px;color:#1d4ed8;">star</span>
          </div>
          <h2 style="font-family:'Noto Serif',serif;font-size:22px;color:#0f172a;margin:0 0 8px;">Ready to get started?</h2>
          <p style="color:#64748b;font-size:14px;margin:0;line-height:1.5;">Get Pro access to save your data across devices, or try the demo first.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <button id="bt-sc-subscribe" style="display:flex;align-items:center;justify-content:center;gap:10px;background:#0f172a;color:white;border:none;border-radius:12px;padding:14px;font-weight:700;font-size:15px;cursor:pointer;transition:opacity 0.15s;font-family:inherit;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <span class="material-symbols-outlined" style="font-size:20px;">lock_open</span>
            Unlock Pro Access
          </button>
          <button id="bt-sc-demo" style="display:flex;flex-direction:column;align-items:center;background:none;border:2px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;transition:all 0.15s;font-family:inherit;" onmouseover="this.style.borderColor='#94a3b8'" onmouseout="this.style.borderColor='#e2e8f0'">
            <span style="font-weight:600;font-size:14px;color:#334155;">Try Demo Instead</span>
            <span style="font-size:12px;color:#94a3b8;margin-top:2px;">5-minute trial with sample data</span>
          </button>
        </div>
      </div>
    `;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#bt-sc-subscribe').addEventListener('click', () => {
      modal.remove();
      if (window.BT_SUB?.showUpgradeModal) {
        window.BT_SUB.showUpgradeModal(templateKey);
      }
    });
    modal.querySelector('#bt-sc-demo').addEventListener('click', () => {
      modal.remove();
      if (onDemo) onDemo();
    });

    document.body.appendChild(modal);
  }

  // ── PUBLIC API ─────────────────────────────────────────
  window.BT_Interactive = {
    Undo,
    exportCSV,
    downloadJSON,
    importJSON,
    toast,
    sortArray,
    sortIcon,
    registerShortcuts,
    addPrintCSS,
    showShortcutsHelp,
    showLoginChoice,
    handleStartFree,
  };

  addPrintCSS();

})();
