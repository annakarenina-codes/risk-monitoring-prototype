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
  // Save the seed straight away so every tab shares the same start times.
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(state));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.version === RMS.SEED.version) return saved;
    } catch (e) { /* fall through to the seed */ }
    return structuredClone(RMS.SEED);
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
