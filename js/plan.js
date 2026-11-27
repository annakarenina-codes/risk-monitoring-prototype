/*
 * Floor plan drawing (SVG), shared by the site page and the phone demo.
 * Plan units: x 0–100, y 0–60.
 */
window.RMS = window.RMS || {};

(function () {
  const { esc, initials } = RMS.ui;

  const W = 100;
  const H = 60;

  const centroid = (pts) => [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];

  /**
   * Static layer: rooms and zones.
   * opts.selectedZone: id to highlight with drag handles
   * opts.draft: points of a zone being drawn; opts.cursor: [x, y] for the preview line
   */
  function base(site, zones, opts = {}) {
    const rooms = site.rooms.map((r) => `
      <rect class="room" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="0.6"/>
      <text class="room-label" x="${r.x + 1.2}" y="${r.y + 2.6}">${esc(r.name)}</text>`).join('');

    const zoneMarkup = zones.filter((z) => z.siteId === site.id).map((z) => {
      const pts = z.points.map((p) => p.join(',')).join(' ');
      const [cx, cy] = centroid(z.points);
      const sel = z.id === opts.selectedZone;
      const handles = sel && opts.handles
        ? z.points.map((p, i) => `<circle class="handle" data-zone="${z.id}" data-index="${i}" cx="${p[0]}" cy="${p[1]}" r="1.1"/>`).join('')
        : '';
      return `
        <g class="zone zone-${z.type} ${sel ? 'selected' : ''}" data-zone="${z.id}">
          <polygon points="${pts}"/>
          <text class="zone-label" x="${cx}" y="${cy + 0.8}" text-anchor="middle">${esc(z.name)}</text>
        </g>${handles}`;
    }).join('');

    let draft = '';
    if (opts.draft && opts.draft.length) {
      const pts = [...opts.draft, ...(opts.cursor ? [opts.cursor] : [])];
      draft = `<polyline class="draft" points="${pts.map((p) => p.join(',')).join(' ')}"/>
        ${opts.draft.map((p, i) => `<circle class="draft-pt ${i === 0 ? 'first' : ''}" cx="${p[0]}" cy="${p[1]}" r="${i === 0 ? 1.3 : 0.8}"/>`).join('')}`;
    }

    const gate = site.gate ? `<g class="gate"><rect x="${site.gate[0] - 3}" y="${H - 1.2}" width="6" height="1.2"/><text x="${site.gate[0]}" y="${H - 2}" text-anchor="middle">Gate</text></g>` : '';

    return `
      <defs>
        <pattern id="hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.6" height="1.6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="1.6" class="hatch-line"/>
        </pattern>
      </defs>
      <rect class="yard" x="0" y="0" width="${W}" height="${H}" rx="1.5"/>
      ${rooms}${gate}${zoneMarkup}${draft}`;
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

  /** Convert a pointer event to plan coordinates. */
  function toPlan(svg, evt) {
    const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [Math.max(0, Math.min(W, Math.round(pt.x * 2) / 2)), Math.max(0, Math.min(H, Math.round(pt.y * 2) / 2))];
  }

  RMS.plan = { W, H, base, people, toPlan, centroid };
})();
