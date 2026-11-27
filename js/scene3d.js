/*
 * 3D site view (three.js), shown on the live monitor (index.html).
 *
 * Read-only. Everything is built from the site configuration in RMS.store (set up on the
 * Configure page) and rebuilt whenever that configuration changes, in this tab or another.
 * Coordinates: plan x → 3D x, plan y → 3D z, y is up, 1 unit = 1 metre.
 *
 * three.js is only published as ES modules. This file is a normal script that pulls them in
 * with import() from the CDN, so the page also works when opened straight from disk
 * (browsers refuse to load a local file as a module, but CDN modules are fine).
 * When ready it sets RMS.scene3d and fires 'rms:scene3d-ready', or 'rms:scene3d-failed'.
 *
 * People: positions come from RMS.live() every frame (no logic duplicated here). Only
 * records with kind 'site' are drawn. Paused (private zone) and offline people never are:
 * private zones show a head count instead, with no names.
 *
 * Clicking: people, rooms, zones, the gate and waiting trucks can be selected. The selection
 * lives in RMS.ui.selection (this tab only, never in the shared store).
 */
(function () {
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';

Promise.all([
  import(THREE_URL + 'build/three.module.js'),
  // These import 'three' themselves; the import map in index.html points that at the same file.
  import(THREE_URL + 'examples/jsm/controls/OrbitControls.js'),
  import(THREE_URL + 'examples/jsm/renderers/CSS2DRenderer.js'),
  import(THREE_URL + 'examples/jsm/geometries/RoundedBoxGeometry.js'),
]).then(([THREE, { OrbitControls }, { CSS2DRenderer, CSS2DObject }, { RoundedBoxGeometry }]) => {
const { RMS } = window;

const SLAB = 0.3; // building floor slab height
const WALL_T = 0.3; // wall thickness
const CAP = 0.18; // teal strip on top of the walls

const material = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.95, metalness: 0, ...extra });

/** Everything the 3D structure depends on, as a string, so we only rebuild when it changes. */
function structureKey(state, siteId) {
  const site = RMS.site(state, siteId);
  return JSON.stringify([site, state.zones.filter((z) => z.siteId === siteId)]);
}

/** A flat shape on the floor from plan points. Shape y is -plan y so rotating onto the floor gives z = plan y. */
function floorShape(points) {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, -y)));
}

function label(text, cls, chip) {
  const el = document.createElement('div');
  el.className = `label3d ${cls}`;
  const name = document.createElement('span');
  name.textContent = text;
  el.appendChild(name);
  if (chip) {
    const c = document.createElement('span');
    c.className = `chip ${chip.cls}`;
    c.textContent = chip.text;
    el.appendChild(c);
  }
  return new CSS2DObject(el);
}

const ZONE_CHIP = {
  private: { cls: 'private', text: 'Private' },
  restricted: { cls: 'restricted', text: 'Restricted' },
  general: null,
};

/**
 * Mount a 3D view into `container`. opts.padRight: pixels covered by a side panel,
 * so the site is centred in the part of the screen you can see.
 */
function mount(container, opts = {}) {
  const T = RMS.theme;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels3d';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.ground);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.45; // never look from below the ground
  controls.minDistance = 12;
  controls.maxDistance = 450;
  controls.autoRotateSpeed = 0.6;

  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(T.ground), 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), material(T.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  let siteId = null;
  let key = '';
  let group = null;
  let goal = null; // camera easing target { pos, target }
  let zoneFx = {}; // per zone, for live effects: private → count chip, restricted → materials to pulse
  let floorAt = () => 0.06; // floor height at a plan point, set by build()
  let picks = []; // clickable structure objects (userData.pick = { kind, id })
  let boxes = {}; // 'kind:id' → { x0, z0, x1, z1, y } footprint, for selection brackets and the camera
  let selection = null; // this site's part of RMS.ui.selection
  let roofsOn = opts.roofs === true; // roofs hide the inside, so they start hidden
  let roofGroup = null;
  const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const bbox = (pts, y) => ({
    x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])),
    z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])), y,
  });

  /* ---------- building the structure ---------- */

  function build(state) {
    if (group) { disposeGroup(group); scene.remove(group); }
    group = new THREE.Group();
    zoneFx = {};
    picks = [];
    boxes = {};
    const addPick = (obj, kind, id) => { obj.userData.pick = { kind, id }; picks.push(obj); };
    /** An invisible floor area you can click. */
    const floorPick = (pts, y, kind, id) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(floorShape(pts)).rotateX(-Math.PI / 2), pickMat);
      m.position.y = y;
      group.add(m);
      addPick(m, kind, id);
    };
    const site = RMS.site(state, siteId);
    const { w, d } = RMS.geo.size(site);
    const H = site.wallHeight || 4;
    const zones = state.zones.filter((z) => z.siteId === siteId);

    // Yard: the site area.
    const yard = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), material(T.yard));
    yard.position.set(w / 2, 0.02, d / 2);
    yard.receiveShadow = true;
    group.add(yard);

    // Roads: a raised strip with a dashed centre line. Clickable.
    const roadMat = material(T.road);
    const paintMat = material('#FFFFFF');
    (site.roads || []).forEach((r) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.06, r.h), roadMat);
      m.position.set(r.x + r.w / 2, 0.09, r.y + r.h / 2);
      m.receiveShadow = true;
      group.add(m);
      const horiz = r.w >= r.h;
      const len = horiz ? r.w : r.h;
      for (let k = 1; k + 1.2 < len; k += 2.4) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1.2 : 0.18, 0.02, horiz ? 0.18 : 1.2), paintMat);
        dash.position.set(horiz ? r.x + k + 0.6 : r.x + r.w / 2, 0.13, horiz ? r.y + r.h / 2 : r.y + k + 0.6);
        group.add(dash);
      }
      m.userData.pick = { kind: 'road', id: r.id };
      picks.push(m);
      boxes[`road:${r.id}`] = { x0: r.x, x1: r.x + r.w, z0: r.y, z1: r.y + r.h, y: 0.1 };
    });

    // Parking areas: the same surface with white slot lines and a "P" sign. Clickable.
    (site.parking || []).forEach((pk) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(pk.w, 0.06, pk.h), roadMat);
      m.position.set(pk.x + pk.w / 2, 0.09, pk.y + pk.h / 2);
      m.receiveShadow = true;
      group.add(m);
      const slots = RMS.trucks.parkingSlots({ parking: [pk] });
      const across = (pk.entry || 's') === 'n' || (pk.entry || 's') === 's';
      const edges = slots.map((sl) => (across ? sl.x : sl.y) - 2);
      if (slots.length) edges.push((across ? slots[slots.length - 1].x : slots[slots.length - 1].y) + 2);
      edges.forEach((c) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(across ? 0.2 : pk.w, 0.02, across ? pk.h : 0.2), paintMat);
        line.position.set(across ? c : pk.x + pk.w / 2, 0.13, across ? pk.y + pk.h / 2 : c);
        group.add(line);
      });
      const kind = { loading: 'Loading', unloading: 'Unloading' }[pk.kind];
      const l = label(`P · ${pk.name}`, 'parking', kind ? { cls: 'tone-accent', text: kind } : null);
      l.position.set(pk.x + pk.w / 2, 1.2, pk.y + pk.h / 2);
      group.add(l);
      m.userData.pick = { kind: 'parking', id: pk.id };
      picks.push(m);
      boxes[`parking:${pk.id}`] = { x0: pk.x, x1: pk.x + pk.w, z0: pk.y, z1: pk.y + pk.h, y: 0.1 };
    });

    // Building slab, plus a slab under any room that sits outside the building (a guard hut).
    const slabMat = material(T.wall);
    const addSlab = (r) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(r.w + WALL_T, SLAB, r.h + WALL_T, 2, 0.1), slabMat);
      m.position.set(r.x + r.w / 2, SLAB / 2, r.y + r.h / 2);
      m.receiveShadow = true;
      m.castShadow = true;
      group.add(m);
    };
    const o = site.outline;
    if (o) addSlab(o);
    site.rooms.forEach((r) => {
      const inside = o && r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
      if (!inside) addSlab(r);
    });
    // Roofs: over the building, and over any hut outside it. Shown or hidden with setRoofs().
    roofGroup = new THREE.Group();
    roofGroup.visible = roofsOn;
    const roofMat = material(T.roof);
    const roofEdgeMat = material(T.roofShade);
    const addRoof = (r) => {
      const y = SLAB + H + CAP;
      const edge = new THREE.Mesh(new RoundedBoxGeometry(r.w + WALL_T + 0.8, 0.3, r.h + WALL_T + 0.8, 2, 0.12), roofEdgeMat);
      edge.position.set(r.x + r.w / 2, y + 0.15, r.y + r.h / 2);
      const top = new THREE.Mesh(new RoundedBoxGeometry(r.w + WALL_T + 0.2, 0.3, r.h + WALL_T + 0.2, 2, 0.12), roofMat);
      top.position.set(r.x + r.w / 2, y + 0.4, r.y + r.h / 2);
      edge.castShadow = true;
      top.castShadow = true;
      roofGroup.add(edge, top);
    };
    if (o) addRoof(o);
    site.rooms.forEach((r) => {
      const inside = o && r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
      if (!inside) addRoof(r);
    });
    group.add(roofGroup);

    site.rooms.forEach((r) => {
      floorPick([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]], SLAB + 0.01, 'room', r.id);
      boxes[`room:${r.id}`] = { x0: r.x, z0: r.y, x1: r.x + r.w, z1: r.y + r.h, y: SLAB };
    });
    const onSlab = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    floorAt = (x, y) => ((o && onSlab(x, y, o)) || site.rooms.some((r) => onSlab(x, y, r)) ? SLAB : 0.06);

    // Walls with door gaps (shared walls once), each with a teal strip on top.
    // Horizontal walls run a little past their ends to close the corners; vertical walls stop
    // short and sit a hair lower, so overlapping faces never flicker.
    const { walls, doors } = RMS.geo.siteWalls(site);
    const wallMat = material(T.wall);
    const capMat = material(T.roof);
    walls.forEach(([a, b]) => {
      const horiz = a[1] === b[1];
      const len = horiz ? b[0] - a[0] : b[1] - a[1];
      const along = horiz ? len + WALL_T : Math.max(0.05, len - WALL_T);
      const hh = horiz ? H : H - 0.01;
      const sx = horiz ? along : WALL_T;
      const sz = horiz ? WALL_T : along;
      const cx = (a[0] + b[0]) / 2;
      const cz = (a[1] + b[1]) / 2;
      const wall = new THREE.Mesh(new RoundedBoxGeometry(sx, hh, sz, 2, 0.06), wallMat);
      wall.position.set(cx, SLAB + hh / 2, cz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const cap = new THREE.Mesh(new RoundedBoxGeometry(sx + 0.04, CAP, sz + 0.04, 2, 0.06), capMat);
      cap.position.set(cx, SLAB + hh + CAP / 2 - 0.02, cz);
      cap.castShadow = true;
      group.add(wall, cap);
    });

    // Door thresholds: a thin accent strip on the floor where a gap is.
    const doorMat = material(T.accent);
    doors.forEach(([a, b]) => {
      const horiz = a[1] === b[1];
      const len = horiz ? b[0] - a[0] : b[1] - a[1];
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : WALL_T, 0.03, horiz ? WALL_T : len), doorMat);
      m.position.set((a[0] + b[0]) / 2, SLAB + 0.015, (a[1] + b[1]) / 2);
      group.add(m);
    });

    // Zones.
    zones.forEach((z) => {
      boxes[`zone:${z.id}`] = bbox(z.points, SLAB);
      if (z.type === 'general') floorPick(z.points, SLAB + 0.03, 'zone', z.id);
      if (z.type === 'private') {
        // A frosted block: you can see the room is there, not who is inside.
        const geom = new THREE.ExtrudeGeometry(floorShape(z.points), { depth: H - 0.1, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geom, material(T.zones.private, {
          transparent: true, opacity: T.zones.privateOpacity, depthWrite: false,
        }));
        m.position.y = SLAB + 0.02;
        group.add(m);
        addPick(m, 'zone', z.id);
      } else if (z.type === 'restricted') {
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(floorShape(z.points)), material(T.zones.restricted, {
          transparent: true, opacity: 0.1, depthWrite: false,
        }));
        fill.geometry.rotateX(-Math.PI / 2);
        fill.position.y = SLAB + 0.02;
        group.add(fill);
        addPick(fill, 'zone', z.id);
        const edgeMat = material(T.zones.restricted, { emissive: new THREE.Color(T.zones.restricted), emissiveIntensity: 0 });
        zoneFx[z.id] = { type: 'restricted', fillMat: fill.material, edgeMat };
        z.points.forEach((p, i) => {
          const q = z.points[(i + 1) % z.points.length];
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
          const edge = new THREE.Mesh(new THREE.BoxGeometry(len + 0.25, 0.06, 0.25), edgeMat);
          edge.position.set((p[0] + q[0]) / 2, SLAB + 0.05, (p[1] + q[1]) / 2);
          edge.rotation.y = -Math.atan2(q[1] - p[1], q[0] - p[0]);
          group.add(edge);
        });
      }
      // General zones: no fill, label only.
    });

    // Labels. A zone with the same name as a room shares the room's label.
    const labelY = SLAB + H + 1.2;
    const zoneByName = {};
    zones.forEach((z) => { zoneByName[z.name.trim().toLowerCase()] = z; });
    const merged = new Set();
    site.rooms.forEach((r) => {
      const z = zoneByName[r.name.trim().toLowerCase()];
      if (z) merged.add(z.id);
      const l = label(r.name, 'room', z ? ZONE_CHIP[z.type] : null);
      l.position.set(r.x + r.w / 2, labelY, r.y + r.h / 2);
      group.add(l);
      if (z?.type === 'private') addCountChip(z, l);
    });
    zones.filter((z) => !merged.has(z.id)).forEach((z) => {
      const [cx, cy] = RMS.geo.centroid(z.points);
      const l = label(z.name, `zone zone-${z.type}`, ZONE_CHIP[z.type]);
      l.position.set(cx, z.type === 'private' ? labelY : SLAB + 0.8, cy);
      group.add(l);
      if (z.type === 'private') addCountChip(z, l);
    });

    // Gate: two posts and a bar.
    const gate = RMS.geo.gate(site);
    if (gate) {
      // Built along local x, then turned to match the plan (plan rotation is clockwise with y down).
      const gg = new THREE.Group();
      gg.position.set(gate.x, 0, gate.y);
      gg.rotation.y = -gate.rotation * Math.PI / 180;
      const postMat = material(T.roof);
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(new RoundedBoxGeometry(0.5, 2.4, 0.5, 2, 0.12), postMat);
        post.position.set(side * gate.width / 2, 1.2, 0);
        post.castShadow = true;
        gg.add(post);
      });
      const bar = new THREE.Mesh(new RoundedBoxGeometry(gate.width + 0.4, 0.25, 0.25, 2, 0.08), material(T.roofShade));
      bar.position.set(0, 2.2, 0);
      bar.castShadow = true;
      gg.add(bar);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(gate.width + 1.5, 3, 2.5), pickMat); // easier to click
      hit.position.y = 1.5;
      gg.add(hit);
      group.add(gg);
      addPick(gg, 'gate', 'gate');
      const hw = gate.width / 2 + 0.5;
      boxes['gate:gate'] = gate.rotation % 180
        ? { x0: gate.x - 1, x1: gate.x + 1, z0: gate.y - hw, z1: gate.y + hw, y: 0 }
        : { x0: gate.x - hw, x1: gate.x + hw, z0: gate.y - 1, z1: gate.y + 1, y: 0 };
      const l = label(gate.name, 'gate');
      l.position.set(gate.x, 3.4, gate.y);
      group.add(l);
    }

    scene.add(group);

    // Sun and shadow area follow the site.
    const r = Math.max(w, d);
    sun.position.set(w / 2 - r * 0.35, r * 0.9, d / 2 + r * 0.25);
    sun.target.position.set(w / 2, 0, d / 2);
    const sc = sun.shadow.camera;
    sc.left = -r * 0.8; sc.right = r * 0.8; sc.top = r * 0.8; sc.bottom = -r * 0.8;
    sc.near = 1; sc.far = r * 3;
    sc.updateProjectionMatrix();

    updateTrucks(); // the gate or the roads may have changed
    applySelection(false);
  }

  function disposeGroup(g) {
    g.traverse((obj) => {
      if (obj.isCSS2DObject) obj.element.remove();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }

  /** A private zone's label gets a "2 inside" chip. Counts only, never names. */
  function addCountChip(z, labelObj) {
    const chip = document.createElement('span');
    chip.className = 'chip count';
    chip.style.display = 'none';
    labelObj.element.appendChild(chip);
    zoneFx[z.id] = { type: 'private', chip, count: 0 };
  }

  /* ---------- people ---------- */

  const peopleGroup = new THREE.Group();
  scene.add(peopleGroup);
  const avatars = new Map(); // key → { group, ring, tag }
  const bodyGeo = new THREE.CapsuleGeometry(0.38, 0.6, 4, 12);
  const headGeo = new THREE.SphereGeometry(0.3, 16, 12);
  const ringGeo = new THREE.RingGeometry(0.75, 1.0, 32).rotateX(-Math.PI / 2);
  const roleMats = {};
  const roleMat = (role, ghost) => {
    const k = `${role}:${ghost ? 1 : 0}`;
    if (!roleMats[k]) {
      roleMats[k] = material(T.roles[role] || T.muted, ghost ? { transparent: true, opacity: 0.35, depthWrite: false } : {});
    }
    return roleMats[k];
  };
  const headMat = material(T.wall);
  const ghostHeadMat = material(T.wall, { transparent: true, opacity: 0.35, depthWrite: false });
  const selMat = material(T.accent, { emissive: new THREE.Color(T.accent), emissiveIntensity: 0.35 });
  let hoverId = null;
  let hoverEquip = null;
  let labelsOn = opts.labels !== false; // status labels above people and forklifts
  let namesOn = opts.names !== false; // people's names on those labels (hover or select still shows them)

  /** A toy figure: role-colored capsule body, light head, a red ring under alerted visitors. */
  function makeAvatar(rec, ghost) {
    const g = new THREE.Group();
    g.userData.personId = rec.id;
    g.userData.pick = { kind: ghost ? 'ghost' : 'person', id: rec.id };
    const body = new THREE.Mesh(bodyGeo, roleMat(rec.person.role, ghost));
    body.position.y = 0.68;
    const head = new THREE.Mesh(headGeo, ghost ? ghostHeadMat : headMat);
    head.position.y = 1.65;
    body.castShadow = !ghost;
    head.castShadow = !ghost;
    const ring = new THREE.Mesh(ringGeo, material(T.zones.restricted, { transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.03;
    ring.visible = false;
    const sel = new THREE.Mesh(ringGeo, selMat);
    sel.position.y = 0.04;
    sel.scale.set(0.85, 1, 0.85);
    sel.visible = false;
    const tag = ghost
      ? label(`${rec.person.name} (last seen)`, `person role-${rec.person.role}`)
      : label(rec.person.name, `person role-${rec.person.role}`, { cls: 'st', text: '' });
    tag.position.y = 2.5;
    tag.visible = false;
    g.add(body, head, ring, sel, tag);
    g.scale.setScalar(1.6); // a bit larger than life so people read at site scale
    return { group: g, ring, sel, tag, chip: ghost ? null : tag.element.lastChild, statusKey: '' };
  }

  function removeAvatar(k) {
    const a = avatars.get(k);
    a.tag.element.remove();
    a.ring.material.dispose();
    peopleGroup.remove(a.group);
    avatars.delete(k);
  }

  function updatePeople(t) {
    if (!siteId) return;
    const recs = RMS.live(RMS.store.get());
    const show = [];
    recs.forEach((r) => {
      if (r.kind === 'site' && r.siteId === siteId && !r.rides) show.push({ r, x: r.x, y: r.y, ghost: false }); // operators sit on their forklift
      // Only when the client turns on "show last known position" (off by default).
      else if (r.kind === 'paused' && r.lastKnown?.siteId === siteId) show.push({ r, x: r.lastKnown.x, y: r.lastKnown.y, ghost: true });
    });

    const seen = new Set();
    show.forEach(({ r, x, y, ghost }) => {
      const k = `${r.id}:${ghost ? 'ghost' : 'live'}`;
      seen.add(k);
      let a = avatars.get(k);
      const target = new THREE.Vector3(x, floorAt(x, y), y);
      if (!a) {
        a = makeAvatar(r, ghost);
        a.group.position.copy(target);
        avatars.set(k, a);
        peopleGroup.add(a.group);
      }
      // Glide: simulated people already move smoothly; phone reports jump, so ease toward them.
      a.group.position.lerp(target, 0.15);
      a.ring.visible = !!r.alert;
      if (r.alert) {
        const sc = 1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 6));
        a.ring.scale.set(sc, 1, sc);
      }
      const picked = !ghost && selection?.kind === 'person' && selection.id === r.id;
      a.sel.visible = picked;
      if (a.chip && r.status) {
        const sk = r.status.text + r.status.tone;
        if (sk !== a.statusKey) {
          a.statusKey = sk;
          a.chip.textContent = r.status.text;
          a.chip.className = `chip st tone-${r.status.tone}`;
        }
      }
      a.tag.visible = hoverId === r.id || picked || (labelsOn && !ghost);
      // With names off the label shows only the status; hovering or selecting brings the name back.
      const nameEl = a.tag.element.firstChild;
      const showName = namesOn || hoverId === r.id || picked || !a.chip;
      if (nameEl.dataset.shown !== String(showName)) {
        nameEl.dataset.shown = String(showName);
        nameEl.style.display = showName ? '' : 'none';
      }
    });
    [...avatars.keys()].forEach((k) => { if (!seen.has(k)) removeAvatar(k); });

    // Private zones: a head count, no names.
    const counts = RMS.occupancy.privateCounts(recs, siteId);
    // Restricted zones pulse while a visitor is inside.
    const alertZones = new Set(recs.filter((r) => r.alert && r.siteId === siteId).map((r) => r.zone.id));
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    Object.entries(zoneFx).forEach(([id, fx]) => {
      if (fx.type === 'private') {
        const n = counts[id] || 0;
        if (n !== fx.count) {
          fx.count = n;
          fx.chip.textContent = `${n} inside`;
          fx.chip.style.display = n ? '' : 'none';
        }
      } else if (fx.type === 'restricted') {
        const on = alertZones.has(id);
        fx.edgeMat.emissiveIntensity = on ? 0.2 + 0.8 * pulse : 0;
        fx.fillMat.opacity = on ? 0.12 + 0.2 * pulse : 0.1;
      }
    });
  }

  /* ---------- trucks waiting at the gate ---------- */

  const truckGroup = new THREE.Group();
  scene.add(truckGroup);
  const trucks = new Map(); // trip id -> { group, sel, nameEl, chip, key }

  /** A small toy truck, cab toward local -z. */
  function makeTruck() {
    const g = new THREE.Group();
    const add = (geom, mat, x, y, z) => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(2.4, 2.6, 5.2, 2, 0.15), material(T.wall), 0, 1.75, 1.2);
    add(new RoundedBoxGeometry(2.4, 2.1, 1.9, 2, 0.25), material(T.roles.driver), 0, 1.45, -2.5);
    add(new THREE.BoxGeometry(2.0, 0.7, 0.05), material(T.ink), 0, 1.95, -3.46);
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16).rotateZ(Math.PI / 2);
    const wheelMat = material(T.ink);
    [-2.5, 0.2, 2.6].forEach((z) => [-1.15, 1.15].forEach((x) => add(wheelGeo, wheelMat, x, 0.45, z)));
    return g;
  }

  /**
   * Trucks from the trips (RMS.trucks.atSite): waiting outside the gate, driving along the
   * roads, parked in a slot, or driving out. Positions come from the clock, so they're simply
   * placed every frame; the truck only turns smoothly.
   */
  function updateTrucks() {
    if (!siteId) return;
    const list = RMS.trucks.atSite(RMS.store.get(), siteId);
    const seen = new Set();
    list.forEach((tr) => {
      seen.add(tr.id);
      const want = Math.atan2(-tr.dir[0], -tr.dir[1]); // cab (local -z) faces tr.dir
      let t = trucks.get(tr.id);
      if (!t) {
        const g = makeTruck();
        g.userData.pick = { kind: 'truck', id: tr.id };
        const sel = new THREE.Mesh(ringGeo, selMat);
        sel.scale.set(4.4, 1, 4.4);
        sel.position.y = 0.06;
        sel.visible = false;
        const tag = label('', 'truck', { cls: 'st', text: '' });
        tag.position.set(0, 4.3, 0);
        g.add(sel, tag);
        g.position.set(tr.x, 0, tr.y);
        g.rotation.y = want;
        truckGroup.add(g);
        t = { group: g, sel, nameEl: tag.element.firstChild, chip: tag.element.lastChild, key: '' };
        trucks.set(tr.id, t);
      }
      t.group.position.set(tr.x, 0, tr.y);
      let dd = want - t.group.rotation.y;
      dd = ((dd + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      t.group.rotation.y += dd * 0.2;
      const k = `${tr.driver?.name}|${tr.status.text}|${tr.status.tone}`;
      if (k !== t.key) {
        t.key = k;
        t.chip.textContent = tr.status.text;
        t.chip.className = `chip st tone-${tr.status.tone}`;
      }
      t.sel.visible = selection?.kind === 'truck' && selection.id === tr.id;
      // The plate always; the driver's name only with names on (or when selected).
      const plate = tr.trip.vehicle.replace(/^Truck\s*/i, '');
      const nm = namesOn || t.sel.visible ? `${plate} · ${tr.driver?.name || 'no driver'}` : plate;
      if (t.nameEl.textContent !== nm) t.nameEl.textContent = nm;
    });
    [...trucks.keys()].forEach((id) => { if (!seen.has(id)) removeTruck(id); });
  }

  function removeTruck(id) {
    const t = trucks.get(id);
    disposeGroup(t.group);
    truckGroup.remove(t.group);
    trucks.delete(id);
  }

  /* ---------- forklifts ---------- */

  const equipGroup = new THREE.Group();
  scene.add(equipGroup);
  const forklifts = new Map(); // id -> { group, tag, chip, sel, statusKey }
  const forkMat = material(T.equip.forklift);
  const darkMat = material(T.ink);

  /** A toy forklift, forks toward local -z. */
  function makeForklift(e) {
    const g = new THREE.Group();
    g.userData.pick = { kind: 'forklift', id: e.id };
    const add = (geom, mat, x, y, z) => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    };
    add(new RoundedBoxGeometry(1.3, 1.0, 2.0, 2, 0.15), forkMat, 0, 0.8, 0.25); // body
    add(new RoundedBoxGeometry(1.3, 0.7, 0.5, 2, 0.12), darkMat, 0, 0.75, 1.3); // counterweight
    [[-0.58, -0.35], [0.58, -0.35], [-0.58, 0.85], [0.58, 0.85]].forEach(([x, z]) => {
      add(new THREE.BoxGeometry(0.08, 1.3, 0.08), darkMat, x, 1.95, z); // cage posts
    });
    add(new THREE.BoxGeometry(1.35, 0.08, 1.4), darkMat, 0, 2.62, 0.25); // roof
    [-0.42, 0.42].forEach((x) => add(new THREE.BoxGeometry(0.12, 2.6, 0.12), darkMat, x, 1.4, -0.85)); // mast
    [-0.3, 0.3].forEach((x) => add(new THREE.BoxGeometry(0.16, 0.06, 1.2), darkMat, x, 0.2, -1.5)); // forks
    const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 14).rotateZ(Math.PI / 2);
    [[-0.68, -0.4], [0.68, -0.4], [-0.68, 0.95], [0.68, 0.95]].forEach(([x, z]) => add(wheel, darkMat, x, 0.33, z));
    // The operator, seated (colored by role), and a pallet that shows while carrying.
    const driver = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.35, 4, 10), roleMat('employee'));
    torso.position.set(0, 1.75, 0.35);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), headMat);
    head.position.set(0, 2.25, 0.35);
    driver.add(torso, head);
    driver.visible = false;
    g.add(driver);
    const pallet = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 1.15), darkMat);
    base.position.set(0, 0.32, -1.5);
    const load = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.8, 1.05, 2, 0.06), material(T.equip.cargo));
    load.position.set(0, 0.8, -1.5);
    load.castShadow = true;
    pallet.add(base, load);
    pallet.visible = false;
    g.add(pallet);
    const sel = new THREE.Mesh(ringGeo, selMat);
    sel.scale.set(1.8, 1, 1.8);
    sel.position.y = 0.04;
    sel.visible = false;
    const tag = label(e.asset.name.replace(/^Forklift\s*/i, ''), 'equip', { cls: 'st', text: '' });
    tag.position.y = 3.3;
    g.add(sel, tag);
    g.scale.setScalar(1.3);
    return { group: g, tag, nameEl: tag.element.firstChild, chip: tag.element.lastChild, sel, driver, torso, pallet, statusKey: '', opKey: null, opId: null };
  }

  function removeForklift(id) {
    const f = forklifts.get(id);
    f.tag.element.remove();
    equipGroup.remove(f.group);
    forklifts.delete(id);
  }

  function updateEquipment() {
    if (!siteId) return;
    const list = RMS.equipment(RMS.store.get()).filter((e) => e.siteId === siteId);
    const seen = new Set();
    list.forEach((e) => {
      seen.add(e.id);
      let f = forklifts.get(e.id);
      const target = new THREE.Vector3(e.x, floorAt(e.x, e.y), e.y);
      if (!f) {
        f = makeForklift(e);
        f.group.position.copy(target);
        forklifts.set(e.id, f);
        equipGroup.add(f.group);
      }
      f.group.position.lerp(target, 0.15);
      if (e.heading) {
        // Turn smoothly toward the direction of travel (the shortest way round).
        const want = Math.atan2(-e.heading[0], -e.heading[1]);
        let dd = want - f.group.rotation.y;
        dd = ((dd + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        f.group.rotation.y += dd * 0.12;
      }
      const sk = e.status.text + e.status.tone;
      if (sk !== f.statusKey) {
        f.statusKey = sk;
        f.chip.textContent = e.status.text;
        f.chip.className = `chip st tone-${e.status.tone}`;
      }
      // Who's driving it, shown on the label and as a seated figure.
      const opKey = e.operator ? e.operator.id : '';
      if (opKey !== f.opKey) {
        f.opKey = opKey;
        f.opId = e.operator?.id || null;
        f.driver.visible = !!e.operator;
        if (e.operator) f.torso.material = roleMat(e.operator.role);
      }
      f.pallet.visible = !!e.carry;
      const picked = (selection?.kind === 'forklift' && selection.id === e.id)
        || (selection?.kind === 'person' && f.opId === selection.id);
      f.sel.visible = picked;
      f.tag.visible = labelsOn || picked || hoverEquip === e.id;
      // The forklift id always; the operator's name only with names on (or on hover / select).
      const withName = namesOn || picked || hoverEquip === e.id;
      const nm = !withName ? e.id : `${e.id} · ${e.operator ? e.operator.name : 'no operator'}`;
      if (f.nameEl.textContent !== nm) f.nameEl.textContent = nm;
    });
    [...forklifts.keys()].forEach((id) => { if (!seen.has(id)) removeForklift(id); });
  }

  /* ---------- picking and selection ---------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** What's under the pointer: { kind, id } or null. People and trucks win over floors. */
  function pickAt(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const list of [[peopleGroup, truckGroup, equipGroup], picks]) {
      for (const h of raycaster.intersectObjects(list, true)) {
        let o = h.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) return o.userData.pick;
      }
    }
    return null;
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    const hit = pickAt(e);
    hoverId = hit && (hit.kind === 'person' || hit.kind === 'ghost') ? hit.id : null;
    hoverEquip = hit && hit.kind === 'forklift' ? hit.id : null;
    renderer.domElement.style.cursor = hit && hit.kind !== 'ghost' ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => { hoverId = null; hoverEquip = null; });

  // A click selects; a drag moves the camera and selects nothing.
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    downAt = null;
    const hit = pickAt(e);
    RMS.ui.selection.set(hit && hit.kind !== 'ghost' ? { ...hit, siteId } : null);
  });

  /* teal corner brackets around the selected room, zone, gate or truck */
  const selGroup = new THREE.Group();
  scene.add(selGroup);

  function drawBrackets(b) {
    selGroup.children.forEach((c) => c.geometry.dispose());
    selGroup.clear();
    if (!b) return;
    const pad = 0.6;
    const x0 = b.x0 - pad; const x1 = b.x1 + pad; const z0 = b.z0 - pad; const z1 = b.z1 + pad;
    const L = Math.max(1, Math.min(3, (x1 - x0) / 3, (z1 - z0) / 3));
    const y = b.y + 0.2;
    [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]].forEach(([cx, cz, sx, sz]) => {
      const a = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.4), selMat);
      a.position.set(cx + (sx * L) / 2, y, cz);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, L), selMat);
      c.position.set(cx, y, cz + (sz * L) / 2);
      selGroup.add(a, c);
    });
  }

  /** Redraw the brackets; with `ease`, also glide the camera toward the selection. */
  function applySelection(ease) {
    const s = selection;
    const follows = s && (s.kind === 'person' || s.kind === 'forklift' || s.kind === 'truck'); // these carry their own ring
    drawBrackets(s && !follows ? boxes[`${s.kind}:${s.id}`] : null);
    if (!ease || !s) return;
    let c;
    let size;
    if (follows) {
      const a = s.kind === 'person'
        ? avatars.get(`${s.id}:live`) || [...forklifts.values()].find((f) => f.opId === s.id)
        : (s.kind === 'truck' ? trucks.get(s.id) : forklifts.get(s.id));
      if (!a) return;
      c = a.group.position.clone();
      size = 6;
    } else {
      const b = boxes[`${s.kind}:${s.id}`];
      if (!b) return;
      c = new THREE.Vector3((b.x0 + b.x1) / 2, b.y, (b.z0 + b.z1) / 2);
      size = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    }
    const dist = Math.min(90, Math.max(24, size * 2.2));
    const dir = camera.position.clone().sub(controls.target).normalize();
    goal = { pos: c.clone().add(dir.multiplyScalar(dist)), target: c };
  }

  RMS.ui.selection.subscribe((sel) => {
    selection = sel && sel.siteId === siteId ? sel : null;
    applySelection(true);
  });

  /* ---------- camera ---------- */

  /** A light isometric-ish view of the whole site. */
  function homeView() {
    const site = RMS.site(RMS.store.get(), siteId);
    const { w, d } = RMS.geo.size(site);
    const target = new THREE.Vector3(w / 2, 0, d / 2);
    const pos = target.clone().add(new THREE.Vector3(-0.5, 0.85, 1).normalize().multiplyScalar(Math.max(w, d) * 1.6));
    return { pos, target };
  }

  controls.addEventListener('start', () => { goal = null; }); // the user takes over

  /* ---------- sizing and the frame loop ---------- */

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    camera.aspect = width / height;
    // Shift the picture left so the site is centred in the area the side panel doesn't cover.
    const pad = width > 900 ? (opts.padRight || 0) : 0;
    if (pad) camera.setViewOffset(width + pad, height, pad, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    updatePeople(clock.getElapsedTime());
    updateTrucks();
    updateEquipment();
    if (goal) {
      camera.position.lerp(goal.pos, 0.12);
      controls.target.lerp(goal.target, 0.12);
      if (camera.position.distanceTo(goal.pos) < 0.05 && controls.target.distanceTo(goal.target) < 0.05) goal = null;
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  /* ---------- staying in sync with the store ---------- */

  function sync() {
    if (!siteId) return;
    const state = RMS.store.get();
    if (!RMS.site(state, siteId)) return;
    const k = structureKey(state, siteId);
    if (k === key) return; // something else changed (a location, an approval): no rebuild
    key = k;
    build(state);
  }
  RMS.store.subscribe(sync);

  return {
    /** Show another site and jump the camera to it. */
    setSite(id) {
      if (id === siteId) return;
      siteId = id;
      key = '';
      [...avatars.keys()].forEach(removeAvatar);
      [...forklifts.keys()].forEach(removeForklift);
      selection = null;
      [...trucks.keys()].forEach(removeTruck);
      sync();
      const v = homeView();
      camera.position.copy(v.pos);
      controls.target.copy(v.target);
      goal = null;
    },
    /** factor < 1 moves closer, > 1 moves away. */
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
      goal = { pos: controls.target.clone().add(offset), target: controls.target.clone() };
    },
    toggleRotate() {
      controls.autoRotate = !controls.autoRotate;
      return controls.autoRotate;
    },
    resetView() { goal = homeView(); },
    /** Show or hide the name and status labels above people and forklifts. */
    setLabels(on) { labelsOn = !!on; },
    /** Show or hide people's names on the labels (statuses stay). */
    setNames(on) { namesOn = !!on; },
    /** Show or hide the roofs. */
    setRoofs(on) {
      roofsOn = !!on;
      if (roofGroup) roofGroup.visible = roofsOn;
    },
  };
}

RMS.scene3d = { mount };
window.dispatchEvent(new Event('rms:scene3d-ready'));
}).catch((err) => {
  console.error('3D view failed to load', err);
  window.RMS.scene3dError = err;
  window.dispatchEvent(new Event('rms:scene3d-failed'));
});
})();
