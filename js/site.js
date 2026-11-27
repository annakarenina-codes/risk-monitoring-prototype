/*
 * Configure (site.html), superadmins only.
 * Set up a site's layout: rooms (rectangles with door gaps), buildings, the gate,
 * the site size and wall height, and zones. Every edit goes through RMS.config → RMS.store,
 * so other open tabs (and the 3D Monitor) update live. Everything snaps to a 1 m grid.
 */
(function () {
  const { store, ui, plan, config, geo } = RMS;
  const { esc } = ui;
  const { GATE } = plan;

  ui.header('site');
  if (!ui.requireRole('superadmin')) return;

  const svg = document.getElementById('plan');
  const baseLayer = document.getElementById('plan-base');
  const peopleLayer = document.getElementById('plan-people');
  const sideEl = document.getElementById('side');

  const params = new URLSearchParams(location.search);
  let siteId = params.get('site');
  if (!RMS.site(store.get(), siteId)) siteId = store.get().sites[0].id;
  let selZone = params.get('zone');
  let selRoom = params.get('room');
  let tab = selZone ? 'zones' : 'rooms';
  let mode = 'view'; // 'view' | 'draw-zone' | 'draw-room' | 'add-door'
  let draft = []; // corners of a zone being drawn
  let cursor = null;
  let roomDraft = null; // { a: [x, y], b: [x, y] } while dragging out a new room
  let drag = null; // gate | zone-pt | move | corner, see the pointer handlers
  let lastPeopleTab = '';

  const MIN = 2; // smallest room side, metres
  const site = () => RMS.site(store.get(), siteId);
  const siteZones = () => store.get().zones.filter((z) => z.siteId === siteId);
  /** Buildings, roads and parking areas are selected like rooms, as 'bldg:<id>' / 'road:<id>' / 'park:<id>'. */
  const FEATURE = { 'bldg:': 'buildings', 'road:': 'roads', 'park:': 'parking' };
  const featureOf = (id) => {
    const pre = id && Object.keys(FEATURE).find((x) => id.startsWith(x));
    return pre ? { list: FEATURE[pre], id: id.slice(pre.length) } : null;
  };
  const KIND_LABEL = { any: 'Any truck', loading: 'Loading', unloading: 'Unloading' };

  const rectOf = (id, s = site()) => {
    const f = featureOf(id);
    if (f) return (s[f.list] || []).find((x) => x.id === f.id);
    if (id === GATE) return geo.gate(s);
    return s.rooms.find((r) => r.id === id);
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const normRect = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });
  const TYPE_LABEL = { private: 'Private', restricted: 'Restricted', general: 'General' };
  const TYPE_TONE = { private: 'private', restricted: 'danger', general: 'grey' };
  const SIDE_LABEL = { n: 'Top', s: 'Bottom', w: 'Left', e: 'Right' };

  /*
   * Rooms and zones are separate: a room only hides people if a private zone covers it.
   * Flag rooms whose name sounds private but that no private zone fully covers.
   */
  const PRIVATE_NAME = /comfort|toilet|restroom|washroom|\bcr\b|clinic|lactation|prayer|shower|locker/i;
  function uncoveredPrivateRoom(r) {
    if (!PRIVATE_NAME.test(r.name)) return false;
    const priv = siteZones().filter((z) => z.type === 'private');
    const pts = [[r.x + r.w / 2, r.y + r.h / 2], [r.x + 0.5, r.y + 0.5], [r.x + r.w - 0.5, r.y + 0.5], [r.x + r.w - 0.5, r.y + r.h - 0.5], [r.x + 0.5, r.y + r.h - 0.5]];
    return !pts.every(([x, y]) => priv.some((z) => geo.inside(x, y, z.points)));
  }

  /** The site as it should look right now, including a drag that isn't saved yet. */
  function viewSite() {
    const s = site();
    if (!drag || drag.type === 'zone-pt') return s;
    const c = structuredClone(s);
    if (drag.type === 'gate') c.gate = { ...geo.gate(s), x: drag.pos[0], y: drag.pos[1] };
    else Object.assign(rectOf(drag.id, c), drag.rect);
    return c;
  }

  /* ---------- rendering ---------- */

  function renderHead() {
    const s = site();
    document.getElementById('site-title').textContent = `${s.id} · ${s.name}`;
    document.getElementById('site-area').textContent = s.area;
    const sel = document.getElementById('site-select');
    sel.innerHTML = store.get().sites.map((x) => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('');
    const vb = plan.viewBox(s, store.get().zones);
    if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
  }

  function renderToolbar() {
    const el = document.getElementById('toolbar');
    const room = selRoom && !featureOf(selRoom) ? rectOf(selRoom) : null;
    const cancel = '<button class="btn btn-ghost btn-sm" id="cancel">Cancel</button>';
    const html = {
      'draw-zone': `
        <button class="btn btn-sm" id="finish" ${draft.length < 3 ? 'disabled' : ''}><i data-lucide="check"></i>Finish zone</button>${cancel}
        <span class="hint">Click to add corners. Click the first corner or press Enter to finish, Esc to cancel.</span>`,
      'draw-room': `${cancel}<span class="hint">Drag on the plan to draw the room. Esc to cancel.</span>`,
      'add-door': `${cancel}<span class="hint">Click a wall of <b>${esc(room?.name)}</b> to add a 2 m door there.</span>`,
    }[mode] || {
      rooms: `
        <span class="hint">Add rooms, roads and parking with the buttons on the right. Click anything to select it, drag to move, drag the white corners to resize, press R to rotate 90°.</span>`,
      zones: `
        <button class="btn btn-sm" id="draw-zone"><i data-lucide="pen-tool"></i>Draw new zone</button>
        <span class="hint">Click a zone to edit it. Drag the white corner handles to reshape.</span>`,
      site: '<span class="hint">Site size and wall height. The gate is set up in the Layout tab.</span>',
      people: '<span class="hint">Live view. People inside private zones are not shown.</span>',
    }[tab];
    el.innerHTML = html + toolbarExtras();
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('fit-site', fitSite);
    on('finish', finishDraft);
    on('cancel', cancelMode);
    on('draw-zone', () => { mode = 'draw-zone'; draft = []; cursor = null; selZone = null; renderAll(); });
    svg.setAttribute('class', `plan editable tab-${tab}${mode !== 'view' ? ' drawing' : ''}`);
    ui.icons();
  }

  let notice = null;
  let noticeTimer = null;
  /** Show a short message in the toolbar for a few seconds. */
  function flash(msg) {
    notice = msg;
    renderToolbar();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = null; renderToolbar(); }, 4500);
  }

  /** What sticks out past the site edge, or null when everything fits. */
  function overflow() {
    const s = site();
    const { w, d } = geo.size(s);
    const b = geo.contentBounds(s, siteZones());
    return b && (b.x1 > w || b.y1 > d) ? { w, d, needW: Math.ceil(b.x1), needD: Math.ceil(b.y1) } : null;
  }

  function toolbarExtras() {
    let out = notice ? `<span class="warn-inline"><i data-lucide="triangle-alert"></i>${esc(notice)}</span>` : '';
    const o = overflow();
    if (o) {
      out += `<span class="warn-inline"><i data-lucide="triangle-alert"></i>Part of the layout is outside the ${o.w} × ${o.d} m site.</span>
        <button class="btn btn-soft btn-sm" id="fit-site"><i data-lucide="maximize"></i>Fit site to layout</button>`;
    }
    return out;
  }

  /** Grow the site so everything in the layout is inside it. */
  function fitSite() {
    const o = overflow();
    if (o) config.updateSite(siteId, { size: { w: Math.max(o.w, o.needW), d: Math.max(o.d, o.needD) } });
  }

  function renderBase() {
    const zones = store.get().zones.map((z) => (drag?.type === 'zone-pt' && z.id === drag.zoneId ? { ...z, points: drag.points } : z));
    baseLayer.innerHTML = plan.base(viewSite(), zones, {
      selectedZone: tab === 'zones' ? selZone : null,
      zoneHandles: tab === 'zones' && mode === 'view',
      selectedRoom: tab === 'rooms' ? selRoom : null,
      roomHandles: tab === 'rooms' && mode === 'view',
      draft: mode === 'draw-zone' ? draft : null,
      cursor,
      roomDraft: roomDraft ? normRect(roomDraft.a, roomDraft.b) : null,
    });
  }

  function renderPeopleLayer() {
    const recs = RMS.live(store.get()).filter((r) => r.kind === 'site' && r.siteId === siteId);
    plan.people(peopleLayer, recs);
  }

  function renderSide() {
    if (tab === 'people') return renderPeopleTab();
    if (tab === 'zones') renderZonesTab();
    if (tab === 'rooms') renderRoomsTab();
    if (tab === 'site') renderSiteTab();
    sideEl.dataset.tab = tab;
    ui.icons();
  }

  const sizeLine = (r) => `<small class="muted">Corner at ${r.x}, ${r.y} m · ${r.w} × ${r.h} m</small>`;

  function renderRoomsTab() {
    const s = site();
    const sel = selRoom ? rectOf(selRoom) : null;
    let form = '';
    const rotateButtons = `
      <button class="btn btn-soft btn-sm icon-btn" id="rotate-ccw" title="Rotate 90° counter-clockwise (Shift+R)"><i data-lucide="rotate-ccw"></i></button>
      <button class="btn btn-soft btn-sm icon-btn" id="rotate-cw" title="Rotate 90° clockwise (R)"><i data-lucide="rotate-cw"></i></button>`;
    if (sel && featureOf(selRoom)?.list === 'buildings') {
      form = `
        <div class="zone-form">
          <label class="field">Building name<input class="input" id="bldg-name" value="${esc(sel.name)}"></label>
          <p class="muted" style="margin:0">A building's footprint: the floor slab and roof its rooms sit under in 3D. Moving or removing it doesn't move or remove the rooms.</p>
          ${sizeLine(sel)}
          <div style="display:flex;gap:8px">${rotateButtons}
            <button class="btn btn-soft-red btn-sm" id="feature-delete"><i data-lucide="trash-2"></i>Remove</button>
            <span class="spacer"></span><button class="btn btn-ghost btn-sm" id="room-done">Done</button></div>
        </div>`;
    } else if (sel && selRoom === GATE) {
      form = `
        <div class="zone-form">
          <label class="field">Gate name<input class="input" id="gate-name" value="${esc(sel.name)}"></label>
          <div class="grid2">
            <label class="field">Width (m)<input class="input" type="number" min="2" max="30" step="1" id="gate-width" value="${sel.width}"></label>
            <label class="field">Direction
              <select class="input" id="gate-rot">
                <option value="0" ${sel.rotation % 180 ? '' : 'selected'}>Left–right</option>
                <option value="90" ${sel.rotation % 180 ? 'selected' : ''}>Up–down</option>
              </select>
            </label>
          </div>
          <div class="grid2">
            <label class="field">Position x (m)<input class="input" type="number" min="0" step="1" id="gate-x" value="${sel.x}"></label>
            <label class="field">Position y (m)<input class="input" type="number" min="0" step="1" id="gate-y" value="${sel.y}"></label>
          </div>
          <small class="muted">Drag the gate on the plan to move it. Drivers check in here and appear just inside it.</small>
          <div style="display:flex;gap:8px">${rotateButtons}<span class="spacer"></span><button class="btn btn-ghost btn-sm" id="room-done">Done</button></div>
        </div>`;
    } else if (sel && featureOf(selRoom)?.list === 'roads') {
      form = `
        <div class="zone-form">
          ${sizeLine(sel)}
          <small class="muted">Trucks drive only on roads and parking areas. Forklifts prefer roads when they cross the yard.</small>
          <div style="display:flex;gap:8px">${rotateButtons}
            <button class="btn btn-soft-red btn-sm" id="feature-delete"><i data-lucide="trash-2"></i>Delete road</button>
            <span class="spacer"></span><button class="btn btn-ghost btn-sm" id="room-done">Done</button></div>
        </div>`;
    } else if (sel && featureOf(selRoom)?.list === 'parking') {
      const slots = RMS.trucks.parkingSlots({ parking: [sel] }).length;
      form = `
        <div class="zone-form">
          <label class="field">Name<input class="input" id="park-name" value="${esc(sel.name)}"></label>
          <label class="field">For
            <select class="input" id="park-kind">
              ${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${(sel.kind || 'any') === k ? 'selected' : ''}>${v}${k === 'any' ? '' : ' trucks'}</option>`).join('')}
            </select>
          </label>
          ${sizeLine(sel)}
          <small class="muted">${slots} truck slot${slots === 1 ? '' : 's'}, 4 m wide. Trucks back in from the ${SIDE_LABEL[sel.entry || 's'].toLowerCase()} side; rotate to change it.</small>
          <div style="display:flex;gap:8px">${rotateButtons}
            <button class="btn btn-soft-red btn-sm" id="feature-delete"><i data-lucide="trash-2"></i>Delete</button>
            <span class="spacer"></span><button class="btn btn-ghost btn-sm" id="room-done">Done</button></div>
        </div>`;
    } else if (sel) {
      const doors = (sel.doors || []).map((d, i) => `
        <div class="door-row">
          <span class="grow">${SIDE_LABEL[d.side]} wall</span>
          <label>at <input class="input num" type="number" min="0" step="1" data-door-at="${i}" value="${d.at}"></label>
          <label>width <input class="input num" type="number" min="1" step="1" data-door-width="${i}" value="${d.width}"></label>
          <button class="btn btn-ghost btn-sm icon-btn" data-door-remove="${i}" title="Remove door"><i data-lucide="x"></i></button>
        </div>`).join('');
      form = `
        <div class="zone-form">
          <label class="field">Room name<input class="input" id="room-name" value="${esc(sel.name)}"></label>
          ${sizeLine(sel)}
          <div class="field">Doors (metres from the wall's left or top end)
            ${doors || '<small>No doors yet.</small>'}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${rotateButtons}
            <button class="btn btn-soft btn-sm" id="add-door"><i data-lucide="door-open"></i>Add door</button>
            <button class="btn btn-soft-red btn-sm" id="room-delete"><i data-lucide="trash-2"></i>Delete room</button>
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-sm" id="room-done">Done</button>
          </div>
        </div>`;
    }

    const rows = [];
    (s.buildings || []).forEach((b) => rows.push({ id: `bldg:${b.id}`, name: b.name, sub: `Building · ${b.w} × ${b.h} m` }));
    const gate = geo.gate(s);
    if (gate) rows.push({ id: GATE, name: gate.name, sub: `Gate · ${gate.width} m wide · ${gate.rotation % 180 ? 'up–down' : 'left–right'}` });
    (s.roads || []).forEach((r, i) => rows.push({ id: `road:${r.id}`, name: `Road ${i + 1}`, sub: `Road · ${r.w} × ${r.h} m` }));
    (s.parking || []).forEach((pk) => rows.push({
      id: `park:${pk.id}`, name: pk.name,
      sub: `Parking · ${KIND_LABEL[pk.kind || 'any']} · ${RMS.trucks.parkingSlots({ parking: [pk] }).length} slots`,
    }));
    s.rooms.forEach((r) => rows.push({
      id: r.id, name: r.name,
      sub: `${r.w} × ${r.h} m · ${(r.doors || []).length || 'no'} door${(r.doors || []).length === 1 ? '' : 's'}`,
      warn: uncoveredPrivateRoom(r),
    }));
    const anyWarn = rows.some((r) => r.warn);

    const heading = { [GATE]: 'Gate' }[selRoom]
      || (featureOf(selRoom) ? { buildings: 'Building', roads: 'Road', parking: 'Parking area' }[featureOf(selRoom).list] : 'Edit room');
    sideEl.innerHTML = `
      ${paletteHtml()}
      <div class="card-head" style="padding-top:4px"><h2>${sel ? heading : 'Layout'}</h2><span class="spacer"></span><span class="muted">${s.rooms.length}</span></div>
      ${form}
      <ul class="list">
        ${rows.map((r) => `
          <li class="row clickable ${r.id === selRoom ? 'selected' : ''}" data-room="${esc(r.id)}">
            <span class="grow"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small>
              ${r.warn ? '<small class="warn"><i data-lucide="triangle-alert"></i>Sounds private, but no private zone covers it</small>' : ''}</span>
          </li>`).join('')}
      </ul>
      ${anyWarn ? `<p class="note warn-note"><i data-lucide="triangle-alert"></i><span>Rooms and zones are separate. A room only hides people when a <b>private zone</b> covers it. Draw one in the Zones tab.</span></p>` : ''}`;

    sideEl.querySelectorAll('[data-room]').forEach((row) => { row.onclick = () => selectRoom(row.dataset.room); });
    sideEl.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => addTemplate(b.dataset.add); });
    if (!sel) return;
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('room-done', () => selectRoom(null));
    on('rotate-cw', () => rotateSelected(1));
    on('rotate-ccw', () => rotateSelected(-1));
    const feat = featureOf(selRoom);
    if (feat) {
      on('feature-delete', () => {
        const what = { buildings: `building "${sel.name}"? Its rooms stay; in 3D each gets its own floor and roof`, roads: 'road', parking: 'parking area' }[feat.list];
        if (!confirm(`Remove this ${what}?`)) return;
        selRoom = null;
        config.deleteFeature(siteId, feat.list, feat.id);
      });
      const bn = document.getElementById('bldg-name');
      if (bn) bn.onchange = () => config.updateFeature(siteId, 'buildings', feat.id, { name: bn.value.trim() || 'Building' });
      const pn = document.getElementById('park-name');
      if (pn) pn.onchange = () => config.updateFeature(siteId, 'parking', feat.id, { name: pn.value.trim() || 'Parking' });
      const pk = document.getElementById('park-kind');
      if (pk) pk.onchange = () => config.updateFeature(siteId, 'parking', feat.id, { kind: pk.value });
      return;
    }
    if (selRoom === GATE) {
      const { w, d } = geo.size(s);
      const val = (id, lo, hi, fallback) => clamp(Math.round(+document.getElementById(id).value || fallback), lo, hi);
      document.getElementById('gate-name').onchange = (e) => config.updateGate(siteId, { name: e.target.value.trim() || 'Gate' });
      document.getElementById('gate-width').onchange = () => config.updateGate(siteId, { width: val('gate-width', 2, 30, sel.width) });
      document.getElementById('gate-rot').onchange = (e) => config.updateGate(siteId, { rotation: +e.target.value });
      const setPos = () => config.updateGate(siteId, { x: val('gate-x', 0, w, sel.x), y: val('gate-y', 0, d, sel.y) });
      document.getElementById('gate-x').onchange = setPos;
      document.getElementById('gate-y').onchange = setPos;
      return;
    }
    const roomId = selRoom;
    const name = document.getElementById('room-name');
    name.onchange = () => config.updateRoom(siteId, roomId, { name: name.value.trim() || 'Unnamed room' });
    on('add-door', () => { mode = 'add-door'; renderToolbar(); renderBase(); });
    on('room-delete', () => {
      if (!confirm(`Delete the room “${sel.name}”?`)) return;
      selRoom = null;
      config.deleteRoom(siteId, roomId);
    });
    sideEl.querySelectorAll('[data-door-at]').forEach((inp) => {
      inp.onchange = () => config.updateDoor(siteId, roomId, +inp.dataset.doorAt, { at: Math.max(0, Math.round(+inp.value || 0)) });
    });
    sideEl.querySelectorAll('[data-door-width]').forEach((inp) => {
      inp.onchange = () => config.updateDoor(siteId, roomId, +inp.dataset.doorWidth, { width: Math.max(1, Math.round(+inp.value || 1)) });
    });
    sideEl.querySelectorAll('[data-door-remove]').forEach((b) => {
      b.onclick = () => config.removeDoor(siteId, roomId, +b.dataset.doorRemove);
    });
  }

  function renderZonesTab() {
    const zones = siteZones();
    const z = zones.find((x) => x.id === selZone);
    const form = z ? `
      <div class="zone-form">
        <label class="field">Zone name<input class="input" id="zone-name" value="${esc(z.name)}"></label>
        <label class="field">Type
          <select class="input" id="zone-type">
            <option value="private" ${z.type === 'private' ? 'selected' : ''}>Private: stop sharing location inside</option>
            <option value="restricted" ${z.type === 'restricted' ? 'selected' : ''}>Restricted: alert when a visitor enters</option>
            <option value="general" ${z.type === 'general' ? 'selected' : ''}>General: label only</option>
          </select>
        </label>
        <div style="display:flex;gap:8px">
          <button class="btn btn-soft-red btn-sm" id="zone-delete"><i data-lucide="trash-2"></i>Delete zone</button>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" id="zone-done">Done</button>
        </div>
      </div>` : '';

    sideEl.innerHTML = `
      <div class="card-head" style="padding-top:4px"><h2>${z ? 'Edit zone' : 'Zones'}</h2><span class="spacer"></span><span class="muted">${zones.length}</span></div>
      ${form}
      <ul class="list">
        ${zones.map((x) => `
          <li class="row clickable ${x.id === selZone ? 'selected' : ''}" data-zone="${x.id}">
            <span class="grow"><b>${esc(x.name)}</b><small>${x.points.length} corners</small></span>
            ${ui.badge(TYPE_LABEL[x.type], TYPE_TONE[x.type])}
          </li>`).join('') || '<li class="empty">No zones yet. Use “Draw new zone”.</li>'}
      </ul>
      <p class="note"><i data-lucide="lock"></i><span>Inside a <b>private</b> zone the phone stops sending coordinates, so the person disappears from this plan. Entering or leaving is not logged.</span></p>`;

    sideEl.querySelectorAll('[data-zone]').forEach((row) => { row.onclick = () => selectZone(row.dataset.zone); });
    if (z) {
      const name = document.getElementById('zone-name');
      name.onchange = () => config.updateZone(z.id, { name: name.value.trim() || 'Unnamed zone' });
      document.getElementById('zone-type').onchange = (e) => config.updateZone(z.id, { type: e.target.value });
      document.getElementById('zone-delete').onclick = () => {
        if (!confirm(`Delete the zone “${z.name}”?`)) return;
        selZone = null;
        config.deleteZone(z.id);
      };
      document.getElementById('zone-done').onclick = () => selectZone(null);
    }
  }

  function renderSiteTab() {
    const s = site();
    const { w, d } = geo.size(s);
    const b = geo.contentBounds(s, siteZones());
    const minW = Math.max(20, Math.ceil(b?.x1 || 0));
    const minD = Math.max(20, Math.ceil(b?.y1 || 0));
    sideEl.innerHTML = `
      <div class="card-head" style="padding-top:4px"><h2>Site</h2></div>
      <div class="zone-form">
        <div class="grid2">
          <label class="field">Width (m)<input class="input" type="number" min="20" max="400" step="1" id="site-w" value="${w}"></label>
          <label class="field">Depth (m)<input class="input" type="number" min="20" max="400" step="1" id="site-d" value="${d}"></label>
        </div>
        <small class="muted">The layout needs at least ${minW} × ${minD} m, so the site can't be smaller than that.</small>
        <label class="field">Wall height (m)<input class="input" type="number" min="2" max="12" step="0.5" id="site-wh" value="${s.wallHeight || 4}"></label>
      </div>
      <p class="note"><i data-lucide="box"></i><span>The 3D view is built from this setup: rooms become walls at this height, with gaps for doors.</span></p>`;

    const num = (id, lo, hi, fallback) => clamp(Math.round(+document.getElementById(id).value || fallback), lo, hi);
    const setSize = () => config.updateSite(siteId, { size: { w: num('site-w', minW, 400, w), d: num('site-d', minD, 400, d) } });
    document.getElementById('site-w').onchange = setSize;
    document.getElementById('site-d').onchange = setSize;
    document.getElementById('site-wh').onchange = (e) => config.updateSite(siteId, { wallHeight: clamp(Math.round((+e.target.value || 4) * 2) / 2, 2, 12) });
  }

  function renderPeopleTab() {
    const state = store.get();
    const recs = RMS.live(state).filter((r) => (r.kind === 'site' || r.kind === 'paused') && r.siteId === siteId);
    const html = `
      <ul class="list">
        ${recs.map((r) => {
          const st = ui.liveStatus(r, state);
          return `<li class="row">
            <span class="pfp ${r.person.role}">${ui.initials(r.person.name)}</span>
            <span class="grow"><b>${esc(r.person.name)}</b><small>${esc(ui.ROLE[r.person.role])} · ${esc(r.kind === 'paused' ? 'Location paused' : (r.zone && r.zone.type !== 'private' ? r.zone.name : r.room))}</small></span>
            ${ui.badge(st.tag, st.tone)}
          </li>`;
        }).join('') || '<li class="empty">No one on site.</li>'}
      </ul>
      <p class="note"><i data-lucide="eye-off"></i><span>People with “Private space” are on site but their position isn't shared. The dashboard doesn't know which room they are in.</span></p>`;
    if (html === lastPeopleTab && sideEl.dataset.tab === 'people') return;
    sideEl.innerHTML = html;
    sideEl.dataset.tab = 'people';
    lastPeopleTab = html;
    ui.icons();
  }

  function renderAll() {
    renderHead();
    renderToolbar();
    renderBase();
    renderPeopleLayer();
    lastPeopleTab = '';
    renderSide();
  }

  /* ---------- selection and modes ---------- */

  function selectRoom(id) {
    selRoom = id;
    mode = 'view';
    renderToolbar(); renderBase(); renderSide();
  }

  function selectZone(id) {
    selZone = id;
    renderBase(); renderSide();
  }

  function cancelMode() {
    mode = 'view'; draft = []; cursor = null; roomDraft = null;
    renderToolbar(); renderBase();
  }

  function finishDraft() {
    if (draft.length < 3) return;
    const points = draft;
    mode = 'view'; draft = []; cursor = null;
    selZone = config.addZone(siteId, points);
    renderToolbar(); renderBase(); renderSide();
    focusSoon('zone-name');
  }

  function focusSoon(id) {
    setTimeout(() => { const n = document.getElementById(id); if (n) { n.focus(); n.select(); } }, 0);
  }

  /* ---------- "Add to site": ready-made rooms, zones, roads and parking ---------- */

  const TEMPLATES = [
    { key: 'building', icon: 'building-2', label: 'Building', w: 40, h: 30, feature: 'buildings', extra: { name: 'New building' } },
    { key: 'room', icon: 'square', label: 'Room', name: 'Room', w: 10, h: 8, doors: [{ side: 's', at: 4, width: 2 }] },
    { key: 'storage', icon: 'warehouse', label: 'Storage room', name: 'Storage room', w: 24, h: 16, doors: [{ side: 's', at: 10, width: 4 }] },
    { key: 'bay', icon: 'package', label: 'Loading bay', name: 'Loading bay', w: 20, h: 10, doors: [{ side: 's', at: 3, width: 6 }, { side: 's', at: 11, width: 6 }, { side: 'n', at: 8, width: 4 }] },
    { key: 'office', icon: 'briefcase', label: 'Office', name: 'Office', w: 12, h: 8, doors: [{ side: 'w', at: 3, width: 2 }] },
    { key: 'cr', icon: 'toilet', label: 'Comfort room', name: 'Comfort room', w: 6, h: 6, doors: [{ side: 's', at: 2, width: 2 }], privateZone: true },
    { key: 'restricted', icon: 'shield-alert', label: 'Restricted area', name: 'Restricted area', w: 10, h: 8, zone: 'restricted' },
    { key: 'road', icon: 'route', label: 'Road', w: 24, h: 6, feature: 'roads' },
    { key: 'parking', icon: 'square-parking', label: 'Parking area', w: 20, h: 12, feature: 'parking', extra: { name: 'Parking', kind: 'any', entry: 's' } },
  ];

  function paletteHtml() {
    return `
      <div class="palette">
        <div class="palette-head">Add to site</div>
        <div class="palette-grid">
          ${TEMPLATES.map((t) => `<button class="pal" data-add="${t.key}"><i data-lucide="${t.icon}"></i><span>${esc(t.label)}</span></button>`).join('')}
        </div>
      </div>`;
  }

  const cornersOf = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const bboxOf = (pts) => {
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  /** The free spot nearest the middle of the site where a w × h rectangle overlaps none of `avoid`. */
  function freeSpot(w, h, avoid) {
    const { w: W, d: D } = geo.size(site());
    const clear = (x, y) => !avoid.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
    const spots = [];
    for (let y = 0; y <= D - h; y += 2) for (let x = 0; x <= W - w; x += 2) spots.push([x, y]);
    spots.sort((a, b) => Math.hypot(a[0] + w / 2 - W / 2, a[1] + h / 2 - D / 2) - Math.hypot(b[0] + w / 2 - W / 2, b[1] + h / 2 - D / 2));
    return spots.find(([x, y]) => clear(x, y)) || [0, 0];
  }

  /** Place a ready-made element on a free spot and select it, ready to drag into place. */
  function addTemplate(key) {
    const t = TEMPLATES.find((x) => x.key === key);
    const s = site();
    const taken = [...s.rooms, ...(s.roads || []), ...(s.parking || [])];
    let avoid = taken;
    const others = [...(s.roads || []), ...(s.parking || []), ...(s.buildings || [])];
    if (t.feature === 'buildings') avoid = others; // a new building may go around existing rooms
    else if (t.feature) avoid = [...taken, ...(s.buildings || [])]; // roads and parking go outside buildings
    if (t.zone) avoid = siteZones().map((z) => bboxOf(z.points));
    const [x, y] = freeSpot(t.w, t.h, avoid);
    const rect = { x, y, w: t.w, h: t.h };
    mode = 'view';
    if (t.zone) {
      const id = config.addZone(siteId, cornersOf(rect), t.zone);
      config.updateZone(id, { name: t.name });
      selZone = id;
      flash(`Added a ${t.label.toLowerCase()}. Drag its corners to fit it over the area.`);
      setTab('zones');
      return;
    }
    if (t.feature) {
      const id = config.addFeature(siteId, t.feature, { ...rect, ...(t.extra || {}) });
      selRoom = `${{ buildings: 'bldg', roads: 'road', parking: 'park' }[t.feature]}:${id}`;
    } else {
      selRoom = config.addRoom(siteId, { name: t.name, ...rect, doors: t.doors.map((d) => ({ ...d })) });
      if (t.privateZone) {
        // A comfort room comes with its private zone, so people inside are hidden straight away.
        const zid = config.addZone(siteId, cornersOf(rect), 'private');
        config.updateZone(zid, { name: t.name });
      }
    }
    renderAll();
    flash(`Added ${t.label.toLowerCase()}. Drag it into place, drag the corners to resize, press R to rotate.`);
  }

  /** Turn the selected room, building, road or parking area 90°: dir 1 = clockwise, -1 = counter-clockwise. */
  function rotateSelected(dir) {
    if (!selRoom || !rectOf(selRoom)) return;
    if (selRoom === GATE) {
      const g = geo.gate(site());
      config.updateGate(siteId, { rotation: (g.rotation + (dir > 0 ? 90 : 270)) % 360 });
    } else if (featureOf(selRoom)) {
      const f = featureOf(selRoom);
      const cur = rectOf(selRoom);
      const r = geo.rotateRoom(cur, dir, site());
      if (!r) return flash("Turned, it wouldn't fit in the site. Make the site bigger in the Site tab first.");
      const patch = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (f.list === 'parking') {
        const order = ['n', 'e', 's', 'w'];
        patch.entry = order[(order.indexOf(cur.entry || 's') + (dir > 0 ? 1 : 3)) % 4];
      }
      config.updateFeature(siteId, f.list, f.id, patch);
    } else if (!config.rotateRoom(siteId, selRoom, dir)) {
      flash("Turned, this room wouldn't fit in the site. Make the site bigger in the Site tab first.");
    }
  }

  /** Add a 2 m door on the selected room's wall nearest to the click (within 2 m). */
  function addDoorAt([px, py]) {
    const r = rectOf(selRoom);
    if (!r || selRoom === GATE || featureOf(selRoom)) return;
    const inX = px >= r.x && px <= r.x + r.w;
    const inY = py >= r.y && py <= r.y + r.h;
    const best = [
      { side: 'n', dist: Math.abs(py - r.y), along: px - r.x, len: r.w, ok: inX },
      { side: 's', dist: Math.abs(py - (r.y + r.h)), along: px - r.x, len: r.w, ok: inX },
      { side: 'w', dist: Math.abs(px - r.x), along: py - r.y, len: r.h, ok: inY },
      { side: 'e', dist: Math.abs(px - (r.x + r.w)), along: py - r.y, len: r.h, ok: inY },
    ].filter((s) => s.ok).sort((a, b) => a.dist - b.dist)[0];
    if (!best || best.dist > 2) return; // not near a wall: stay in door mode
    const width = Math.min(2, best.len);
    const at = clamp(Math.round(best.along - width / 2), 0, best.len - width);
    mode = 'view';
    renderToolbar();
    config.addDoor(siteId, selRoom, { side: best.side, at, width });
  }

  /* ---------- pointer editing ---------- */

  svg.addEventListener('pointerdown', (e) => {
    if (tab === 'people') return;
    const p = plan.toPlan(svg, e, site());
    if (tab === 'rooms' && mode === 'view' && e.target.closest('.gate')) {
      if (selRoom !== GATE) selectRoom(GATE);
      const g = geo.gate(site());
      drag = { type: 'gate', pos: [g.x, g.y], moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (tab === 'zones') zonesDown(e, p);
    if (tab === 'rooms') roomsDown(e, p);
  });

  function zonesDown(e, p) {
    if (mode === 'draw-zone') {
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 2) return finishDraft();
      draft.push(p);
      renderToolbar(); renderBase();
      return;
    }
    const handle = e.target.closest('.handle');
    if (handle && handle.dataset.zone) {
      const z = siteZones().find((x) => x.id === handle.dataset.zone);
      drag = { type: 'zone-pt', zoneId: z.id, index: +handle.dataset.index, points: z.points.map((q) => [...q]), moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const zone = e.target.closest('.zone');
    selectZone(zone ? zone.dataset.zone : null);
  }

  function roomsDown(e, p) {
    if (mode === 'draw-room') {
      roomDraft = { a: p, b: p };
      svg.setPointerCapture(e.pointerId);
      renderBase();
      return;
    }
    if (mode === 'add-door') return addDoorAt(p);
    const corner = e.target.closest('.rhandle');
    if (corner && selRoom) {
      const o = { ...rectOf(selRoom) };
      drag = { type: 'corner', id: selRoom, corner: +corner.dataset.corner, orig: o, rect: pick(o), moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const hit = e.target.closest('[data-room]');
    if (!hit) return selectRoom(null);
    const id = hit.dataset.room;
    if (id !== selRoom) selectRoom(id);
    const o = { ...rectOf(id) };
    drag = { type: 'move', id, start: p, orig: o, rect: pick(o), moved: false };
    svg.setPointerCapture(e.pointerId);
  }

  const pick = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });

  svg.addEventListener('pointermove', (e) => {
    if (roomDraft) { roomDraft.b = plan.toPlan(svg, e, site()); renderBase(); return; }
    if (mode === 'draw-zone' && draft.length) { cursor = plan.toPlan(svg, e, site()); renderBase(); return; }
    if (!drag) return;
    const p = plan.toPlan(svg, e, site());
    const { w, d } = geo.size(site());
    if (drag.type === 'gate') drag.pos = p;
    else if (drag.type === 'zone-pt') drag.points[drag.index] = p;
    else if (drag.type === 'move') {
      const o = drag.orig;
      drag.rect = { x: clamp(o.x + p[0] - drag.start[0], 0, w - o.w), y: clamp(o.y + p[1] - drag.start[1], 0, d - o.h), w: o.w, h: o.h };
    } else if (drag.type === 'corner') {
      const opposite = plan.corners(drag.orig)[(drag.corner + 2) % 4];
      const r = normRect(opposite, p);
      if (r.w >= MIN && r.h >= MIN) drag.rect = r;
    }
    drag.moved = true;
    renderBase();
  });

  svg.addEventListener('pointerup', () => {
    if (roomDraft) {
      const r = normRect(roomDraft.a, roomDraft.b);
      roomDraft = null;
      mode = 'view';
      if (r.w >= MIN && r.h >= MIN) {
        selRoom = config.addRoom(siteId, { name: 'New room', ...r });
        focusSoon('room-name');
      }
      renderToolbar(); renderBase(); renderSide();
      return;
    }
    if (!drag) return;
    const dr = drag;
    drag = null;
    if (!dr.moved) return renderBase();
    if (dr.type === 'gate') config.updateGate(siteId, { x: dr.pos[0], y: dr.pos[1] });
    else if (dr.type === 'zone-pt') config.updateZone(dr.zoneId, { points: dr.points });
    else if (featureOf(dr.id)) config.updateFeature(siteId, featureOf(dr.id).list, featureOf(dr.id).id, dr.rect);
    else config.updateRoom(siteId, dr.id, dr.rect);
  });

  svg.addEventListener('pointerleave', () => { if (mode === 'draw-zone' && cursor) { cursor = null; renderBase(); } });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (mode === 'draw-zone' && e.key === 'Enter') finishDraft();
    else if (tab === 'rooms' && mode === 'view' && selRoom && (e.key === 'r' || e.key === 'R')) rotateSelected(e.shiftKey ? -1 : 1);
    else if (tab === 'rooms' && mode === 'view' && selRoom && (e.key === 'Delete' || e.key === 'Backspace')) {
      // Same as pressing the selected item's remove button (it asks to confirm).
      document.querySelector('#room-delete, #feature-delete, #building-delete')?.click();
    }
    else if (e.key === 'Escape') {
      if (mode !== 'view') cancelMode();
      else if (tab === 'rooms') selectRoom(null);
      else if (tab === 'zones') selectZone(null);
    }
  });

  /* ---------- tabs and site switching ---------- */

  function setTab(t) {
    tab = t;
    mode = 'view'; draft = []; cursor = null; roomDraft = null;
    document.querySelectorAll('#side-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    renderAll();
  }
  document.getElementById('side-tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); };
  document.querySelectorAll('#side-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  document.getElementById('site-select').onchange = (e) => {
    siteId = e.target.value;
    selRoom = null; selZone = null;
    mode = 'view'; draft = []; roomDraft = null;
    history.replaceState(null, '', `?site=${encodeURIComponent(siteId)}`);
    peopleLayer.innerHTML = '';
    renderAll();
  };

  store.subscribe(() => {
    if (!site()) { siteId = store.get().sites[0].id; selRoom = null; }
    if (selZone && !store.get().zones.find((z) => z.id === selZone)) selZone = null;
    if (selRoom && !rectOf(selRoom)) selRoom = null;
    // Don't redraw the side panel while someone is typing in it.
    const typing = document.activeElement && document.activeElement.closest('#side') && document.activeElement.matches('input, select, textarea');
    renderHead(); renderToolbar(); renderBase(); renderPeopleLayer();
    if (!typing) { lastPeopleTab = ''; renderSide(); }
  });
  renderToolbar();

  setInterval(() => {
    renderPeopleLayer();
    if (tab === 'people') renderSide();
  }, 1000);
})();
