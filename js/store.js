/*
 * The "backend" of the prototype: state saved in localStorage and shared live
 * between every open tab (dashboard, site view, phone demo) of the same origin.
 *
 * In the real system this is replaced by an API + WebSocket server; pages only
 * talk to RMS.store, so swapping it out later touches this one file.
 */
window.RMS = window.RMS || {};

(function () {
  const KEY = 'rms-state';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('rms') : null;
  const subscribers = new Set();
  let state = load();

  /**
   * Read saved state, upgrading older versions. Whatever comes back is saved again
   * when it differs, so every tab shares the same data and start times.
   */
  function load() {
    const raw = localStorage.getItem(KEY);
    let next = null;
    try { next = migrate(JSON.parse(raw)); } catch (e) { /* fall through to the seed */ }
    if (!next) next = structuredClone(RMS.SEED);
    const json = JSON.stringify(next);
    if (json !== raw) localStorage.setItem(KEY, json);
    return next;
  }

  /** Bring saved data up to the current version, step by step, or return null to start from the seed. */
  function migrate(saved) {
    if (!saved || typeof saved !== 'object') return null;
    let s = saved;
    if (s.version === 3) s = v3to4(s);
    if (s.version === 4) s = v4to5(s);
    if (s.version === 5) s = v5to6(s);
    if (s.version === 6) s = v6to7(s);
    return s.version === RMS.SEED.version ? s : null; // anything else is too old: reset
  }

  /**
   * v4 -> v5: more people, forklifts (assets), two more trips, and activities on the
   * simulated people's paths. Keeps your sites, zones, trips, events and phone positions.
   */
  function v4to5(saved) {
    const seed = structuredClone(RMS.SEED);
    const has = (list, id) => list.some((x) => x.id === id);
    const newTrips = seed.trips.filter((t) => !has(saved.trips, t.id));
    return {
      ...saved,
      version: 5,
      people: [
        ...saved.people.map((p) => (p.sim ? seed.people.find((x) => x.id === p.id) || p : { ...p, status: p.status ?? seed.people.find((x) => x.id === p.id)?.status })),
        ...seed.people.filter((p) => !has(saved.people, p.id)),
      ],
      trips: [...saved.trips, ...newTrips],
      assets: seed.assets,
      events: [...saved.events, ...seed.events.filter((e) => newTrips.some((t) => e.text.includes(t.id)))].sort((x, y) => y.t - x.t),
    };
  }

  /**
   * v3 -> v4: sites gained size, wall height, outline, room ids and doors, and drivers
   * are no longer tracked on the road. Rooms couldn't be edited in v3, so take the new
   * site layouts from the seed; keep zones, trips, events and phone positions.
   */
  /** v6 -> v7: sites gain roads and parking areas (empty: add them in Configure, or Reset for the example). */
  function v6to7(saved) {
    return { ...saved, version: 7, sites: saved.sites.map((x) => ({ roads: [], parking: [], ...x })) };
  }

  /** v5 -> v6: forklifts get jobs (bay <-> storage) and operators. Everything else is kept. */
  function v5to6(saved) {
    const seed = structuredClone(RMS.SEED);
    return {
      ...saved,
      version: 6,
      assets: seed.assets,
      people: [...saved.people, ...seed.people.filter((p) => p.rides && !saved.people.some((x) => x.id === p.id))],
    };
  }

  function v3to4(saved) {
    const seed = structuredClone(RMS.SEED);
    return {
      ...saved,
      version: 4,
      settings: { ...seed.settings, showLastKnownWhenPaused: !!saved.settings?.showLastKnownWhenPaused },
      sites: seed.sites,
      people: saved.people.map((p) => {
        const fresh = seed.people.find((x) => x.id === p.id);
        if (p.sim) return fresh || p;
        if (p.live?.kind === 'transit') { const { duration, ...rest } = p.live; return { ...p, live: rest }; }
        return p;
      }),
    };
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (channel) channel.postMessage('changed');
  }

  function notify() {
    subscribers.forEach((fn) => fn(state));
  }

  function reloadFromStorage() {
    state = load();
    notify();
  }

  if (channel) channel.onmessage = reloadFromStorage;
  window.addEventListener('storage', (e) => { if (e.key === KEY) reloadFromStorage(); });

  RMS.store = {
    get: () => state,

    /** Change state with `fn(state)`. An optional event text is added to the activity log. */
    update(fn, event) {
      fn(state);
      if (event) {
        state.events.unshift({ t: Date.now(), ...event });
        state.events = state.events.slice(0, 60);
      }
      save();
      notify();
    },

    subscribe(fn) {
      subscribers.add(fn);
      fn(state);
      return () => subscribers.delete(fn);
    },

    reset() {
      state = structuredClone(RMS.SEED);
      // Restart the clocks so simulated movement and timestamps begin from now.
      const shift = Date.now() - firstSeedTime();
      shiftTimes(state, shift);
      // Forget the phone demo's on-device positions too.
      Object.keys(localStorage).filter((k) => k.startsWith('rms-device-')).forEach((k) => localStorage.removeItem(k));
      save();
      notify();
    },
  };

  function firstSeedTime() {
    return Math.max(...RMS.SEED.people.map((p) => p.live?.at || p.sim?.transit?.startedAt || 0));
  }

  function shiftTimes(obj, shift) {
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') shiftTimes(v, shift);
      else if (typeof v === 'number' && /^(t|at|startedAt|arrivedAt|approvedAt|rejectedAt)$/.test(k)) obj[k] = v + shift;
    }
  }
})();
