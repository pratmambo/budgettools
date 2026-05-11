(function () {
  var STORAGE_PREFIX = 'bt_tour_seen_';

  var TOURS = {
    wedding: [
      { nav: 'dashboard', icon: 'dashboard', title: 'Your Wedding Dashboard', desc: 'See your budget, guest count, vendor status, and countdown to the big day — all in one view.' },
      { nav: 'guests', icon: 'group', title: 'Guest List & RSVPs', desc: 'Track every guest, their RSVP status, dietary requirements, and table assignments.' },
      { nav: 'budget', icon: 'payments', title: 'Budget Tracker', desc: 'Set budgets by category, log every expense, and see exactly where your money is going.' },
      { nav: 'vendors', icon: 'store', title: 'Vendor Hub', desc: 'Store vendor contacts, track contracts, payment schedules, and important notes.' },
      { nav: 'checklist', icon: 'checklist', title: 'Wedding Checklist', desc: 'Pre-built timeline of tasks from 12 months out to your wedding day.' },
      { nav: 'payments', icon: 'schedule', title: 'Payment Scheduler', desc: 'Track deposits, installments, and final payments with due dates and reminders.' },
    ],
    event: [
      { nav: 'overview', icon: 'dashboard', title: 'Event P&L Dashboard', desc: 'Real-time profit & loss tracking for your entire event at a glance.' },
      { nav: 'costs', icon: 'receipt_long', title: 'Cost Categories', desc: 'Organize expenses by category — venue, catering, marketing, equipment, and more.' },
      { nav: 'revenue', icon: 'attach_money', title: 'Revenue Streams', desc: 'Track ticket sales, sponsorships, merchandise, and other income sources.' },
      { nav: 'summary', icon: 'summarize', title: 'P&L Summary', desc: 'See your final profit/loss, break-even point, and per-attendee metrics.' },
    ],
    travel: [
      { nav: 'overview', icon: 'dashboard', title: 'Trip Overview', desc: 'Set trip dates, total budget, and add travel companions — all in one place.' },
      { nav: 'expenses', icon: 'receipt_long', title: 'Expense Breakdown', desc: 'See spending by category — flights, hotels, food, activities, and transport.' },
      { nav: 'dailylog', icon: 'today', title: 'Daily Expense Log', desc: 'Log every expense with category, date, and who paid — track your daily burn rate.' },
      { nav: 'packing', icon: 'checklist', title: 'Packing Checklist', desc: 'Customizable packing list so you never forget the essentials.' },
    ],
    cafe: [
      { nav: 'overview', icon: 'dashboard', title: 'Cafe Overview', desc: 'See total menu items, average food cost percentage, and gross margin at a glance.' },
      { nav: 'menu', icon: 'restaurant_menu', title: 'Menu Management', desc: 'Add every dish on your menu with selling price, category, and active status.' },
      { nav: 'recipe', icon: 'kitchen', title: 'Recipe Costing', desc: 'Build recipes with ingredients and quantities — see the exact cost per serving.' },
      { nav: 'breakeven', icon: 'trending_up', title: 'Break-Even Calculator', desc: 'Know how many covers per day you need to break even on fixed costs.' },
    ],
    inventory: [
      { nav: 'overview', icon: 'dashboard', title: 'Stock Dashboard', desc: 'See all inventory items, quantities, and total stock value at a glance.' },
      { nav: 'inventory', icon: 'inventory_2', title: 'Inventory Items', desc: 'Add SKUs with costs, reorder points, suppliers, and current stock levels.' },
      { nav: 'movements', icon: 'swap_vert', title: 'Stock Movements', desc: 'Track every stock-in, stock-out, and adjustment with timestamps and notes.' },
      { nav: 'lowstock', icon: 'warning', title: 'Low Stock Alerts', desc: 'Items below reorder point are flagged automatically — never run out.' },
    ],
  };

  function getTemplateId() {
    return (window.TEMPLATE_KEY || '').replace('bt_', '').replace(/_v\d+$/, '');
  }

  function hasSeen(tid) {
    return localStorage.getItem(STORAGE_PREFIX + tid) === 'true';
  }

  function markSeen(tid) {
    localStorage.setItem(STORAGE_PREFIX + tid, 'true');
  }

  var _active = false;

  function showTour(tid, steps) {
    if (_active) return;
    if (document.getElementById('bt-tour-container')) return;
    if (document.getElementById('bt-trial-lock')) return;
    if (document.getElementById('bt-upgrade-modal')) return;
    _active = true;

    var current = 0;
    var prevNavItem = null;

    var style = document.createElement('style');
    style.id = 'bt-tour-styles';
    style.textContent =
      '@keyframes btSlideUp{from{transform:translateX(-50%) translateY(30px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}' +
      '@keyframes btFadeIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes btPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,53,95,0.35)}50%{box-shadow:0 0 0 10px rgba(0,53,95,0)}}' +
      '.bt-tour-hl{animation:btPulse 1.5s ease-in-out infinite !important;outline:2px solid #0f4c81;outline-offset:2px;border-radius:8px;position:relative;z-index:10;}' +
      '@media(max-width:767px){#bt-tour-container{bottom:12px !important;max-width:100% !important;padding:0 12px !important;}}';
    document.head.appendChild(style);

    var backdrop = document.createElement('div');
    backdrop.id = 'bt-tour-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.12);animation:btFadeIn 0.3s ease;';

    var container = document.createElement('div');
    container.id = 'bt-tour-container';
    container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;width:100%;max-width:460px;padding:0 16px;animation:btSlideUp 0.4s ease forwards;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.04);font-family:"Plus Jakarta Sans",system-ui,sans-serif;overflow:hidden;';
    container.appendChild(card);

    function highlightNav(navName) {
      if (prevNavItem) prevNavItem.classList.remove('bt-tour-hl');
      var btns = document.querySelectorAll('[data-nav="' + navName + '"]');
      var btn = null;
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].offsetParent !== null) { btn = btns[i]; break; }
      }
      if (!btn && btns.length) btn = btns[0];
      if (btn) {
        btn.classList.add('bt-tour-hl');
        prevNavItem = btn;
      }
      if (typeof window.switchTab === 'function') {
        try { window.switchTab(navName); } catch (e) {}
      }
    }

    function render() {
      var step = steps[current];
      var isLast = current === steps.length - 1;
      var isFirst = current === 0;
      var pct = ((current + 1) / steps.length) * 100;

      highlightNav(step.nav);

      card.innerHTML =
        '<div style="height:3px;background:#e2e8f0;">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#00355f,#0f4c81);transition:width 0.4s ease;border-radius:0 3px 3px 0;"></div>' +
        '</div>' +
        '<div style="padding:20px 24px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#00355f,#0f4c81);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                '<span class="material-symbols-outlined" style="color:#fff;font-size:20px;">' + step.icon + '</span>' +
              '</div>' +
              '<div>' +
                '<p style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0;">' + (current + 1) + ' of ' + steps.length + '</p>' +
                '<h3 style="font-size:17px;color:#0d1c2f;margin:0;font-weight:700;">' + step.title + '</h3>' +
              '</div>' +
            '</div>' +
            '<button id="bt-tour-skip" style="background:none;border:none;color:#94a3b8;font-size:13px;cursor:pointer;padding:4px 8px;font-weight:600;white-space:nowrap;" title="Skip tour (Esc)">Skip &times;</button>' +
          '</div>' +
          '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 16px;">' + step.desc + '</p>' +
          '<div style="display:flex;gap:10px;">' +
            (isFirst ? '' : '<button id="bt-tour-back" style="flex:1;background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:10px;font-weight:600;cursor:pointer;font-size:13px;font-family:inherit;transition:background 0.15s;">&larr; Back</button>') +
            '<button id="bt-tour-next" style="flex:' + (isFirst ? '1' : '2') + ';background:linear-gradient(135deg,#00355f,#0f4c81);color:#fff;border:none;border-radius:10px;padding:10px;font-weight:700;cursor:pointer;font-size:14px;font-family:inherit;transition:opacity 0.15s;">' +
              (isLast ? 'Get Started &check;' : 'Next &rarr;') +
            '</button>' +
          '</div>' +
        '</div>';

      card.querySelector('#bt-tour-skip').onclick = close;
      var backBtn = card.querySelector('#bt-tour-back');
      if (backBtn) {
        backBtn.onclick = function () { current--; render(); };
        backBtn.onmouseenter = function () { this.style.background = '#e2e8f0'; };
        backBtn.onmouseleave = function () { this.style.background = '#f1f5f9'; };
      }
      var nextBtn = card.querySelector('#bt-tour-next');
      nextBtn.onclick = function () { if (isLast) close(); else { current++; render(); } };
      nextBtn.onmouseenter = function () { this.style.opacity = '0.85'; };
      nextBtn.onmouseleave = function () { this.style.opacity = '1'; };
    }

    function close() {
      markSeen(tid);
      _active = false;
      document.removeEventListener('keydown', onKey);
      if (prevNavItem) prevNavItem.classList.remove('bt-tour-hl');
      if (steps[0] && typeof window.switchTab === 'function') {
        try { window.switchTab(steps[0].nav); } catch (e) {}
      }
      container.style.transition = 'all 0.3s ease';
      container.style.opacity = '0';
      container.style.transform = 'translateX(-50%) translateY(20px)';
      backdrop.style.transition = 'opacity 0.3s ease';
      backdrop.style.opacity = '0';
      setTimeout(function () {
        container.remove();
        backdrop.remove();
        var s = document.getElementById('bt-tour-styles');
        if (s) s.remove();
      }, 300);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && current < steps.length - 1) { current++; render(); }
      else if (e.key === 'ArrowLeft' && current > 0) { current--; render(); }
    }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', close);

    render();
    document.body.appendChild(backdrop);
    document.body.appendChild(container);
  }

  window.BT_TOUR = {
    start: function () {
      var tid = getTemplateId();
      var steps = TOURS[tid];
      if (!steps || hasSeen(tid)) return;
      if (document.getElementById('bt-trial-lock') || document.getElementById('bt-upgrade-modal')) return;
      setTimeout(function () { showTour(tid, steps); }, 600);
    },
    restart: function () {
      var tid = getTemplateId();
      var steps = TOURS[tid];
      if (!steps) return;
      localStorage.removeItem(STORAGE_PREFIX + tid);
      showTour(tid, steps);
    },
    dismiss: function () {
      _active = false;
      var c = document.getElementById('bt-tour-container');
      var b = document.getElementById('bt-tour-backdrop');
      var s = document.getElementById('bt-tour-styles');
      if (c) c.remove();
      if (b) b.remove();
      if (s) s.remove();
      document.querySelectorAll('.bt-tour-hl').forEach(function (el) { el.classList.remove('bt-tour-hl'); });
    },
    isActive: function () { return _active; },
  };
})();
