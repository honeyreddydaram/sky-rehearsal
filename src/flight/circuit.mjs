import {distance, resolveRunwayEnds, bearing} from './core.mjs';

// Landmarks seen to the side are NOT route vertices. Only explicit turn points
// define this illustrative track; a missing final intercept is projected onto
// the runway line and must remain labelled as inferred.
export function buildCircuit(airport, circuits, runway) {
  const source = circuits['27'];
  const circuit = circuits[runway];
  if (!source || !circuit) throw new Error('Circuit data unavailable');
  const ends = resolveRunwayEnds(airport.referencePoint, airport.runways[0]);
  const turn = (next) => {
    const checkpoint = source.legs.flatMap((leg) => leg.checkpoints).find((c) => c.turnTo === next);
    if (!checkpoint?.coords) throw new Error(`Missing turn point for ${next}`);
    return checkpoint.coords;
  };
  const cyber = turn('crosswind');
  const wells = turn('downwind');
  const junction = turn('base');
  // Local planar projection, sufficient only for this small familiarization area.
  const scale = Math.cos((airport.referencePoint.lat * Math.PI) / 180);
  const axis = [(ends['27'][0] - ends['09'][0]) * scale, ends['27'][1] - ends['09'][1]];
  const offset = [(junction[0] - ends['09'][0]) * scale, junction[1] - ends['09'][1]];
  const t = (offset[0] * axis[0] + offset[1] * axis[1]) / (axis[0] ** 2 + axis[1] ** 2);
  const intercept = [ends['09'][0] + (t * axis[0]) / scale, ends['09'][1] + t * axis[1]];
  const points = [ends['27'], ends['09'], cyber, wells, junction, intercept, ends['27'], ends['09']];
  if (runway === '09') points.reverse();
  const lengths = [0];
  points.slice(1).forEach((point, i) => lengths.push(lengths[i] + distance(points[i], point)));
  const model = {points, lengths, total: lengths.at(-1)};
  const names = ['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'];
  const stages = names.map((name, i) => {
    const leg = circuit.legs.find((leg) => leg.name === name);
    return {
      name,
      start: lengths[i] / model.total,
      end: lengths[i + 1] / model.total,
      altitudeFt: [
        airport.elevation.ft,
        airport.elevation.ft + 100,
        airport.circuitAltitude.circuitAltitudeAmslFt,
        airport.circuitAltitude.circuitAltitudeAmslFt,
        airport.circuitAltitude.circuitAltitudeAmslFt,
        airport.elevation.ft + 700,
        airport.elevation.ft,
      ][i],
      speedKt: [55, 65, 90, 90, 90, 65, 55][i],
      headingTrue: bearing(points[i], points[i + 1]),
      referenceHeadingTrue: leg?.headingTrue ?? Number(runway) * 10,
      landmarks: leg?.checkpoints ?? [],
      turnPoint: points[i + 1],
      nextLeg: names[i + 1] ?? null,
      expectedAction: i < 6 ? `Continue ${name}; next: ${names[i + 1]}.` : 'Complete the ground rehearsal.',
    };
  });
  return {model, stages, runway, verified: false, inferredIntercept: intercept};
}

export function circuitStage(circuit, progress) {
  return circuit.stages.find((stage) => progress < stage.end) ?? circuit.stages.at(-1);
}
