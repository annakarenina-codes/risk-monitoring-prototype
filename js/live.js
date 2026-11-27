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

    /** Average of a polygon's corners (good enough for placing a label). */
    centroid(pts) {
      return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    },

    /** Site size in metres (older data without a size used a 100 × 60 grid). */
    size(site) { return { w: site?.size?.w || 100, d: site?.size?.d || 60 }; },

    /**
     * A room turned 90° around its centre, `turns` times clockwise (negative = counter-clockwise),
     * kept inside the site. Doors move with their walls. Returns { x, y, w, h, doors }.
     */
    rotateRoom(room, turns, site) {
      let r = { x: room.x, y: room.y, w: room.w, h: room.h, doors: (room.doors || []).map((d) => ({ ...d })) };
      const n = ((turns % 4) + 4) % 4;
      for (let i = 0; i < n; i++) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        // Clockwise on screen (y points down): top → right → bottom → left → top.
        // The top and bottom walls keep their offset; the side walls' offset flips end to end.
        const doors = r.doors.map((d) => {
          if (d.side === 'n') return { ...d, side: 'e' };
          if (d.side === 's') return { ...d, side: 'w' };
          if (d.side === 'e') return { ...d, side: 's', at: Math.max(0, r.h - d.at - d.width) };
          return { ...d, side: 'n', at: Math.max(0, r.h - d.at - d.width) };
        });
        r = { x: Math.round(cx - r.h / 2), y: Math.round(cy - r.w / 2), w: r.h, h: r.w, doors };
      }
      const { w, d } = geo.size(site);
      if (r.w > w || r.h > d) return null; // turned, it wouldn't fit inside the site
      r.x = Math.max(0, Math.min(w - r.w, r.x));
      r.y = Math.max(0, Math.min(d - r.h, r.y));
      return r;
    },

    /** The area the layout actually uses (building, rooms, zones, gate): { x0, y0, x1, y1 } or null. */
    contentBounds(site, zones = []) {
      const xs = [];
      const ys = [];
      const add = (x, y) => { xs.push(x); ys.push(y); };
      const rect = (r) => { add(r.x, r.y); add(r.x + r.w, r.y + r.h); };
      (site.buildings || []).forEach(rect);
      site.rooms.forEach(rect);
      zones.filter((z) => z.siteId === site.id).forEach((z) => z.points.forEach(([x, y]) => add(x, y)));
      const g = geo.gate(site);
      if (g) {
        const hw = g.width / 2;
        if (g.rotation % 180) { add(g.x, g.y - hw); add(g.x, g.y + hw); } else { add(g.x - hw, g.y); add(g.x + hw, g.y); }
      }
      if (!xs.length) return null;
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    },

    /** The site's gate as { name, x, y, width, rotation }, or null. Also reads the older [x, y] form. */
    gate(site) {
      const g = site?.gate;
      if (!g) return null;
      const base = { name: 'Main gate', width: 6, rotation: 0 };
      return Array.isArray(g) ? { ...base, x: g[0], y: g[1] } : { ...base, ...g };
    },

    /** Where a driver stands after checking in: 3 m inside the gate, toward the middle of the site. */
    nearGate(site) {
      const g = geo.gate(site);
      const { w, d } = geo.size(site);
      if (g.rotation % 180) return [g.x > w / 2 ? g.x - 3 : g.x + 3, g.y]; // gate runs up–down
      return [g.x, g.y > d / 2 ? g.y - 3 : g.y + 3];
    },

    /**
     * Every wall of a site as merged line segments [[x1, y1], [x2, y2]], with door gaps cut out.
     * Walls two rooms share appear once, and a door on either room opens the shared wall.
     * Works on the 1 m grid the editor snaps to. Returns { walls, doors } (doors are the gaps).
     */
    siteWalls(site) {
      const wall = new Set();
      const door = new Set();
      // Unit segments: 'h,x,y' runs (x,y)→(x+1,y); 'v,x,y' runs (x,y)→(x,y+1).
      const sideUnits = (r, side) => {
        const x0 = Math.round(r.x), y0 = Math.round(r.y), x1 = Math.round(r.x + r.w), y1 = Math.round(r.y + r.h);
        if (side === 'n' || side === 's') { const y = side === 'n' ? y0 : y1; return range(x0, x1).map((x) => `h,${x},${y}`); }
        const x = side === 'w' ? x0 : x1;
        return range(y0, y1).map((y) => `v,${x},${y}`);
      };
      for (const r of site.rooms) {
        for (const side of ['n', 's', 'w', 'e']) {
          const units = sideUnits(r, side);
          units.forEach((u) => wall.add(u));
          (r.doors || []).filter((d) => d.side === side).forEach((d) => {
            const a = Math.max(0, Math.round(d.at));
            units.slice(a, a + Math.max(1, Math.round(d.width))).forEach((u) => door.add(u));
          });
        }
      }
      door.forEach((u) => wall.delete(u));
      return { walls: mergeUnits(wall), doors: mergeUnits(door) };
    },
  };

  function range(a, b) { const out = []; for (let i = a; i < b; i++) out.push(i); return out; }

  /** Join neighbouring unit segments on the same line into longer segments. */
  function mergeUnits(set) {
    const lines = {};
    set.forEach((u) => {
      const [dir, x, y] = u.split(',');
      const key = dir === 'h' ? `h,${y}` : `v,${x}`;
      (lines[key] = lines[key] || []).push(+(dir === 'h' ? x : y));
    });
    const out = [];
    Object.entries(lines).forEach(([key, starts]) => {
      const [dir, fixed] = key.split(',');
      starts.sort((a, b) => a - b);
      let a = starts[0];
      let b = a + 1;
      const push = () => out.push(dir === 'h' ? [[a, +fixed], [b, +fixed]] : [[+fixed, a], [+fixed, b]]);
      for (let i = 1; i < starts.length; i++) {
        if (starts[i] === b) b++;
        else { push(); a = starts[i]; b = a + 1; }
      }
      push();
    });
    return out;
  }

  /* ---------- pathfinding: routes go through doors, never through walls ---------- */

  const navCache = new Map();
  const routeCache = new Map();
  const layoutKey = (s) => JSON.stringify([s.id, geo.size(s), s.rooms, s.roads || [], s.parking || [], s.gate]);

  /** The site as a 1 m grid, with the cell edges that walls block. */
  function navGrid(s) {
    const key = layoutKey(s);
    let g = navCache.get(key);
    if (g) return g;
    const { w, d } = geo.size(s);
    const blockH = new Set(); // a wall along y=Y between cells (X, Y-1) and (X, Y): 'X,Y'
    const blockV = new Set(); // a wall along x=X between cells (X-1, Y) and (X, Y): 'X,Y'
    const { walls } = geo.siteWalls(s);
    walls.forEach(([a, b]) => {
      if (a[1] === b[1]) for (let x = a[0]; x < b[0]; x++) blockH.add(`${x},${a[1]}`);
      else for (let y = a[1]; y < b[1]; y++) blockV.add(`${a[0]},${y}`);
    });
    const W = Math.ceil(w);
    const D = Math.ceil(d);
    // Cells covered by a road or a parking area: trucks keep to these, forklifts prefer them.
    const roadMask = new Uint8Array(W * D);
    [...(s.roads || []), ...(s.parking || [])].forEach((r) => {
      for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(D, Math.ceil(r.y + r.h)); y++) {
        for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.w)); x++) roadMask[y * W + x] = 1;
      }
    });
    const roadCost = new Float32Array(W * D).map((v, i) => (roadMask[i] ? 0.5 : 1));
    g = { W, D, blockH, blockV, walls, roadMask, roadCost };
    if (navCache.size > 20) navCache.clear();
    navCache.set(key, g);
    return g;
  }

  /** Can you move from cell (x, y) by (dx, dy)? Diagonals may not cut a wall corner. */
  function canStep(g, x, y, dx, dy) {
    if (dx && dy) {
      return canStep(g, x, y, dx, 0) && canStep(g, x + dx, y, 0, dy) && canStep(g, x, y, 0, dy) && canStep(g, x, y + dy, dx, 0);
    }
    if (dx === 1) return !g.blockV.has(`${x + 1},${y}`);
    if (dx === -1) return !g.blockV.has(`${x},${y}`);
    if (dy === 1) return !g.blockH.has(`${x},${y + 1}`);
    return !g.blockH.has(`${x},${y}`);
  }

  /**
   * A* on the grid. Returns points from `from` to `to`, or [from, to] marked .direct when there's
   * no way through. opts.mask: only use these cells (roads); opts.cost: per-cell cost (prefer roads).
   */
  function findPath(g, from, to, opts = {}) {
    const { W, D } = g;
    const cell = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v)));
    const sx = cell(from[0], W); const sy = cell(from[1], D);
    const tx = cell(to[0], W); const ty = cell(to[1], D);
    const start = sy * W + sx;
    const goal = ty * W + tx;
    if (start === goal) return [from, to];
    const N = W * D;
    const gs = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const up = (k - 1) >> 1;
        if (heap[up][0] <= heap[k][0]) break;
        [heap[up], heap[k]] = [heap[k], heap[up]];
        k = up;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (l + 1 < heap.length && heap[l + 1][0] < heap[m][0]) m = l + 1;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hs = opts.cost ? 0.5 : 1; // keep the estimate below the cheapest real cost
    const h = (x, y) => {
      const dx = Math.abs(x - tx);
      const dy = Math.abs(y - ty);
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * hs;
    };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    gs[start] = 0;
    push(h(sx, sy), start);
    while (heap.length) {
      const i = pop()[1];
      if (done[i]) continue;
      done[i] = 1;
      if (i === goal) break;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= D || !canStep(g, x, y, dx, dy)) continue;
        const j = ny * W + nx;
        if (opts.mask && !opts.mask[j] && j !== goal) continue;
        const ng = gs[i] + (dx && dy ? Math.SQRT2 : 1) * (opts.cost ? opts.cost[j] : 1);
        if (ng < gs[j]) { gs[j] = ng; came[j] = i; push(ng + h(nx, ny), j); }
      }
    }
    if (came[goal] === -1) return Object.assign([from, to], { direct: true });
    const pts = [];
    for (let i = goal; i !== -1; i = came[i]) pts.push([(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    pts.reverse();
    pts[0] = [from[0], from[1]];
    pts[pts.length - 1] = [to[0], to[1]];
    return pts;
  }

  /** Does the straight line p→q stay clear of every wall (with a little room at door edges)? */
  function clearLine(g, p, q) {
    const E = 0.45;
    const side = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
    return !g.walls.some(([a, b]) => {
      const horiz = a[1] === b[1];
      const a2 = horiz ? [a[0] - E, a[1]] : [a[0], a[1] - E];
      const b2 = horiz ? [b[0] + E, b[1]] : [b[0], b[1] + E];
      return side(p, q, a2) !== side(p, q, b2) && side(a2, b2, p) !== side(a2, b2, q);
    });
  }

  /** Does the line p→q stay on the masked cells (roads)? Checked every half metre. */
  function onMask(g, mask, p, q) {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2);
    for (let k = 1; k < n; k++) {
      const x = Math.floor(lerpN(p[0], q[0], k / n));
      const y = Math.floor(lerpN(p[1], q[1], k / n));
      if (x >= 0 && y >= 0 && x < g.W && y < g.D && !mask[y * g.W + x]) return false;
    }
    return true;
  }
  const lerpN = (a, b, t) => a + (b - a) * t;

  /**
   * Drop grid steps you don't need, so routes are a few straight lines instead of a staircase.
   * With a mask, shortcuts must also stay on it (a truck doesn't cut across the grass).
   */
  function smooth(g, pts, mask) {
    if (pts.length <= 2) return pts;
    const ok = (a, b) => clearLine(g, a, b) && (!mask || onMask(g, mask, a, b));
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !ok(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /**
   * A looping path turned into a route that goes around walls and through doors, with its
   * timing worked out once. Cached per site layout and path, so it's only computed again
   * when the layout changes in Configure.
   * Path points: [x, y, waitSeconds?, activity?, carrying?, movingActivity?].
   */
  function route(s, sim, preferRoads = false) {
    const key = `${s ? layoutKey(s) : '-'}|${preferRoads ? 'r' : ''}|${sim.speed}|${sim.offset || 0}|${JSON.stringify(sim.path)}`;
    let r = routeCache.get(key);
    if (r) return r;
    const pts = sim.path;
    let full = pts;
    if (s && pts.length > 1) {
      const g = navGrid(s);
      full = [];
      pts.forEach((pt, i) => {
        const q = pts[(i + 1) % pts.length];
        full.push(pt);
        // In-between points carry the destination's labels, so status reads "heading to…".
        const opts = preferRoads ? { cost: g.roadCost } : {};
        smooth(g, findPath(g, pt, q, opts)).slice(1, -1).forEach(([x, y]) => full.push([x, y, 0, q[3], q[4], q[5]]));
      });
    }
    const legs = full.map((pt, i) => {
      const q = full[(i + 1) % full.length];
      return { p: pt, q, wait: pt[2] || 0, move: Math.hypot(q[0] - pt[0], q[1] - pt[1]) / sim.speed };
    });
    r = { legs, total: legs.reduce((t, l) => t + l.wait + l.move, 0), offset: sim.offset || 0 };
    if (routeCache.size > 300) routeCache.clear();
    routeCache.set(key, r);
    return r;
  }

  /**
   * Where something on a route is at time `now`: { x, y, activity, carry, heading }.
   * Waiting at a point shows its activity; heading to it shows its moving activity (or activity).
   */
  function walk(r, now) {
    const first = r.legs[0].p;
    if (!r.total) return { x: first[0], y: first[1], activity: first[3] || null, carry: !!first[4], heading: null };
    let t = ((now / 1000 + r.offset) % r.total + r.total) % r.total;
    for (const l of r.legs) {
      if (t < l.wait) return { x: l.p[0], y: l.p[1], activity: l.p[3] || null, carry: !!l.p[4], heading: null };
      t -= l.wait;
      if (t < l.move) {
        const f = t / l.move;
        return {
          x: geo.lerp(l.p[0], l.q[0], f), y: geo.lerp(l.p[1], l.q[1], f),
          activity: l.q[5] || l.q[3] || null, carry: !!l.q[4], heading: [l.q[0] - l.p[0], l.q[1] - l.p[1]],
        };
      }
      t -= l.move;
    }
    return { x: first[0], y: first[1], activity: null, carry: false, heading: null };
  }

  /* ---------- status: what someone (or something) is doing ---------- */

  const DEFAULT_STATUS = { employee: 'On duty', guard: 'On duty', visitor: 'Visiting', driver: 'On site' };
  const STATUS_TONE = { 'On break': 'grey', Walking: 'grey', Waiting: 'warning', Charging: 'grey', Idle: 'grey', Moving: 'grey' };
  const statusOf = (text, tone) => ({ text, tone: tone || STATUS_TONE[text] || (/^Heading/.test(text) ? 'grey' : 'success') });

  /** Loading or unloading, from a phase label like "Pickup" or "Drop-off". */
  const workFor = (label) => (/drop|unload|deliver/i.test(label) ? 'Unloading' : 'Loading');

  /** A driver's status is their trip phase. */
  function driverStatus(state, p, now) {
    const trips = state.trips.filter((t) => t.driverId === p.id);
    const t = trips.find((x) => currentPhase(x) !== -1) || trips[trips.length - 1];
    if (!t) return statusOf('On site', 'grey');
    const i = currentPhase(t);
    const base = { tripId: t.id };
    if (i === -1) return { ...base, ...statusOf('Trip complete', 'success') };
    const ph = t.phases[i];
    if (ph.status === 'arrived') return { ...base, ...statusOf(`${ph.label} · waiting for guard`, 'warning') };
    if (ph.status === 'rejected') return { ...base, ...statusOf(`${ph.label} · rejected at gate`, 'danger') };
    if (t.transit) return { ...base, ...statusOf('En route', 'accent') };
    if (i > 0) {
      // Approved here: say what the truck is doing and where ("Driving to Loading dock", "Loading at Loading dock").
      const truck = p.siteId && trucksAt(state, p.siteId, now).find((x) => x.id === t.id);
      return { ...base, ...(truck ? truck.status : statusOf(`${workFor(t.phases[i - 1].label)} at bay`, 'success')) };
    }
    return { ...base, ...statusOf(`${ph.label} · not checked in`, 'grey') };
  }

  /** { text, tone } for a person who is visible on site. Drivers may also carry tripId. */
  function personStatus(state, p, activity, now = Date.now()) {
    if (p.rides) return statusOf(`Driving ${p.rides}`, 'accent');
    if (p.role === 'driver') return driverStatus(state, p, now);
    if (p.sim) return statusOf(activity || 'Walking');
    return statusOf(p.status || DEFAULT_STATUS[p.role] || 'On duty');
  }

  function site(state, id) { return state.sites.find((s) => s.id === id); }

  /**
   * Everyone's current status. Each record:
   *   kind: 'site' | 'paused' | 'transit' | 'offline'
   *   site: x, y, zone, room, alert
   *   paused: siteId, zoneId (which private zone, for head counts; never a position),
   *           plus lastKnown only if settings.showLastKnownWhenPaused is on
   *   transit: from, to, tripId, startedAt. No position: drivers aren't tracked on the road,
   *            we only know where they're headed (until they check in at the next gate).
   *
   * Privacy: for phone users the phone itself sends kind 'paused' with no coordinates
   * (see phone.js). Simulated people have no phone, so the same rule is applied here.
   */
  function live(state, now = Date.now()) {
    // Forklift operators are wherever their forklift is.
    const rides = state.people.some((p) => p.rides) ? Object.fromEntries(equipment(state, now).map((e) => [e.id, e])) : {};
    return state.people.map((p) => {
      const base = { id: p.id, person: p };
      let r;
      if (p.sim?.path) {
        const w = walk(route(site(state, p.siteId), p.sim), now);
        r = { kind: 'site', siteId: p.siteId, x: w.x, y: w.y, activity: w.activity };
      } else if (p.sim?.transit) {
        r = { kind: 'transit', ...p.sim.transit };
      } else if (p.rides) {
        const e = rides[p.rides];
        r = e ? { kind: 'site', siteId: e.siteId, x: e.x, y: e.y, rides: e.id } : { kind: 'offline' };
      } else {
        r = { ...(p.live || { kind: 'offline' }) };
      }

      if (r.kind === 'site') {
        const s = site(state, r.siteId);
        const zone = geo.zoneAt(state.zones, r.siteId, r.x, r.y);
        if (zone?.type === 'private') {
          r = { kind: 'paused', siteId: r.siteId, zoneId: zone.id };
        } else {
          return {
            ...base, ...r, zone,
            room: s ? geo.roomAt(s, r.x, r.y) : '',
            alert: zone?.type === 'restricted' && p.role === 'visitor',
            status: personStatus(state, p, r.activity, now),
          };
        }
      }

      if (r.kind === 'paused') {
        // Which private zone, but never where in it. Only used for head counts.
        const out = { ...base, kind: 'paused', siteId: r.siteId, zoneId: r.zoneId || null };
        if (state.settings?.showLastKnownWhenPaused && p.lastKnown) out.lastKnown = p.lastKnown;
        return out;
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
    if (i === -1) return { label: 'Completed', tone: 'success' };
    const ph = trip.phases[i];
    if (ph.status === 'arrived') return { label: 'Awaiting guard', tone: 'warning' };
    if (ph.status === 'rejected') return { label: 'Rejected at gate', tone: 'danger' };
    if (trip.transit) return { label: 'En route', tone: 'accent' };
    return { label: i === 0 ? 'Scheduled' : 'Ready to depart', tone: 'grey' };
  }

  /** Phases where a driver has checked in and a guard must decide. Optionally for one site. */
  function pending(state, siteId) {
    return state.trips.flatMap((trip) => trip.phases.map((phase, index) => ({ trip, phase, index })))
      .filter((x) => x.phase.status === 'arrived' && (!siteId || x.phase.siteId === siteId))
      .map((x) => ({ ...x, driver: state.people.find((p) => p.id === x.trip.driverId), site: site(state, x.phase.siteId) }));
  }

  /* ---------- equipment and trucks ---------- */

  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  /** Where pallets are picked up or set down in a room: just inside its dock doors, or a row across a storage room. */
  function palletSpots(s, r) {
    const atDocks = docks(s).filter((d) => inRect(d.x - d.ox * 0.5, d.y - d.oy * 0.5, r)).map((d) => [d.x - d.ox * 3, d.y - d.oy * 3]);
    if (atDocks.length) return atDocks;
    const y = Math.round(r.y + r.h * 0.65);
    return [0.25, 0.5, 0.75].map((f) => [Math.round(r.x + r.w * f), y]);
  }

  /** A forklift's loop from its job: pick up a pallet in one room, set it down in the other, go back. */
  function jobPath(s, job) {
    const from = s.rooms.find((r) => r.id === job.from);
    const to = s.rooms.find((r) => r.id === job.to);
    if (!from || !to) return null;
    const P = palletSpots(s, from);
    const Q = palletSpots(s, to);
    const out = [];
    for (let k = 0; k < Math.max(P.length, Q.length); k++) {
      const a = P[k % P.length];
      const b = Q[k % Q.length];
      out.push([a[0], a[1], 8, 'Loading pallet', false, `Heading to ${from.name}`]);
      out.push([b[0], b[1], 6, 'Unloading pallet', true, `Carrying pallet to ${to.name}`]);
    }
    return out;
  }

  /**
   * Every piece of equipment right now: { id, asset, siteId, x, y, heading, carry, operator,
   * job: { from, to } room names, status }. Forklifts with a job follow it; others their own path.
   */
  function equipment(state, now = Date.now()) {
    return (state.assets || []).map((a) => {
      const s = site(state, a.siteId);
      if (!s) return null;
      const path = a.job ? jobPath(s, a.job) : a.sim?.path;
      if (!path) return null; // its rooms were deleted in Configure
      const w = walk(route(s, { speed: a.speed || a.sim?.speed || 2.5, offset: a.offset ?? a.sim?.offset ?? 0, path }, true), now);
      const roomName = (id) => s.rooms.find((r) => r.id === id)?.name;
      return {
        id: a.id, asset: a, siteId: a.siteId, x: w.x, y: w.y, heading: w.heading, carry: w.carry,
        operator: state.people.find((p) => p.rides === a.id) || null,
        job: a.job ? { from: roomName(a.job.from), to: roomName(a.job.to) } : null,
        status: statusOf(w.activity || 'Moving'),
      };
    }).filter(Boolean);
  }

  /**
   * Loading-bay doors trucks back up to: outside doors of rooms named like
   * "Loading bays", "Unloading", "Dock". { x, y, ox, oy } = door centre and outward direction.
   */
  function docks(s) {
    const out = [];
    const inRoom = (x, y) => s.rooms.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
    s.rooms.filter((r) => /load|dock|bay/i.test(r.name)).forEach((r) => {
      (r.doors || []).forEach((d) => {
        const m = d.at + d.width / 2;
        const [x, y, ox, oy] = {
          n: [r.x + m, r.y, 0, -1], s: [r.x + m, r.y + r.h, 0, 1],
          w: [r.x, r.y + m, -1, 0], e: [r.x + r.w, r.y + m, 1, 0],
        }[d.side];
        if (!inRoom(x + ox, y + oy)) out.push({ x, y, ox, oy }); // only doors that open to the outside
      });
    });
    return out;
  }

  /* ---------- trucks: from the gate, along the roads, into a parking slot ---------- */

  const TRUCK_SPEED = 5; // metres per second in the yard
  const SLOT_WIDTH = 4;
  const ENTRY_DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  /**
   * Truck slots in every parking area: { parkId, name, kind, x, y, dir, depth }. Trucks back in,
   * so `dir` (the way the cab faces when parked) points out of the area's entry side.
   */
  function parkingSlots(s) {
    const out = [];
    (s.parking || []).forEach((pk) => {
      const entry = pk.entry || 's';
      const across = entry === 'n' || entry === 's'; // slots side by side along the width
      const span = across ? pk.w : pk.h;
      const n = Math.max(1, Math.floor(span / SLOT_WIDTH));
      const pad = (span - n * SLOT_WIDTH) / 2;
      for (let i = 0; i < n; i++) {
        const c = pad + SLOT_WIDTH / 2 + i * SLOT_WIDTH;
        out.push({
          parkId: pk.id, name: pk.name, kind: pk.kind || 'any', dir: ENTRY_DIR[entry],
          x: across ? pk.x + c : pk.x + pk.w / 2, y: across ? pk.y + pk.h / 2 : pk.y + c,
          depth: across ? pk.h : pk.w,
        });
      }
    });
    return out;
  }

  const truckRoutes = new Map();

  /**
   * The drive from outside the gate to a slot: through the gate, along the roads (or anywhere
   * if there are none), then backing in. Returns { segs: [{ a, b, len, dir }], length }.
   */
  function truckRoute(s, slot) {
    const gate = geo.gate(s);
    const key = `${layoutKey(s)}|${slot.x},${slot.y},${slot.dir}`;
    let rt = truckRoutes.get(key);
    if (rt) return rt;
    const g = navGrid(s);
    const [nx, ny] = geo.nearGate(s);
    const inward = [Math.sign(nx - gate.x), Math.sign(ny - gate.y)];
    const outside = [gate.x - inward[0] * 6, gate.y - inward[1] * 6];
    const inside = [gate.x + inward[0] * 3, gate.y + inward[1] * 3];
    const approach = [slot.x + slot.dir[0] * (slot.depth / 2 + 5), slot.y + slot.dir[1] * (slot.depth / 2 + 5)];
    let mid = (s.roads || []).length ? findPath(g, inside, approach, { mask: g.roadMask }) : null;
    if (mid && !mid.direct) mid = smooth(g, mid, g.roadMask);
    else mid = smooth(g, findPath(g, inside, approach));
    const pts = [outside, ...mid, [slot.x, slot.y]];
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const last = i === pts.length - 2;
      // Driving forward the cab faces where it's going; backing into the slot it faces out.
      segs.push({ a, b, len, dir: last ? slot.dir : [(b[0] - a[0]) / len, (b[1] - a[1]) / len] });
    }
    rt = { segs, length: segs.reduce((t, x) => t + x.len, 0) };
    if (truckRoutes.size > 100) truckRoutes.clear();
    truckRoutes.set(key, rt);
    return rt;
  }

  /** The same drive the other way: out of the slot (forward), back along the roads, out the gate. */
  function reverseRoute(rt) {
    const segs = rt.segs.slice().reverse().map((x, i) => ({
      a: x.b, b: x.a, len: x.len, dir: i === 0 ? x.dir : [-x.dir[0], -x.dir[1]],
    }));
    return { segs, length: rt.length };
  }

  /** Where a truck is after driving `dist` metres along a route: { x, y, dir, moving }. */
  function along(rt, dist) {
    let d = Math.max(0, dist);
    for (const x of rt.segs) {
      if (d < x.len) {
        const f = d / x.len;
        return { x: lerpN(x.a[0], x.b[0], f), y: lerpN(x.a[1], x.b[1], f), dir: x.dir, moving: true };
      }
      d -= x.len;
    }
    const last = rt.segs[rt.segs.length - 1];
    return { x: last.b[0], y: last.b[1], dir: last.dir, moving: false };
  }

  /**
   * Trucks at a site, from the trips. Each: { id (trip id), trip, phase, index, driver, state, work,
   * place, x, y, dir (the way the cab faces), moving, status }.
   *   'waiting': outside the gate while the guard decides.
   *   'docked':  approved; drives along the roads to a free parking slot (loading / unloading /
   *              any, matching its work), backs in and stays until the driver departs.
   *   'leaving': departed; drives back out through the gate, then it's gone.
   * Positions come from the clock (approval or departure time), so every tab agrees.
   */
  function trucksAt(state, siteId, now = Date.now()) {
    const s = site(state, siteId);
    const gate = s && geo.gate(s);
    if (!gate) return [];
    const [nx, ny] = geo.nearGate(s);
    const inward = [Math.sign(nx - gate.x), Math.sign(ny - gate.y)];
    const out = [];
    const atSite = [];
    let waiting = 0;
    state.trips.forEach((t) => {
      const i = currentPhase(t);
      const driver = state.people.find((p) => p.id === t.driverId);
      if (t.transit) {
        // Just departed from here? It drives out first.
        const ph = i > 0 && t.phases[i - 1];
        const startedAt = driver?.live?.startedAt || driver?.sim?.transit?.startedAt;
        if (t.transit.from === siteId && ph && ph.siteId === siteId && startedAt) {
          atSite.push({ id: t.id, trip: t, phase: ph, index: i - 1, driver, state: 'leaving', work: workFor(ph.label), startedAt });
        }
        return;
      }
      const here = i !== -1 && t.phases[i];
      if (here && here.siteId === siteId && (here.status === 'arrived' || here.status === 'rejected')) {
        const dist = 5 + waiting++ * 9;
        out.push({
          id: t.id, trip: t, phase: here, index: i, driver, state: 'waiting', place: geo.gate(s).name,
          x: gate.x - inward[0] * dist, y: gate.y - inward[1] * dist, dir: inward, moving: false,
          status: here.status === 'rejected' ? statusOf('Rejected at gate', 'danger') : statusOf('Waiting for guard', 'warning'),
        });
        return;
      }
      const j = i === -1 ? t.phases.length - 1 : i - 1;
      const ph = j >= 0 && t.phases[j];
      if (!ph || ph.siteId !== siteId || ph.status !== 'approved') return;
      if (i !== -1 && t.phases[i].status !== 'upcoming') return;
      if (i === -1 && now - (ph.approvedAt || 0) > 10 * 60 * 1000) return;
      atSite.push({ id: t.id, trip: t, phase: ph, index: j, driver, state: 'docked', work: workFor(ph.label) });
    });

    // Slots: parking areas first (matching kind, then 'any'), then dock doors, then the yard.
    const slots = parkingSlots(s);
    const doors = docks(s).map((d) => ({ name: 'Loading bay', kind: 'any', x: d.x + d.ox * 4.2, y: d.y + d.oy * 4.2, dir: [d.ox, d.oy], depth: 8.4 }));
    const taken = new Set();
    const pick = (work) => {
      const want = work === 'Unloading' ? 'unloading' : 'loading';
      const pool = slots.length ? slots : doors;
      const k = [pool.findIndex((x, n) => !taken.has(n) && x.kind === want), pool.findIndex((x, n) => !taken.has(n) && x.kind === 'any')]
        .find((n) => n !== -1);
      if (k === undefined) return null;
      taken.add(k);
      return pool[k];
    };
    // First approved gets the first slot, so a truck never jumps when another one arrives.
    atSite.sort((a, b) => (a.phase.approvedAt || 0) - (b.phase.approvedAt || 0)).forEach((tr, n) => {
      const slot = pick(tr.work) || { name: 'the yard', x: nx + inward[0] * 10 + n * 4, y: ny + inward[1] * 10, dir: inward, depth: 8 };
      const rt = truckRoute(s, slot);
      let pos;
      let status;
      if (tr.state === 'leaving') {
        const back = reverseRoute(rt);
        const dist = ((now - tr.startedAt) / 1000) * TRUCK_SPEED;
        if (dist >= back.length) return; // out of the gate: gone
        pos = along(back, dist);
        status = statusOf('Leaving site', 'accent');
      } else {
        pos = along(rt, ((now - (tr.phase.approvedAt || 0)) / 1000) * TRUCK_SPEED);
        status = pos.moving ? statusOf(`Driving to ${slot.name}`, 'accent') : statusOf(`${tr.work} at ${slot.name}`, 'success');
      }
      out.push({ ...tr, place: slot.name, parkId: slot.parkId || null, ...pos, status });
    });
    return out;
  }

  /** Head count per private zone at a site: { zoneId: n }. Counts only, never names. */
  function privateCounts(records, siteId) {
    const out = {};
    records.forEach((r) => {
      if (r.kind === 'paused' && r.siteId === siteId && r.zoneId) out[r.zoneId] = (out[r.zoneId] || 0) + 1;
    });
    return out;
  }

  RMS.geo = geo;
  RMS.live = live;
  RMS.occupancy = { privateCounts };
  RMS.site = site;
  RMS.trips = { currentPhase, tripStatus, pending };
  RMS.equipment = equipment;
  RMS.trucks = { atSite: trucksAt, docks, parkingSlots };
  RMS.nav = { findPath: (s, a, b) => smooth(navGrid(s), findPath(navGrid(s), a, b)) };
})();
