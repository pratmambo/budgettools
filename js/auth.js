/**
 * BudgetTools Auth Module
 * Loaded globally on all pages. Sets up Supabase client and exposes
 * window.BT_AUTH with session, user, and helper methods.
 */

(function() {
  // These are the PUBLIC keys — safe to embed in client-side JS.
  // Row Level Security enforces data isolation. Service role key is only in Netlify Functions.
  const SUPABASE_URL = 'https://sidrjbvjkbfmzrsojtkp.supabase.co';         // e.g. https://xxxx.supabase.co
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpZHJqYnZqa2JmbXpyc29qdGtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDk0MzcsImV4cCI6MjA5MDk4NTQzN30.IiFfDhDAomrfZk-msDTdC-w1bbcF71DtEDfIrIoN3NQ'; // eyJ...

  if (!window.supabase) {
    console.warn('BudgetTools: Supabase SDK not loaded. Include the CDN script before auth.js');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  });

  // Global auth state
  window.BT_AUTH = {
    client,
    user: null,
    session: null,
    isLoading: true,

    /** Get the current session synchronously (from memory after init) */
    getUser() { return this.user; },
    getSession() { return this.session; },
    isLoggedIn() { return !!this.user; },

    /** Redirect to login, then back to current page */
    requireAuth() {
      if (!this.user) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/auth.html?next=' + next;
        return false;
      }
      return true;
    },

    /** Sign out and redirect to home */
    async signOut() {
      await client.auth.signOut();
      this.user = null;
      this.session = null;
      window.location.href = '/index.html';
    },

    /** Get the JWT access token for API calls */
    getToken() {
      return this.session?.access_token || null;
    },

    /** Make an authenticated fetch to a Netlify Function */
    async apiFetch(path, options = {}) {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(options.headers || {}),
      };
      const response = await fetch(path, { ...options, headers });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'API request failed');
      }
      return response.json();
    },
  };

  // Initialize — load session immediately
  async function init() {
    try {
      const { data: { session } } = await client.auth.getSession();
      window.BT_AUTH.session = session;
      window.BT_AUTH.user = session?.user || null;
      window.BT_AUTH.isLoading = false;

      // Dispatch event so templates can react
      window.dispatchEvent(new CustomEvent('bt:auth:ready', {
        detail: { user: window.BT_AUTH.user, isLoggedIn: !!window.BT_AUTH.user }
      }));
    } catch (e) {
      console.warn('BudgetTools auth init failed:', e);
      window.BT_AUTH.isLoading = false;
      window.dispatchEvent(new CustomEvent('bt:auth:ready', { detail: { user: null, isLoggedIn: false } }));
    }

    // Listen for auth changes (token refresh, sign-out, etc.)
    client.auth.onAuthStateChange((event, session) => {
      window.BT_AUTH.session = session;
      window.BT_AUTH.user = session?.user || null;
      window.dispatchEvent(new CustomEvent('bt:auth:change', {
        detail: { event, user: window.BT_AUTH.user }
      }));
    });
  }

  init();

  // ── Nav UI helper ─────────────────────────────────────────
  // Call this after DOMContentLoaded to update nav links based on auth state
  window.BT_AUTH.updateNav = function() {
    const loginLinks = document.querySelectorAll('[data-bt-login]');
    const accountLinks = document.querySelectorAll('[data-bt-account]');
    const userEmailEls = document.querySelectorAll('[data-bt-user-email]');

    if (window.BT_AUTH.isLoggedIn()) {
      loginLinks.forEach(el => el.style.display = 'none');
      accountLinks.forEach(el => el.style.display = '');
      userEmailEls.forEach(el => el.textContent = window.BT_AUTH.user?.email || '');
    } else {
      loginLinks.forEach(el => el.style.display = '');
      accountLinks.forEach(el => el.style.display = 'none');
    }
  };

})();
