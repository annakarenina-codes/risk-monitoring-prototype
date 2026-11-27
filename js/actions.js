/*
 * Things people do: drivers check in and depart, guards approve or reject a phase,
 * phones report location. In production each of these becomes an API call.
 */
window.RMS = window.RMS || {};

(function () {
  const { store } = RMS;

  const person = (s, id) => s.people.find((p) => p.id === id);
  const trip = (s, id) => s.trips.find((t) => t.id === id);
  const siteName = (s, id) => RMS.site(s, id)?.name || id;

  RMS.actions = {
    /** What a phone sends. `live` is { kind:'site', siteId, x, y } | { kind:'paused', siteId } | { kind:'offline' } … */
    reportLocation(personId, live) {
      store.update((s) => {
        const p = person(s, personId);
        p.live = { ...live, at: Date.now() };
        if (live.siteId) p.siteId = live.siteId;
      });
    },

    /** Driver arrives at the gate of the current phase's site. */
    checkIn(tripId) {
      const s = store.get();
      const t = trip(s, tripId);
      const i = RMS.trips.currentPhase(t);
      if (i === -1) return;
      const ph = t.phases[i];
      const site = RMS.site(s, ph.siteId);
      const driver = person(s, t.driverId);
      store.update((s) => {
        const t2 = trip(s, tripId);
        const ph2 = t2.phases[i];
        ph2.status = 'arrived';
        ph2.arrivedAt = Date.now();
        delete ph2.rejectedReason;
        t2.transit = null;
        const d = person(s, t2.driverId);
        d.siteId = ph.siteId;
        d.live = { kind: 'site', siteId: ph.siteId, x: site.gate[0], y: site.gate[1] + 2, at: Date.now() };
      }, { kind: 'checkin', text: `${driver.name} checked in at ${site.name} (${tripId} · ${ph.label}). Waiting for guard.` });
    },

    approve(tripId, phaseIndex, byName) {
      const s = store.get();
      const t = trip(s, tripId);
      const ph = t.phases[phaseIndex];
      const last = phaseIndex === t.phases.length - 1;
      store.update((s) => {
        const p = trip(s, tripId).phases[phaseIndex];
        p.status = 'approved';
        p.approvedAt = Date.now();
        p.approvedBy = byName;
      }, {
        kind: 'approve',
        text: `${byName} approved ${ph.label} at ${siteName(s, ph.siteId)} for ${tripId}.${last ? ' Trip complete.' : ''}`,
      });
    },

    reject(tripId, phaseIndex, byName, reason) {
      const s = store.get();
      const ph = trip(s, tripId).phases[phaseIndex];
      store.update((s) => {
        const p = trip(s, tripId).phases[phaseIndex];
        p.status = 'rejected';
        p.rejectedAt = Date.now();
        p.rejectedBy = byName;
        p.rejectedReason = reason || 'No reason given';
      }, { kind: 'reject', text: `${byName} rejected ${ph.label} at ${siteName(s, ph.siteId)} for ${tripId}: ${reason || 'no reason given'}.` });
    },

    /** Driver leaves for the next phase's site. */
    depart(tripId) {
      const s = store.get();
      const t = trip(s, tripId);
      const i = RMS.trips.currentPhase(t);
      if (i <= 0) return;
      const from = t.phases[i - 1].siteId;
      const to = t.phases[i].siteId;
      const driver = person(s, t.driverId);
      const duration = s.settings.transitSeconds * 1000;
      store.update((s) => {
        trip(s, tripId).transit = { from, to };
        const d = person(s, t.driverId);
        d.siteId = null;
        d.live = { kind: 'transit', tripId, from, to, startedAt: Date.now(), duration, at: Date.now() };
      }, { kind: 'depart', text: `${driver.name} left ${siteName(s, from)} for ${siteName(s, to)} (${tripId}).` });
    },
  };
})();
