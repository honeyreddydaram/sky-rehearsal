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

import {rad} from './core.mjs';
import {state, models, routeData, getTrackPoints, heightAt} from './state.js';
import {$, all, text, toast, selectStates} from './ui.js';

const C = window.Cesium;

let viewer = null;
let plane, planned, windLine, groundLine;
let labels = [];
let currentPosition,
  flightHeading = 0;
let buildings = null;
let terrainGeneration = 0;
let imageryGeneration = 0;

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
  const coords = [
    ...models[state.route].points,
    ...getTrackPoints(),
    ...routeData.places.map((p) => [p.lon, p.lat]),
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
export function setView(v) {
  if (!viewer && v !== 'overview') {
    toast('Pilot and chase views need WebGL. You can still rehearse and take quizzes in the route diagram.');
    return false;
  }
  state.view = v;
  state.yaw = 0;
  state.pitch = -20;
  selectStates(state);
  if (v === 'overview') fit(); // note: fit() also calls onInteraction() when there's no viewer
  onInteraction();
  return true;
}

// Wires the view-mode tabs, the "fit" button, and the on-screen look buttons.
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
      state.yaw = b.dataset.look === 'left' ? -Math.PI / 2 : b.dataset.look === 'right' ? Math.PI / 2 : 0;
      state.pitch = b.dataset.look === 'down' ? -85 : -20;
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

export function setQuality(quality) {
  if (!viewer) return;
  viewer.useBrowserRecommendedResolution = true;
  viewer.resolutionScale = quality === 'sharp' ? Math.min(devicePixelRatio || 1, 2) : 1;
  viewer.scene.globe.maximumScreenSpaceError = quality === 'sharp' ? 1 : 2;
  viewer.resize();
  viewer.scene.requestRender();
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
      buildings = viewer.scene.primitives.add(loaded);
      text('terrain-status', 'World Terrain + OSM 3D buildings');
      text('terrain-message', 'Connected. Building detail depends on local coverage.');
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

export function disconnectTerrain() {
  terrainGeneration++;
  $('connect-terrain').disabled = false;
  $('ion-token').value = '';
  if (C) C.Ion.defaultAccessToken = '';
  if (viewer) {
    viewer.terrainProvider = new C.EllipsoidTerrainProvider();
    if (buildings) viewer.scene.primitives.remove(buildings);
    buildings = null;
    viewer.scene.requestRender();
    text('terrain-status', 'Satellite imagery · smooth globe');
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
        point: {pixelSize: 5, color: C.Color.WHITE, heightReference: C.HeightReference.CLAMP_TO_GROUND},
        label: {
          text: p.name,
          font: '13px sans-serif',
          fillColor: C.Color.WHITE,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString('#172234dd'),
          pixelOffset: new C.Cartesian2(0, -16),
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Infinity,
        },
      }),
    );

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
