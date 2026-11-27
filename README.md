# Risk Management Monitoring System: prototype

A clickable prototype in plain HTML, CSS and JavaScript (no framework, no build step).
It tracks employees, visitors, drivers, forklifts and trucks across three sites, hides people's location
inside private spaces, and runs the driver → guard approval flow.

## Run it

Serve the folder with any static server and open `index.html`:

```powershell
python -m http.server 5510
```

Then go to <http://localhost:5510>. VS Code's Live Server extension or `npx serve` work too.
Opening `index.html` directly (double-click) also works, including the 3D view. A server is still the
safer choice for the live sync between tabs.

The 3D library (three.js), icons and font load from CDNs, so you need an internet connection.

## Demo script

1. Open **Live monitor** (`index.html`) and click **Phone demo** in the top bar. Put the two windows side by side.
2. Live monitor: a truck waits at the **Main gate** of Warehouse 1. Click it to see the trip, then **Approve** (or do it
   on the phone as **Jun Dela Cruz (Guard)**). Both update together.
3. Phone: switch to **Juan Bautista (Driver)** → **Depart to Warehouse 2**. He leaves the
   Warehouse 1 people list. Drivers between sites aren't shown on the live monitor; the Trips page has the trip.
4. Phone: **I've arrived: check in at Warehouse 2 gate** → sign in as **Mark Villanueva (Guard)** → **Approve**.
5. Phone: sign in as **Bea Navarro (Employee)** and tap inside **Comfort rooms**. The phone says
   "Paused · private space", and on the live monitor she drops off the people view and counts under **Location paused**.
6. **Configure** (Superadmin only), **Rooms** tab: drag a room to a new spot or **Add door**. Keep the live monitor open
   in another tab: the 3D model updates as soon as you let go.
7. **Configure**, **Zones** tab: click **Draw new zone**, click the corners, name it, pick **Private**. Anyone who walks
   into it is hidden from then on.
8. **Reset** in the top bar puts everything back to the start.

## Sites in the demo

| Site | Size | What's there |
|---|---|---|
| WH-01 · Warehouse 1 (North Harbor) | 100 × 80 m | One building: storage hall, loading bays, office, comfort rooms, clinic, break room; guard post; unloading, loading and yard parking |
| WH-02 · Warehouse 2 (Valenzuela) | 100 × 80 m | One building: cold and dry storage, unloading bays, office, comfort rooms; guard post; truck dock |
| WH-03 · Logistics Hub (Calamba, Laguna) | 200 × 140 m | Five buildings: Warehouse A, Warehouse B, Cold storage, Admin building, Maintenance; guard house; a road network with Dock A (loading), Dock B (unloading) and the Cold dock; 3 forklifts |

A site can have any number of buildings. Each is a floor slab and a roof in 3D; rooms outside every building
get their own. Add, move, rotate, rename or remove buildings in Configure.

## Pages

| File | What it is |
|---|---|
| `index.html` | Live monitor: a 3D model of the chosen site built from its Configure setup, with people, forklifts and trucks moving live, each with a status label. KPIs, a People / Equipment list and activity. Click anything to inspect it; waiting trucks can be approved or rejected there. No layout editing here |
| `site.html` | Configure (Superadmin only): each site's layout. **Add to site** buttons place ready-made rooms (room, storage room, loading bay, office, comfort room with its private zone), restricted areas, roads and parking areas; then move, resize, rotate 90°, rename or delete them. Also door gaps, building outline, gate, site size, wall height, and custom zones. Snaps to a 1 m grid |
| `trips.html` | Approval queue and every trip's phases |
| `phone.html` | Stand-in for the iOS/Android app: employee, driver and guard views |

## Statuses on the live monitor

| Who | Where the status comes from |
|---|---|
| Simulated employees and visitors | The activity on their path point (`js/data.js`): Picking, Packing, Loading, On break... |
| Phone users (employees, guards) | Picked on the phone under **My status** |
| Drivers | Their trip phase: "Pickup · waiting for guard", "Loading at bay", "Unloading at bay", "Trip complete" |
| Forklifts | Their job: Heading to Loading bays, Loading pallet, Carrying pallet to Storage hall, Unloading pallet |
| Forklift operators | "Driving FL-01". They ride the forklift, so their position is the forklift's |
| Trucks | From the trip: waiting outside the gate, then backed up to a loading-bay door once approved, until the driver departs |

Loading-bay doors are found automatically: outside doors of rooms whose name contains "load", "dock" or "bay".

**Pathfinding.** People and forklifts walk around walls and through doors: the site is a 1 m grid, walls block the
cell edges they sit on, and A* finds the route (`js/live.js`, `findPath`). Routes are worked out once per layout and
cached, so editing a room or door in Configure re-routes everyone straight away.

**Forklift jobs.** Each forklift has `job: { from, to }` (room ids) in `js/data.js`: it picks pallets up just inside a
bay's dock doors (or along a row in a storage room) and sets them down in the other room, carrying a visible pallet.
Its operator is the person with `rides: '<forklift id>'`.

**Roads and parking.** Roads and parking areas are rectangles added in Configure. A parking area is for loading,
unloading or any truck, and has an entry side (rotate it to change). When the guard approves a truck, it drives from
the gate along the roads (only on roads and parking areas), backs into a free 4 m slot of the right kind, and drives
back out when the driver departs. Positions come from the approval and departure times, so every tab agrees. Without
parking areas, trucks use the loading-bay doors as before. Forklifts prefer roads when they cross the yard.

**Roofs.** The house button on the live monitor shows or hides roofs (off by default, so you can see inside).
People in a private zone show only "Private space": no status, no room. The tag button on the live monitor hides or
shows the labels.

## Code layout

| File | Role |
|---|---|
| `js/data.js` | Seed data: sites, floor plans, zones, people, trips. Edit this to change the demo. |
| `js/store.js` | Fake backend: state in `localStorage`, synced live across tabs with `BroadcastChannel`. Swap this for API + WebSocket calls later. |
| `js/live.js` | Works out where everyone and everything is right now: people and their status, forklifts (`RMS.equipment`), trucks at a gate or loading bay (`RMS.trucks`), plus geometry (point-in-zone, walls with door gaps) and trip status |
| `js/actions.js` | Check in, depart, approve, reject, report location, and `RMS.config` site edits (future API calls) |
| `js/ui.js` | Theme (`RMS.theme`), role switcher, top bar, badges, trip stepper, formatting, and the tab-only 3D selection (`RMS.ui.selection`) |
| `js/plan.js` | Floor plan SVG drawing, shared by the site page and the phone |
| `js/scene3d.js` | The 3D site view (three.js). Loads three.js from the CDN with `import()`, then registers `RMS.scene3d` |
| `js/dashboard.js`, `js/site.js`, `js/trips.js`, `js/phone.js` | One script per page |
| `css/styles.css` | All styles. Every color is a variable on `:root` ("Harbor teal" theme) |

Libraries (from CDNs): three.js 0.170.0 (via an import map in `index.html`), Lucide icons 0.460.0, Inter font.

## Design choices worth knowing

- **Privacy is decided on the phone.** Inside a private zone the phone sends only `{ kind: 'paused', zoneId }` with no
  coordinates (`js/phone.js`, `report()`), so the server never holds the position. The live monitor shows each private
  zone as a frosted block with a head count ("2 inside") and never draws or names who is in it. Entering or leaving a
  private zone is not written to the activity log, because that timeline is itself sensitive.
  Trade-off (chosen on purpose): because the zone id is stored for the counts, the data does say which private
  zone a paused person is in, even though the UI never shows it. Remove `zoneId` to go back to per-site counts only.
- **`settings.showLastKnownWhenPaused`** (off by default, open client question): when on, the spot just before entering
  a private zone is kept and shown as a faded figure. When off, nothing is kept.
- **Drivers aren't tracked on the road.** After departing, the phone sends nothing until the driver checks in at the
  next gate, where the guard confirms arrival. The live monitor only shows who is at a site; the phone and the Trips
  page show the trip as "En route".
- **Roles are a prototype switch.** The top bar picks Superadmin or Admin (site officer), stored in the browser's
  `rms-role` key. Only Superadmins see Configure. This is not security; the real system needs login.
- **Configure in 2D, monitor in 3D.** The layout is edited precisely on an SVG plan (1 m grid). The 3D model on the
  live monitor is built from the same data and is never edited directly. Both read `RMS.store`, so an edit in one tab
  shows in the other straight away. Plan x is 3D x, plan y is 3D z, 1 unit = 1 m.
- Indoor positions need better indoor positioning than phone GPS (5–30 m off) in the real system.
- Simulated people move along fixed paths computed from the clock, so every open tab shows the same positions
  without saving them.

## Not in the prototype yet

- Real backend, login and roles (who may see whom)
- Real phone location (GPS, indoor positioning such as BLE beacons, or QR/NFC check-in points)
- Visitor registration and badges
- Creating trips from the UI (edit `js/data.js` for now)
- Multi-floor buildings
- Settings page (e.g. `showLastKnownWhenPaused` in `js/data.js` is a placeholder for an open client question)

## Open questions for the client

- Indoor tracking, outdoor tracking, or both?
- How many sites and floors, and are floor plans available?
- Is the "desktop version" the website, or a separate installed app?
- In a private space, should the dashboard show a gap, or the last known location?
