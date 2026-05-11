(function () {
  var TRIAL_MS = 5 * 60 * 1000;

  var _templateId = null;
  var _intervalId = null;

  function storageKey(tid) {
    return 'bt_trial_start_' + tid;
  }

  function getRemainingMs() {
    var start = localStorage.getItem(storageKey(_templateId));
    if (!start) return TRIAL_MS;
    return Math.max(0, TRIAL_MS - (Date.now() - parseInt(start, 10)));
  }

  function formatTime(ms) {
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateDisplay() {
    var el = document.getElementById('trial-countdown');
    if (el) el.textContent = formatTime(getRemainingMs());
  }

  async function expire() {
    clearInterval(_intervalId);
    _intervalId = null;

    if (window.BT_TOUR && window.BT_TOUR.isActive && window.BT_TOUR.isActive()) {
      window.BT_TOUR.dismiss();
    }

    if (window.BT_STORAGE && window.BT_STORAGE.checkProAccess) {
      try {
        var result = await window.BT_STORAGE.checkProAccess();
        if (result.hasAccess) return;
      } catch (_) {}
    }

    var lock = document.createElement('div');
    lock.id = 'bt-trial-lock';
    lock.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);';
    document.body.appendChild(lock);

    if (window.BT_SUB && window.BT_SUB.showUpgradeModal) {
      window.BT_SUB.showUpgradeModal(_templateId);
    }
  }

  function tick() {
    updateDisplay();
    if (getRemainingMs() <= 0) expire();
  }

  function doStart() {
    var admins = (window.BT_AUTH && window.BT_AUTH.ADMIN_EMAILS) ? window.BT_AUTH.ADMIN_EMAILS : [];
    if (window.BT_AUTH && window.BT_AUTH.user && admins.includes(window.BT_AUTH.user.email)) return;

    if (!localStorage.getItem(storageKey(_templateId))) {
      localStorage.setItem(storageKey(_templateId), Date.now().toString());
    }

    if (getRemainingMs() <= 0) {
      expire();
      return;
    }

    tick();
    if (_intervalId) clearInterval(_intervalId);
    _intervalId = setInterval(tick, 1000);
  }

  function _doUnlock() {
    clearInterval(_intervalId);
    _intervalId = null;
    localStorage.removeItem(storageKey(_templateId));
    var lock = document.getElementById('bt-trial-lock');
    if (lock) lock.remove();
    var banner = document.getElementById('demo-banner');
    if (banner) banner.style.display = 'none';
  }

  window.BT_TRIAL = {
    start: function (templateId) {
      _templateId = templateId;

      if (window.BT_AUTH && !window.BT_AUTH.isLoading) {
        doStart();
      } else {
        window.addEventListener('bt:auth:ready', doStart, { once: true });
      }
    },

    unlock: function () {
      if (window.BT_STORAGE && window.BT_STORAGE.checkProAccess) {
        window.BT_STORAGE.checkProAccess().then(function (r) {
          if (r.hasAccess) _doUnlock();
        }).catch(function () {});
      }
    },

    isExpired: function () {
      return _templateId && getRemainingMs() <= 0;
    },
  };
})();
