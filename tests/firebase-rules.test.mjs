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
