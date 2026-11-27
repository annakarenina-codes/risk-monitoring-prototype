/*
 * Shared UI pieces: theme, role switcher, top bar, badges, trip stepper, formatting.
 */
window.RMS = window.RMS || {};

(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const initials = (name) => name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return `${Math.round(s / 3600)} h ago`;
  }

  const ROLE = { employee: 'Employee', visitor: 'Visitor', driver: 'Driver', guard: 'Guard' };

  const badge = (text, tone = 'grey') => `<span class="badge badge-${tone}">${esc(text)}</span>`;

  /** Replace <i data-lucide> placeholders with icons (no-op if the icon script didn't load). */
  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
  }

  /*
   * Theme colors for code that can't use CSS (the map, the 3D scene).
   * The values live only in css/styles.css; this reads them back, so there is one source.
   * Stylesheets in <head> load before these scripts run, so the variables are ready.
   */
  function readTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(`--${name}`).trim();
    return {
      accent: v('accent'), accentInk: v('accent-ink'), accentTint: v('accent-tint'),
      roof: v('roof'), roofShade: v('roof-shade'), wall: v('wall'), wallShade: v('wall-shade'),
      ground: v('ground'), road: v('road'), yard: v('yard'),
      ink: v('ink'), muted: v('muted'), line: v('line'), panel: v('panel'),
      success: v('success'), successBg: v('success-bg'),
      warning: v('warning'), warningBg: v('warning-bg'),
      danger: v('danger'), dangerBg: v('danger-bg'),
      roles: { employee: v('role-employee'), visitor: v('role-visitor'), driver: v('role-driver'), guard: v('role-guard') },
      equip: { forklift: v('equip-forklift'), cargo: v('cargo') },
      zones: {
        private: v('zone-private'), privateOpacity: parseFloat(v('zone-private-opacity')) || 0.5,
        restricted: v('zone-restricted'),
      },
    };
  }

  /*
   * Prototype roles (no real login). Kept in its own localStorage key, not in the
   * shared RMS state: it's "who is using this browser", not data everyone shares.
   */
  const ROLE_KEY = 'rms-role';
  const ROLES = {
    superadmin: { label: 'Superadmin', short: 'SA' },
    admin: { label: 'Admin (site officer)', short: 'AD' },
  };
  function role() {
    try { const r = localStorage.getItem(ROLE_KEY); if (ROLES[r]) return r; } catch (e) { /* ignore */ }
    return 'superadmin';
  }
  function setRole(r) {
    try { localStorage.setItem(ROLE_KEY, r); } catch (e) { /* ignore */ }
  }
  const roleLabel = () => ROLES[role()].label;

  /**
   * Show a "not for your role" message instead of the page. Returns true when allowed.
   * Client-side only: a prototype convenience, not security.
   */
  function requireRole(needed) {
    if (role() === needed) return true;
    const main = document.querySelector('main');
    main.innerHTML = `
      <section class="card gate-msg">
        <span class="ico"><i data-lucide="lock"></i></span>
        <h2>${esc(ROLES[needed].label)}s only</h2>
        <p>Configure is where site layouts are set up: rooms, zones and gates. Switch to ${esc(ROLES[needed].label)} in the top bar to open it.</p>
        <a class="btn" href="index.html"><i data-lucide="box"></i>Go to the live monitor</a>
      </section>`;
    icons();
    return false;
  }

  const NAV = [
    { href: 'index.html', key: 'dashboard', icon: 'box', label: 'Live monitor', roles: ['superadmin', 'admin'] },
    { href: 'site.html', key: 'site', icon: 'layout-grid', label: 'Configure', roles: ['superadmin'] },
    { href: 'trips.html', key: 'trips', icon: 'truck', label: 'Trips', roles: ['superadmin', 'admin'] },
  ];

  /** Top bar shared by the desktop pages. */
  function header(active) {
    const el = document.getElementById('topbar');
    el.innerHTML = `
      <a class="brand" href="index.html"><span class="brand-mark"><i data-lucide="shield-check"></i></span>RMMS</a>
      <nav class="nav">
        ${NAV.filter((n) => n.roles.includes(role())).map((n) => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}"><i data-lucide="${n.icon}"></i>${n.label}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      <span class="live-pill"><span class="dot"></span>Live <b id="clock"></b></span>
      <button class="btn btn-ghost" id="open-phone" title="Open the phone demo in a small window"><i data-lucide="smartphone"></i>Phone demo</button>
      <button class="btn btn-ghost" id="reset-demo" title="Put the demo data back to the start"><i data-lucide="rotate-ccw"></i>Reset</button>
      <label class="role-switch" title="Prototype only: choose who you're signed in as">
        <span class="avatar">${ROLES[role()].short}</span>
        <select class="input" id="role-select">
          ${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === role() ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>
      </label>`;
    // Reload so the nav and page access match the new role. Other open tabs follow via 'storage'.
    document.getElementById('role-select').onchange = (e) => { setRole(e.target.value); location.reload(); };
    window.addEventListener('storage', (e) => { if (e.key === ROLE_KEY) location.reload(); });
    document.getElementById('open-phone').onclick = () =>
      window.open('phone.html', 'rms-phone', 'width=440,height=900');
    document.getElementById('reset-demo').onclick = () => {
      if (confirm('Reset all demo data (zones, trips, positions) to the start?')) RMS.store.reset();
    };
    const tick = () => { document.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    tick();
    setInterval(tick, 1000);
    icons();
  }

  /** One-line status for a live record, used in people lists. */
  function liveStatus(r, state) {
    const site = r.siteId ? RMS.site(state, r.siteId) : null;
    switch (r.kind) {
      case 'site':
        return { text: `${site?.name ?? ''} · ${r.zone && r.zone.type !== 'private' ? r.zone.name : r.room}`, tone: r.alert ? 'danger' : 'success', tag: r.alert ? 'Restricted area' : 'On site' };
      case 'paused':
        return { text: `${site?.name ?? ''} · location paused`, tone: 'private', tag: 'Private space' };
      case 'transit': {
        // Drivers aren't tracked on the road: we only know where they're headed and when they left.
        const to = RMS.site(state, r.to);
        return { text: `On the way to ${to?.name ?? r.to}${r.startedAt ? ` · left ${clock(r.startedAt)}` : ''}`, tone: 'accent', tag: 'En route' };
      }
      default:
        return { text: 'Not sharing location', tone: 'grey', tag: 'Offline' };
    }
  }

  /**
   * Trip progress as a stepper: phase, drive, phase, …
   * `driverLive` is the driver's live record (for when they left; the drive itself isn't tracked).
   */
  function stepper(trip, state, driverLive, { vertical = false } = {}) {
    const steps = [];
    trip.phases.forEach((ph, i) => {
      if (i > 0) {
        const prev = trip.phases[i - 1];
        let st = 'todo';
        let sub = '';
        if (ph.status !== 'upcoming') { st = 'done'; sub = 'Arrived'; }
        else if (trip.transit && trip.transit.to === ph.siteId) {
          st = 'active';
          const left = driverLive?.kind === 'transit' && driverLive.startedAt ? ` · left ${clock(driverLive.startedAt)}` : '';
          sub = `On the way${left}`;
        } else if (prev.status === 'approved') { st = 'todo'; sub = 'Ready to leave'; }
        steps.push({ icon: 'truck', title: 'En route', sub, st });
      }
      const site = RMS.site(state, ph.siteId);
      const title = `${ph.label} · ${site?.name ?? ph.siteId}`;
      if (ph.status === 'approved') steps.push({ icon: 'check', title, sub: `Approved ${clock(ph.approvedAt)} · ${ph.approvedBy}`, st: 'done' });
      else if (ph.status === 'arrived') steps.push({ icon: 'clock', title, sub: `Checked in ${clock(ph.arrivedAt)} · awaiting guard`, st: 'wait' });
      else if (ph.status === 'rejected') steps.push({ icon: 'x', title, sub: `Rejected: ${ph.rejectedReason}`, st: 'bad' });
      else steps.push({ icon: 'warehouse', title, sub: 'Upcoming', st: 'todo' });
    });
    return `<ol class="stepper ${vertical ? 'vertical' : ''}">
      ${steps.map((s) => `
        <li class="step step-${s.st}">
          <span class="step-dot"><i data-lucide="${s.st === 'done' ? 'check' : s.icon}"></i></span>
          <span class="step-text"><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span>
        </li>`).join('')}
    </ol>`;
  }

  /**
   * What's selected on the live monitor: { kind: 'person'|'room'|'zone'|'gate'|'truck', id, siteId } or null.
   * Tab-local on purpose: it's never put in RMS.store, so it doesn't sync to other tabs.
   */
  const selection = (() => {
    let current = null;
    const subs = new Set();
    return {
      get: () => current,
      set(v) { current = v; subs.forEach((fn) => fn(current)); },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    };
  })();

  RMS.theme = readTheme();
  RMS.ui = { esc, initials, clock, ago, ROLE, badge, icons, header, liveStatus, stepper, role, roleLabel, requireRole, selection };
})();
