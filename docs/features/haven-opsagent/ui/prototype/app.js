/* ============================================================
   Haven 运维 Agent — 原型共享交互
   现代化深色 UI：cyan 主色 + 分组 sidebar + lucide 线框图标
   ============================================================ */

// lucide 风格线框 SVG path
var ICONS = {
  activity: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  message: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35"/>',
  plus: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m-7-7h14"/>',
  gauge: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14v7"/>',
  gitbranch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9a9 9 0 0 1-9 9"/>',
  box: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  moon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  book: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14A2.5 2.5 0 0 0 6.5 22H20v-2.5"/>',
};

function icon(name) {
  return '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' + ICONS[name] + '</svg>';
}

function sidebarHTML(activeKey) {
  var groups = [
    {
      label: '核心',
      items: [
        { key: 'chat', label: '对话排障', href: 'chat.html', ic: 'message' },
        { key: 'risk', label: '风险中心', href: 'risk-center.html', ic: 'alert' },
        { key: 'rca', label: 'RCA 分析', href: 'rca.html', ic: 'search' },
      ],
    },
    {
      label: '数据视图',
      items: [
        { key: 'topology', label: '拓扑视图', href: 'topology.html', ic: 'gitbranch' },
        { key: 'history', label: '历史回溯', href: 'history.html', ic: 'clock' },
      ],
    },
    {
      label: '管理',
      items: [
        { key: 'agents', label: 'Agent 管理', href: 'agent-management.html', ic: 'box' },
        { key: 'settings', label: '系统配置', href: 'settings.html', ic: 'settings' },
      ],
    },
  ];

  var nav = groups.map(function (g) {
    var items = g.items.map(function (it) {
      var cls = 'nav-item' + (it.key === activeKey ? ' active' : '');
      return '<a class="' + cls + '" href="' + it.href + '" aria-current="' + (it.key === activeKey ? 'page' : 'false') + '">' + icon(it.ic) + it.label + '</a>';
    }).join('');
    return '<div class="nav-group"><div class="nav-group-label">' + g.label + '</div>' + items + '</div>';
  }).join('');

  return '' +
    '<div class="sidebar-brand">' +
      '<div class="logo-icon">' + icon('activity') + '</div>' +
      '<h1>Haven 运维 Agent</h1>' +
    '</div>' +
    '<nav class="sidebar-nav" aria-label="主导航">' + nav + '</nav>' +
    '<div class="sidebar-footer">' +
      '<button class="btn" style="width:100%;" onclick="location.href=\'chat.html\'">' + icon('plus') + '新建诊断</button>' +
      '<div class="sidebar-user">' +
        '<div class="avatar">H</div>' +
        '<div style="flex:1; min-width:0;"><p class="u-name">havens</p><p class="u-role">值班运维 · jlc 租户</p></div>' +
        '<button class="btn btn-ghost btn-sm" id="themeBtn" aria-label="切换主题" title="切换主题">' + icon('moon') + '</button>' +
      '</div>' +
    '</div>';
}

function injectSidebar(key) {
  var aside = document.querySelector('.sidebar');
  if (aside) aside.innerHTML = sidebarHTML(key);
  var tb = document.getElementById('themeBtn');
  if (tb) tb.addEventListener('click', toggleTheme);
  var saved = localStorage.getItem('haven-theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
}

(function () {
  document.documentElement.classList.add('dark');
  var saved = localStorage.getItem('haven-theme');
  if (saved === 'light') document.documentElement.classList.remove('dark');
})();

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('haven-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function toast(message, type) {
  var wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  var el = document.createElement('div');
  el.className = 'toast ' + (type || 'success');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(function () { el.remove(); }, 300); }, 3000);
}

function openDialog(id) {
  var overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('open');
  var first = overlay.querySelector('button, [tabindex]');
  if (first) first.focus();
  var onKey = function (e) {
    if (e.key === 'Escape') { closeDialog(id); document.removeEventListener('keydown', onKey); }
    if (e.key === 'Tab') trapFocus(overlay, e);
  };
  document.addEventListener('keydown', onKey);
  overlay._onKey = onKey;
}
function closeDialog(id) {
  var overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
}
function trapFocus(overlay, e) {
  var f = overlay.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
  if (f.length === 0) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}

function setupCollapsibles(root) {
  (root || document).querySelectorAll('.collapsible-header').forEach(function (h) {
    h.setAttribute('tabindex', '0'); h.setAttribute('role', 'button'); h.setAttribute('aria-expanded', 'false');
    h.addEventListener('click', toggleCollapse);
    h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse.call(h); } });
  });
}
function toggleCollapse() {
  var c = this.parentElement.querySelector('.collapsible-content');
  if (!c) return;
  var open = c.classList.toggle('open');
  this.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function setupMenus(root) {
  (root || document).querySelectorAll('[data-menu-trigger]').forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      var p = (root || document).querySelector('[data-menu-panel="' + t.dataset.menuTrigger + '"]');
      if (!p) return;
      var open = p.classList.toggle('open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) {
    (root || document).querySelectorAll('.menu-pop.open').forEach(function (p) { p.classList.remove('open'); });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-action="close-dialog"]').forEach(function (b) {
    b.addEventListener('click', function () { closeDialog(b.closest('.dialog-overlay').id); });
  });
  document.querySelectorAll('.dialog-overlay').forEach(function (o) {
    o.addEventListener('click', function (e) { if (e.target === o) closeDialog(o.id); });
  });
});