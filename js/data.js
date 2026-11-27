/*
 * Seed data for the prototype.
 * Everything here is made up. Edit freely; bump `version` so browsers that
 * already saved older data reset to this seed on their next load.
 *
 * Each site has its own local grid in metres: x runs 0 → size.w, y runs 0 → size.d.
 * In 3D, x stays x and y becomes depth (z), 1 unit = 1 metre. In the real system each
 * site would be georeferenced so phone coordinates can be converted into this grid.
 *
 * Rooms are rectangles. Doors are gaps in a room's wall:
 *   { side: 'n' | 's' | 'e' | 'w', at: metres from the wall's start (left or top), width }
 * A door on a wall two rooms share opens it for both.
 *
 * A site can have several buildings: { id, name, x, y, w, h }. Each is a floor slab and a roof
 * in 3D; rooms inside one share it, rooms outside every building get their own.
 *
 * Roads and parking areas are rectangles too: { id, x, y, w, h }. A parking area also has
 * { name, kind: 'loading' | 'unloading' | 'any', entry: 'n' | 's' | 'e' | 'w' }. Trucks drive
 * along the roads and back into a 4 m slot, entering from the `entry` side.
 *
 * The gate: { name, x, y, width, rotation } where rotation 0 runs left–right and 90 runs
 * up–down. Drivers check in there. (Older saved data stored it as [x, y]; RMS.geo.gate() reads both.)
 */
window.RMS = window.RMS || {};

(function () {
  const now = Date.now();
  const min = 60 * 1000;

  RMS.SEED = {
    version: 8,
    settings: {
      // Open question for the client: when someone is in a private space, should the
      // dashboard show nothing (false) or their last position before entering (true)?
      showLastKnownWhenPaused: false,
    },

    sites: [
      {
        id: 'WH-01', name: 'Warehouse 1', area: 'North Harbor',
        lat: 14.6095, lng: 120.9605,
        size: { w: 100, d: 80 },
        wallHeight: 4,
        buildings: [{ id: 'B1', name: 'Warehouse 1', x: 16, y: 4, w: 80, h: 50 }],
        gate: { name: 'Main gate', x: 20, y: 80, width: 8, rotation: 0 },
        roads: [
          { id: 'RD1', x: 4, y: 69, w: 92, h: 6 },
          { id: 'RD2', x: 16, y: 75, w: 8, h: 5 },
        ],
        parking: [
          { id: 'PK1', name: 'Unloading dock', kind: 'unloading', entry: 's', x: 18, y: 55, w: 24, h: 12 },
          { id: 'PK2', name: 'Loading dock', kind: 'loading', entry: 's', x: 44, y: 55, w: 24, h: 12 },
          { id: 'PK3', name: 'Yard parking', kind: 'any', entry: 's', x: 72, y: 56, w: 20, h: 11 },
        ],
        rooms: [
          { id: 'R1', name: 'Storage hall', x: 16, y: 4, w: 52, h: 34, doors: [{ side: 's', at: 20, width: 6 }, { side: 'e', at: 26, width: 3 }] },
          { id: 'R2', name: 'Loading bays', x: 16, y: 38, w: 52, h: 16, doors: [{ side: 's', at: 8, width: 8 }, { side: 's', at: 30, width: 8 }] },
          { id: 'R3', name: 'Office', x: 70, y: 4, w: 26, h: 18, doors: [{ side: 'w', at: 12, width: 2 }] },
          { id: 'R4', name: 'Comfort rooms', x: 70, y: 22, w: 12, h: 12, doors: [{ side: 'w', at: 6, width: 2 }] },
          { id: 'R5', name: 'Clinic', x: 82, y: 22, w: 14, h: 12, doors: [{ side: 's', at: 5, width: 2 }] },
          { id: 'R6', name: 'Break room', x: 70, y: 34, w: 26, h: 20, doors: [{ side: 'w', at: 4, width: 3 }] },
          { id: 'R7', name: 'Guard post', x: 2, y: 44, w: 12, h: 12, doors: [{ side: 'e', at: 4, width: 2 }] },
        ],
      },
      {
        id: 'WH-02', name: 'Warehouse 2', area: 'Valenzuela',
        lat: 14.7004, lng: 120.9831,
        size: { w: 100, d: 80 },
        wallHeight: 4,
        buildings: [{ id: 'B1', name: 'Warehouse 2', x: 4, y: 4, w: 92, h: 48 }],
        gate: { name: 'Main gate', x: 80, y: 80, width: 8, rotation: 0 },
        roads: [
          { id: 'RD1', x: 4, y: 67, w: 92, h: 6 },
          { id: 'RD2', x: 76, y: 73, w: 8, h: 7 },
        ],
        parking: [
          { id: 'PK1', name: 'Truck dock', kind: 'any', entry: 's', x: 8, y: 53, w: 48, h: 12 },
        ],
        rooms: [
          { id: 'R1', name: 'Cold storage', x: 4, y: 4, w: 30, h: 30, doors: [{ side: 's', at: 12, width: 4 }] },
          { id: 'R2', name: 'Dry storage', x: 34, y: 4, w: 40, h: 30, doors: [{ side: 's', at: 16, width: 6 }] },
          { id: 'R3', name: 'Unloading bays', x: 4, y: 34, w: 70, h: 18, doors: [{ side: 's', at: 10, width: 8 }, { side: 's', at: 40, width: 8 }] },
          { id: 'R4', name: 'Comfort rooms', x: 76, y: 4, w: 20, h: 12, doors: [{ side: 'w', at: 5, width: 2 }] },
          { id: 'R5', name: 'Office', x: 76, y: 16, w: 20, h: 18, doors: [{ side: 'w', at: 8, width: 2 }] },
          { id: 'R6', name: 'Guard post', x: 86, y: 53, w: 10, h: 6, doors: [{ side: 'w', at: 2, width: 2 }] },
        ],
      },
      {
        // A larger site with several buildings: two warehouses, cold storage, admin and maintenance.
        id: 'WH-03', name: 'Logistics Hub', area: 'Calamba, Laguna',
        lat: 14.2117, lng: 121.1653,
        size: { w: 200, d: 140 },
        wallHeight: 5,
        buildings: [
          { id: 'B1', name: 'Warehouse A', x: 12, y: 24, w: 72, h: 44 },
          { id: 'B2', name: 'Warehouse B', x: 116, y: 24, w: 72, h: 44 },
          { id: 'B3', name: 'Cold storage', x: 88, y: 30, w: 24, h: 28 },
          { id: 'B4', name: 'Admin building', x: 130, y: 104, w: 30, h: 20 },
          { id: 'B5', name: 'Maintenance', x: 30, y: 104, w: 30, h: 22 },
        ],
        gate: { name: 'Main gate', x: 100, y: 140, width: 10, rotation: 0 },
        roads: [
          { id: 'RD1', x: 96, y: 86, w: 8, h: 54 },
          { id: 'RD2', x: 8, y: 80, w: 184, h: 6 },
          { id: 'RD3', x: 90, y: 73, w: 20, h: 7 },
        ],
        parking: [
          { id: 'PK1', name: 'Dock A', kind: 'loading', entry: 's', x: 16, y: 69, w: 64, h: 10 },
          { id: 'PK2', name: 'Dock B', kind: 'unloading', entry: 's', x: 120, y: 69, w: 64, h: 10 },
          { id: 'PK3', name: 'Cold dock', kind: 'any', entry: 's', x: 90, y: 59, w: 20, h: 14 },
        ],
        rooms: [
          // Warehouse A
          { id: 'R1', name: 'Storage A', x: 12, y: 24, w: 60, h: 28, doors: [{ side: 's', at: 28, width: 8 }] },
          { id: 'R2', name: 'Loading bays A', x: 12, y: 52, w: 72, h: 16, doors: [{ side: 's', at: 8, width: 8 }, { side: 's', at: 30, width: 8 }, { side: 's', at: 52, width: 8 }] },
          { id: 'R3', name: 'Comfort rooms A', x: 72, y: 24, w: 12, h: 10, doors: [{ side: 'w', at: 4, width: 2 }] },
          { id: 'R4', name: 'Office A', x: 72, y: 34, w: 12, h: 18, doors: [{ side: 'w', at: 8, width: 2 }] },
          // Warehouse B
          { id: 'R5', name: 'Storage B', x: 116, y: 24, w: 60, h: 28, doors: [{ side: 's', at: 28, width: 8 }] },
          { id: 'R6', name: 'Unloading bays B', x: 116, y: 52, w: 72, h: 16, doors: [{ side: 's', at: 8, width: 8 }, { side: 's', at: 30, width: 8 }, { side: 's', at: 52, width: 8 }] },
          { id: 'R7', name: 'Comfort rooms B', x: 176, y: 24, w: 12, h: 10, doors: [{ side: 'w', at: 4, width: 2 }] },
          { id: 'R8', name: 'Office B', x: 176, y: 34, w: 12, h: 18, doors: [{ side: 'w', at: 8, width: 2 }] },
          // Cold storage
          { id: 'R9', name: 'Cold room', x: 88, y: 30, w: 24, h: 18, doors: [{ side: 's', at: 8, width: 8 }] },
          { id: 'R10', name: 'Cold dock bay', x: 88, y: 48, w: 24, h: 10, doors: [{ side: 's', at: 8, width: 8 }] },
          // Admin building
          { id: 'R11', name: 'Reception', x: 130, y: 104, w: 12, h: 20, doors: [{ side: 's', at: 4, width: 3 }, { side: 'e', at: 4, width: 2 }] },
          { id: 'R12', name: 'Admin office', x: 142, y: 104, w: 18, h: 12, doors: [] },
          { id: 'R13', name: 'Clinic', x: 142, y: 116, w: 10, h: 8, doors: [{ side: 'n', at: 3, width: 2 }] },
          { id: 'R14', name: 'Comfort rooms', x: 152, y: 116, w: 8, h: 8, doors: [{ side: 'n', at: 3, width: 2 }] },
          // Maintenance
          { id: 'R15', name: 'Workshop', x: 30, y: 104, w: 22, h: 22, doors: [{ side: 'n', at: 8, width: 6 }] },
          { id: 'R16', name: 'Tool room', x: 52, y: 104, w: 8, h: 10, doors: [{ side: 'w', at: 4, width: 2 }] },
          { id: 'R17', name: 'Forklift charging', x: 52, y: 114, w: 8, h: 12, doors: [{ side: 'w', at: 4, width: 2 }] },
          // At the gate
          { id: 'R18', name: 'Guard house', x: 106, y: 128, w: 10, h: 8, doors: [{ side: 'w', at: 3, width: 2 }] },
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
      { id: 'Z31', siteId: 'WH-03', name: 'Comfort rooms A', type: 'private', points: [[72, 24], [84, 24], [84, 34], [72, 34]] },
      { id: 'Z32', siteId: 'WH-03', name: 'Comfort rooms B', type: 'private', points: [[176, 24], [188, 24], [188, 34], [176, 34]] },
      { id: 'Z33', siteId: 'WH-03', name: 'Clinic', type: 'private', points: [[142, 116], [152, 116], [152, 124], [142, 124]] },
      { id: 'Z34', siteId: 'WH-03', name: 'Comfort rooms', type: 'private', points: [[152, 116], [160, 116], [160, 124], [152, 124]] },
      { id: 'Z35', siteId: 'WH-03', name: 'Cold room', type: 'restricted', points: [[88, 30], [112, 30], [112, 48], [88, 48]] },
      { id: 'Z36', siteId: 'WH-03', name: 'High-value racks', type: 'restricted', points: [[150, 26], [174, 26], [174, 38], [150, 38]] },
    ],

    /*
     * People with `sim` move on their own (computed from the clock, so every open tab
     * agrees without anyone saving positions). People without `sim` are moved from
     * the phone demo page, and their `live` record is what their phone last sent.
     *
     * Path points are [x, y], [x, y, secondsToWait] or [x, y, secondsToWait, 'Activity'].
     * The activity is the person's status while they are at that point or heading to it
     * ("Picking", "On break"...). Phone users set their status on the phone instead, and
     * drivers' status comes from their trip phase.
     */
    people: [
      // Warehouse 1
      { id: 'P01', name: 'Maria Santos', role: 'employee', siteId: 'WH-01',
        sim: { speed: 3, offset: 0, path: [[24, 12, 6, 'Picking'], [44, 30, 4, 'Packing'], [66, 30], [76, 28, 8], [66, 30], [80, 12, 6, 'Admin work'], [44, 12, 4, 'Picking']] } },
      { id: 'P02', name: 'Ramon Cruz', role: 'employee', siteId: 'WH-01',
        sim: { speed: 4, offset: 7, path: [[20, 44, 4, 'Loading'], [64, 44, 4, 'Loading'], [64, 50, 2, 'Loading'], [20, 50, 4, 'Loading']] } },
      { id: 'P03', name: 'Liza Reyes', role: 'visitor', siteId: 'WH-01',
        sim: { speed: 2.5, offset: 11, path: [[84, 10, 6, 'In a meeting'], [84, 42, 6, 'Waiting'], [58, 14, 4, 'Site tour'], [84, 10]] } },
      { id: 'P08', name: 'Joy Mercado', role: 'employee', siteId: 'WH-01',
        sim: { speed: 2, offset: 4, path: [[76, 8, 30, 'Admin work'], [86, 14, 20, 'Admin work'], [69, 17], [69, 40], [80, 44, 25, 'On break'], [69, 40], [69, 17]] } },
      { id: 'P09', name: 'Dante Villareal', role: 'employee', siteId: 'WH-01',
        sim: { speed: 3, offset: 15, path: [[24, 48, 15, 'Unloading'], [52, 48, 15, 'Loading'], [40, 42, 8, 'Checking stock']] } },
      { id: 'P10', name: 'Kim Soriano', role: 'employee', siteId: 'WH-01',
        sim: { speed: 3, offset: 9, path: [[30, 8, 12, 'Picking'], [30, 32, 12, 'Picking'], [46, 32, 10, 'Packing'], [44, 24, 10, 'Picking']] } },

      // Warehouse 2
      { id: 'P05', name: 'Ana Lim', role: 'employee', siteId: 'WH-02',
        sim: { speed: 3, offset: 3, path: [[10, 40, 4, 'Unloading'], [30, 28, 4, 'Checking stock'], [60, 20, 3, 'Picking'], [84, 10, 6], [86, 24, 5, 'Admin work'], [50, 44, 4, 'Loading']] } },
      { id: 'P06', name: 'Carlo Mendoza', role: 'visitor', siteId: 'WH-02',
        sim: { speed: 2, offset: 20, path: [[86, 26, 6, 'In a meeting'], [60, 44, 4, 'Site tour'], [20, 20, 3, 'Site tour'], [86, 26]] } },
      { id: 'P12', name: 'Ben Aquino', role: 'employee', siteId: 'WH-02',
        sim: { speed: 3, offset: 5, path: [[40, 10, 12, 'Picking'], [68, 10, 12, 'Picking'], [68, 28, 10, 'Packing'], [40, 28, 10, 'Picking']] } },
      { id: 'P13', name: 'Rosa Dizon', role: 'employee', siteId: 'WH-02',
        sim: { speed: 3, offset: 12, path: [[14, 46, 15, 'Loading'], [40, 44, 15, 'Staging pallets'], [64, 44, 10, 'Checking stock']] } },
      { id: 'P14', name: 'Leo Castro', role: 'employee', siteId: 'WH-02',
        sim: { speed: 2, offset: 2, path: [[82, 22, 30, 'Admin work'], [92, 28, 20, 'Admin work']] } },

      // Logistics Hub (WH-03)
      { id: 'P21', name: 'Joel Manalo', role: 'employee', siteId: 'WH-03',
        sim: { speed: 3, offset: 2, path: [[24, 30, 10, 'Picking'], [60, 30, 10, 'Picking'], [60, 46, 8, 'Packing'], [24, 46, 8, 'Picking']] } },
      { id: 'P22', name: 'Cris Bautista', role: 'employee', siteId: 'WH-03',
        sim: { speed: 3, offset: 9, path: [[20, 60, 12, 'Loading'], [50, 62, 12, 'Loading'], [76, 60, 8, 'Checking stock']] } },
      { id: 'P23', name: 'Lea Domingo', role: 'employee', siteId: 'WH-03',
        sim: { speed: 3, offset: 4, path: [[124, 30, 10, 'Picking'], [144, 44, 10, 'Packing'], [130, 46, 8, 'Picking']] } },
      { id: 'P24', name: 'Noel Rivera', role: 'employee', siteId: 'WH-03',
        sim: { speed: 3, offset: 14, path: [[126, 60, 12, 'Unloading'], [160, 62, 12, 'Unloading'], [180, 58, 8, 'Checking stock']] } },
      { id: 'P25', name: 'Tess Aquino', role: 'employee', siteId: 'WH-03',
        sim: { speed: 2, offset: 6, path: [[150, 108, 30, 'Admin work'], [136, 112, 20, 'At reception']] } },
      { id: 'P26', name: 'Rico Valdez', role: 'employee', siteId: 'WH-03',
        sim: { speed: 2, offset: 3, path: [[38, 112, 25, 'Repairing forklift'], [56, 120, 15, 'Charging forklifts'], [56, 108, 10, 'Getting tools']] } },
      { id: 'P27', name: 'Mika Santos', role: 'visitor', siteId: 'WH-03',
        sim: { speed: 2, offset: 18, path: [[136, 112, 20, 'Waiting'], [100, 90, 6, 'Site tour'], [46, 40, 6, 'Site tour'], [100, 90, 4, 'Site tour']] } },
      { id: 'P28', name: 'Ben Cruz', role: 'employee', siteId: 'WH-03',
        sim: { speed: 2.5, offset: 7, path: [[96, 36, 12, 'Picking'], [104, 52, 10, 'Loading'], [106, 40, 10, 'Checking stock']] } },
      { id: 'P29', name: 'Ramil Ortiz', role: 'guard', siteId: 'WH-03',
        sim: { speed: 1.5, offset: 0, path: [[100, 120, 20, 'On patrol'], [60, 92, 10, 'On patrol'], [100, 90, 6, 'On patrol'], [160, 92, 10, 'On patrol']] } },
      { id: 'O05', name: 'Jomar Reyes', role: 'employee', siteId: 'WH-03', rides: 'FL-05' },
      { id: 'O06', name: 'Ivy Navarro', role: 'employee', siteId: 'WH-03', rides: 'FL-06' },
      { id: 'O07', name: 'Paul Sison', role: 'employee', siteId: 'WH-03', rides: 'FL-07' },

      // On the road between sites (not shown on the live monitor)
      { id: 'D02', name: 'Paolo Garcia', role: 'driver', siteId: null,
        sim: { transit: { tripId: 'TRP-1039', from: 'WH-02', to: 'WH-01', startedAt: now - 30 * min } } },

      // Forklift operators: they ride their forklift, so their position is the forklift's.
      { id: 'O01', name: 'Arnel Pascual', role: 'employee', siteId: 'WH-01', rides: 'FL-01' },
      { id: 'O02', name: 'Grace Tan', role: 'employee', siteId: 'WH-01', rides: 'FL-02' },
      { id: 'O03', name: 'Ruel Ocampo', role: 'employee', siteId: 'WH-02', rides: 'FL-03' },
      { id: 'O04', name: 'Mae Flores', role: 'employee', siteId: 'WH-02', rides: 'FL-04' },

      // Controlled from phone.html
      { id: 'D01', name: 'Juan Bautista', role: 'driver', siteId: 'WH-01',
        live: { kind: 'site', siteId: 'WH-01', x: 8, y: 52, at: now } },
      { id: 'D03', name: 'Lito Ramos', role: 'driver', siteId: 'WH-02',
        live: { kind: 'site', siteId: 'WH-02', x: 24, y: 55, at: now } },
      { id: 'D04', name: 'Ely Santos', role: 'driver', siteId: 'WH-01',
        live: { kind: 'site', siteId: 'WH-01', x: 34, y: 57, at: now } },
      { id: 'P30', name: 'Arvin Lopez', role: 'guard', siteId: 'WH-03', status: 'At gate post',
        live: { kind: 'site', siteId: 'WH-03', x: 110, y: 132, at: now } },
      { id: 'D05', name: 'Dennis Uy', role: 'driver', siteId: 'WH-03',
        live: { kind: 'site', siteId: 'WH-03', x: 140, y: 82, at: now } },
      { id: 'D06', name: 'Gina Pascua', role: 'driver', siteId: 'WH-03',
        live: { kind: 'site', siteId: 'WH-03', x: 98, y: 134, at: now } },
      { id: 'E01', name: 'Bea Navarro', role: 'employee', siteId: 'WH-01', status: 'Checking stock',
        live: { kind: 'site', siteId: 'WH-01', x: 30, y: 30, at: now } },
      { id: 'P04', name: 'Jun Dela Cruz', role: 'guard', siteId: 'WH-01', status: 'At gate post',
        live: { kind: 'site', siteId: 'WH-01', x: 8, y: 48, at: now } },
      { id: 'P07', name: 'Mark Villanueva', role: 'guard', siteId: 'WH-02', status: 'At gate post',
        live: { kind: 'site', siteId: 'WH-02', x: 90, y: 56, at: now } },
    ],

    /*
     * Equipment. A forklift with a `job` shuttles pallets between two rooms (by room id):
     * it picks up just inside the dock doors of a loading/unloading bay, or along a row in a
     * storage room, and finds its own way through the doors. Its operator is the person whose
     * `rides` is the forklift's id.
     */
    assets: [
      { id: 'FL-01', type: 'forklift', name: 'Forklift FL-01', siteId: 'WH-01', job: { from: 'R2', to: 'R1' }, speed: 2.5, offset: 0 },
      { id: 'FL-02', type: 'forklift', name: 'Forklift FL-02', siteId: 'WH-01', job: { from: 'R1', to: 'R2' }, speed: 2.2, offset: 17 },
      { id: 'FL-03', type: 'forklift', name: 'Forklift FL-03', siteId: 'WH-02', job: { from: 'R3', to: 'R2' }, speed: 2.5, offset: 5 },
      { id: 'FL-05', type: 'forklift', name: 'Forklift FL-05', siteId: 'WH-03', job: { from: 'R2', to: 'R1' }, speed: 2.5, offset: 3 },
      { id: 'FL-06', type: 'forklift', name: 'Forklift FL-06', siteId: 'WH-03', job: { from: 'R6', to: 'R5' }, speed: 2.5, offset: 11 },
      { id: 'FL-07', type: 'forklift', name: 'Forklift FL-07', siteId: 'WH-03', job: { from: 'R10', to: 'R9' }, speed: 2, offset: 6 },
      { id: 'FL-04', type: 'forklift', name: 'Forklift FL-04', siteId: 'WH-02', job: { from: 'R3', to: 'R1' }, speed: 2.2, offset: 23 },
    ],

    /*
     * A trip is a list of phases (stops). At each stop the driver checks in at the gate
     * and the guard of that site approves before the driver can move on.
     * phase.status: 'upcoming' -> 'arrived' (waiting for guard) -> 'approved' | 'rejected'
     * On the live monitor a truck waits outside the gate while 'arrived', then backs up to a
     * loading-bay door once 'approved', until the driver departs.
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
      { id: 'TRP-1045', driverId: 'D03', vehicle: 'Truck ABK 3390', cargo: '12 pallets · frozen goods',
        transit: null,
        phases: [
          { siteId: 'WH-02', label: 'Pickup', status: 'approved', arrivedAt: now - 14 * min, approvedAt: now - 9 * min, approvedBy: 'Mark Villanueva' },
          { siteId: 'WH-01', label: 'Drop-off', status: 'upcoming' },
        ] },
      { id: 'TRP-1046', driverId: 'D04', vehicle: 'Truck NDA 7712', cargo: '20 pallets · beverages',
        transit: null,
        phases: [
          { siteId: 'WH-01', label: 'Drop-off', status: 'approved', arrivedAt: now - 25 * min, approvedAt: now - 20 * min, approvedBy: 'Jun Dela Cruz' },
          { siteId: 'WH-02', label: 'Pickup', status: 'upcoming' },
        ] },
      { id: 'TRP-1050', driverId: 'D05', vehicle: 'Truck LGN 2045', cargo: '24 pallets · canned goods',
        transit: null,
        phases: [
          { siteId: 'WH-03', label: 'Drop-off', status: 'approved', arrivedAt: now - 12 * min, approvedAt: now - 6 * min, approvedBy: 'Arvin Lopez' },
          { siteId: 'WH-01', label: 'Pickup', status: 'upcoming' },
        ] },
      { id: 'TRP-1051', driverId: 'D06', vehicle: 'Truck CLB 7310', cargo: '10 pallets · frozen seafood',
        transit: null,
        phases: [
          { siteId: 'WH-03', label: 'Pickup', status: 'arrived', arrivedAt: now - 3 * min },
          { siteId: 'WH-02', label: 'Drop-off', status: 'upcoming' },
        ] },
    ],

    // Activity log. Note: entering or leaving a private space is never logged,
    // because "who was in the comfort room and when" is itself sensitive.
    events: [
      { t: now - 3 * min, kind: 'checkin', text: 'Gina Pascua checked in at Logistics Hub (TRP-1051 · Pickup). Waiting for guard.' },
      { t: now - 6 * min, kind: 'approve', text: 'Arvin Lopez approved Drop-off at Logistics Hub for TRP-1050.' },
      { t: now - 12 * min, kind: 'checkin', text: 'Dennis Uy checked in at Logistics Hub (TRP-1050 · Drop-off).' },
      { t: now - 4 * min, kind: 'checkin', text: 'Juan Bautista checked in at Warehouse 1 (TRP-1042 · Pickup). Waiting for guard.' },
      { t: now - 9 * min, kind: 'approve', text: 'Mark Villanueva approved Pickup at Warehouse 2 for TRP-1045.' },
      { t: now - 14 * min, kind: 'checkin', text: 'Lito Ramos checked in at Warehouse 2 (TRP-1045 · Pickup).' },
      { t: now - 20 * min, kind: 'approve', text: 'Jun Dela Cruz approved Drop-off at Warehouse 1 for TRP-1046.' },
      { t: now - 25 * min, kind: 'checkin', text: 'Ely Santos checked in at Warehouse 1 (TRP-1046 · Drop-off).' },
      { t: now - 31 * min, kind: 'approve', text: 'Mark Villanueva approved Pickup at Warehouse 2 for TRP-1039.' },
      { t: now - 38 * min, kind: 'checkin', text: 'Paolo Garcia checked in at Warehouse 2 (TRP-1039 · Pickup).' },
    ],
  };
})();
