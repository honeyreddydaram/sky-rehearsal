import {airportPackage, airportCatalog, catalogPackage} from './airport.js';
import {validateAirportPackage} from './package.mjs';
import {$, text, showDialog, download} from '../ui/ui.js';
export function wireAirportBuilder(activate) {
  let preview = null;
  const clear = () => {
    preview = null;
    $('airport-apply').disabled = true;
    $('airport-export').disabled = true;
  };
  const show = (data) => {
    $('airport-json').value = JSON.stringify(data, null, 2);
    clear();
  };
  for (const entry of airportCatalog) {
    const option = document.createElement('option');
    option.value = entry.icao;
    option.textContent = `${entry.name} · ${entry.revision}`;
    $('airport-catalog').append(option);
  }
  $('airport-open').disabled = false;
  $('airport-open').onclick = () => showDialog('airport-dialog');
  $('airport-edit').onclick = () => show(airportPackage);
  $('airport-json').oninput = clear;
  const action = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      text('airport-status', error.message);
    }
  };
  $('airport-load').onclick = action(async () => {
    const data = await catalogPackage($('airport-catalog').value);
    activate(data);
    text('airport-status', `${data.airport.icao} loaded · ${data.review.status}.`);
    $('airport-dialog').close();
  });
  $('airport-file').onchange = action(async () => {
    const file = $('airport-file').files[0];
    if (!file || file.size > 1000000) throw Error('Choose an airport package under 1 MB.');
    show(JSON.parse(await file.text()));
    text('airport-status', 'Imported into editor. Validate before applying.');
    $('airport-file').value = '';
  });
  $('airport-validate').onclick = action(() => {
    clear();
    preview = validateAirportPackage(JSON.parse($('airport-json').value));
    text(
      'airport-status',
      `${preview.airport.icao} / ${preview.airport.name} · revision ${preview.revision} · ${preview.circuits.length} circuits · ${preview.review.status}. Source: ${preview.source}`,
    );
    $('airport-apply').disabled = false;
    $('airport-export').disabled = false;
  });
  $('airport-export').onclick = () => {
    if (preview) download(`${preview.airport.icao.toLowerCase()}-airport.json`, preview);
  };
  $('airport-apply').onclick = action(() => {
    if (!preview) throw Error('Validate the package first.');
    activate(preview);
    $('airport-dialog').close();
  });
}
