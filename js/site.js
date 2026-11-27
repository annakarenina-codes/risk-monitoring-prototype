/*
 * Site floor plan + zone editor (site.html).
 * Draw a zone by clicking its corners; click a zone to rename it, change its type,
 * reshape it (drag the white handles) or delete it.
 */
(function () {
  const { store, ui, plan } = RMS;
  const { esc } = ui;

  const svg = document.getElementById('plan');
  const baseLayer = document.getElementById('plan-base');
  const peopleLayer = document.getElementById('plan-people');

  const params = new URLSearchParams(location.search);
  let siteId = params.get('site') || store.get().sites[0].id;
  let tab = 'zones';
  let mode = 'view'; // 'view' | 'draw'
  let draft = [];
  let cursor = null;
  let selected = null;
  let drag = null; // { zoneId, index, points }

  ui.header('site');

  const site = () => RMS.site(store.get(), siteId) || store.get().sites[0];
  const siteZones = () => store.get().zones.filter((z) => z.siteId === siteId);
  const TYPE_LABEL = { private: 'Private', restricted: 'Restricted', general: 'General' };
  const TYPE_TONE = { private: 'violet', restricted: 'red', general: 'blue' };

  /* ---------- rendering ---------- */

  function renderHead() {
    const s = site();
    document.getElementById('site-title').textContent = `${s.id} · ${s.name}`;
    document.getElementById('site-area').textContent = s.area;
    const sel = document.getElementById('site-select');
    sel.innerHTML = store.get().sites.map((x) => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('');
  }

  function renderToolbar() {
    const el = document.getElementById('toolbar');
    if (mode === 'draw') {
      el.innerHTML = `
        <button class="btn btn-green btn-sm" id="finish" ${draft.length < 3 ? 'disabled' : ''}><i data-lucide="check"></i>Finish zone</button>
        <button class="btn btn-ghost btn-sm" id="cancel">Cancel</button>
        <span class="hint">Click to add corners. Click the first corner or press Enter to finish, Esc to cancel.</span>`;
      document.getElementById('finish').onclick = finishDraft;
      document.getElementById('cancel').onclick = cancelDraft;
    } else {
      el.innerHTML = `
        <button class="btn btn-sm" id="draw"><i data-lucide="pen-tool"></i>Draw new zone</button>
        <span class="hint">Click a zone to edit it. Drag the white corner handles to reshape.</span>`;
      document.getElementById('draw').onclick = startDraft;
    }
    svg.classList.toggle('drawing', mode === 'draw');
    ui.icons();
  }

  function renderBase() {
    const zones = store.get().zones.map((z) => (drag && z.id === drag.zoneId ? { ...z, points: drag.points } : z));
    baseLayer.innerHTML = plan.base(site(), zones, {
      selectedZone: selected,
      handles: mode === 'view',
      draft: mode === 'draw' ? draft : null,
      cursor,
    });
  }

  function renderPeopleLayer() {
    const recs = RMS.live(store.get()).filter((r) => r.kind === 'site' && r.siteId === siteId);
    plan.people(peopleLayer, recs);
  }

  function renderSide() {
    const el = document.getElementById('side');
    if (tab === 'people') return renderPeopleTab(el);

    const zones = siteZones();
    const z = zones.find((x) => x.id === selected);
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

    el.innerHTML = `
      <div class="card-head" style="padding-top:4px"><h2>${z ? 'Edit zone' : 'Zones'}</h2><span class="spacer"></span><span class="muted">${zones.length}</span></div>
      ${form}
      <ul class="list">
        ${zones.map((x) => `
          <li class="row clickable" data-zone="${x.id}" style="${x.id === selected ? 'background:var(--blue-50)' : ''}">
            <span class="grow"><b>${esc(x.name)}</b><small>${x.points.length} corners</small></span>
            ${ui.badge(TYPE_LABEL[x.type], TYPE_TONE[x.type])}
          </li>`).join('') || '<li class="empty">No zones yet. Use “Draw new zone”.</li>'}
      </ul>
      <p class="note"><i data-lucide="lock"></i><span>Inside a <b>private</b> zone the phone stops sending coordinates, so the person disappears from this plan. Entering or leaving is not logged.</span></p>`;

    el.querySelectorAll('[data-zone]').forEach((row) => { row.onclick = () => select(row.dataset.zone); });
    if (z) {
      const name = document.getElementById('zone-name');
      name.onchange = () => updateZone(z.id, { name: name.value.trim() || 'Unnamed zone' });
      document.getElementById('zone-type').onchange = (e) => updateZone(z.id, { type: e.target.value });
      document.getElementById('zone-delete').onclick = () => deleteZone(z.id);
      document.getElementById('zone-done').onclick = () => select(null);
    }
    ui.icons();
  }

  let lastPeopleTab = '';
  function renderPeopleTab(el) {
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
    if (html === lastPeopleTab && el.dataset.tab === 'people') return;
    el.innerHTML = html;
    el.dataset.tab = 'people';
    lastPeopleTab = html;
    ui.icons();
  }

  function renderAll() {
    renderHead();
    renderToolbar();
    renderBase();
    renderPeopleLayer();
    document.getElementById('side').dataset.tab = '';
    renderSide();
  }

  /* ---------- zone editing ---------- */

  function select(id) {
    selected = id;
    if (tab !== 'zones') setTab('zones');
    renderBase();
    renderSide();
  }

  function updateZone(id, patch) {
    store.update((s) => Object.assign(s.zones.find((z) => z.id === id), patch));
  }

  function deleteZone(id) {
    const z = siteZones().find((x) => x.id === id);
    if (!confirm(`Delete the zone “${z.name}”?`)) return;
    selected = null;
    store.update((s) => { s.zones = s.zones.filter((x) => x.id !== id); });
  }

  function startDraft() { mode = 'draw'; draft = []; cursor = null; selected = null; renderToolbar(); renderBase(); renderSide(); }
  function cancelDraft() { mode = 'view'; draft = []; cursor = null; renderToolbar(); renderBase(); }

  function finishDraft() {
    if (draft.length < 3) return;
    const id = 'Z' + Date.now().toString(36);
    const points = draft;
    mode = 'view'; draft = []; cursor = null; selected = id;
    store.update((s) => { s.zones.push({ id, siteId, name: 'New zone', type: 'private', points }); });
    renderToolbar();
    setTimeout(() => { const n = document.getElementById('zone-name'); if (n) { n.focus(); n.select(); } }, 0);
  }

  svg.addEventListener('pointerdown', (e) => {
    const p = plan.toPlan(svg, e);
    if (mode === 'draw') {
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 2) return finishDraft();
      draft.push(p);
      renderToolbar();
      renderBase();
      return;
    }
    const handle = e.target.closest('.handle');
    if (handle) {
      const z = siteZones().find((x) => x.id === handle.dataset.zone);
      drag = { zoneId: z.id, index: +handle.dataset.index, points: z.points.map((q) => [...q]) };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const zone = e.target.closest('.zone');
    select(zone ? zone.dataset.zone : null);
  });

  svg.addEventListener('pointermove', (e) => {
    if (mode === 'draw' && draft.length) { cursor = plan.toPlan(svg, e); renderBase(); }
    if (drag) { drag.points[drag.index] = plan.toPlan(svg, e); renderBase(); }
  });

  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const { zoneId, points } = drag;
    drag = null;
    store.update((s) => { s.zones.find((z) => z.id === zoneId).points = points; });
  });

  svg.addEventListener('pointerleave', () => { if (mode === 'draw') { cursor = null; renderBase(); } });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (mode === 'draw' && e.key === 'Enter') finishDraft();
    else if (e.key === 'Escape') { if (mode === 'draw') cancelDraft(); else select(null); }
  });

  /* ---------- tabs and site switching ---------- */

  function setTab(t) {
    tab = t;
    document.querySelectorAll('#side-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    document.getElementById('side').dataset.tab = '';
    lastPeopleTab = '';
    renderSide();
  }
  document.getElementById('side-tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); };

  document.getElementById('site-select').onchange = (e) => {
    siteId = e.target.value;
    selected = null; mode = 'view'; draft = [];
    history.replaceState(null, '', `?site=${encodeURIComponent(siteId)}`);
    peopleLayer.innerHTML = '';
    renderAll();
  };

  store.subscribe(() => {
    if (selected && !store.get().zones.find((z) => z.id === selected)) selected = null;
    // Don't redraw the side form while someone is typing in it.
    const typing = document.activeElement && document.activeElement.closest('#side');
    renderHead(); renderBase(); renderPeopleLayer();
    if (!typing) { document.getElementById('side').dataset.tab = ''; lastPeopleTab = ''; renderSide(); }
  });
  renderToolbar();

  setInterval(() => {
    renderPeopleLayer();
    if (tab === 'people') renderSide();
  }, 1000);
})();
