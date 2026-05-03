/**
 * BudgetTools Trial Timer
 *
 * Manages the 10-minute demo trial for premium templates.
 * - Times are stored in sessionStorage so refreshing continues the trial,
 *   but closing the tab resets it (fresh trial on next visit).
 * - Admin accounts and paid subscribers are never blocked.
 *
 * Usage in enterDemo():
 *   if (window.BT_TRIAL) window.BT_TRIAL.start('wedding');
 *
 * Demo banner must contain: <span id="trial-countdown">10:00</span>
 */

(function () {
  const TRIAL_MS = 10 * 60 * 1000; // 10 minutes
  const ADMIN_EMAILS = ['preetam.juturu@gmail.com'];

  let _templateId = null;
  let _intervalId = null;

  function storageKey(tid) {
    return 'bt_trial_start_' + tid;
  }

  function getRemainingMs() {
    const start = sessionStorage.getItem(storageKey(_templateId));
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
    if (ADMIN_EMAILS.includes(window.BT_AUTH?.user?.email)) return;

    if (!sessionStorage.getItem(storageKey(_templateId))) {
      sessionStorage.setItem(storageKey(_templateId), Date.now().toString());
    }

    if (getRemainingMs() <= 0) {
      expire();
      return;
    }

    tick(); // immediate first render
    _intervalId = setInterval(tick, 1000);
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

    // Call this after a successful purchase to remove the lock without reloading
    unlock() {
      clearInterval(_intervalId);
      _intervalId = null;
      sessionStorage.removeItem(storageKey(_templateId));
      document.getElementById('bt-trial-lock')?.remove();
    },
  };
})();
