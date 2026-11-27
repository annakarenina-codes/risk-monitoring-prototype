/*
 * Live monitor (index.html): a 3D model of one site, built from its Configure setup,
 * with the site's head counts, people and activity around it. Read-only.
 * Drivers between sites are not shown here: this page is about what's on site.
 */
(function () {
  const { store, ui } = RMS;
  const { esc } = ui;

  const params = new URLSearchParams(location.search);
  let siteId = RMS.site(store.get(), params.get('site')) ? params.get('site') : store.get().sites[0].id;
  let roleFilter = 'all';
  let view = null;

  ui.header('dashboard');

  /* ---------- 3D view ---------- */

  function sceneMessage(text) {
    document.getElementById('scene').innerHTML = `<div class="scene-fallback">${esc(text)}</div>`;
  }

  function initScene() {
    if (view) return;
    try {
      view = RMS.scene3d.mount(document.getElementById('scene'), { padRight: 392, labels: labelsOn, names: namesOn, roofs: roofsOn });
      view.setSite(siteId);
    } catch (e) {
      console.error(e);
      sceneMessage('The 3D view could not start. This browser or device may not support WebGL.');
    }
  }
  // js/scene3d.js fetches three.js from the CDN after this script runs.
  if (RMS.scene3d) initScene();
  else window.addEventListener('rms:scene3d-ready', initScene, { once: true });
  window.addEventListener('rms:scene3d-failed', () => sceneMessage('The 3D library could not load. Check the internet connection.'), { once: true });

  document.getElementById('zoom-in').onclick = () => view?.zoom(0.75);
  document.getElementById('zoom-out').onclick = () => view?.zoom(1.33);
  document.getElementById('reset-view').onclick = () => view?.resetView();
  document.getElementById('rotate').onclick = (e) => {
    if (view) e.currentTarget.classList.toggle('on', view.toggleRotate());
  };

  // Name and status labels above people and forklifts (remembered in this browser only).
  let labelsOn = true;
  try { labelsOn = localStorage.getItem('rms-monitor-labels') !== 'off'; } catch (e) { /* ignore */ }
  const labelsBtn = document.getElementById('labels');
  labelsBtn.classList.toggle('on', labelsOn);
  labelsBtn.onclick = () => {
    labelsOn = !labelsOn;
    labelsBtn.classList.toggle('on', labelsOn);
    view?.setLabels(labelsOn);
    try { localStorage.setItem('rms-monitor-labels', labelsOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
  };

  // Names on the 3D labels (remembered in this browser only). Off = statuses only.
  let namesOn = true;
  try { namesOn = localStorage.getItem('rms-monitor-names') !== 'off'; } catch (e) { /* ignore */ }
  const namesBtn = document.getElementById('names');
  namesBtn.classList.toggle('on', namesOn);
  namesBtn.onclick = () => {
    namesOn = !namesOn;
    namesBtn.classList.toggle('on', namesOn);
    view?.setNames(namesOn);
    try { localStorage.setItem('rms-monitor-names', namesOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
  };

  // Roofs (remembered in this browser only). Off by default so you can see inside.
  let roofsOn = false;
  try { roofsOn = localStorage.getItem('rms-monitor-roofs') === 'on'; } catch (e) { /* ignore */ }
  const roofsBtn = document.getElementById('roofs');
  roofsBtn.classList.toggle('on', roofsOn);
  roofsBtn.onclick = () => {
    roofsOn = !roofsOn;
    roofsBtn.classList.toggle('on', roofsOn);
    view?.setRoofs(roofsOn);
    try { localStorage.setItem('rms-monitor-roofs', roofsOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
  };

  function setSite(id) {
    ui.selection.set(null);
    siteId = id;
    history.replaceState(null, '', `?site=${encodeURIComponent(id)}`);
    view?.setSite(id);
    render();
  }

  /* ---------- panels ---------- */

  function renderSwitch(state) {
    swap('site-switch', state.sites.map((s) => `
      <button class="seg ${s.id === siteId ? 'active' : ''}" data-site="${esc(s.id)}">
        <b>${esc(s.id)} · ${esc(s.name)}</b><small>${esc(s.area)}</small>
      </button>`).join(''));
  }

  function renderKpis(state, here) {
    const awaiting = RMS.trips.pending(state, siteId).length;
    const alerts = here.filter((r) => r.alert).length;
    const items = [
      { icon: 'users', label: 'On site', value: here.length },
      { icon: 'id-card', label: 'Visitors', value: here.filter((r) => r.person.role === 'visitor').length, tone: 'warning' },
      { icon: 'stamp', label: 'Awaiting guard', value: awaiting, tone: awaiting ? 'warning' : '', href: 'trips.html' },
      { icon: 'eye-off', label: 'Location paused', value: here.filter((r) => r.kind === 'paused').length, tone: 'private' },
      { icon: 'truck', label: 'Trucks here', value: RMS.trucks.atSite(state, siteId).length },
      { icon: 'siren', label: 'Alerts', value: alerts, tone: alerts ? 'danger' : '' },
    ];
    swap('kpis', items.map((k) => `
      <${k.href ? `a href="${k.href}"` : 'div'} class="card kpi ${k.tone || ''}">
        <span class="kpi-icon"><i data-lucide="${k.icon}"></i></span>
        <span><small>${k.label}</small><b>${k.value}</b></span>
      </${k.href ? 'a' : 'div'}>`).join(''));
  }

  /** One chip per visitor inside a restricted zone. */
  function renderAlerts(here) {
    swap('alerts', here.filter((r) => r.alert).map((r) => `
      <div class="alert-chip">
        <i data-lucide="siren"></i>
        <span><b>${esc(r.person.name)}</b> (${esc(ui.ROLE[r.person.role].toLowerCase())}) is in <b>${esc(r.zone.name)}</b>, a restricted zone</span>
      </div>`).join(''));
  }

  /* ---------- inspector: details of what's selected in 3D ---------- */

  const TYPE_LABEL = { private: 'Private', restricted: 'Restricted', general: 'General' };
  const TYPE_TONE = { private: 'private', restricted: 'danger', general: 'grey' };
  const isSuper = () => ui.role() === 'superadmin';
  const field = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;
  const personRow = (r) => `
    <li class="row clickable" data-person="${esc(r.id)}">
      <span class="pfp ${r.person.role}">${ui.initials(r.person.name)}</span>
      <span class="grow"><b>${esc(r.person.name)}</b><small>${esc(ui.ROLE[r.person.role])}</small></span>
      ${r.alert ? ui.badge('Restricted area', 'danger') : ''}
    </li>`;
  const decide = (x) => `
    <div class="decide">
      <button class="btn btn-soft-red btn-sm" data-reject="${esc(x.trip.id)}" data-index="${x.index}"><i data-lucide="x"></i>Reject</button>
      <button class="btn btn-sm" data-approve="${esc(x.trip.id)}" data-index="${x.index}"><i data-lucide="check"></i>Approve</button>
    </div>`;

  /** Returns { icon, title, body, edit } for the selection, or null when it no longer exists. */
  function describe(sel, state, recs, here) {
    const site = RMS.site(state, siteId);
    const onSite = here.filter((r) => r.kind === 'site');
    const pend = RMS.trips.pending(state, siteId);
    const counts = RMS.occupancy.privateCounts(recs, siteId);

    if (sel.kind === 'person') {
      const r = onSite.find((x) => x.id === sel.id);
      if (!r) return null; // left the site, went offline, or entered a private zone
      const tripId = r.status?.tripId;
      const truck = tripId && RMS.trucks.atSite(state, siteId).find((t) => t.id === tripId);
      return {
        icon: 'user', title: r.person.name,
        body: `
          ${field('Role', esc(ui.ROLE[r.person.role]))}
          ${field('Status', ui.badge(r.status.text, r.status.tone))}
          ${tripId ? field('Trip', esc(tripId)) : ''}
          ${r.rides ? field('Driving', `<a href="#" data-forklift="${esc(r.rides)}">${esc(r.rides)}</a>`) : ''}
          ${field('Room', esc(r.room))}
          ${field('Zone', r.zone ? `${esc(r.zone.name)} ${ui.badge(TYPE_LABEL[r.zone.type], TYPE_TONE[r.zone.type])}` : 'None')}
          ${truck ? `<div class="decide"><button class="btn btn-soft btn-sm" data-truck="${esc(truck.id)}"><i data-lucide="truck"></i>Show truck</button></div>` : ''}`,
      };
    }

    if (sel.kind === 'zone') {
      const z = state.zones.find((x) => x.id === sel.id && x.siteId === siteId);
      if (!z) return null;
      let people;
      if (z.type === 'private') {
        const n = counts[z.id] || 0;
        people = `${field('Inside', `${n} ${n === 1 ? 'person' : 'people'}`)}
          <p class="note"><i data-lucide="eye-off"></i><span>Private zone: only a head count. Names and positions are never shown.</span></p>`;
      } else {
        const inside = onSite.filter((r) => r.zone?.id === z.id);
        people = `${field('Inside', `${inside.length} ${inside.length === 1 ? 'person' : 'people'}`)}
          <ul class="list">${inside.map(personRow).join('')}</ul>`;
      }
      return {
        icon: 'shapes', title: z.name,
        body: `${field('Type', ui.badge(TYPE_LABEL[z.type], TYPE_TONE[z.type]))}${people}`,
        edit: `site.html?site=${encodeURIComponent(siteId)}&zone=${encodeURIComponent(z.id)}`,
      };
    }

    if (sel.kind === 'room') {
      const room = site.rooms.find((x) => x.id === sel.id);
      if (!room) return null;
      const inside = onSite.filter((r) => r.room === room.name);
      const priv = state.zones.find((z) => z.siteId === siteId && z.type === 'private' && z.name.trim().toLowerCase() === room.name.trim().toLowerCase());
      const n = priv ? counts[priv.id] || 0 : 0;
      return {
        icon: 'square', title: room.name,
        body: `
          ${field('Size', `${room.w} × ${room.h} m · ${(room.doors || []).length} door${(room.doors || []).length === 1 ? '' : 's'}`)}
          ${field('People', priv ? `${n} inside (private, no names)` : `${inside.length}`)}
          ${priv ? '' : `<ul class="list">${inside.map(personRow).join('')}</ul>`}`,
        edit: `site.html?site=${encodeURIComponent(siteId)}&room=${encodeURIComponent(room.id)}`,
      };
    }

    if (sel.kind === 'gate') {
      const g = RMS.geo.gate(site);
      if (!g) return null;
      return {
        icon: 'door-open', title: g.name,
        body: `
          ${field('Width', `${g.width} m`)}
          ${field('Waiting for guard', `${pend.length}`)}
          ${pend.map((x) => `
            <div class="waiting">
              <div class="row clickable" data-truck="${esc(x.trip.id)}">
                <span class="pfp driver">${ui.initials(x.driver.name)}</span>
                <span class="grow"><b>${esc(x.driver.name)}</b><small>${esc(x.trip.vehicle)} · ${esc(x.phase.label)} · checked in ${ui.ago(x.phase.arrivedAt)}</small></span>
              </div>
              ${decide(x)}
            </div>`).join('') || '<div class="empty">No drivers waiting.</div>'}`,
        edit: `site.html?site=${encodeURIComponent(siteId)}&room=__gate`,
      };
    }

    if (sel.kind === 'truck') {
      const tr = RMS.trucks.atSite(state, siteId).find((t) => t.id === sel.id);
      if (!tr) return null; // departed, or rejected and gone
      const dl = recs.find((r) => r.id === tr.trip.driverId);
      const status = ui.badge(tr.status.text, tr.status.tone);
      const driver = dl?.kind === 'site' && dl.siteId === siteId
        ? `<a href="#" data-person="${esc(dl.id)}">${esc(tr.driver.name)}</a>` : esc(tr.driver?.name);
      return {
        icon: 'truck', title: `${tr.trip.vehicle}`,
        body: `
          ${field('Status', status)}
          ${field('Trip', esc(tr.trip.id))}
          ${field('Driver', driver)}
          ${field('Cargo', esc(tr.trip.cargo))}
          ${field('Stop', `${esc(tr.phase.label)} · ${tr.state === 'waiting' ? `checked in ${ui.ago(tr.phase.arrivedAt)}` : `approved ${ui.ago(tr.phase.approvedAt)}`}`)}
          ${tr.state === 'waiting' ? '' : field('Parking', esc(tr.place))}
          <div class="insp-stepper">${ui.stepper(tr.trip, state, dl, { vertical: true })}</div>
          ${tr.state === 'waiting' && tr.phase.status === 'arrived' ? decide(tr) : ''}`,
      };
    }

    if (sel.kind === 'parking') {
      const pk = (site.parking || []).find((x) => x.id === sel.id);
      if (!pk) return null;
      const slots = RMS.trucks.parkingSlots({ parking: [pk] }).length;
      const here = RMS.trucks.atSite(state, siteId).filter((t) => t.parkId === pk.id);
      const KIND = { any: 'Any truck', loading: 'Loading trucks', unloading: 'Unloading trucks' };
      return {
        icon: 'square-parking', title: pk.name,
        body: `
          ${field('For', KIND[pk.kind || 'any'])}
          ${field('Slots', `${here.length} of ${slots} taken`)}
          <ul class="list">${here.map((t) => `
            <li class="row clickable" data-truck="${esc(t.id)}">
              <span class="pfp truck"><i data-lucide="truck"></i></span>
              <span class="grow"><b>${esc(t.trip.vehicle)}</b><small>${esc(t.driver?.name || '')}</small></span>
              ${ui.badge(t.status.text, t.status.tone)}
            </li>`).join('')}</ul>`,
        edit: `site.html?site=${encodeURIComponent(siteId)}&room=${encodeURIComponent(`park:${pk.id}`)}`,
      };
    }

    if (sel.kind === 'road') {
      const r = (site.roads || []).find((x) => x.id === sel.id);
      if (!r) return null;
      return {
        icon: 'route', title: 'Road',
        body: `${field('Size', `${r.w} × ${r.h} m`)}<p class="note"><i data-lucide="truck"></i><span>Trucks drive only on roads and parking areas. Forklifts prefer roads when they cross the yard.</span></p>`,
        edit: `site.html?site=${encodeURIComponent(siteId)}&room=${encodeURIComponent(`road:${r.id}`)}`,
      };
    }

    if (sel.kind === 'forklift') {
      const e = RMS.equipment(state).find((x) => x.id === sel.id && x.siteId === siteId);
      if (!e) return null;
      const zone = RMS.geo.zoneAt(state.zones, siteId, e.x, e.y);
      return {
        icon: 'forklift', title: e.asset.name,
        body: `
          ${field('Type', 'Forklift')}
          ${field('Operator', e.operator ? `<a href="#" data-person="${esc(e.operator.id)}">${esc(e.operator.name)}</a>` : 'None')}
          ${field('Status', ui.badge(e.status.text, e.status.tone))}
          ${e.job ? field('Job', `${esc(e.job.from)} → ${esc(e.job.to)}`) : ''}
          ${field('Load', e.carry ? '1 pallet' : 'Empty')}
          ${field('Room', esc(RMS.geo.roomAt(site, e.x, e.y)))}
          ${field('Zone', zone ? `${esc(zone.name)} ${ui.badge(TYPE_LABEL[zone.type], TYPE_TONE[zone.type])}` : 'None')}`,
      };
    }
    return null;
  }

  function renderInspector(state, recs, here) {
    const el = document.getElementById('inspector');
    const sel = ui.selection.get();
    const d = sel && sel.siteId === siteId ? describe(sel, state, recs, here) : null;
    if (!d) {
      if (sel) ui.selection.set(null); // it's gone: clear it everywhere in this tab
      el.hidden = true;
      return;
    }
    el.hidden = false;
    swap('inspector', `
      <div class="card-head">
        <h2><i data-lucide="${d.icon}"></i>${esc(d.title)}</h2>
        <span class="spacer"></span>
        ${d.edit && isSuper() ? `<a class="btn btn-ghost btn-sm" href="${d.edit}" title="Open this in Configure"><i data-lucide="pencil"></i>Edit in Configure</a>` : ''}
        <button class="btn btn-ghost btn-sm icon-btn" id="insp-close" title="Close (Esc)"><i data-lucide="x"></i></button>
      </div>
      <div class="card-body insp-body">${d.body}</div>`);
  }

  document.getElementById('inspector').addEventListener('click', (e) => {
    if (e.target.closest('#insp-close')) return ui.selection.set(null);
    const a = e.target.closest('[data-approve]');
    const r = e.target.closest('[data-reject]');
    const by = `${ui.roleLabel()} (desktop)`;
    if (a) return RMS.actions.approve(a.dataset.approve, +a.dataset.index, by);
    if (r) {
      const reason = prompt('Reason for rejecting (shown to the driver):', 'Documents incomplete');
      if (reason !== null) RMS.actions.reject(r.dataset.reject, +r.dataset.index, by, reason);
      return;
    }
    const p = e.target.closest('[data-person]');
    if (p) { e.preventDefault(); return ui.selection.set({ kind: 'person', id: p.dataset.person, siteId }); }
    const t = e.target.closest('[data-truck]');
    if (t) return ui.selection.set({ kind: 'truck', id: t.dataset.truck, siteId });
    const f = e.target.closest('[data-forklift]');
    if (f) { e.preventDefault(); ui.selection.set({ kind: 'forklift', id: f.dataset.forklift, siteId }); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.target.matches('input, select, textarea')) ui.selection.set(null);
  });

  function renderPeople(state, here) {
    const sel = ui.selection.get();
    if (roleFilter === 'equipment') return renderEquipment(state, sel);
    const recs = here.filter((r) => roleFilter === 'all' || r.person.role === roleFilter);
    document.getElementById('people-count').textContent = `${recs.length}`;
    swap('people', recs.map((r) => {
      // Paused people show only "Private space": no status, no room.
      const st = r.kind === 'paused' ? { text: 'Private space', tone: 'private' } : r.status;
      const where = r.kind === 'paused' ? 'Location paused' : (r.zone && r.zone.type !== 'private' ? r.zone.name : r.room);
      const picked = sel?.kind === 'person' && sel.id === r.id;
      // Only people drawn in 3D can be selected; paused people have no position to show.
      return `
        <li class="row ${r.kind === 'site' ? 'clickable' : ''} ${picked ? 'selected' : ''}" ${r.kind === 'site' ? `data-person="${esc(r.id)}"` : ''}>
          <span class="pfp ${r.person.role}">${ui.initials(r.person.name)}</span>
          <span class="grow"><b>${esc(r.person.name)}</b><small>${esc(ui.ROLE[r.person.role])} · ${esc(where)}</small></span>
          ${ui.badge(st.text, st.tone)}
        </li>`;
    }).join('') || '<li class="empty">No one here.</li>');
  }

  /** Forklifts and trucks at this site. */
  function renderEquipment(state, sel) {
    const site = RMS.site(state, siteId);
    const lifts = RMS.equipment(state).filter((e) => e.siteId === siteId);
    const trucks = RMS.trucks.atSite(state, siteId);
    document.getElementById('people-count').textContent = `${lifts.length + trucks.length}`;
    const picked = (kind, id) => (sel?.kind === kind && sel.id === id ? 'selected' : '');
    swap('people', [
      ...lifts.map((e) => `
        <li class="row clickable ${picked('forklift', e.id)}" data-forklift="${esc(e.id)}">
          <span class="pfp equip"><i data-lucide="forklift"></i></span>
          <span class="grow"><b>${esc(e.asset.name)}</b><small>${esc(e.operator?.name || 'No operator')} · ${esc(RMS.geo.roomAt(site, e.x, e.y))}</small></span>
          ${ui.badge(e.status.text, e.status.tone)}
        </li>`),
      ...trucks.map((t) => `
        <li class="row clickable ${picked('truck', t.id)}" data-truck="${esc(t.id)}">
          <span class="pfp truck"><i data-lucide="truck"></i></span>
          <span class="grow"><b>${esc(t.trip.vehicle)}</b><small>Driven by ${esc(t.driver?.name || 'no one')} · ${esc(t.trip.id)}</small></span>
          ${ui.badge(t.status.text, t.status.tone)}
        </li>`),
    ].join('') || '<li class="empty">No equipment here.</li>');
  }

  function renderFeed(state) {
    const icon = { approve: 'check', reject: 'x', checkin: 'log-in' };
    // Departures are trips leaving a site, not something happening on it, so they're left out.
    swap('feed', state.events.filter((e) => e.kind !== 'depart').map((e) => `
      <li class="row">
        <span class="feed-icon ${e.kind}"><i data-lucide="${icon[e.kind] || 'dot'}"></i></span>
        <span class="grow"><span>${esc(e.text)}</span><small>${ui.ago(e.t)}</small></span>
      </li>`).join('') || '<li class="empty">Nothing yet.</li>');
  }

  /** Replace an element's HTML only when it changed (keeps hover and scroll steady). */
  function swap(id, html) {
    const el = document.getElementById(id);
    if (el.dataset.html === html) return;
    el.innerHTML = html;
    el.dataset.html = html;
    ui.icons();
  }

  function render() {
    const state = store.get();
    // Only people at this site. Drivers on the road are 'transit' and never match.
    const recs = RMS.live(state);
    const here = recs.filter((r) => (r.kind === 'site' || r.kind === 'paused') && r.siteId === siteId);
    renderSwitch(state);
    renderKpis(state, here);
    renderAlerts(here);
    renderPeople(state, here);
    renderFeed(state);
    renderInspector(state, recs, here);
  }

  document.getElementById('site-switch').onclick = (e) => {
    const b = e.target.closest('[data-site]');
    if (b && b.dataset.site !== siteId) setSite(b.dataset.site);
  };
  document.getElementById('people').onclick = (e) => {
    const row = e.target.closest('[data-person], [data-forklift], [data-truck]');
    if (!row) return;
    if (row.dataset.person) ui.selection.set({ kind: 'person', id: row.dataset.person, siteId });
    else if (row.dataset.forklift) ui.selection.set({ kind: 'forklift', id: row.dataset.forklift, siteId });
    else ui.selection.set({ kind: 'truck', id: row.dataset.truck, siteId });
  };
  ui.selection.subscribe(() => render());

  document.getElementById('people-tabs').onclick = (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    roleFilter = b.dataset.role;
    document.querySelectorAll('#people-tabs .tab').forEach((t) => t.classList.toggle('active', t === b));
    render();
  };

  ui.icons();
  store.subscribe(render);
  setInterval(render, 1000);
})();
