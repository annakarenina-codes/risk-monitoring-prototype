/*
 * Shared UI pieces: top bar, badges, trip stepper, formatting.
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

  const NAV = [
    { href: 'index.html', key: 'dashboard', icon: 'map', label: 'Live map' },
    { href: 'site.html', key: 'site', icon: 'layout-grid', label: 'Sites & zones' },
    { href: 'trips.html', key: 'trips', icon: 'truck', label: 'Trips' },
  ];

  /** Top bar shared by the desktop pages. */
  function header(active) {
    const el = document.getElementById('topbar');
    el.innerHTML = `
      <a class="brand" href="index.html"><span class="brand-mark"><i data-lucide="shield-check"></i></span>RMMS</a>
      <nav class="nav">
        ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}"><i data-lucide="${n.icon}"></i>${n.label}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      <span class="live-pill"><span class="dot"></span>Live <b id="clock"></b></span>
      <button class="btn btn-ghost" id="open-phone" title="Open the phone demo in a small window"><i data-lucide="smartphone"></i>Phone demo</button>
      <button class="btn btn-ghost" id="reset-demo" title="Put the demo data back to the start"><i data-lucide="rotate-ccw"></i>Reset</button>
      <span class="avatar" title="Signed in as Admin">AD</span>`;
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
        return { text: `${site?.name ?? ''} · ${r.zone && r.zone.type !== 'private' ? r.zone.name : r.room}`, tone: r.alert ? 'red' : 'green', tag: r.alert ? 'Restricted area' : 'On site' };
      case 'paused':
        return { text: `${site?.name ?? ''} · location paused`, tone: 'violet', tag: 'Private space' };
      case 'transit': {
        const to = RMS.site(state, r.to);
        return { text: `To ${to?.name ?? r.to} · ${Math.round(r.progress * 100)}%`, tone: 'blue', tag: 'In transit' };
      }
      default:
        return { text: 'Not sharing location', tone: 'grey', tag: 'Offline' };
    }
  }

  /**
   * Trip progress as a stepper: phase, drive, phase, …
   * `driverLive` is the driver's live record (for the drive progress).
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
          const pct = driverLive?.kind === 'transit' ? Math.round(driverLive.progress * 100) : 0;
          sub = `${pct}% · on the road`;
        } else if (prev.status === 'approved') { st = 'todo'; sub = 'Ready to leave'; }
        steps.push({ icon: 'truck', title: 'In transit', sub, st });
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

  RMS.ui = { esc, initials, clock, ago, ROLE, badge, icons, header, liveStatus, stepper };
})();
