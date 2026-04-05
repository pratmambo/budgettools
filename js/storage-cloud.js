/**
 * BudgetTools Cloud Storage Module
 *
 * Drop-in replacement for the localStorage-based Storage object in templates.
 *
 * Usage in each template:
 *   <script src="/js/auth.js"></script>
 *   <script>window.TEMPLATE_KEY = 'bt_wedding_v2';</script>
 *   <script src="/js/storage-cloud.js"></script>
 *
 * Then use Storage.get(), Storage.set(data), Storage.clear() — same API as before.
 * Storage.get() is now async and must be awaited.
 * Storage.set() is fire-and-forget (writes localStorage immediately, debounces cloud sync).
 */

(function() {
  const key = window.TEMPLATE_KEY || 'bt_unknown';

  // Debounce timer for cloud saves
  let _saveTimer = null;
  const DEBOUNCE_MS = 800;

  // Map localStorage keys to API template identifiers
  const KEY_TO_TEMPLATE = {
    'bt_wedding_v2':   'bt_wedding_v2',
    'bt_event_v2':     'bt_event_v2',
    'bt_travel_v1':    'bt_travel_v1',
    'bt_cafe_v1':      'bt_cafe_v1',
    'bt_inventory_v1': 'bt_inventory_v1',
  };

  function getLocalData() {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch(e) { return null; }
  }

  function setLocalData(d) {
    try { localStorage.setItem(key, JSON.stringify(d)); }
    catch(e) { console.warn('localStorage write failed:', e); }
  }

  async function loadFromCloud() {
    if (!window.BT_AUTH?.isLoggedIn()) return null;
    try {
      const token = window.BT_AUTH.getToken();
      const res = await fetch('/api/user-data?template=' + encodeURIComponent(key), {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch(e) {
      console.warn('Cloud load failed, using local cache:', e);
      return null;
    }
  }

  async function saveToCloud(d) {
    if (!window.BT_AUTH?.isLoggedIn()) return;
    try {
      const token = window.BT_AUTH.getToken();
      await fetch('/api/user-data', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ template: key, data: d })
      });
    } catch(e) {
      console.warn('Cloud save failed (will retry on next change):', e);
      // Show non-blocking toast if available
      if (window.BT_TOAST) window.BT_TOAST.warn('Save failed — working offline');
    }
  }

  window.Storage = {
    KEY: key,

    /**
     * Load data. Async.
     * Priority: 1) Cloud (if logged in), 2) localStorage cache
     * Merges: if cloud data exists and is newer, use it. Otherwise use localStorage.
     */
    async get() {
      // If not logged in, use localStorage only (same as before)
      if (!window.BT_AUTH?.isLoggedIn()) {
        return getLocalData();
      }

      // Try cloud first
      const cloudData = await loadFromCloud();

      if (cloudData) {
        // Cloud data found — update local cache and return
        setLocalData(cloudData);
        return cloudData;
      }

      // No cloud data yet. Check for local data to migrate.
      const localData = getLocalData();
      if (localData) {
        // Offer migration (one-time, silent — just save it up)
        saveToCloud(localData);
      }
      return localData;
    },

    /**
     * Save data.
     * Writes localStorage immediately (sync, zero latency for UI).
     * Debounces cloud save to avoid hammering API on rapid edits.
     */
    set(d) {
      // Always write localStorage immediately
      setLocalData(d);

      // Debounce cloud save
      if (window.BT_AUTH?.isLoggedIn()) {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => saveToCloud(d), DEBOUNCE_MS);
      }
    },

    /**
     * Clear data from both localStorage and cloud.
     */
    async clear() {
      localStorage.removeItem(key);
      if (window.BT_AUTH?.isLoggedIn()) {
        try {
          await fetch('/api/user-data', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + window.BT_AUTH.getToken(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ template: key, data: null })
          });
        } catch(e) { console.warn('Cloud clear failed:', e); }
      }
    },
  };

  // ── Upgrade prompt helper ─────────────────────────────────
  // Templates can call this to show an upgrade modal
  window.BT_STORAGE = {
    async checkProAccess() {
      if (!window.BT_AUTH?.isLoggedIn()) return { hasAccess: false, reason: 'not_logged_in' };
      try {
        const templateId = KEY_TO_TEMPLATE[key]?.replace('bt_', '').replace('_v1','').replace('_v2','') || 'unknown';
        const data = await window.BT_AUTH.apiFetch('/api/subscription-status?template=' + templateId);
        return { hasAccess: data.hasAccess, status: data.status, renewsAt: data.renewsAt };
      } catch(e) {
        return { hasAccess: false, reason: 'check_failed' };
      }
    },

    async startCheckout(templateId) {
      // Delegate to subscription.js which handles the Razorpay modal
      if (window.BT_SUB?.startCheckout) {
        await window.BT_SUB.startCheckout(templateId);
      } else {
        window.location.href = '/auth.html?mode=signup';
      }
    }
  };

})();
