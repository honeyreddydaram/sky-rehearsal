// settings.js
// Wiring for the "Map settings" dialog: basemap/quality/label toggles and the Cesium
// ion terrain token flow. The actual Cesium work lives in map.js; this module just
// connects the dialog's form controls to it.
//
// Unlike map.js/playback.js/progress.js, settings.js is a leaf — nothing imports it —
// so it's free to import playback.js directly for refresh() without risking a cycle.

import {$, showDialog} from './ui.js';
import {refresh} from '../flight/playback.js';
import * as map from '../map/map.js';

export function init() {
  $('settings-open').onclick = () => showDialog('settings-dialog');
  $('terrain-open').onclick = () => showDialog('settings-dialog');

  $('basemap').onchange = () => map.loadImagery();

  $('labels').onchange = () => {
    const hadViewer = map.hasViewer();
    map.setLabelsVisible($('labels').checked);
    if (!hadViewer) refresh(); // renderDiagram() redrew the SVG — resync the plane marker too
  };

  $('quality').onchange = () => map.setQuality($('quality').value);

  $('buildings-toggle').onchange = () => map.setBuildingsVisible($('buildings-toggle').checked);

  $('connect-terrain').onclick = () => {
    const token = $('ion-token').value.trim();
    if ($('google-3d-beta').checked) map.connectGoogle3D(token);
    else map.connectTerrain(token);
  };
  $('disconnect-terrain').onclick = () => map.disconnectTerrain();
}
