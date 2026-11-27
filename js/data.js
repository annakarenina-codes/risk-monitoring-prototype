/*
 * Seed data for the prototype.
 * Everything here is made up. Edit freely; bump `version` so browsers that
 * already saved older data reset to this seed on their next load.
 *
 * Floor plans use a simple local grid: x runs 0–100, y runs 0–60 (roughly metres).
 * In the real system each site would be georeferenced so phone coordinates can be
 * converted into this grid.
 */
window.RMS = window.RMS || {};

(function () {
  const now = Date.now();
  const min = 60 * 1000;

  RMS.SEED = {
    version: 3,
    settings: {
      // Open question for the client: when someone is in a private space, should the
      // dashboard show nothing (false) or their last position before entering (true)?
      showLastKnownWhenPaused: false,
      // How long the demo drive between warehouses takes, in seconds.
      transitSeconds: 45,
    },

    sites: [
      {
        id: 'WH-01', name: 'Warehouse 1', area: 'North Harbor',
        lat: 14.6095, lng: 120.9605,
        gate: [8, 50],
        rooms: [
          { name: 'Storage hall', x: 16, y: 4, w: 52, h: 34 },
          { name: 'Loading bays', x: 16, y: 38, w: 52, h: 16 },
          { name: 'Office', x: 70, y: 4, w: 26, h: 18 },
          { name: 'Comfort rooms', x: 70, y: 22, w: 12, h: 12 },
          { name: 'Clinic', x: 82, y: 22, w: 14, h: 12 },
          { name: 'Break room', x: 70, y: 34, w: 26, h: 20 },
          { name: 'Guard post', x: 2, y: 44, w: 12, h: 12 },
        ],
      },
      {
        id: 'WH-02', name: 'Warehouse 2', area: 'Valenzuela',
        lat: 14.7004, lng: 120.9831,
        gate: [92, 50],
        rooms: [
          { name: 'Cold storage', x: 4, y: 4, w: 30, h: 30 },
          { name: 'Dry storage', x: 34, y: 4, w: 40, h: 30 },
          { name: 'Unloading bays', x: 4, y: 34, w: 70, h: 18 },
          { name: 'Comfort rooms', x: 76, y: 4, w: 20, h: 12 },
          { name: 'Office', x: 76, y: 16, w: 20, h: 18 },
          { name: 'Guard post', x: 86, y: 44, w: 12, h: 12 },
        ],
      },
    ],

    // type: 'private'    → location is not shared while inside (comfort rooms, clinic…)
    //       'restricted' → visitors inside raise an alert
    //       'general'    → just a labelled area
    zones: [
      { id: 'Z1', siteId: 'WH-01', name: 'Comfort rooms', type: 'private', points: [[70, 22], [82, 22], [82, 34], [70, 34]] },
      { id: 'Z2', siteId: 'WH-01', name: 'Clinic', type: 'private', points: [[82, 22], [96, 22], [96, 34], [82, 34]] },
      { id: 'Z3', siteId: 'WH-01', name: 'High-value cage', type: 'restricted', points: [[50, 6], [66, 6], [66, 20], [50, 20]] },
      { id: 'Z4', siteId: 'WH-02', name: 'Comfort rooms', type: 'private', points: [[76, 4], [96, 4], [96, 16], [76, 16]] },
      { id: 'Z5', siteId: 'WH-02', name: 'Cold storage', type: 'restricted', points: [[4, 4], [34, 4], [34, 34], [4, 34]] },
    ],

    /*
     * People with `sim` move on their own (computed from the clock, so every open tab
     * agrees without anyone saving positions). People without `sim` are moved from
     * the phone demo page, and their `live` record is what their phone last sent.
     * Path points are [x, y] or [x, y, secondsToWait].
     */
    people: [
      { id: 'P01', name: 'Maria Santos', role: 'employee', siteId: 'WH-01',
        sim: { speed: 3, offset: 0, path: [[24, 12], [44, 30, 3], [66, 30], [76, 28, 8], [66, 30], [80, 12, 5], [44, 12, 3]] } },
      { id: 'P02', name: 'Ramon Cruz', role: 'employee', siteId: 'WH-01',
        sim: { speed: 4, offset: 7, path: [[20, 44], [64, 44, 2], [64, 50], [20, 50, 2]] } },
      { id: 'P03', name: 'Liza Reyes', role: 'visitor', siteId: 'WH-01',
        sim: { speed: 2.5, offset: 11, path: [[84, 10, 4], [84, 42, 6], [58, 14, 4], [84, 10]] } },
      { id: 'P05', name: 'Ana Lim', role: 'employee', siteId: 'WH-02',
        sim: { speed: 3, offset: 3, path: [[10, 40], [30, 28, 4], [60, 20, 3], [84, 10, 6], [86, 24, 5], [50, 44]] } },
      { id: 'P06', name: 'Carlo Mendoza', role: 'visitor', siteId: 'WH-02',
        sim: { speed: 2, offset: 20, path: [[86, 26, 6], [60, 44, 4], [20, 20, 3], [86, 26]] } },
      { id: 'D02', name: 'Paolo Garcia', role: 'driver', siteId: null,
        sim: { transit: { tripId: 'TRP-1039', from: 'WH-02', to: 'WH-01', startedAt: now, duration: 4 * min, loop: true } } },

      // Controlled from phone.html
      { id: 'D01', name: 'Juan Bautista', role: 'driver', siteId: 'WH-01',
        live: { kind: 'site', siteId: 'WH-01', x: 8, y: 52, at: now } },
      { id: 'E01', name: 'Bea Navarro', role: 'employee', siteId: 'WH-01',
        live: { kind: 'site', siteId: 'WH-01', x: 30, y: 30, at: now } },
      { id: 'P04', name: 'Jun Dela Cruz', role: 'guard', siteId: 'WH-01',
        live: { kind: 'site', siteId: 'WH-01', x: 8, y: 48, at: now } },
      { id: 'P07', name: 'Mark Villanueva', role: 'guard', siteId: 'WH-02',
        live: { kind: 'site', siteId: 'WH-02', x: 92, y: 48, at: now } },
    ],

    /*
     * A trip is a list of phases (stops). At each stop the driver checks in at the gate
     * and the guard of that site approves before the driver can move on.
     * phase.status: 'upcoming' → 'arrived' (waiting for guard) → 'approved' | 'rejected'
     */
    trips: [
      { id: 'TRP-1042', driverId: 'D01', vehicle: 'Truck NBC 4821', cargo: '18 pallets · dry goods',
        transit: null,
        phases: [
          { siteId: 'WH-01', label: 'Pickup', status: 'arrived', arrivedAt: now - 4 * min },
          { siteId: 'WH-02', label: 'Drop-off', status: 'upcoming' },
        ] },
      { id: 'TRP-1039', driverId: 'D02', vehicle: 'Truck WTR 1187', cargo: '6 pallets · chilled',
        transit: { from: 'WH-02', to: 'WH-01' },
        phases: [
          { siteId: 'WH-02', label: 'Pickup', status: 'approved', arrivedAt: now - 38 * min, approvedAt: now - 31 * min, approvedBy: 'Mark Villanueva' },
          { siteId: 'WH-01', label: 'Drop-off', status: 'upcoming' },
        ] },
    ],

    // Activity log. Note: entering or leaving a private space is never logged,
    // because "who was in the comfort room and when" is itself sensitive.
    events: [
      { t: now - 4 * min, kind: 'checkin', text: 'Juan Bautista checked in at Warehouse 1 (TRP-1042 · Pickup). Waiting for guard.' },
      { t: now - 31 * min, kind: 'approve', text: 'Mark Villanueva approved Pickup at Warehouse 2 for TRP-1039.' },
      { t: now - 38 * min, kind: 'checkin', text: 'Paolo Garcia checked in at Warehouse 2 (TRP-1039 · Pickup).' },
    ],
  };
})();
