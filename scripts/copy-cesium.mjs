import {cpSync, mkdirSync} from 'node:fs';

// Workers and globe assets are served locally in development and the built site.
mkdirSync('public/cesium', {recursive: true});
for (const directory of ['Assets', 'ThirdParty', 'Workers', 'Widgets']) {
  cpSync(`node_modules/cesium/Build/Cesium/${directory}`, `public/cesium/${directory}`, {
    recursive: true,
  });
}
