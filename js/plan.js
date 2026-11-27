/*
 * Floor plan drawing (SVG), shared by the Configure page and the phone demo.
 * Plan units are metres: x 0 → site.size.w, y 0 → site.size.d.
 */
window.RMS = window.RMS || {};

(function () {
  const { esc, initials } = RMS.ui;
  const { geo } = RMS;

  /** Id used for the gate wherever a room id is expected (selection). */
  const GATE = '__gate';

  const { centroid } = geo;

  const corners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

  /**
   * The SVG viewBox for a site, with a 1 m margin. It also covers anything that sticks out
   * past the site edge, so nothing is ever cut off.
   */
  function viewBox(site, zones = []) {
    const { w, d } = geo.size(site);
    const b = geo.contentBounds(site, zones) || { x0: 0, y0: 0, x1: w, y1: d };
    const x0 = Math.min(0, b.x0) - 1;
    const y0 = Math.min(0, b.y0) - 1;
    const x1 = Math.max(w, b.x1) + 1;
    const y1 = Math.max(d, b.y1) + 1;
    return `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
  }

  /**
   * Static layer: yard, building, rooms, walls, zones, gate.
   * opts.selectedZone / opts.zoneHandles: zone to highlight, with corner handles
   * opts.selectedRoom / opts.roomHandles: room id (or 'bldg:', 'road:', 'park:' id) to highlight, with corner handles
   * opts.draft + opts.cursor: points of a zone being drawn and the preview line end
   * opts.roomDraft: { x, y, w, h } of a room being drawn
   */
  function base(site, zones, opts = {}) {
    const { w, d } = geo.size(site);

    // Roads and parking areas, under the building. Selected like rooms, as 'road:<id>' / 'park:<id>'.
    const picked = (id) => (opts.selectedRoom === id ? 'selected' : '');
    const roads = (site.roads || []).map((r) => {
      const horiz = r.w >= r.h;
      const line = horiz
        ? `<line class="road-line" x1="${r.x + 0.6}" y1="${r.y + r.h / 2}" x2="${r.x + r.w - 0.6}" y2="${r.y + r.h / 2}"/>`
        : `<line class="road-line" x1="${r.x + r.w / 2}" y1="${r.y + 0.6}" x2="${r.x + r.w / 2}" y2="${r.y + r.h - 0.6}"/>`;
      return `<g class="road ${picked(`road:${r.id}`)}" data-room="road:${esc(r.id)}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>${line}</g>`;
    }).join('');
    const parking = (site.parking || []).map((pk) => {
      const slots = RMS.trucks.parkingSlots({ parking: [pk] });
      const across = (pk.entry || 's') === 'n' || (pk.entry || 's') === 's';
      const edge = (c) => (across
        ? `<line class="park-line" x1="${c}" y1="${pk.y}" x2="${c}" y2="${pk.y + pk.h}"/>`
        : `<line class="park-line" x1="${pk.x}" y1="${c}" x2="${pk.x + pk.w}" y2="${c}"/>`);
      const lines = slots.map((sl) => edge((across ? sl.x : sl.y) - 2)).join('')
        + (slots.length ? edge((across ? slots[slots.length - 1].x : slots[slots.length - 1].y) + 2) : '');
      return `<g class="parking ${picked(`park:${pk.id}`)}" data-room="park:${esc(pk.id)}">
        <rect x="${pk.x}" y="${pk.y}" width="${pk.w}" height="${pk.h}"/>${lines}
        <text class="park-label" x="${pk.x + pk.w / 2}" y="${pk.y + pk.h / 2 + 0.6}" text-anchor="middle">P · ${esc(pk.name)}</text>
      </g>`;
    }).join('');

    const building = (site.buildings || []).map((b) => `
      <rect class="building ${picked(`bldg:${b.id}`)}" data-room="bldg:${esc(b.id)}"
        x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="0.4"/>
      <text class="building-label" x="${b.x + 1}" y="${b.y - 0.8}">${esc(b.name)}</text>`).join('');

    const rooms = site.rooms.map((r) => `
      <g class="room-g ${r.id === opts.selectedRoom ? 'selected' : ''}" data-room="${esc(r.id)}">
        <rect class="room" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>
        <text class="room-label" x="${r.x + 1.2}" y="${r.y + 2.6}">${esc(r.name)}</text>
      </g>`).join('');

    const { walls, doors } = geo.siteWalls(site);
    const line = (cls) => ([a, b]) => `<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    const wallMarkup = `<g class="walls">${walls.map(line('wall')).join('')}${doors.map(line('door')).join('')}</g>`;

    const zoneMarkup = zones.filter((z) => z.siteId === site.id).map((z) => {
      const pts = z.points.map((p) => p.join(',')).join(' ');
      const [cx, cy] = centroid(z.points);
      const sel = z.id === opts.selectedZone;
      return `
        <g class="zone zone-${z.type} ${sel ? 'selected' : ''}" data-zone="${z.id}">
          <polygon points="${pts}"/>
          <text class="zone-label" x="${cx}" y="${cy + 0.8}" text-anchor="middle">${esc(z.name)}</text>
        </g>`;
    }).join('');

    let draft = '';
    if (opts.draft && opts.draft.length) {
      const pts = [...opts.draft, ...(opts.cursor ? [opts.cursor] : [])];
      draft = `<polyline class="draft" points="${pts.map((p) => p.join(',')).join(' ')}"/>
        ${opts.draft.map((p, i) => `<circle class="draft-pt ${i === 0 ? 'first' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === 0 ? 1.3 : 0.8}"/>`).join('')}`;
    }
    if (opts.roomDraft) {
      const r = opts.roomDraft;
      draft += `<rect class="draft" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>
        <text class="draft-size" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 0.7}" text-anchor="middle">${r.w} × ${r.h} m</text>`;
    }

    const g = geo.gate(site);
    const gate = g ? `
      <g class="gate ${opts.selectedRoom === GATE ? 'selected' : ''}" data-gate="1">
        <rect transform="translate(${g.x} ${g.y}) rotate(${g.rotation})" x="${-g.width / 2}" y="-0.7" width="${g.width}" height="1.4" rx="0.7"/>
        <text x="${g.x}" y="${g.rotation % 180 ? g.y - g.width / 2 - 1 : g.y - 1.6}" text-anchor="middle">${esc(g.name)}</text>
      </g>` : '';

    let handles = '';
    if (opts.zoneHandles && opts.selectedZone) {
      const z = zones.find((x) => x.id === opts.selectedZone);
      if (z) handles = z.points.map((p, i) => `<circle class="handle" data-zone="${z.id}" data-index="${i}" cx="${p[0]}" cy="${p[1]}" r="1.1"/>`).join('');
    }
    if (opts.roomHandles && opts.selectedRoom) {
      const id = opts.selectedRoom;
      const feature = (list, pre) => (site[list] || []).find((x) => `${pre}:${x.id}` === id);
      const r = feature('buildings', 'bldg') || feature('roads', 'road') || feature('parking', 'park') || site.rooms.find((x) => x.id === id);
      if (r) handles = corners(r).map((p, i) => `<circle class="handle rhandle" data-corner="${i}" cx="${p[0]}" cy="${p[1]}" r="1.1"/>`).join('');
    }

    return `
      <defs>
        <pattern id="hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.6" height="1.6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="1.6" class="hatch-line"/>
        </pattern>
      </defs>
      <rect class="yard" x="0" y="0" width="${w}" height="${d}" rx="1.5"/>
      ${roads}${parking}${building}${rooms}${wallMarkup}${zoneMarkup}${draft}${gate}${handles}`;
  }

  /**
   * Draw people into an SVG <g>, updating dots in place so they glide between positions.
   * records: live records with kind 'site' at this site.
   */
  function people(layer, records, { meId } = {}) {
    const NS = 'http://www.w3.org/2000/svg';
    const seen = new Set();
    records.forEach((r) => {
      seen.add(r.id);
      let g = layer.querySelector(`[data-person="${r.id}"]`);
      const cls = `person role-${r.person.role} ${r.alert ? 'alert' : ''} ${r.id === meId ? 'me' : ''}`;
      if (!g) {
        g = document.createElementNS(NS, 'g');
        g.dataset.person = r.id;
        g.style.transition = 'none';
        layer.appendChild(g);
        requestAnimationFrame(() => { g.style.transition = ''; });
      }
      if (g.getAttribute('class') !== cls) {
        g.setAttribute('class', cls);
        g.innerHTML = `${r.alert ? '<circle class="pulse" r="3.2"/>' : ''}<circle r="1.9"/>
          <text y="0.65" text-anchor="middle">${initials(r.person.name)}</text><title>${esc(r.person.name)}</title>`;
      }
      g.style.transform = `translate(${r.x.toFixed(2)}px, ${r.y.toFixed(2)}px)`;
    });
    layer.querySelectorAll('[data-person]').forEach((g) => { if (!seen.has(g.dataset.person)) g.remove(); });
  }

  /** Convert a pointer event to plan coordinates, snapped to the 1 m grid and kept inside the site. */
  function toPlan(svg, evt, site) {
    const { w, d } = geo.size(site);
    const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [Math.max(0, Math.min(w, Math.round(pt.x))), Math.max(0, Math.min(d, Math.round(pt.y)))];
  }

  RMS.plan = { GATE, base, people, toPlan, centroid, corners, viewBox };
})();
