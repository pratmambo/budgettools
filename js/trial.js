/**
 * BudgetTools Trial Timer
 *
 * Manages the 10-minute demo trial for premium templates.
 * - Times are stored in localStorage so closing the tab does NOT reset the trial.
 * - Each template has its own independent timer.
 * - Admin accounts and paid subscribers are never blocked.
 *
 * Usage in enterDemo():
 *   if (window.BT_TRIAL) window.BT_TRIAL.start('wedding');
 *
 * Demo banner must contain: <span id="trial-countdown">10:00</span>
 */

(function () {
  const TRIAL_MS = 10 * 60 * 1000; // 10 minutes

  let _templateId = null;
  let _intervalId = null;

  function storageKey(tid) {
    return 'bt_trial_start_' + tid;
  }

  function getRemainingMs() {
    const start = localStorage.getItem(storageKey(_templateId));
    if (!start) return TRIAL_MS;
    return Math.max(0, TRIAL_MS - (Date.now() - parseInt(start, 10)));
  }

  function formatTime(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateDisplay() {
    const el = document.getElementById('trial-countdown');
    if (el) el.textContent = formatTime(getRemainingMs());
  }

  async function expire() {
    clearInterval(_intervalId);
    _intervalId = null;

    // Don't lock subscribers who happened to enter demo mode
    if (window.BT_STORAGE?.checkProAccess) {
      try {
        const { hasAccess } = await window.BT_STORAGE.checkProAccess();
        if (hasAccess) return;
      } catch (_) {}
    }

    // Dim the page behind the modal
    const lock = document.createElement('div');
    lock.id = 'bt-trial-lock';
    lock.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
    document.body.appendChild(lock);

    // Show upgrade modal from subscription.js
    if (window.BT_SUB?.showUpgradeModal) {
      window.BT_SUB.showUpgradeModal(_templateId);
    }
  }

  function tick() {
    updateDisplay();
    if (getRemainingMs() <= 0) expire();
  }

  function doStart() {
    // Admin accounts are never rate-limited
    const admins = window.BT_AUTH?.ADMIN_EMAILS || [];
    if (admins.includes(window.BT_AUTH?.user?.email)) return;

    if (!localStorage.getItem(storageKey(_templateId))) {
      localStorage.setItem(storageKey(_templateId), Date.now().toString());
    }

    if (getRemainingMs() <= 0) {
      expire();
      return;
    }

    tick(); // immediate first render
    if (_intervalId) clearInterval(_intervalId);
    _intervalId = setInterval(tick, 1000);
  }

  // Internal unlock — called after successful purchase
  function _doUnlock() {
    clearInterval(_intervalId);
    _intervalId = null;
    localStorage.removeItem(storageKey(_templateId));
    document.getElementById('bt-trial-lock')?.remove();
  }

  window.BT_TRIAL = {
    start(templateId) {
      _templateId = templateId;

      // Wait for auth module to finish initialising
      if (window.BT_AUTH && !window.BT_AUTH.isLoading) {
        doStart();
      } else {
        window.addEventListener('bt:auth:ready', doStart, { once: true });
      }
    },

    // Called after a successful purchase — verified server-side before reaching here
    unlock() {
      if (window.BT_STORAGE?.checkProAccess) {
        window.BT_STORAGE.checkProAccess().then(({ hasAccess }) => {
          if (hasAccess) _doUnlock();
        }).catch(() => {});
      }
    },
  };
})();
