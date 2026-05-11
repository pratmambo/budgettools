(function() {

  var TEMPLATES = {
    wedding:   { name: 'Wedding Planner',       price: '₹899',  color: '#506351' },
    event:     { name: 'Event Budget & P&L',    price: '₹899',  color: '#4527a0' },
    travel:    { name: 'Travel Budget Planner', price: '₹899',  color: '#006874' },
    cafe:      { name: 'Cafe Costing',          price: '₹899',  color: '#5d1a0a' },
    inventory: { name: 'Inventory Management',  price: '₹899',  color: '#1565c0' },
  };

  var _cashfreeLoaded = false;

  async function loadCashfreeSDK() {
    if (_cashfreeLoaded) return;
    await new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.onload = function() { _cashfreeLoaded = true; resolve(); };
      script.onerror = function() { reject(new Error('Failed to load Cashfree SDK')); };
      document.head.appendChild(script);
    });
  }

  function _handleMaybeLater() {
    var modal = document.getElementById('bt-upgrade-modal');
    if (modal) modal.remove();
    var lock = document.getElementById('bt-trial-lock');
    if (lock) {
      lock.remove();
      if (typeof window.exitToLanding === 'function') {
        window.exitToLanding();
      }
    }
  }

  window.BT_SUB = {

    injectSaveBanner: function(templateId) {
      var template = TEMPLATES[templateId];
      if (!template) return;
      if (document.getElementById('bt-save-banner')) return;

      var banner = document.createElement('div');
      banner.id = 'bt-save-banner';
      banner.style.cssText =
        'position:fixed;bottom:20px;right:20px;z-index:200;' +
        'background:white;border-radius:16px;padding:16px 20px;' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.12);border:1px solid #e2e8f0;' +
        'max-width:320px;font-family:"Plus Jakarta Sans",sans-serif;' +
        'display:flex;flex-direction:column;gap:10px;' +
        'animation:btSlideIn 0.3s ease;';
      banner.innerHTML =
        '<style>@keyframes btSlideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></div>' +
          '<p style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;margin:0;">Demo Mode</p>' +
          '<button onclick="document.getElementById(\'bt-save-banner\').remove()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:0;">&times;</button>' +
        '</div>' +
        '<p style="font-size:13px;color:#374151;margin:0;line-height:1.4;">Your data isn\'t saved. Get Pro access to sync across devices, export reports, and unlock all features.</p>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="window.BT_SUB.showUpgradeModal(\'' + templateId + '\')" style="flex:1;background:' + template.color + ';color:white;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;">Unlock ' + template.name + ' &rarr;</button>' +
        '</div>' +
        '<p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;">' + template.price + ' one-time &middot; Visa / Mastercard / UPI</p>';

      document.body.appendChild(banner);

      setTimeout(function() {
        var el = document.getElementById('bt-save-banner');
        if (el) {
          el.style.opacity = '0';
          el.style.transition = 'opacity 0.5s';
          setTimeout(function() { if (el.parentNode) el.remove(); }, 500);
        }
      }, 12000);
    },

    showUpgradeModal: function(templateId) {
      var template = TEMPLATES[templateId];
      if (!template) return;
      var existing = document.getElementById('bt-upgrade-modal');
      if (existing) existing.remove();

      var modal = document.createElement('div');
      modal.id = 'bt-upgrade-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;';
      modal.innerHTML =
        '<div style="background:white;border-radius:20px;padding:36px;max-width:460px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);font-family:\'Plus Jakarta Sans\',sans-serif;">' +
          '<div style="width:48px;height:48px;border-radius:14px;background:' + template.color + '20;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">' +
            '<span style="font-size:24px;">&#11088;</span>' +
          '</div>' +
          '<h2 style="font-family:\'Noto Serif\',serif;font-size:24px;color:#0d1c2f;margin:0 0 8px;">Unlock ' + template.name + ' Pro</h2>' +
          '<p style="color:#64748b;font-size:15px;margin:0 0 24px;line-height:1.5;">One-time payment &mdash; save your data across devices, export reports, and use all features.</p>' +
          '<ul style="list-style:none;padding:0;margin:0 0 20px;display:flex;flex-direction:column;gap:8px;">' +
            '<li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">&#10003;</span> Cloud sync across all your devices</li>' +
            '<li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">&#10003;</span> Full history, unlimited entries</li>' +
            '<li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">&#10003;</span> PDF &amp; CSV export</li>' +
            '<li style="display:flex;align-items:center;gap:8px;font-size:14px;color:#374151;"><span style="color:#16a34a;font-size:16px;">&#10003;</span> One-time payment &middot; No auto-renewal</li>' +
          '</ul>' +
          '<div style="margin-bottom:16px;">' +
            '<label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Phone number (required for payment)</label>' +
            '<input id="bt-checkout-phone" type="tel" placeholder="Phone number" maxlength="15" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;" />' +
            '<p id="bt-phone-error" style="display:none;color:#dc2626;font-size:12px;margin:4px 0 0;"></p>' +
          '</div>' +
          '<div style="display:flex;gap:12px;">' +
            '<button id="bt-maybe-later" style="flex:1;border:2px solid #e2e8f0;background:white;color:#64748b;border-radius:12px;padding:12px;font-weight:600;cursor:pointer;font-size:14px;">Maybe Later</button>' +
            '<button id="bt-checkout-btn" style="flex:2;background:' + template.color + ';color:white;border:none;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;font-size:15px;">Pay ' + template.price + ' &rarr;</button>' +
          '</div>' +
          '<p style="text-align:center;margin:12px 0 0;font-size:12px;color:#94a3b8;">Secure payment via Cashfree &middot; Visa &middot; Mastercard &middot; UPI &middot; Net Banking</p>' +
        '</div>';

      modal.querySelector('#bt-maybe-later').onclick = _handleMaybeLater;
      modal.querySelector('#bt-checkout-btn').onclick = function() { window.BT_SUB._doCheckout(templateId); };

      modal.addEventListener('click', function(e) {
        if (e.target === modal) _handleMaybeLater();
      });

      document.body.appendChild(modal);
    },

    _doCheckout: async function(templateId) {
      var phoneInput = document.getElementById('bt-checkout-phone');
      var phoneError = document.getElementById('bt-phone-error');
      var phone = (phoneInput ? phoneInput.value : '').replace(/\D/g, '');

      if (phone.length < 10 || phone.length > 15) {
        if (phoneError) {
          phoneError.textContent = 'Please enter a valid 10-digit phone number.';
          phoneError.style.display = 'block';
        }
        if (phoneInput) phoneInput.focus();
        return;
      }
      if (phoneError) phoneError.style.display = 'none';

      await this.startCheckout(templateId, phone);
    },

    startCheckout: async function(templateId, phone) {
      if (!window.BT_AUTH || !window.BT_AUTH.isLoggedIn()) {
        window.location.href = '/auth.html?mode=signup&next=' + encodeURIComponent(window.location.pathname);
        return;
      }

      var template = TEMPLATES[templateId];
      if (!template) return;
      var btn = document.getElementById('bt-checkout-btn');
      if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

      try {
        var resp = await window.BT_AUTH.apiFetch('/api/create-checkout-session', {
          method: 'POST',
          body: JSON.stringify({ template: templateId, phone: phone }),
        });

        await loadCashfreeSDK();

        var cashfree = window.Cashfree({ mode: resp.cashfreeEnv || 'production' });
        var result = await cashfree.checkout({
          paymentSessionId: resp.sessionId,
          redirectTarget: '_modal',
        });

        if (result.error) {
          console.error('Cashfree checkout error:', result.error);
          var b = document.getElementById('bt-checkout-btn');
          if (b) { b.textContent = 'Try Again'; b.disabled = false; }
          return;
        }

        if (result.paymentDetails || result.redirect) {
          if (typeof gtag === 'function') {
            gtag('event', 'conversion', {
              'send_to': 'AW-18154608762/WnO7CP68gqscEPqw5dBD',
              'value': 899.0,
              'currency': 'INR',
              'transaction_id': resp.orderId
            });
          }
          document.getElementById('bt-upgrade-modal')?.remove();
          document.getElementById('bt-trial-lock')?.remove();
          _showSuccessBanner(template.name);
          _pollForAccess(templateId);
        }

      } catch (err) {
        console.error('Checkout error:', err);
        var b2 = document.getElementById('bt-checkout-btn');
        if (b2) { b2.textContent = 'Try Again'; b2.disabled = false; }
      }
    },

    injectAuthNav: function(navContainerSelector) {
      var container = document.querySelector(navContainerSelector);
      if (!container) return;

      function updateNav() {
        var existing = container.querySelector('#bt-auth-nav');
        if (existing) existing.remove();

        var navEl = document.createElement('div');
        navEl.id = 'bt-auth-nav';
        navEl.style.cssText = 'display:flex;align-items:center;gap:10px;';

        if (window.BT_AUTH && window.BT_AUTH.isLoggedIn()) {
          var email = window.BT_AUTH.user ? window.BT_AUTH.user.email : 'U';
          navEl.innerHTML =
            '<a href="/account.html" style="font-size:13px;color:#64748b;text-decoration:none;font-weight:500;" title="' + email + '">' +
              '<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#00355f;color:white;font-weight:700;font-size:13px;">' + (email || 'U').charAt(0).toUpperCase() + '</span>' +
            '</a>';
        } else {
          navEl.innerHTML =
            '<a href="/auth.html" style="font-size:13px;color:#64748b;text-decoration:none;font-weight:500;">Sign In</a>' +
            '<a href="/auth.html?mode=signup" style="background:#00355f;color:white;border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;text-decoration:none;">Sign Up Free</a>';
        }

        container.appendChild(navEl);
      }

      window.addEventListener('bt:auth:ready', updateNav);
      window.addEventListener('bt:auth:change', updateNav);
    },
  };

  function _showSuccessBanner(templateName) {
    var banner = document.createElement('div');
    banner.id = 'bt-success-banner';
    banner.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:400;' +
      'background:#16a34a;color:white;border-radius:12px;padding:16px 20px;' +
      'box-shadow:0 8px 32px rgba(22,163,74,0.3);font-family:"Plus Jakarta Sans",sans-serif;' +
      'max-width:300px;display:flex;align-items:center;gap:10px;' +
      'animation:btSlideIn 0.3s ease;';
    banner.innerHTML =
      '<span style="font-size:20px;">&#127881;</span>' +
      '<div>' +
        '<p style="margin:0;font-weight:700;font-size:14px;">Payment successful!</p>' +
        '<p style="margin:0;font-size:12px;opacity:0.85;">Activating ' + templateName + ' Pro access…</p>' +
      '</div>';
    document.body.appendChild(banner);
  }

  function _pollForAccess(templateId) {
    var attempts = 0;
    var maxAttempts = 12;
    var interval = setInterval(async function() {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        window.location.reload();
        return;
      }
      try {
        if (window.BT_STORAGE && window.BT_STORAGE.checkProAccess) {
          var result = await window.BT_STORAGE.checkProAccess();
          if (result.hasAccess) {
            clearInterval(interval);
            var sb = document.getElementById('bt-success-banner');
            if (sb) {
              sb.querySelector('p:last-child').textContent = 'Pro access activated!';
            }
            if (window.BT_TRIAL && window.BT_TRIAL.unlock) window.BT_TRIAL.unlock();
            setTimeout(function() { window.location.reload(); }, 1500);
            return;
          }
        }
      } catch (e) {}
    }, 2500);
  }

})();
