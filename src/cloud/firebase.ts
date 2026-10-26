import {initializeApp} from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {getStorage, connectStorageEmulator, ref, uploadBytes, getBytes} from 'firebase/storage';

const env = import.meta.env;
const emulate = env.VITE_FIREBASE_EMULATORS === 'true';
const projectId = env.VITE_FIREBASE_PROJECT_ID;
export const cloudConfigured = Boolean(projectId && (emulate || env.VITE_FIREBASE_API_KEY));
function initialize() {
  if (emulate && (!import.meta.env.DEV || projectId !== 'demo-sky-rehearsal'))
    throw new Error('Emulators require the demo project and Vite development mode.');
  const app = initializeApp({
    projectId,
    apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app),
    db = getFirestore(app),
    storage = getStorage(app);
  if (emulate) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  return {auth, db, storage};
}
export const cloud = cloudConfigured ? initialize() : null;
export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
};
export type {User};

export async function loadAccount(user: User) {
  if (!cloud) throw new Error('Firebase is not configured.');
  const [sessions, profiles] = await Promise.all([
    getDocs(
      query(collection(cloud.db, 'users', user.uid, 'sessions'), orderBy('completedAt', 'desc'), limit(300)),
    ),
    getDocs(collection(cloud.db, 'users', user.uid, 'profiles')),
  ]);
  return {
    id: user.uid,
    name: (user.displayName || user.email || 'Student').slice(0, 40),
    sessions: sessions.docs.map((d) => d.data()).reverse(),
    flightProfiles: profiles.docs.map((d) => d.data()),
  };
}

export async function saveAccount(
  uid: string,
  account: {sessions: Array<{id: string}>; flightProfiles: Array<{id: string}>},
) {
  if (!cloud || cloud.auth.currentUser?.uid !== uid) throw new Error('Account changed; sign in again.');
  // Session IDs are immutable and independent, so another device cannot overwrite
  // an entire progress snapshot. Existing sessions never need an update write.
  for (const session of account.sessions) {
    const target = doc(cloud.db, 'users', uid, 'sessions', session.id);
    if (!(await getDoc(target)).exists()) await setDoc(target, session);
  }
  for (const profile of account.flightProfiles)
    await setDoc(doc(cloud.db, 'users', uid, 'profiles', profile.id), profile);
}

export async function saveTrack(name: string, rows: unknown, reference: string, geoidOffsetM: number | null) {
  const user = cloud?.auth.currentUser;
  if (!cloud || !user) throw new Error('Sign in before saving a flight.');
  const id = crypto.randomUUID(),
    path = `users/${user.uid}/tracks/${id}.json`;
  const metadata = {
    name: name.slice(0, 200),
    path,
    reference,
    geoidOffsetM,
    createdAt: new Date().toISOString(),
  };
  await uploadBytes(ref(cloud.storage, path), new Blob([JSON.stringify(rows)], {type: 'application/json'}), {
    contentType: 'application/json',
  });
  await setDoc(doc(cloud.db, 'users', user.uid, 'tracks', id), metadata);
}
export async function listTracks() {
  const user = cloud?.auth.currentUser;
  if (!cloud || !user) throw new Error('Sign in to load flights.');
  const result = await getDocs(collection(cloud.db, 'users', user.uid, 'tracks'));
  if (cloud.auth.currentUser?.uid !== user.uid) throw new Error('Account changed.');
  return result.docs.map((d) => ({id: d.id, ...d.data()}));
}
export async function readTrack(id: string) {
  const user = cloud?.auth.currentUser;
  if (!cloud || !user || !/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Sign in and choose a saved flight.');
  const data = (await getDoc(doc(cloud.db, 'users', user.uid, 'tracks', id))).data();
  if (!data) throw new Error('Flight not found.');
  const bytes = await getBytes(ref(cloud.storage, `users/${user.uid}/tracks/${id}.json`), 15000000);
  if (cloud.auth.currentUser?.uid !== user.uid) throw new Error('Account changed.');
  return {rows: JSON.parse(new TextDecoder().decode(bytes)), ...data};
}
