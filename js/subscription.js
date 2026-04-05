/**
 * BudgetTools Subscription Module
 *
 * Handles the "unlock" flow in templates:
 * - Shows upgrade banner/modal for free users
 * - Triggers Razorpay checkout (modal, supports UPI / cards / net banking)
 * - Shows "save to account" prompt for logged-in but free users
 */

(function() {

  // Template key → friendly name + INR price + brand color
  const TEMPLATES = {
    wedding:   { name: 'Wedding Planner',       price: '₹799/month',  color: '#506351' },
    event:     { name: 'Event Budget & P&L',    price: '₹599/month',  color: '#4527a0' },
    travel:    { name: 'Travel Budget Planner', price: '₹599/month',  color: '#006874' },
    cafe:      { name: 'Cafe Costing',          price: '₹999/month',  color: '#5d1a0a' },
    inventory: { name: 'Inventory Management',  price: '₹799/month',  color: '#1565c0' },
    all:       { name: 'All Templates',         price: '₹1,499/month', color: '#00355f' },
  };

  window.BT_SUB = {

    /**
     * Inject the "Save to Account" banner into a template.
     * Call this after the app shell renders, when user enters app mode from demo.
     * Shows only when user is logged out or on free plan.
     */
    injectSaveBanner(templateId) {
      const template = TEMPLATES[templateId];
      if (!template) return;

      // Don't show if already shown
      if (document.getElementById('bt-save-banner')) return;

      const banner = document.createElement('div');
      banner.id = 'bt-save-banner';
      banner.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 200;
        background: white; border-radius: 16px; padding: 16px 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12); border: 1px solid #e2e8f0;
        max-width: 320px; font-family: 'Plus Jakarta Sans', sans-serif;
        display: flex; flex-direction: column; gap: 10px;
        animation: btSlideIn 0.3s ease;
      `;
      banner.innerHTML = `
        <style>
          @keyframes btSlideIn { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        </style>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></div>
          <p style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;margin:0;">Demo Mode</p>
          <button onclick="document.getElementById('bt-save-banner').remove()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:0;">×</button>
        </div>
        <p style="font-size:13px;color:#374151;margin:0;line-height:1.4;">Your data isn't saved. Upgrade to sync across devices, export reports, and unlock all features.</p>
        <div style="display:flex;gap:8px;">
          <button onclick="window.BT_SUB.showUpgradeModal('${templateId}')" style="flex:1;background:${template.color};color:white;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;">
            Unlock ${template.name} →
          </button>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;">${template.price} · UPI / Card / Netbanking · Cancel anytime</p>
      `;

      document.body.appendChild(banner);

      // Auto-hide after 12 seconds
      setTimeout(() => {
        const el = document.getElementById('bt-save-banner');
        if (el) {
          el.style.opacity = '0';
          el.style.transition = 'opacity 0.5s';
          setTimeout(() => el.remove(), 500);
        }
      }, 12000);
    },

    /**
     * Show upgrade modal overlay
     */
    showUpgradeModal(templateId) {
      const template = TEMPLATES[templateId] || TEMPLATES.all;
      const existing = document.getElementById('bt-upgrade-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'bt-upgrade-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:36px;max-width:460px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);font-family:'Plus Jakarta Sans',sans-serif;">
          <div style="width:48px;height:48px;border-radius:14px;background:${template.color}20;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="font-size:24px;">⭐</span>
          </div>
          <h2 style="font-family:'Noto Serif',serif;font-size:24px;color:#0d1c2f;margin:0 0 8px;">Unlock ${template.name} Pro</h2>
          <p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.5;">Save your data across devices, export reports, and get full access — no demo mode.</p>
          <ul style="list-style:none;padding:0;margin:0 0 24px;display:flex;flex-direction:column;gap:8px;">
            <li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">✓</span> Cloud sync across all your devices</li>
            <li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">✓</span> Full history, unlimited entries</li>
            <li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">✓</span> PDF &amp; CSV export</li>
            <li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">✓</span> Cancel anytime from your account</li>
          </ul>
          <div style="display:flex;gap:12px;">
            <button onclick="document.getElementById('bt-upgrade-modal').remove()" style="flex:1;border:2px solid #e2e8f0;background:white;color:#64748b;border-radius:12px;padding:12px;font-weight:600;cursor:pointer;font-size:14px;">Maybe Later</button>
            <button id="bt-checkout-btn" onclick="window.BT_STORAGE.startCheckout('${templateId}')" style="flex:2;background:${template.color};color:white;border:none;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;font-size:15px;">
              Unlock for ${template.price} →
            </button>
          </div>
          <p style="text-align:center;margin:12px 0 0;font-size:12px;color:#94a3b8;">
            Secure payment via Razorpay · UPI · Cards · Net Banking · Wallets
          </p>
        </div>
      `;

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      document.body.appendChild(modal);
    },

    /**
     * Start Razorpay checkout flow.
     * Called by storage-cloud.js BT_STORAGE.startCheckout()
     */
    async startCheckout(templateId) {
      if (!window.BT_AUTH?.isLoggedIn()) {
        window.location.href = '/auth.html?mode=signup&redirect=' + encodeURIComponent(window.location.pathname);
        return;
      }

      const template = TEMPLATES[templateId] || TEMPLATES.all;

      // Show loading state on button
      const btn = document.getElementById('bt-checkout-btn');
      if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

      try {
        // Step 1: Create Razorpay subscription on the server
        const { subscriptionId, keyId } = await window.BT_AUTH.apiFetch('/api/create-checkout-session', {
          method: 'POST',
          body: JSON.stringify({ template: templateId }),
        });

        // Step 2: Load Razorpay checkout.js if not already on the page
        if (!window.Razorpay) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
            document.head.appendChild(script);
          });
        }

        // Step 3: Open Razorpay checkout modal
        const rzp = new window.Razorpay({
          key:             keyId,
          subscription_id: subscriptionId,
          name:            'BudgetTools',
          description:     template.name + ' Pro',
          prefill: {
            email: window.BT_AUTH.user?.email || '',
          },
          theme: { color: template.color },
          handler: function(response) {
            // Payment captured — webhook will update Supabase in the background
            document.getElementById('bt-upgrade-modal')?.remove();
            _showSuccessBanner(template.name);
            // Reload after 2.5 s so storage-cloud.js re-checks subscription status
            setTimeout(() => window.location.reload(), 2500);
          },
          modal: {
            ondismiss: function() {
              const b = document.getElementById('bt-checkout-btn');
              if (b) { b.textContent = `Unlock for ${template.price} →`; b.disabled = false; }
            },
          },
        });

        rzp.open();

      } catch (err) {
        console.error('Checkout error:', err);
        const b = document.getElementById('bt-checkout-btn');
        if (b) { b.textContent = 'Try Again'; b.disabled = false; }
        alert('Could not start checkout. Please try again or contact support.');
      }
    },

    /**
     * Inject auth-aware nav additions to any page.
     * Adds "Sign In" / "Account" links based on auth state.
     */
    injectAuthNav(navContainerSelector) {
      const container = document.querySelector(navContainerSelector);
      if (!container) return;

      function updateNav() {
        const existing = container.querySelector('#bt-auth-nav');
        if (existing) existing.remove();

        const navEl = document.createElement('div');
        navEl.id = 'bt-auth-nav';
        navEl.style.cssText = 'display:flex;align-items:center;gap:10px;';

        if (window.BT_AUTH?.isLoggedIn()) {
          navEl.innerHTML = `
            <a href="/account.html" style="font-size:13px;color:#64748b;text-decoration:none;font-weight:500;" title="${window.BT_AUTH.user?.email}">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#00355f;color:white;font-weight:700;font-size:13px;">${(window.BT_AUTH.user?.email || 'U').charAt(0).toUpperCase()}</span>
            </a>
          `;
        } else {
          navEl.innerHTML = `
            <a href="/auth.html" style="font-size:13px;color:#64748b;text-decoration:none;font-weight:500;">Sign In</a>
            <a href="/auth.html?mode=signup" style="background:#00355f;color:white;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;text-decoration:none;">Sign Up Free</a>
          `;
        }

        container.appendChild(navEl);
      }

      window.addEventListener('bt:auth:ready', updateNav);
      window.addEventListener('bt:auth:change', updateNav);
    },
  };

  // ── Private helpers ─────────────────────────────────────────────

  function _showSuccessBanner(templateName) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:400;
      background:#16a34a;color:white;border-radius:12px;padding:16px 20px;
      box-shadow:0 8px 32px rgba(22,163,74,0.3);font-family:'Plus Jakarta Sans',sans-serif;
      max-width:300px;display:flex;align-items:center;gap:10px;
      animation:btSlideIn 0.3s ease;
    `;
    banner.innerHTML = `
      <span style="font-size:20px;">🎉</span>
      <div>
        <p style="margin:0;font-weight:700;font-size:14px;">Payment successful!</p>
        <p style="margin:0;font-size:12px;opacity:0.85;">Activating your ${templateName} Pro access…</p>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
  }

})();
