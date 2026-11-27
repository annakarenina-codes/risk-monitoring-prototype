# Risk Management Monitoring System: prototype

A clickable prototype in plain HTML, CSS and JavaScript (no framework, no build step).
It tracks employees, visitors and drivers across two warehouses, hides people's location
inside private spaces, and runs the driver → guard approval flow.

## Run it

Serve the folder with any static server and open `index.html`:

```powershell
python -m http.server 5510
```

Then go to <http://localhost:5510>. VS Code's Live Server extension or `npx serve` work too.
Opening the files directly (double-click) hasn't been tested. Use a server so the map and the
live sync between tabs work.

The map, icons and font load from CDNs, so you need an internet connection.

## Demo script

1. Open **Live map** (`index.html`) and click **Phone demo** in the top bar. Put the two windows side by side.
2. Phone: sign in as **Jun Dela Cruz (Guard)** → **Approve** Juan's pickup.
3. Phone: switch to **Juan Bautista (Driver)** → **Depart to Warehouse 2**. Watch the truck move on the map
   and the trip stepper fill in.
4. When the drive finishes (45 s), **Check in at Warehouse 2 gate** → sign in as **Mark Villanueva (Guard)** → **Approve**.
5. Phone: sign in as **Bea Navarro (Employee)** and tap inside **Comfort rooms**. The phone says
   "Paused · private space", and on the dashboard she drops off the floor plan and counts under **Location paused**.
6. **Sites & zones**: click **Draw new zone**, click the corners, name it, pick **Private**. Anyone who walks into it
   is hidden from then on.
7. **Reset** in the top bar puts everything back to the start.

## Pages

| File | What it is |
|---|---|
| `index.html` | Live map: KPIs, sites with head counts, drivers on the road, people list, activity, trip stepper |
| `site.html` | Floor plan per site with live people, plus the zone editor (draw, rename, reshape, delete) |
| `trips.html` | Approval queue and every trip's phases |
| `phone.html` | Stand-in for the iOS/Android app: employee, driver and guard views |

## Code layout

| File | Role |
|---|---|
| `js/data.js` | Seed data: sites, floor plans, zones, people, trips. Edit this to change the demo. |
| `js/store.js` | Fake backend: state in `localStorage`, synced live across tabs with `BroadcastChannel`. Swap this for API + WebSocket calls later. |
| `js/live.js` | Works out where everyone is right now, plus geometry (point-in-zone) and trip status |
| `js/actions.js` | Check in, depart, approve, reject, report location (future API calls) |
| `js/ui.js` | Top bar, badges, trip stepper, formatting |
| `js/plan.js` | Floor plan SVG drawing, shared by the site page and the phone |
| `js/dashboard.js`, `js/site.js`, `js/trips.js`, `js/phone.js` | One script per page |
| `css/styles.css` | All styles |

Libraries (from CDNs): MapLibre GL JS 4.7.1 with OpenFreeMap tiles (free, no API key), Lucide icons, Inter font.

## Design choices worth knowing

- **Privacy is decided on the phone.** Inside a private zone the phone sends only `{ kind: 'paused' }` with no
  coordinates (`js/phone.js`, `report()`), so the server never holds the position. Entering or leaving a private
  zone is not written to the activity log either, because that timeline is itself sensitive.
- **The map shows head counts per site, not dots per person.** Phone GPS indoors is often 5–30 m off, so
  individual positions only appear on the floor plan, where the real system would use better indoor positioning.
- **2D first.** The floor plan and zone editor are SVG. The **tilt** button on the map gives a 2.5D look. A Three.js
  3D site view could be added later as a separate page without touching the rest.
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
