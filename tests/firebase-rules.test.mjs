import {readFileSync} from 'node:fs';
import {test, after, before} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, getDocs, collection, updateDoc} from 'firebase/firestore';
import {ref, uploadBytes, getBytes} from 'firebase/storage';
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-sky-rehearsal',
    firestore: {host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8')},
    storage: {host: '127.0.0.1', port: 9199, rules: readFileSync('storage.rules', 'utf8')},
  });
});
after(async () => environment?.cleanup());
const session = {
  id: 'attempt-1',
  route: 'circuit27',
  mode: 'quiz',
  completedAt: '2026-01-01T00:00:00Z',
  profile: 'Demo',
  score: 4,
  total: 5,
};
test('owner can save and read a session, but cannot change its score', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  const target = doc(db, 'users/alice/sessions/attempt-1');
  await assertSucceeds(setDoc(target, session));
  await assertSucceeds(getDoc(target));
  await assertFails(updateDoc(target, {score: 5}));
});
test('another student and signed-out callers cannot read or list private sessions', async () => {
  for (const context of [environment.authenticatedContext('bob'), environment.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), 'users/alice/sessions/attempt-1')));
    await assertFails(getDocs(collection(context.firestore(), 'users/alice/sessions')));
    await assertFails(
      setDoc(doc(context.firestore(), 'users/alice/sessions/foreign'), {...session, id: 'foreign'}),
    );
  }
});
test('client cannot self-promote or smuggle a role into session data', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice'), {role: 'platform_admin'}));
  await assertFails(
    setDoc(doc(db, 'users/alice/sessions/escalate'), {...session, id: 'escalate', role: 'platform_admin'}),
  );
  await assertFails(setDoc(doc(db, 'users/alice/sessions/score'), {...session, id: 'score', score: 100}));
});
test('roles do not implicitly grant cross-user or cross-school data access', async () => {
  for (const role of ['instructor', 'school_admin', 'platform_admin']) {
    const db = environment.authenticatedContext('staff', {role, organizationId: 'school-b'}).firestore();
    await assertFails(getDoc(doc(db, 'users/alice/sessions/attempt-1')));
  }
});
test('owner can store and download a JSON track, other accounts cannot', async () => {
  const alice = environment.authenticatedContext('alice').storage();
  await assertSucceeds(
    uploadBytes(
      ref(alice, 'users/alice/tracks/flight-1.json'),
      new TextEncoder().encode('[{"latitude":17}]'),
      {contentType: 'application/json'},
    ),
  );
  await assertSucceeds(getBytes(ref(alice, 'users/alice/tracks/flight-1.json')));
  await assertFails(
    getBytes(ref(environment.authenticatedContext('bob').storage(), 'users/alice/tracks/flight-1.json')),
  );
  await assertFails(
    getBytes(ref(environment.unauthenticatedContext().storage(), 'users/alice/tracks/flight-1.json')),
  );
  await assertFails(
    uploadBytes(ref(alice, 'users/alice/tracks/html.json'), new Uint8Array([1]), {contentType: 'text/html'}),
  );
  await assertFails(
    uploadBytes(ref(alice, 'users/bob/tracks/foreign.json'), new Uint8Array([1]), {
      contentType: 'application/json',
    }),
  );
});
test('track metadata cannot point to another account', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  const data = {
    name: 'Flight',
    createdAt: '2026-01-01T00:00:00Z',
    reference: 'MSL',
    geoidOffsetM: -76,
    path: 'users/alice/tracks/flight-1.json',
  };
  await assertSucceeds(setDoc(doc(db, 'users/alice/tracks/flight-1'), data));
  await assertFails(
    setDoc(doc(db, 'users/alice/tracks/foreign'), {...data, path: 'users/bob/tracks/foreign.json'}),
  );
});

test('new assessment modes persist difficulty and hint metadata without allowing invalid levels', async () => {
  const db = environment.authenticatedContext('training-student').firestore();
  for (const mode of ['landmarks', 'decisions', 'exam']) {
    await assertSucceeds(
      setDoc(doc(db, `users/training-student/sessions/${mode}`), {
        ...session,
        id: mode,
        mode,
        difficulty: 'advanced',
        hintsUsed: 0,
      }),
    );
  }
  await assertSucceeds(
    setDoc(doc(db, 'users/training-student/sessions/practice'), {
      ...session,
      id: 'practice',
      mode: 'practice',
      difficulty: 'intermediate',
      hintsUsed: 2,
      score: null,
      total: null,
    }),
  );
  await assertFails(
    setDoc(doc(db, 'users/training-student/sessions/bad-level'), {
      ...session,
      id: 'bad-level',
      mode: 'exam',
      difficulty: 'invented',
    }),
  );
});

test('debrief summaries can be saved on private sessions/tracks; unsupported versions are denied', async () => {
  const db = environment.authenticatedContext('debrief-student').firestore();
  const debrief = {version: 1, events: [], source: 'simulation', overall: null};
  await assertSucceeds(
    setDoc(doc(db, 'users/debrief-student/sessions/report'), {...session, id: 'report', debrief}),
  );
  await assertFails(
    setDoc(doc(db, 'users/debrief-student/sessions/bad-report'), {
      ...session,
      id: 'bad-report',
      debrief: {...debrief, version: 99},
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, 'users/debrief-student/tracks/report'), {
      name: 'Flight',
      createdAt: '2026-01-01T00:00:00Z',
      reference: 'MSL',
      geoidOffsetM: -76,
      path: 'users/debrief-student/tracks/report.json',
      debrief,
    }),
  );
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext('other-student').firestore(),
        'users/debrief-student/tracks/report',
      ),
    ),
  );
});

test('completed sessions retain bounded weather and aircraft inputs privately', async () => {
  const db = environment.authenticatedContext('conditions-owner').firestore();
  const conditions = {
    version: 1,
    weather: {
      source: 'Training scenario',
      observedAt: null,
      qnh: 1008,
      temperature: 30,
      visibilityM: 8000,
      clouds: 'SCT030',
      gustKt: null,
    },
    aircraft: null,
  };
  await assertSucceeds(
    setDoc(doc(db, 'users/conditions-owner/sessions/weather'), {
      ...session,
      id: 'weather',
      environment: conditions,
    }),
  );
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext('other-student').firestore(),
        'users/conditions-owner/sessions/weather',
      ),
    ),
  );
  await assertFails(
    setDoc(doc(db, 'users/conditions-owner/sessions/bad-weather'), {
      ...session,
      id: 'bad-weather',
      environment: {...conditions, weather: {...conditions.weather, qnh: 0}},
    }),
  );
});

test('aircraft performance snapshots require bounded numeric phase speeds', async () => {
  const db = environment.authenticatedContext('performance-owner').firestore();
  const weather = {
    source: 'Training scenario',
    observedAt: null,
    qnh: 1013,
    temperature: 20,
    visibilityM: 10000,
    clouds: 'Clear',
    gustKt: null,
  };
  const aircraft = {
    version: 1,
    typeCode: 'c152',
    source: 'Fixture',
    reference: 'Synthetic, not POH',
    reviewedBy: 'Test reviewer',
    bankDeg: 20,
    phaseSpeedsKias: Object.fromEntries(
      ['takeoff', 'upwind', 'crosswind', 'downwind', 'base', 'final', 'landing'].map((p) => [p, 80]),
    ),
  };
  await assertSucceeds(
    setDoc(doc(db, 'users/performance-owner/sessions/performance'), {
      ...session,
      id: 'performance',
      environment: {version: 1, weather, aircraft},
    }),
  );
  await assertFails(
    setDoc(doc(db, 'users/performance-owner/sessions/bad-performance'), {
      ...session,
      id: 'bad-performance',
      environment: {
        version: 1,
        weather,
        aircraft: {...aircraft, phaseSpeedsKias: {...aircraft.phaseSpeedsKias, final: 'invalid'}},
      },
    }),
  );
});

test('school records and submitted evidence cannot be edited directly by clients', async () => {
  for (const role of ['student', 'instructor', 'school_admin', 'platform_admin']) {
    const db = environment.authenticatedContext(`school-${role}`, {role}).firestore();
    for (const path of [
      'schools/test/members/anyone',
      'schools/test/scenarios/draft',
      'schools/test/assignments/exercise',
      'schools/test/submissions/evidence',
    ]) {
      await assertFails(setDoc(doc(db, path), {role: 'school_admin', active: true}));
      await assertFails(getDoc(doc(db, path)));
    }
  }
});

test('airport-scoped circuit sessions persist without granting quota or school privileges', async () => {
  const db = environment.authenticatedContext('airport-owner').firestore();
  await assertSucceeds(
    setDoc(doc(db, 'users/airport-owner/sessions/airport-flight'), {
      ...session,
      id: 'airport-flight',
      route: 'circuit18',
      airportId: 'ZZZZ',
      airportRevision: 'synthetic-v1',
    }),
  );
  await assertFails(
    setDoc(doc(db, 'users/airport-owner/sessions/bad-airport'), {
      ...session,
      id: 'bad-airport',
      airportId: '../other',
    }),
  );
  await assertFails(setDoc(doc(db, '_apiQuota/airport-owner'), {count: 0}));
  await assertFails(getDoc(doc(db, '_apiQuota/airport-owner')));
});
