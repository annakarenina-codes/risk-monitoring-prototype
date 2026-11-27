/*
 * Live map dashboard (index.html).
 * The map shows sites (with head counts, not individual dots, because phone GPS
 * can't place people inside a building precisely) and drivers on the road.
 */
(function () {
  const { store, ui } = RMS;
  const { esc } = ui;

  let map = null;
  let tilted = false;
  const siteMarkers = {};
  const truckMarkers = {};
  let roleFilter = 'all';
  let selectedTrip = null;

  ui.header('dashboard');

  /* ---------- map ---------- */

  function initMap() {
    const el = document.getElementById('map');
    if (!window.maplibregl) {
      el.innerHTML = '<div class="map-fallback">The map library could not load. Check the internet connection.</div>';
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [120.972, 14.655],
      zoom: 11.6,
      attributionControl: { compact: true },
    });
    RMS.map = map; // handy for poking at it from the browser console
    map.on('load', () => {
      const s = store.get().sites;
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: s.map((x) => [x.lng, x.lat]) } },
      });
      map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#2a3ad8', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [2, 2] },
      });
      fit(false);
    });

    document.getElementById('zoom-in').onclick = () => map.zoomIn();
    document.getElementById('zoom-out').onclick = () => map.zoomOut();
    document.getElementById('fit').onclick = () => fit(true);
    document.getElementById('tilt').onclick = (e) => {
      tilted = !tilted;
      e.currentTarget.classList.toggle('on', tilted);
      map.easeTo({ pitch: tilted ? 55 : 0, bearing: tilted ? -20 : 0, duration: 800 });
    };
  }

  function fit(animate) {
    const s = store.get().sites;
    const b = new maplibregl.LngLatBounds();
    s.forEach((x) => b.extend([x.lng, x.lat]));
    // Leave room for the floating panels.
    map.fitBounds(b, { padding: { top: 190, bottom: 230, left: 120, right: 460 }, maxZoom: 13.5, animate });
  }

  function updateMap(state, liveRecs) {
    if (!map) return;

    state.sites.forEach((site) => {
      const here = liveRecs.filter((r) => (r.kind === 'site' || r.kind === 'paused') && r.siteId === site.id);
      const paused = here.filter((r) => r.kind === 'paused').length;
      const alerts = here.filter((r) => r.alert).length;
      const visitors = here.filter((r) => r.person.role === 'visitor').length;
      const html = `
        <div class="label">
          <b><span class="tag">${esc(site.id)}</span>${esc(site.name)}</b>
          <small>${esc(site.area)}</small>
          <span class="chips">
            ${ui.badge(`${here.length} on site`, 'blue')}
            ${visitors ? ui.badge(`${visitors} visitor${visitors > 1 ? 's' : ''}`, 'amber') : ''}
            ${paused ? ui.badge(`${paused} paused`, 'violet') : ''}
            ${alerts ? ui.badge(`${alerts} alert`, 'red') : ''}
          </span>
        </div>
        <span class="stem"></span><span class="base"></span>`;
      if (!siteMarkers[site.id]) {
        const el = document.createElement('a');
        el.className = 'site-pin';
        el.href = `site.html?site=${encodeURIComponent(site.id)}`;
        el.title = `Open ${site.name}`;
        siteMarkers[site.id] = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([site.lng, site.lat]).addTo(map);
      }
      const el = siteMarkers[site.id].getElement();
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    });

    const moving = liveRecs.filter((r) => r.kind === 'transit');
    moving.forEach((r) => {
      if (!truckMarkers[r.id]) {
        const el = document.createElement('div');
        el.className = 'truck-pin';
        el.innerHTML = `<span class="ico"><i data-lucide="truck"></i></span>${esc(r.person.name)}`;
        truckMarkers[r.id] = new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map);
        ui.icons();
      }
      truckMarkers[r.id].setLngLat([r.lng, r.lat]);
    });
    Object.keys(truckMarkers).forEach((id) => {
      if (!moving.find((r) => r.id === id)) { truckMarkers[id].remove(); delete truckMarkers[id]; }
    });
  }

  /* ---------- panels ---------- */

  function renderKpis(state, liveRecs) {
    const onSite = liveRecs.filter((r) => r.kind === 'site' || r.kind === 'paused');
    const awaiting = state.trips.flatMap((t) => t.phases).filter((p) => p.status === 'arrived').length;
    const alerts = liveRecs.filter((r) => r.alert).length;
    const items = [
      { icon: 'users', label: 'On site', value: onSite.length },
      { icon: 'id-card', label: 'Visitors', value: onSite.filter((r) => r.person.role === 'visitor').length, tone: 'amber' },
      { icon: 'truck', label: 'In transit', value: liveRecs.filter((r) => r.kind === 'transit').length },
      { icon: 'stamp', label: 'Awaiting guard', value: awaiting, tone: awaiting ? 'amber' : '', href: 'trips.html' },
      { icon: 'eye-off', label: 'Location paused', value: liveRecs.filter((r) => r.kind === 'paused').length, tone: 'violet' },
      { icon: 'siren', label: 'Alerts', value: alerts, tone: alerts ? 'red' : '' },
    ];
    const html = items.map((k) => `
      <${k.href ? `a href="${k.href}"` : 'div'} class="card kpi ${k.tone || ''}">
        <span class="kpi-icon"><i data-lucide="${k.icon}"></i></span>
        <span><small>${k.label}</small><b>${k.value}</b></span>
      </${k.href ? 'a' : 'div'}>`).join('');
    swap('kpis', html);
  }

  function renderPeople(state, liveRecs) {
    const recs = liveRecs.filter((r) => roleFilter === 'all' || r.person.role === roleFilter);
    document.getElementById('people-count').textContent = `${recs.length}`;
    const html = recs.map((r) => {
      const st = ui.liveStatus(r, state);
      const href = r.siteId && r.kind !== 'transit' ? `site.html?site=${encodeURIComponent(r.siteId)}` : null;
      return `
        <li><${href ? `a href="${href}"` : 'div'} class="row">
          <span class="pfp ${r.person.role}">${ui.initials(r.person.name)}</span>
          <span class="grow"><b>${esc(r.person.name)}</b><small>${esc(ui.ROLE[r.person.role])} · ${esc(st.text)}</small></span>
          ${ui.badge(st.tag, st.tone)}
        </${href ? 'a' : 'div'}></li>`;
    }).join('') || '<li class="empty">No one here.</li>';
    swap('people', html);
  }

  function renderFeed(state) {
    const icon = { approve: 'check', reject: 'x', checkin: 'log-in', depart: 'truck' };
    const html = state.events.map((e) => `
      <li class="row">
        <span class="feed-icon ${e.kind}"><i data-lucide="${icon[e.kind] || 'dot'}"></i></span>
        <span class="grow"><span>${esc(e.text)}</span><small>${ui.ago(e.t)}</small></span>
      </li>`).join('') || '<li class="empty">Nothing yet.</li>';
    swap('feed', html);
  }

  function renderTrip(state, liveRecs) {
    const sel = document.getElementById('trip-select');
    if (!selectedTrip || !state.trips.find((t) => t.id === selectedTrip)) selectedTrip = state.trips[0]?.id;
    const opts = state.trips.map((t) => {
      const d = state.people.find((p) => p.id === t.driverId);
      return `<option value="${t.id}" ${t.id === selectedTrip ? 'selected' : ''}>${t.id} · ${esc(d?.name)}</option>`;
    }).join('');
    if (sel.dataset.html !== opts) { sel.innerHTML = opts; sel.dataset.html = opts; }

    const trip = state.trips.find((t) => t.id === selectedTrip);
    if (!trip) return swap('trip-stepper', '<div class="empty">No trips yet.</div>');
    const st = RMS.trips.tripStatus(trip);
    swap('trip-badge', ui.badge(st.label, st.tone));
    const driverLive = liveRecs.find((r) => r.id === trip.driverId);
    swap('trip-stepper', ui.stepper(trip, state, driverLive));
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
    const liveRecs = RMS.live(state);
    renderKpis(state, liveRecs);
    renderPeople(state, liveRecs);
    renderTrip(state, liveRecs);
    renderFeed(state);
    updateMap(state, liveRecs);
  }

  document.getElementById('people-tabs').onclick = (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    roleFilter = b.dataset.role;
    document.querySelectorAll('#people-tabs .tab').forEach((t) => t.classList.toggle('active', t === b));
    render();
  };
  document.getElementById('trip-select').onchange = (e) => { selectedTrip = e.target.value; render(); };

  initMap();
  ui.icons();
  store.subscribe(render);
  setInterval(render, 1000);
})();
