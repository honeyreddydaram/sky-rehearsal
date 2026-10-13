// map.js
// Everything that draws the route: the Cesium 3D globe when WebGL is available, and a
// hand-drawn SVG study diagram when it isn't. Owns the Cesium Viewer, the plane/route
// entities, the three camera modes (overview/follow/pilot), and look-around input
// (mouse drag, touch pinch/drag, and keyboard arrows).
//
// map.js deliberately does NOT import playback.js. Several interactions here (dragging
// to look around, pinch-zooming, pressing an arrow key) need to refresh the HUD
// afterward, and playback.js's refresh() needs renderPosition() from this file — if
// both files imported each other directly we'd have a circular module dependency.
// Instead the app bootstrap (app.js) hands this module a callback via
// setInteractionHandler(), and we call that instead of importing playback.js.

import {rad, deg, resolveRunwayEnds, nearestNamedPoint} from './core.mjs';
import {state, models, routeData, getTrackPoints, heightAt} from './state.js';
import {$, all, text, toast, selectStates} from './ui.js';
import {airport, activeCircuit, circuits, landmarks} from './airport.js';

const C = window.Cesium;

// Pilot-view tuning constants (see the ground-rules message for Phase 2b): a natural
// forward-looking pitch and field of view so the Pilot camera reads like a real
// cockpit view (horizon visible) instead of staring at the ground, plus a tighter
// yaw swing for the left/right look buttons than the old 90°.
const PILOT_AHEAD_PITCH_DEG = -5;
const PILOT_LOOK_YAW_DEG = 60;
const PILOT_DOWN_PITCH_DEG = -85; // unchanged — "Below" stays steep
const PILOT_FOV_DEG = 60;

let viewer = null;
let plane, planned, windLine, groundLine;
let labels = [];
let landmarkEntities = [];
let currentPosition,
  flightHeading = 0;
let buildings = null;
let google3dTileset = null;
let googleModeActive = false;
let terrainGeneration = 0;
let imageryGeneration = 0;
let runwayEntity = null;
let checkpointEntities = [];
let identifyMarker = null;
// Which HeightReference mode ground-clamped entities (labels, checkpoints, landmark
// pins) use. Terrain clamping doesn't apply to 3D Tiles surfaces in Cesium, so when
// Google Photorealistic 3D Tiles are active these need CLAMP_TO_3D_TILE instead, or
// they'd sink to the (now flat/ellipsoid) terrain under Google's rendered surface.
let clampMode = 'ground';
function clampRef() {
  return clampMode === '3dtile' ? C.HeightReference.CLAMP_TO_3D_TILE : C.HeightReference.CLAMP_TO_GROUND;
}

// Called by app.js after a route/profile/wind change and by anything that drags the
// camera around, so the HUD (telemetry text, waypoint list, etc) stays current. See
// the module comment above for why this is injected rather than imported.
let onInteraction = () => {};
export function setInteractionHandler(fn) {
  onInteraction = fn;
}

export function hasViewer() {
  return viewer !== null;
}

// Runway ends (real OSM coordinates when the data has them, else the computed
// approximation) + the active circuit's located checkpoints, shared by both the
// Cesium entities (refreshAirportLayer, below) and the SVG fallback (renderDiagram,
// next). Returns null until airport.loadAirportData() has finished.
function airportGeometry() {
  if (!airport) return null;
  const runway = airport.runways[0];
  const ends = Object.values(resolveRunwayEnds(airport.referencePoint, runway));
  const checkpoints = activeCircuit().legs.flatMap((leg) => leg.checkpoints.filter((c) => c.coords));
  return {ends, checkpoints, isReal: runway.geometry !== 'approximate'};
}

// All named points worth labeling or finding-nearest-to: route places, the active
// circuit's checkpoints, the static Landmarks layer, and the runway ends. Shared by
// the Landmarks rendering and the click-to-identify feature.
function namedPoints() {
  const points = routeData.places.map((p) => ({name: p.name, lon: p.lon, lat: p.lat, kind: 'route place'}));
  if (landmarks) {
    points.push(...landmarks.landmarks.map((l) => ({name: l.name, lon: l.lon, lat: l.lat, kind: l.kind})));
  }
  if (airport) {
    // Both runways' checkpoints, not just the active one — "anything on the map,
    // inside or outside the circuit" should be identifiable, per the ground rules.
    for (const circuit of Object.values(circuits)) {
      for (const leg of circuit.legs) {
        for (const c of leg.checkpoints) {
          if (c.coords)
            points.push({name: c.name, lon: c.coords[0], lat: c.coords[1], kind: `${leg.name} checkpoint`});
        }
      }
    }
    const ends = resolveRunwayEnds(airport.referencePoint, airport.runways[0]);
    for (const [id, p] of Object.entries(ends))
      points.push({name: `RWY ${id} threshold`, lon: p[0], lat: p[1], kind: 'runway'});
  }
  return points;
}

// --- SVG fallback diagram -----------------------------------------------------
// Used instead of the Cesium globe when WebGL can't initialize. The SVG study
// diagram projects the same lon/lat points with an equirectangular approximation
// (cosine latitude correction) — fine at this scale (a few km), not meant for
// anywhere near the poles.
function renderDiagram() {
  if (viewer) return;
  const svg = $('fallback-map');
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
    return n;
  };
  const airportLayer = airportGeometry();
  const landmarkPoints = landmarks ? landmarks.landmarks.map((l) => [l.lon, l.lat]) : [];
  const coords = [
    ...models[state.route].points,
    ...getTrackPoints(),
    ...routeData.places.map((p) => [p.lon, p.lat]),
    ...landmarkPoints,
    ...(airportLayer ? [...airportLayer.ends, ...airportLayer.checkpoints.map((c) => c.coords)] : []),
  ];
  const minX = Math.min(...coords.map((p) => p[0])) - 0.01;
  const maxX = Math.max(...coords.map((p) => p[0])) + 0.01;
  const minY = Math.min(...coords.map((p) => p[1])) - 0.009;
  const maxY = Math.max(...coords.map((p) => p[1])) + 0.009;
  const lonScale = Math.cos(rad(17.44)); // Begumpet's latitude, for the equirectangular approximation
  const spanX = (maxX - minX) * lonScale;
  const spanY = maxY - minY;
  const scale = Math.min(790 / spanX, 450 / spanY);
  const x0 = (900 - spanX * scale) / 2;
  const y0 = (600 - spanY * scale) / 2;
  renderDiagram.project = (p) => [x0 + (p[0] - minX) * lonScale * scale, 600 - y0 - (p[1] - minY) * scale];
  // Inverse of project(), for the SVG fallback's click-to-identify handler.
  renderDiagram.unproject = ([x, y]) => [(x - x0) / (lonScale * scale) + minX, minY + (600 - y0 - y) / scale];

  for (let x = 0; x <= 900; x += 50) node('path', {d: `M${x} 0V600`, stroke: '#a9c3df0b'});
  for (let y = 0; y <= 600; y += 50) node('path', {d: `M0 ${y}H900`, stroke: '#a9c3df0b'});

  const path = (pts) => pts.map((p) => renderDiagram.project(p).join(',')).join(' ');
  node('polyline', {
    points: path(models[state.route].points),
    fill: 'none',
    stroke: '#bda7fa',
    'stroke-width': 4,
    'stroke-linejoin': 'round',
  });
  if (state.windSpeed > 0) {
    node('polyline', {
      points: path(getTrackPoints()),
      fill: 'none',
      stroke: '#efb769',
      'stroke-width': 3,
      'stroke-dasharray': state.correctWind ? '8 6' : 'none',
    });
  }
  if ($('labels').checked) {
    routeData.places.forEach((p) => {
      const [x, y] = renderDiagram.project([p.lon, p.lat]);
      node('circle', {cx: x, cy: y, r: 4, fill: '#c1d8ee'});
      const label = node('text', {
        x: x + 8,
        y: y - 10,
        fill: '#b5c6da',
        'font-size': 12,
        'paint-order': 'stroke',
        stroke: '#152034',
        'stroke-width': 4,
      });
      label.textContent = p.name;
    });
  }
  if (landmarks && $('labels').checked) {
    landmarks.landmarks.forEach((l) => {
      const [x, y] = renderDiagram.project([l.lon, l.lat]);
      node('circle', {cx: x, cy: y, r: 3.5, fill: '#8fe3bb'});
      const label = node('text', {
        x: x + 7,
        y: y - 8,
        fill: '#bfe8d4',
        'font-size': 10,
        'paint-order': 'stroke',
        stroke: '#152034',
        'stroke-width': 3,
      });
      label.textContent = l.name;
    });
  }
  if (airportLayer) {
    node('polyline', {
      points: path(airportLayer.ends),
      fill: 'none',
      stroke: '#ffd166',
      'stroke-width': 3,
      // Dashed = still only the approximate (computed) line; solid = real OSM geometry.
      'stroke-dasharray': airportLayer.isReal ? 'none' : '2 5',
    });
    if ($('labels').checked) {
      airportLayer.checkpoints.forEach((c) => {
        const [x, y] = renderDiagram.project(c.coords);
        node('circle', {cx: x, cy: y, r: 3.5, fill: '#7fd1ff'});
        const label = node('text', {
          x: x + 7,
          y: y - 8,
          fill: '#bfe6ff',
          'font-size': 10,
          'paint-order': 'stroke',
          stroke: '#152034',
          'stroke-width': 3,
        });
        label.textContent = c.name + (c.confidence !== 'medium' ? ' (unconfirmed)' : '');
      });
    }
  }
  node('path', {
    id: 'diagram-plane',
    d: 'M0 -14L4 -2 16 6 16 10 3 6 3 13 7 17 -7 17 -3 13 -3 6 -16 10 -16 6 -4 -2Z',
    fill: '#edf5ff',
    stroke: '#8971b6',
    'stroke-width': 2,
  });
  const title = node('text', {x: 30, y: 580, fill: '#829bb8', 'font-size': 11});
  title.textContent = 'ROUTE STUDY DIAGRAM · N ↑';
}
export {renderDiagram};

// --- Click to identify -------------------------------------------------------------
// Clicking anywhere on the map (3D globe or SVG fallback, inside or outside the
// circuit) shows the clicked lat/lon and the nearest named point from routeData
// places, the Landmarks layer, both runways' circuit checkpoints, and the runway
// ends — so an unlocated checkpoint can be pinned by eye against known references.
function showIdentify(lon, lat) {
  const nearest = nearestNamedPoint([lon, lat], namedPoints());
  text('identify-coords', `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`);
  text(
    'identify-nearest',
    nearest
      ? `Nearest: ${nearest.name} (${nearest.kind}) · ${(nearest.distanceM / 1852).toFixed(2)} NM away`
      : 'No named points loaded yet.',
  );
  $('identify-panel').hidden = false;
  if (viewer) {
    if (!identifyMarker) {
      identifyMarker = viewer.entities.add({
        point: {
          pixelSize: 10,
          color: C.Color.fromCssColorString('#ff6b6b'),
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: clampRef(),
        },
      });
    }
    identifyMarker.position = C.Cartesian3.fromDegrees(lon, lat, 0);
    viewer.scene.requestRender();
  }
}

export function wireIdentify() {
  $('identify-close').onclick = () => {
    $('identify-panel').hidden = true;
  };
  $('fallback-map').addEventListener('click', (e) => {
    if (!renderDiagram.unproject) return;
    const rect = $('fallback-map').getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * 900;
    const sy = ((e.clientY - rect.top) / rect.height) * 600;
    const [lon, lat] = renderDiagram.unproject([sx, sy]);
    showIdentify(lon, lat);
  });
}

// --- Position / camera ---------------------------------------------------------

export function renderPosition(s) {
  if (viewer) {
    currentPosition = C.Cartesian3.fromDegrees(...s.position, s.height);
    flightHeading = rad(s.possible ? s.heading : s.course);
    plane.position = currentPosition;
    plane.orientation = C.Transforms.headingPitchRollQuaternion(
      currentPosition,
      new C.HeadingPitchRoll(flightHeading - Math.PI / 2, 0, 0),
    );
    plane.model.show = state.view !== 'pilot';
    plane.billboard.show = state.view === 'overview';
    updateCamera();
    viewer.scene.requestRender();
  } else {
    const p = $('diagram-plane');
    if (p && renderDiagram.project) {
      const [x, y] = renderDiagram.project(s.position);
      p.setAttribute('transform', `translate(${x} ${y}) rotate(${s.possible ? s.heading : s.course})`);
    }
  }
}

export function updateRoutes() {
  if (!viewer) return;
  planned.polyline.positions = models[state.route].points.map((p, i) =>
    C.Cartesian3.fromDegrees(...p, heightAt(models[state.route].lengths[i] / models[state.route].total)),
  );
  windLine.polyline.positions = getTrackPoints().map((p, i) =>
    C.Cartesian3.fromDegrees(...p, heightAt(i / 240)),
  );
  windLine.show = state.windSpeed > 0;
  groundLine.polyline.positions = models[state.route].points.map((p) => C.Cartesian3.fromDegrees(...p));
  viewer.scene.requestRender();
}

// Convenience for callers that change the route/profile/wind: redraw both the Cesium
// polylines and the SVG fallback diagram (only one of the two is ever visible).
export function refreshRouteVisuals() {
  updateRoutes();
  renderDiagram();
}

// Draws the approximate runway line and the active circuit's located checkpoints.
// Called once airport.loadAirportData() resolves, and again whenever the active
// runway changes (the checkpoint set differs between the two circuits). A no-op
// until airport data has loaded. Also redraws the SVG fallback, since renderDiagram()
// includes this layer too (see airportGeometry() above).
export function refreshAirportLayer() {
  const layer = airportGeometry();
  if (!layer) return;
  if (viewer) {
    const runwayPositions = layer.ends.map((p) => C.Cartesian3.fromDegrees(...p, 0));
    const runwayLabel = layer.isReal ? 'RWY 09/27 (OpenStreetMap)' : 'RWY 09/27 (approximate)';
    if (!runwayEntity) {
      runwayEntity = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(...layer.ends[0], 0),
        polyline: {
          positions: runwayPositions,
          width: 5,
          material: new C.PolylineDashMaterialProperty({color: C.Color.fromCssColorString('#ffd166')}),
          clampToGround: true,
        },
        label: {
          text: runwayLabel,
          font: '11px sans-serif',
          fillColor: C.Color.fromCssColorString('#ffd166'),
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString('#172234dd'),
          pixelOffset: new C.Cartesian2(0, -14),
          heightReference: clampRef(),
          disableDepthTestDistance: Infinity,
        },
      });
    } else {
      runwayEntity.polyline.positions = runwayPositions;
      runwayEntity.label.text = runwayLabel;
    }
    checkpointEntities.forEach((e) => viewer.entities.remove(e));
    checkpointEntities = layer.checkpoints.map((c) =>
      viewer.entities.add({
        position: C.Cartesian3.fromDegrees(...c.coords, 0),
        point: {
          pixelSize: 6,
          color: C.Color.fromCssColorString('#7fd1ff'),
          heightReference: clampRef(),
        },
        label: {
          text: c.name + (c.confidence !== 'medium' ? ' (unconfirmed)' : ''),
          font: '11px sans-serif',
          fillColor: C.Color.WHITE,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString('#172234dd'),
          pixelOffset: new C.Cartesian2(0, -16),
          heightReference: clampRef(),
          disableDepthTestDistance: Infinity,
          // Keeps checkpoint labels legible from Pilot view without piling up at
          // long range — same fade-with-distance idea as the Landmarks layer below.
          translucencyByDistance: new C.NearFarScalar(500, 1.0, 12000, 0.15),
        },
      }),
    );
    viewer.scene.requestRender();
  }
  renderDiagram();
}

// Draws the static Landmarks layer (named lakes/hills from data/landmarks.json).
// Labels fade out with distance (NearFarScalar) rather than a hard cutoff, and stay
// on top of nearer geometry (disableDepthTestDistance) so they're still readable
// from Pilot view without a full label-collision system — see data/landmarks.json
// for why this is a curated list rather than an exhaustive automated sweep.
export function refreshLandmarksLayer() {
  if (!landmarks) return;
  if (viewer) {
    landmarkEntities.forEach((e) => viewer.entities.remove(e));
    landmarkEntities = landmarks.landmarks.map((l) =>
      viewer.entities.add({
        position: C.Cartesian3.fromDegrees(l.lon, l.lat, 0),
        point: {pixelSize: 6, color: C.Color.fromCssColorString('#8fe3bb'), heightReference: clampRef()},
        label: {
          text: l.name,
          font: '11px sans-serif',
          fillColor: C.Color.fromCssColorString('#d7f5e6'),
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString('#172234dd'),
          pixelOffset: new C.Cartesian2(0, -16),
          heightReference: clampRef(),
          disableDepthTestDistance: Infinity,
          translucencyByDistance: new C.NearFarScalar(500, 1.0, 20000, 0.1),
        },
      }),
    );
    viewer.scene.requestRender();
  }
  renderDiagram();
}

export function fit() {
  if (!viewer) {
    renderDiagram();
    onInteraction(); // matches setView()'s unconditional refresh below for the no-viewer case
    return;
  }
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  const pts = [...models[state.route].points, ...getTrackPoints()];
  const west = Math.min(...pts.map((p) => p[0])) - 0.014;
  const east = Math.max(...pts.map((p) => p[0])) + 0.014;
  const south = Math.min(...pts.map((p) => p[1])) - 0.012;
  const north = Math.max(...pts.map((p) => p[1])) + 0.012;
  viewer.camera.setView({
    destination: C.Rectangle.fromDegrees(west, south, east, north),
    orientation: {heading: 0, pitch: -Math.PI / 2, roll: 0},
  });
}

function updateCamera() {
  if (!viewer) return;
  viewer.scene.screenSpaceCameraController.enableInputs = state.view === 'overview';
  if (state.view === 'pilot') {
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    viewer.camera.setView({
      destination: currentPosition,
      orientation: {heading: flightHeading + state.yaw, pitch: rad(state.pitch), roll: 0},
    });
  } else if (state.view === 'follow') {
    const clampedPitch = Math.max(-85, Math.min(-8, state.pitch));
    viewer.camera.lookAt(
      currentPosition,
      new C.HeadingPitchRange(flightHeading + state.yaw, rad(clampedPitch), state.viewRange),
    );
  }
}

// Switches camera mode and always ends by calling the injected onInteraction() (HUD
// refresh) — matching the original's unconditional refresh() at the end of setView().
// Pilot view defaults to a natural forward-looking pitch (horizon visible, like a
// real cockpit) and a natural field of view; chase view keeps its old default.
export function setView(v) {
  if (!viewer && v !== 'overview') {
    toast('Pilot and chase views need WebGL. You can still rehearse and take quizzes in the route diagram.');
    return false;
  }
  state.view = v;
  state.yaw = 0;
  state.pitch = v === 'pilot' ? PILOT_AHEAD_PITCH_DEG : -20;
  if (v === 'pilot' && viewer) viewer.camera.frustum.fov = rad(PILOT_FOV_DEG);
  selectStates(state);
  if (v === 'overview') fit(); // note: fit() also calls onInteraction() when there's no viewer
  onInteraction();
  return true;
}

// Wires the view-mode tabs, the "fit" button, and the on-screen look buttons. Ahead
// and left/right share the same natural pitch; only "Below" stays steep.
export function wireViewControls() {
  all('[data-view]').forEach((b) => {
    b.onclick = () => setView(b.dataset.view);
  });
  $('fit').onclick = () => setView('overview');
  all('[data-look]').forEach((b) => {
    b.onclick = () => {
      if (!viewer) {
        toast('Look-around controls need the 3D map.');
        return;
      }
      if (state.view === 'overview') state.view = 'pilot';
      const look = b.dataset.look;
      state.yaw = look === 'left' ? -rad(PILOT_LOOK_YAW_DEG) : look === 'right' ? rad(PILOT_LOOK_YAW_DEG) : 0;
      state.pitch = look === 'down' ? PILOT_DOWN_PITCH_DEG : PILOT_AHEAD_PITCH_DEG;
      selectStates(state);
      onInteraction();
    };
  });
}

// --- Imagery / terrain -----------------------------------------------------------

export async function loadImagery() {
  if (!viewer) return;
  const rev = ++imageryGeneration;
  const type = $('basemap').value;
  try {
    const provider =
      type === 'satellite'
        ? await C.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            {enablePickFeatures: false},
          )
        : new C.OpenStreetMapImageryProvider({url: 'https://tile.openstreetmap.org/'});
    if (rev !== imageryGeneration) return; // a newer request superseded this one
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(provider);
    viewer.scene.requestRender();
  } catch (err) {
    console.warn('Imagery provider failed to load:', err);
    toast('Imagery could not load. Try the other map option in Settings.');
  }
}

export function setLabelsVisible(checked) {
  labels.forEach((l) => {
    l.show = checked;
  });
  if (viewer) viewer.scene.requestRender();
  else renderDiagram();
}

// resolutionScale always tracks the device's actual pixel ratio (capped at 2, to
// bound cost on very-high-DPI screens) for crispness — it's no longer gated behind
// the Quality selector, which now only trades off imagery/terrain tile resolution
// (maximumScreenSpaceError: lower = sharper but more tiles to fetch/render).
const RESOLUTION_SCALE = Math.min(devicePixelRatio || 1, 2);
const MSSE_BY_QUALITY = {balanced: 1.5, sharp: 1};

export function setQuality(quality) {
  if (!viewer) return;
  viewer.scene.globe.maximumScreenSpaceError = MSSE_BY_QUALITY[quality] ?? MSSE_BY_QUALITY.balanced;
  viewer.scene.requestRender();
}

// A lighter, partly-translucent style for OSM 3D buildings so they give a sense of
// the city without burying landmarks/runway markers underneath them — shown this way
// in every view, including Pilot.
function styleBuildingsLighter(tileset) {
  tileset.style = new C.Cesium3DTileStyle({color: "color('white', 0.45)"});
  return tileset;
}

export async function connectTerrain(token) {
  if (!viewer) {
    text(
      'terrain-message',
      'This browser cannot initialize WebGL. Open the site on a WebGL-capable device to load 3D detail.',
    );
    return;
  }
  if (!token) {
    text('terrain-message', 'Enter your Cesium ion read-only token.');
    return;
  }
  state.playing = false; // loading terrain can take a while — don't keep simulating under it
  onInteraction();
  const revision = ++terrainGeneration;
  text('terrain-message', 'Loading World Terrain…');
  $('connect-terrain').disabled = true;
  C.Ion.defaultAccessToken = token; // held only for this tab/session — never persisted
  try {
    const terrain = await C.createWorldTerrainAsync({requestVertexNormals: true});
    if (revision !== terrainGeneration) return; // superseded by a disconnect or another connect
    viewer.terrainProvider = terrain;
    text('terrain-status', 'Cesium World Terrain · loading buildings');
    text('terrain-message', 'Terrain connected. Loading available OSM buildings…');
    try {
      const loaded = await C.createOsmBuildingsAsync();
      if (revision !== terrainGeneration) {
        loaded.destroy();
        return;
      }
      if (buildings) viewer.scene.primitives.remove(buildings);
      buildings = viewer.scene.primitives.add(styleBuildingsLighter(loaded));
      text('terrain-status', 'World Terrain + OSM 3D buildings');
      text(
        'terrain-message',
        'Connected. Building detail depends on local coverage. Shown translucent in every view (including Pilot) so landmarks stay readable underneath.',
      );
    } catch (err) {
      console.warn('OSM buildings failed to load:', err);
      text('terrain-status', 'World Terrain · buildings unavailable');
      text(
        'terrain-message',
        'Terrain loaded, but buildings could not load. Check asset access on your token.',
      );
    }
    viewer.scene.requestRender();
  } catch (err) {
    console.warn('Cesium World Terrain failed to load:', err);
    text('terrain-message', 'Could not load terrain. Check the token, allowed URLs, and asset access.');
  } finally {
    if (revision === terrainGeneration) $('connect-terrain').disabled = false;
  }
}

// Experimental: Google Photorealistic 3D Tiles via Cesium ion, using the same
// session-only token as World Terrain. Google's terms for this asset require not
// showing it alongside other basemap imagery/terrain/building layers, so connecting
// here removes those; disconnectTerrain() (below) restores them. "Beta" per the UI
// label — this session has no ion token with access to verify it end-to-end, so
// treat this as reviewed-but-unverified rather than confirmed working.
export async function connectGoogle3D(token) {
  if (!viewer) {
    text(
      'terrain-message',
      'This browser cannot initialize WebGL. Open the site on a WebGL-capable device to load 3D detail.',
    );
    return;
  }
  if (!token) {
    text('terrain-message', 'Enter your Cesium ion access token.');
    return;
  }
  state.playing = false;
  onInteraction();
  const revision = ++terrainGeneration;
  text('terrain-message', 'Loading Google Photorealistic 3D Tiles…');
  $('connect-terrain').disabled = true;
  C.Ion.defaultAccessToken = token;
  try {
    // Per Google's terms for this asset: no other basemap imagery, terrain, or
    // building layer shown at the same time.
    viewer.imageryLayers.removeAll();
    viewer.terrainProvider = new C.EllipsoidTerrainProvider();
    if (buildings) {
      viewer.scene.primitives.remove(buildings);
      buildings = null;
    }
    // Note: despite the Async-suffix convention createWorldTerrainAsync/
    // createOsmBuildingsAsync follow elsewhere in this file, Cesium's own name for
    // this one is createGooglePhotorealistic3DTileset — no "Async" suffix, even
    // though it's still promise-returning (see Cesium's own usage example). Confirmed
    // against Cesium's docs after the first version of this code guessed the
    // Async-suffixed name by pattern-matching the other two and was wrong.
    const tileset = await C.createGooglePhotorealistic3DTileset();
    if (revision !== terrainGeneration) {
      tileset.destroy();
      return;
    }
    google3dTileset = viewer.scene.primitives.add(tileset);
    googleModeActive = true;
    setClampMode('3dtile');
    text('terrain-status', 'Google Photorealistic 3D Tiles (beta)');
    text(
      'terrain-message',
      'Connected. Imagery, World Terrain, and OSM buildings are hidden while Google 3D is active, per Google’s terms. Google’s own credits remain in the attribution bar below the map.',
    );
    viewer.scene.requestRender();
  } catch (err) {
    console.warn('Google Photorealistic 3D Tiles failed to load:', err);
    text(
      'terrain-message',
      "Could not load Google 3D Tiles. This usually means the token is missing the \"geocode\" scope that this asset requires (your account's default ion token has it; a token scoped down to specific assets, as suggested above for World Terrain, often doesn't). Try your account's default token, or add the geocode scope to a custom one. Check the browser console for the exact error.",
    );
  } finally {
    if (revision === terrainGeneration) $('connect-terrain').disabled = false;
  }
}

// Updates the HeightReference used by ground-clamped entities (place/landmark/
// checkpoint labels) — CLAMP_TO_GROUND clamps to terrain, which doesn't apply to 3D
// Tiles surfaces, so Google mode needs CLAMP_TO_3D_TILE instead or these would sink
// to the now-flat ellipsoid underneath Google's rendered surface.
function setClampMode(mode) {
  clampMode = mode;
  const ref = clampRef();
  [...labels, ...checkpointEntities, ...landmarkEntities].forEach((e) => {
    if (e.point) e.point.heightReference = ref;
    if (e.label) e.label.heightReference = ref;
  });
  if (runwayEntity?.label) runwayEntity.label.heightReference = ref;
  if (identifyMarker?.point) identifyMarker.point.heightReference = ref;
}

export function disconnectTerrain() {
  terrainGeneration++;
  $('connect-terrain').disabled = false;
  $('ion-token').value = '';
  if (C) C.Ion.defaultAccessToken = '';
  if (viewer) {
    viewer.terrainProvider = new C.EllipsoidTerrainProvider();
    if (buildings) viewer.scene.primitives.remove(buildings);
    buildings = null;
    if (google3dTileset) {
      viewer.scene.primitives.remove(google3dTileset);
      google3dTileset = null;
    }
    const wasGoogleMode = googleModeActive;
    googleModeActive = false;
    setClampMode('ground');
    viewer.scene.requestRender();
    text('terrain-status', 'Satellite imagery · smooth globe');
    if (wasGoogleMode) loadImagery(); // Google mode removed the base imagery layer — restore it
  }
  text('terrain-message', 'Using the basic globe. Token cleared from this session.');
}

// --- Setup / fallback --------------------------------------------------------------

function fallback(reason) {
  viewer?.destroy();
  viewer = null;
  $('map').replaceChildren();
  $('map').hidden = true;
  $('fallback-map').removeAttribute('hidden');
  $('map-note').hidden = false;
  text('map-note', reason + ' Practice and quizzes remain available below.');
  text('engine-status', 'Study diagram');
  text('terrain-status', '3D scene unavailable on this browser');
  renderDiagram();
  onInteraction();
}

// Keyboard look-around: arrow keys nudge yaw/pitch in Pilot and Follow views, the same
// way dragging the map does. This restores a control an earlier version of app.js had
// (see git history) that was lost when the single-file app grew — kept here since it's
// map/camera input, same family as the pointer handlers below it.
function wireKeyboardLook(canvas) {
  canvas.tabIndex = 0; // make the canvas focusable so it can receive key events
  canvas.addEventListener('keydown', (e) => {
    if (
      (state.view !== 'pilot' && state.view !== 'follow') ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
    ) {
      return;
    }
    e.preventDefault();
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    state.yaw += dx * 0.08;
    state.pitch = Math.max(-88, Math.min(70, state.pitch + dy * 4));
    updateCamera();
    viewer.scene.requestRender();
    onInteraction();
  });
}

export async function init() {
  try {
    if (!C) throw new Error('3D engine unavailable.');
    C.Ion.defaultAccessToken = '';
    viewer = new C.Viewer('map', {
      baseLayer: false,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: $('credits'),
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      shouldAnimate: false,
    });
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#253b4c');
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
    // Clarity: explicit 1x vertical exaggeration (no stretched-looking terrain),
    // device-pixel-ratio-aware resolution, antialiasing, and a sharper default tile
    // error tolerance than Cesium's own default (2) — see setQuality() for how the
    // Quality selector adjusts this further.
    viewer.scene.verticalExaggeration = 1;
    viewer.resolutionScale = RESOLUTION_SCALE;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.globe.maximumScreenSpaceError = MSSE_BY_QUALITY.balanced;

    planned = viewer.entities.add({
      polyline: {
        positions: [],
        width: 4,
        material: C.Color.fromCssColorString('#bda7fa'),
        arcType: C.ArcType.NONE,
      },
    });
    windLine = viewer.entities.add({
      polyline: {
        positions: [],
        width: 3,
        material: C.Color.fromCssColorString('#efb769'),
        arcType: C.ArcType.NONE,
      },
    });
    groundLine = viewer.entities.add({
      polyline: {
        positions: [],
        width: 2,
        clampToGround: true,
        material: new C.PolylineDashMaterialProperty({color: C.Color.WHITE.withAlpha(0.35)}),
      },
    });
    plane = viewer.entities.add({
      position: C.Cartesian3.fromDegrees(78.4676, 17.4531, 900),
      model: {uri: './aircraft.gltf', minimumPixelSize: 40, maximumScale: 140, scale: 2},
      billboard: {
        image:
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path d="M22 3h4l2 15 16 12v5l-17-6v10l6 4v3l-9-3-9 3v-3l6-4V29L4 35v-5l16-12Z" fill="white" stroke="#8b70bb"/></svg>',
          ),
        width: 32,
        height: 32,
        disableDepthTestDistance: Infinity,
      },
    });
    labels = routeData.places.map((p) =>
      viewer.entities.add({
        position: C.Cartesian3.fromDegrees(p.lon, p.lat),
        point: {pixelSize: 5, color: C.Color.WHITE, heightReference: clampRef()},
        label: {
          text: p.name,
          font: '13px sans-serif',
          fillColor: C.Color.WHITE,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString('#172234dd'),
          pixelOffset: new C.Cartesian2(0, -16),
          heightReference: clampRef(),
          disableDepthTestDistance: Infinity,
        },
      }),
    );

    // Click-to-identify: works in any view, picks against the ellipsoid (reliable
    // regardless of whether terrain/3D tiles are loaded) rather than scene depth.
    viewer.screenSpaceEventHandler.setInputAction((click) => {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = C.Cartographic.fromCartesian(cartesian);
      showIdentify(deg(carto.longitude), deg(carto.latitude));
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    // Pointer-driven look-around: one finger/mouse drags yaw+pitch, two fingers pinch
    // to zoom (chase view range) or adjust field of view (pilot view).
    const canvas = viewer.canvas;
    const pointers = new Map();
    let pinch = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (state.view === 'overview') return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const old = pointers.get(e.pointerId);
      if (!old) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) {
          state.viewRange = Math.max(60, Math.min(1300, state.viewRange * (pinch / d)));
          if (state.view === 'pilot') {
            viewer.camera.frustum.fov = Math.max(0.4, Math.min(1.6, viewer.camera.frustum.fov * (pinch / d)));
          }
        }
        pinch = d;
      } else {
        state.yaw -= (e.clientX - old[0]) * 0.005;
        state.pitch = Math.max(-88, Math.min(50, state.pitch + (e.clientY - old[1]) * 0.17));
      }
      onInteraction();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((event) =>
      canvas.addEventListener(event, (e) => {
        pointers.delete(e.pointerId);
        pinch = 0;
      }),
    );
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (state.view === 'overview') return;
        e.preventDefault();
        state.viewRange = Math.max(60, Math.min(1500, state.viewRange * Math.exp(e.deltaY * 0.001)));
        if (state.view === 'pilot') {
          viewer.camera.frustum.fov = Math.max(
            0.4,
            Math.min(1.6, viewer.camera.frustum.fov + e.deltaY * 0.001),
          );
        }
        onInteraction();
      },
      {passive: false},
    );
    wireKeyboardLook(canvas);

    viewer.scene.renderError.addEventListener(() => {
      state.playing = false;
      fallback('The 3D renderer stopped.');
    });

    text('engine-status', 'Satellite / Cesium');
    updateRoutes();
    fit();
    loadImagery();
  } catch (err) {
    console.warn('Cesium failed to initialize, falling back to the SVG diagram:', err);
    fallback('3D is unavailable on this device.');
  }
}
