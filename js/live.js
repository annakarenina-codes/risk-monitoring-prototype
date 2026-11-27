/*
 * Turns stored state into "where is everyone right now", plus small geometry helpers.
 */
window.RMS = window.RMS || {};

(function () {
  const geo = {
    /** Ray-casting point-in-polygon test. points: [[x, y], ...] */
    inside(x, y, points) {
      let hit = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    },

    /** The zone at a point. Private zones win over others when zones overlap. */
    zoneAt(zones, siteId, x, y) {
      const found = zones.filter((z) => z.siteId === siteId && geo.inside(x, y, z.points));
      return found.find((z) => z.type === 'private') || found.find((z) => z.type === 'restricted') || found[0] || null;
    },

    roomAt(site, x, y) {
      const r = site.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      return r ? r.name : 'Yard';
    },

    lerp(a, b, t) { return a + (b - a) * t; },
  };

  /** Position along a looping path at time `now`. Path points can carry a wait in seconds. */
  function walk(sim, now) {
    const pts = sim.path;
    if (pts.length === 1) return pts[0];
    const legs = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return { p, q, wait: p[2] || 0, move: len / sim.speed };
    });
    const total = legs.reduce((s, l) => s + l.wait + l.move, 0);
    let t = ((now / 1000 + (sim.offset || 0)) % total + total) % total;
    for (const l of legs) {
      if (t < l.wait) return l.p;
      t -= l.wait;
      if (t < l.move) {
        const f = t / l.move;
        return [geo.lerp(l.p[0], l.q[0], f), geo.lerp(l.p[1], l.q[1], f)];
      }
      t -= l.move;
    }
    return pts[0];
  }

  function transitProgress(tr, now) {
    const raw = (now - tr.startedAt) / tr.duration;
    if (!tr.loop) return Math.max(0, Math.min(1, raw));
    return ((raw % 1) + 1) % 1;
  }

  function site(state, id) { return state.sites.find((s) => s.id === id); }

  /**
   * Everyone's current status. Each record:
   *   kind: 'site' | 'paused' | 'transit' | 'offline'
   *   site: x, y, zone, room, alert
   *   transit: lat, lng, progress, from, to, tripId
   *
   * Privacy: for phone users the phone itself sends kind 'paused' with no coordinates
   * (see phone.js). Simulated people have no phone, so the same rule is applied here.
   */
  function live(state, now = Date.now()) {
    return state.people.map((p) => {
      const base = { id: p.id, person: p };
      let r;
      if (p.sim?.path) {
        const [x, y] = walk(p.sim, now);
        r = { kind: 'site', siteId: p.siteId, x, y };
      } else if (p.sim?.transit) {
        r = { kind: 'transit', ...p.sim.transit };
      } else {
        r = { ...(p.live || { kind: 'offline' }) };
      }

      if (r.kind === 'site') {
        const s = site(state, r.siteId);
        const zone = geo.zoneAt(state.zones, r.siteId, r.x, r.y);
        if (zone?.type === 'private') {
          return { ...base, kind: 'paused', siteId: r.siteId };
        }
        return {
          ...base, ...r, zone,
          room: s ? geo.roomAt(s, r.x, r.y) : '',
          alert: zone?.type === 'restricted' && p.role === 'visitor',
        };
      }

      if (r.kind === 'transit') {
        const a = site(state, r.from);
        const b = site(state, r.to);
        const progress = transitProgress(r, now);
        return {
          ...base, ...r, progress,
          lat: geo.lerp(a.lat, b.lat, progress),
          lng: geo.lerp(a.lng, b.lng, progress),
        };
      }

      return { ...base, ...r };
    });
  }

  /* ---------- trips ---------- */

  /** Index of the first phase not yet approved, or -1 when the trip is complete. */
  function currentPhase(trip) {
    return trip.phases.findIndex((p) => p.status !== 'approved');
  }

  /** A short status for a trip: label + tone used for badges. */
  function tripStatus(trip) {
    const i = currentPhase(trip);
    if (i === -1) return { label: 'Completed', tone: 'green' };
    const ph = trip.phases[i];
    if (ph.status === 'arrived') return { label: 'Awaiting guard', tone: 'amber' };
    if (ph.status === 'rejected') return { label: 'Rejected at gate', tone: 'red' };
    if (trip.transit) return { label: 'In transit', tone: 'blue' };
    return { label: i === 0 ? 'Scheduled' : 'Ready to depart', tone: 'grey' };
  }

  /** Phases where a driver has checked in and a guard must decide. Optionally for one site. */
  function pending(state, siteId) {
    return state.trips.flatMap((trip) => trip.phases.map((phase, index) => ({ trip, phase, index })))
      .filter((x) => x.phase.status === 'arrived' && (!siteId || x.phase.siteId === siteId))
      .map((x) => ({ ...x, driver: state.people.find((p) => p.id === x.trip.driverId), site: site(state, x.phase.siteId) }));
  }

  RMS.geo = geo;
  RMS.live = live;
  RMS.site = site;
  RMS.trips = { currentPhase, tripStatus, pending };
})();
