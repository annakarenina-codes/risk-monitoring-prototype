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
    /**
     * What a phone sends. `live` is { kind:'site', siteId, x, y } | { kind:'paused', siteId, zoneId }
     * | { kind:'offline' }. Paused never carries coordinates.
     */
    reportLocation(personId, live) {
      store.update((s) => {
        const p = person(s, personId);
        const prev = p.live;
        p.live = { ...live, at: Date.now() };
        if (live.siteId) p.siteId = live.siteId;
        // Keep the spot just before entering a private zone only if the client asked for it
        // (settings.showLastKnownWhenPaused, off by default). Otherwise nothing is kept.
        if (live.kind === 'paused' && s.settings.showLastKnownWhenPaused && prev?.kind === 'site') {
          p.lastKnown = { siteId: prev.siteId, x: prev.x, y: prev.y, at: prev.at };
        } else if (live.kind !== 'paused') {
          delete p.lastKnown;
        }
      });
    },

    /** What a phone user is doing right now ("Picking", "On break"...). Shown on the live monitor. */
    setStatus(personId, status) {
      store.update((s) => { person(s, personId).status = status; });
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
        const [x, y] = RMS.geo.nearGate(site);
        d.live = { kind: 'site', siteId: ph.siteId, x, y, at: Date.now() };
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

    /**
     * Driver leaves for the next phase's site. From here until check-in the driver is
     * only "en route": no position is tracked on the road, just where they're headed.
     */
    depart(tripId) {
      const s = store.get();
      const t = trip(s, tripId);
      const i = RMS.trips.currentPhase(t);
      if (i <= 0) return;
      const from = t.phases[i - 1].siteId;
      const to = t.phases[i].siteId;
      const driver = person(s, t.driverId);
      store.update((s) => {
        trip(s, tripId).transit = { from, to };
        const d = person(s, t.driverId);
        d.siteId = null;
        d.live = { kind: 'transit', tripId, from, to, startedAt: Date.now(), at: Date.now() };
      }, { kind: 'depart', text: `${driver.name} left ${siteName(s, from)} for ${siteName(s, to)} (${tripId}).` });
    },
  };
})();

/*
 * Site configuration (Configure page, superadmins). In production each of these is an
 * API call; the 3D Monitor and every other tab pick the change up through RMS.store.
 */
(function () {
  const { store } = RMS;
  const newId = (prefix) => prefix + Date.now().toString(36);
  const siteOf = (s, siteId) => s.sites.find((x) => x.id === siteId);
  const roomOf = (s, siteId, roomId) => siteOf(s, siteId).rooms.find((r) => r.id === roomId);

  RMS.config = {
    /** patch: any of { size, wallHeight } */
    updateSite(siteId, patch) {
      store.update((s) => Object.assign(siteOf(s, siteId), patch));
    },

    /** patch: any of { name, x, y, width, rotation } */
    updateGate(siteId, patch) {
      store.update((s) => {
        const site = siteOf(s, siteId);
        site.gate = { ...RMS.geo.gate(site), ...patch };
      });
    },

    /**
     * Buildings, roads and parking areas: list is 'buildings', 'roads' or 'parking'. add() returns the new id.
     */
    addFeature(siteId, list, item) {
      const id = ({ buildings: 'B', roads: 'RD', parking: 'PK' }[list] || 'F') + Date.now().toString(36);
      store.update((s) => { const site = siteOf(s, siteId); site[list] = [...(site[list] || []), { id, ...item }]; });
      return id;
    },
    updateFeature(siteId, list, id, patch) {
      store.update((s) => Object.assign(siteOf(s, siteId)[list].find((x) => x.id === id), patch));
    },
    deleteFeature(siteId, list, id) {
      store.update((s) => { const site = siteOf(s, siteId); site[list] = site[list].filter((x) => x.id !== id); });
    },

    /** rect: { name, x, y, w, h }. Returns the new room's id. */
    addRoom(siteId, rect) {
      const id = newId('R');
      store.update((s) => { siteOf(s, siteId).rooms.push({ id, doors: [], ...rect }); });
      return id;
    },

    /** patch: any of { name, x, y, w, h, doors } */
    updateRoom(siteId, roomId, patch) {
      store.update((s) => Object.assign(roomOf(s, siteId, roomId), patch));
    },

    /** Turn a room 90° around its centre: dir 1 = clockwise, -1 = counter-clockwise. Doors turn with it. */
    /** Returns false (and changes nothing) when the turned room wouldn't fit inside the site. */
    rotateRoom(siteId, roomId, dir = 1) {
      const s0 = store.get();
      const next = RMS.geo.rotateRoom(roomOf(s0, siteId, roomId), dir, siteOf(s0, siteId));
      if (!next) return false;
      store.update((s) => Object.assign(roomOf(s, siteId, roomId), next));
      return true;
    },

    deleteRoom(siteId, roomId) {
      store.update((s) => { const site = siteOf(s, siteId); site.rooms = site.rooms.filter((r) => r.id !== roomId); });
    },

    /** door: { side: 'n'|'s'|'e'|'w', at, width } */
    addDoor(siteId, roomId, door) {
      store.update((s) => { const r = roomOf(s, siteId, roomId); r.doors = [...(r.doors || []), door]; });
    },

    updateDoor(siteId, roomId, index, patch) {
      store.update((s) => Object.assign(roomOf(s, siteId, roomId).doors[index], patch));
    },

    removeDoor(siteId, roomId, index) {
      store.update((s) => { roomOf(s, siteId, roomId).doors.splice(index, 1); });
    },

    /** Returns the new zone's id. */
    addZone(siteId, points, type = 'private') {
      const id = newId('Z');
      store.update((s) => { s.zones.push({ id, siteId, name: 'New zone', type, points }); });
      return id;
    },

    /** patch: any of { name, type, points } */
    updateZone(zoneId, patch) {
      store.update((s) => Object.assign(s.zones.find((z) => z.id === zoneId), patch));
    },

    deleteZone(zoneId) {
      store.update((s) => { s.zones = s.zones.filter((z) => z.id !== zoneId); });
    },
  };
})();
