/*
 * Phone app stand-in (phone.html).
 *
 * The important privacy rule lives here, on the device: the phone knows where it is,
 * checks the site's private zones itself, and inside one sends only "paused" with
 * no coordinates. The dashboard never receives the position, so it can't leak it.
 */
(function () {
  const { store, ui, plan, actions } = RMS;
  const { esc } = ui;

  const app = document.getElementById('app');
  const phoneUsers = () => store.get().people.filter((p) => !p.sim);

  let meId = new URLSearchParams(location.search).get('as') || localStorage.getItem('rms-phone-as') || 'D01';
  if (!phoneUsers().find((p) => p.id === meId)) meId = phoneUsers()[0].id;

  /* ---------- device-only position (never sent while in a private zone) ---------- */

  const deviceKey = () => `rms-device-${meId}`;
  function devicePos() {
    try { const d = JSON.parse(localStorage.getItem(deviceKey())); if (d) return d; } catch (e) { /* ignore */ }
    const me = person();
    const s = RMS.site(store.get(), me.live?.siteId || me.siteId || 'WH-01');
    return { siteId: s.id, x: me.live?.x ?? s.gate[0], y: me.live?.y ?? s.gate[1] };
  }
  function setDevicePos(pos) { localStorage.setItem(deviceKey(), JSON.stringify(pos)); }

  const person = () => store.get().people.find((p) => p.id === meId);
  const sharing = () => person().live?.kind !== 'offline';
  const myTrip = () => store.get().trips.find((t) => t.driverId === meId && RMS.trips.currentPhase(t) !== -1)
    || store.get().trips.find((t) => t.driverId === meId);

  /** Send the device position, applying the private-zone rule first. */
  function report(pos) {
    if (!sharing()) return;
    const zone = RMS.geo.zoneAt(store.get().zones, pos.siteId, pos.x, pos.y);
    if (zone?.type === 'private') actions.reportLocation(meId, { kind: 'paused', siteId: pos.siteId });
    else actions.reportLocation(meId, { kind: 'site', siteId: pos.siteId, x: pos.x, y: pos.y });
  }

  /* ---------- rendering ---------- */

  function shareCard(me, liveRec, pos) {
    const zone = RMS.geo.zoneAt(store.get().zones, pos.siteId, pos.x, pos.y);
    const site = RMS.site(store.get(), pos.siteId);
    let cls, icon, title, text;
    if (!sharing()) { cls = 'off'; icon = 'map-pin-off'; title = 'Not sharing'; text = 'Your location is off. Turn it on while on duty.'; }
    else if (liveRec.kind === 'transit') { cls = 'transit'; icon = 'navigation'; title = 'Sharing · on the road'; text = 'Your route is visible to operations.'; }
    else if (zone?.type === 'private') { cls = 'paused'; icon = 'eye-off'; title = 'Paused · private space'; text = `You're in ${zone.name}. Nothing is being sent. Sharing resumes when you leave.`; }
    else { cls = 'on'; icon = 'radio'; title = `Sharing with ${site?.name ?? ''}`; text = 'Operations can see where you are on site.'; }
    return `
      <section class="card share-card ${cls}">
        <span class="ico"><i data-lucide="${icon}"></i></span>
        <span style="flex:1"><b>${esc(title)}</b><small>${esc(text)}</small></span>
        <label class="switch" title="Share my location"><input type="checkbox" id="share" ${sharing() ? 'checked' : ''}><span></span></label>
      </section>`;
  }

  function mapCard(pos) {
    const sites = store.get().sites;
    return `
      <section class="card">
        <div class="card-head">
          <h2><i data-lucide="map-pin"></i>You are here</h2>
          <span class="spacer"></span>
          <select class="input" id="site" style="width:auto;padding:4px 8px">
            ${sites.map((s) => `<option value="${s.id}" ${s.id === pos.siteId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="card-body">
          <svg class="plan" id="mini" viewBox="-1 -1 102 62"><g id="mini-base"></g><g id="mini-me"></g></svg>
          <small>Tap the plan to move (stands in for GPS / indoor positioning).</small>
        </div>
      </section>`;
  }

  function driverCard(liveRec) {
    const t = myTrip();
    if (!t) return '<section class="card"><div class="empty">No trip assigned.</div></section>';
    const state = store.get();
    const i = RMS.trips.currentPhase(t);
    const ph = t.phases[i];
    let action = '';
    if (i === -1) {
      action = `<div class="badge badge-green">Trip complete. Thank you!</div>`;
    } else if (ph.status === 'arrived') {
      action = `<button class="btn btn-block" disabled><i data-lucide="hourglass"></i>Waiting for the guard…</button>`;
    } else if (ph.status === 'rejected') {
      action = `<p class="muted" style="margin:0 0 8px">Rejected: ${esc(ph.rejectedReason)}</p>
        <button class="btn btn-block" data-act="checkin"><i data-lucide="log-in"></i>Check in again</button>`;
    } else if (t.transit) {
      const p = liveRec.kind === 'transit' ? liveRec.progress : 0;
      const left = liveRec.kind === 'transit' ? Math.max(0, Math.ceil((liveRec.duration * (1 - p)) / 1000)) : 0;
      const to = RMS.site(state, t.transit.to);
      action = `
        <div style="display:grid;gap:8px">
          <div style="display:flex;justify-content:space-between"><small>To ${esc(to.name)}</small><small>${left ? `${left}s left` : 'Arrived'}</small></div>
          <div class="progress"><i style="width:${Math.round(p * 100)}%"></i></div>
          <button class="btn btn-block" data-act="checkin" ${p < 1 ? 'disabled' : ''}><i data-lucide="log-in"></i>Check in at ${esc(to.name)} gate</button>
        </div>`;
    } else if (i === 0) {
      action = `<button class="btn btn-block" data-act="checkin"><i data-lucide="log-in"></i>Check in at ${esc(RMS.site(state, ph.siteId).name)} gate</button>`;
    } else {
      action = `<button class="btn btn-block" data-act="depart"><i data-lucide="truck"></i>Depart to ${esc(RMS.site(state, ph.siteId).name)}</button>`;
    }
    return `
      <section class="card">
        <div class="card-head"><h2><i data-lucide="route"></i>${esc(t.id)}</h2><span class="spacer"></span><small>${esc(t.vehicle)}</small></div>
        <div class="card-body" style="display:grid;gap:14px">
          ${ui.stepper(t, state, liveRec, { vertical: true })}
          ${action}
        </div>
      </section>`;
  }

  function guardCard(me) {
    const siteId = me.siteId;
    const pend = RMS.trips.pending(store.get(), siteId);
    return `
      <section class="card">
        <div class="card-head"><h2><i data-lucide="stamp"></i>At your gate</h2><span class="spacer"></span>${ui.badge(`${pend.length} waiting`, pend.length ? 'amber' : 'grey')}</div>
        ${pend.map((x) => `
          <div class="card-body" style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:12px">
            <div style="display:flex;gap:10px;align-items:center">
              <span class="pfp driver">${ui.initials(x.driver.name)}</span>
              <span style="flex:1"><b>${esc(x.driver.name)}</b><small style="display:block">${esc(x.trip.vehicle)} · ${esc(x.trip.cargo)}</small></span>
            </div>
            <small>${esc(x.trip.id)} · ${esc(x.phase.label)} · checked in ${ui.ago(x.phase.arrivedAt)}</small>
            <div style="display:flex;gap:8px">
              <button class="btn btn-soft-red" style="flex:1" data-reject="${x.trip.id}" data-index="${x.index}"><i data-lucide="x"></i>Reject</button>
              <button class="btn btn-green" style="flex:1" data-approve="${x.trip.id}" data-index="${x.index}"><i data-lucide="check"></i>Approve</button>
            </div>
          </div>`).join('') || '<div class="empty">No drivers waiting.</div>'}
      </section>`;
  }

  let last = '';
  function render() {
    const me = person();
    const liveRec = RMS.live(store.get()).find((r) => r.id === meId);
    const pos = devicePos();
    const inTransit = liveRec.kind === 'transit';

    const html = `
      <div class="phone-top">
        <span class="pfp ${me.role}">${ui.initials(me.name)}</span>
        <span class="grow"><b>${esc(me.name)}</b><small>${esc(ui.ROLE[me.role])}${me.siteId ? ` · ${esc(RMS.site(store.get(), me.siteId)?.name)}` : ''}</small></span>
        <i data-lucide="bell"></i>
      </div>
      ${shareCard(me, liveRec, pos)}
      ${me.role === 'guard' ? guardCard(me) : ''}
      ${me.role === 'driver' ? driverCard(liveRec) : ''}
      ${inTransit ? '' : mapCard(pos)}`;

    if (html !== last) {
      app.innerHTML = html;
      last = html;
      ui.icons();
    }

    const base = document.getElementById('mini-base');
    if (base) {
      const site = RMS.site(store.get(), pos.siteId);
      const markup = plan.base(site, store.get().zones);
      if (base.dataset.html !== markup) { base.innerHTML = markup; base.dataset.html = markup; }
      // The device always shows itself, even in a private zone: that's local only.
      plan.people(document.getElementById('mini-me'), [{ id: meId, person: me, x: pos.x, y: pos.y }], { meId });
    }
  }

  /* ---------- events ---------- */

  app.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest('#mini');
    if (!svg) return;
    const [x, y] = plan.toPlan(svg, e);
    const pos = { ...devicePos(), x, y };
    setDevicePos(pos);
    report(pos);
    render();
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'share') {
      if (e.target.checked) {
        actions.reportLocation(meId, { kind: 'site', siteId: devicePos().siteId, x: devicePos().x, y: devicePos().y });
        report(devicePos());
      } else {
        actions.reportLocation(meId, { kind: 'offline' });
      }
    }
    if (e.target.id === 'site') {
      const s = RMS.site(store.get(), e.target.value);
      const pos = { siteId: s.id, x: s.gate[0], y: s.gate[1] - 4 };
      setDevicePos(pos);
      report(pos);
    }
  });

  app.addEventListener('click', (e) => {
    const t = myTrip();
    const act = e.target.closest('[data-act]');
    if (act && t) {
      if (act.dataset.act === 'checkin') {
        actions.checkIn(t.id);
        const p = person().live;
        if (p?.kind === 'site') setDevicePos({ siteId: p.siteId, x: p.x, y: p.y });
      }
      if (act.dataset.act === 'depart') actions.depart(t.id);
    }
    const a = e.target.closest('[data-approve]');
    const r = e.target.closest('[data-reject]');
    if (a) actions.approve(a.dataset.approve, +a.dataset.index, person().name);
    if (r) {
      const reason = prompt('Reason for rejecting:', 'Seal number does not match');
      if (reason !== null) actions.reject(r.dataset.reject, +r.dataset.index, person().name, reason);
    }
  });

  /* ---------- who is signed in ---------- */

  const asSel = document.getElementById('as');
  function renderAs() {
    asSel.innerHTML = phoneUsers().map((p) => `<option value="${p.id}" ${p.id === meId ? 'selected' : ''}>${esc(p.name)} (${ui.ROLE[p.role]})</option>`).join('');
  }
  asSel.onchange = () => {
    meId = asSel.value;
    localStorage.setItem('rms-phone-as', meId);
    history.replaceState(null, '', `?as=${meId}`);
    last = '';
    render();
  };

  const tick = () => { document.getElementById('phone-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 5000);

  renderAs();
  ui.icons();
  store.subscribe(() => { renderAs(); render(); });
  setInterval(render, 1000);
})();
