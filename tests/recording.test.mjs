import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {normalizeRecording, parseCsv, parseGpx, recordingAt} from '../src/flight/recording.mjs';
const csv =
  'timestamp,latitude,longitude,altitude_m,heading_true\n2026-01-01T00:00:00Z,17.45,78.45,600,350\n2026-01-01T00:00:10Z,17.46,78.46,610,10';
const rows = parseCsv(csv);
const options = {reference: 'MSL', geoidOffsetM: -76};
const recording = normalizeRecording(rows, options);
assert.equal(recording.duration, 10);
const middle = recordingAt(recording, 5);
assert.equal(middle.heading, 0);
assert.equal(middle.altitudeM, 605);
assert.equal(middle.height, 529);
assert.ok(Math.abs(middle.position[0] - 78.455) < 1e-9);
assert.ok(middle.speedKt > 0);
assert.ok(Math.abs(middle.verticalSpeedFpm - 196.850394) < 0.01);
assert.equal(recordingAt(recording, -100).timestamp, recording.points[0].timestamp);
assert.equal(recordingAt(recording, 100).timestamp, recording.points[1].timestamp);
assert.throws(() => normalizeRecording(rows, {reference: 'MSL'}), /geoid/);
for (const mutation of [
  (r) => (r[1].timestamp = r[0].timestamp),
  (r) => (r[1].latitude = ''),
  (r) => (r[1].longitude = null),
  (r) => (r[1].latitude = '91'),
  (r) => (r[1].altitude_m = 'NaN'),
  (r) => (r[1].timestamp = '2026-01-01T00:00:10'),
  (r) => (r[1].speed_kt = '-1'),
]) {
  const invalid = structuredClone(rows);
  mutation(invalid);
  assert.throws(() => normalizeRecording(invalid, options));
}
assert.throws(() => parseCsv('latitude,longitude\n17,78'), /headers/);
assert.throws(() => parseCsv(csv + ',extra'), /fields/);
const Parser = new JSDOM('').window.DOMParser;
const gpx =
  '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="17.45" lon="78.45"><ele>600</ele><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="17.46" lon="78.46"><ele>610</ele><time>2026-01-01T00:00:10Z</time></trkpt></trkseg></trk></gpx>';
const track = normalizeRecording(parseGpx(gpx, Parser), {reference: 'ELLIPSOID'});
assert.equal(track.points[0].height, 600);
assert.equal(track.points[0].headingDerived, true);
assert.throws(() => parseGpx('<gpx>', Parser), /Invalid/);
assert.throws(() => parseGpx(gpx.replace('</trk>', '<trkseg/></trk>'), Parser), /one continuous/);
assert.throws(
  () => normalizeRecording(parseGpx(gpx.replace(' lat="17.45"', ''), Parser), options),
  /invalid/,
);
const dateline = normalizeRecording(
  [
    {timestamp: rows[0].timestamp, latitude: 0, longitude: 179, altitude_m: 0},
    {timestamp: rows[1].timestamp, latitude: 0, longitude: -179, altitude_m: 0},
  ],
  {reference: 'ELLIPSOID'},
);
assert.equal(Math.abs(recordingAt(dateline, 5).position[0]), 180);
console.log(
  'Recording tests passed: CSV/GPX validation, units, interpolation, derived telemetry, date line.',
);
