import {
  cloud,
  cloudConfigured,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  loadAccount,
  saveAccount,
} from '../cloud/firebase';
import {activateAccount, guestProgress, learner, save} from './progress.js';
import {validateProfile, validateProgressBackup} from '../flight/core.mjs';
import {$, text, showDialog} from '../ui/ui.js';

export function wireAccount() {
  let readyUid = null,
    generation = 0,
    pending = Promise.resolve(),
    saveError = null;
  const status = (message) => text('account-status', message);
  $('account-open').onclick = () => showDialog('account-dialog');
  $('account-open').disabled = false;
  if (!cloudConfigured || !cloud) {
    for (const button of $('account-form').querySelectorAll('button')) button.disabled = true;
    status('Cloud sign-in is unavailable here. Guest practice and progress export remain available.');
    return;
  }
  const persist = (account) => {
    const uid = readyUid;
    pending = pending.catch(() => {}).then(() => saveAccount(uid, account));
    pending.then(
      () => {
        saveError = null;
      },
      (error) => {
        saveError = error;
      },
    );
    return pending;
  };
  const load = async (user, version) => {
    const account = await loadAccount(user);
    if (version !== generation || cloud.auth.currentUser?.uid !== user.uid) return;
    validateProgressBackup({schemaVersion: 1, learner: account});
    account.flightProfiles = account.flightProfiles.map((p) => ({...validateProfile(p), id: p.id}));
    readyUid = user.uid;
    activateAccount(account, persist);
    const token = await user.getIdTokenResult();
    if (version !== generation) return;
    const role = ['student', 'instructor', 'school_admin', 'platform_admin'].includes(token.claims.role)
      ? token.claims.role
      : 'student';
    status(
      `Signed in as ${user.email || user.uid} · ${role}. Account progress loaded. Your account ID for school enrollment: ${user.uid}`,
    );
    text('account-open', 'My account');
    text('save-status', 'Account progress loaded');
  };
  onAuthStateChanged(cloud.auth, (user) => {
    const version = ++generation;
    readyUid = null;
    activateAccount(null);
    window.dispatchEvent(new Event('account-changed'));
    $('account-form').hidden = Boolean(user);
    $('account-actions').hidden = !user;
    $('account-copy').disabled = true;
    if (!user) {
      text('account-open', 'Account');
      status('Guest practice · progress stays on this browser.');
      text('save-status', 'Guest progress · this browser');
      return;
    }
    status('Loading account progress…');
    void load(user, version)
      .then(() => {
        $('account-copy').disabled = !readyUid;
      })
      .catch(() =>
        status(
          'Account data could not load. Guest practice remains active. Retry Sync before using cloud progress.',
        ),
      );
  });
  const action = (fn) => async (event) => {
    event.preventDefault();
    try {
      await fn();
    } catch (error) {
      status(
        `Account action failed (${error.code || 'connection or permission error'}). Your guest data is unchanged.`,
      );
    }
    $('account-password').value = '';
  };
  $('account-form').onsubmit = action(() =>
    signInWithEmailAndPassword(cloud.auth, $('account-email').value.trim(), $('account-password').value),
  );
  $('account-register').onclick = action(() =>
    createUserWithEmailAndPassword(cloud.auth, $('account-email').value.trim(), $('account-password').value),
  );
  $('account-google').onclick = action(() => signInWithPopup(cloud.auth, new GoogleAuthProvider()));
  $('account-reset').onclick = action(async () => {
    if (!$('account-email').value.trim()) throw new Error('Email required');
    await sendPasswordResetEmail(cloud.auth, $('account-email').value.trim());
    status('If that account is eligible, a password reset email has been requested.');
  });
  $('account-signout').onclick = action(async () => {
    await pending;
    if (saveError) throw saveError;
    await signOut(cloud.auth);
  });
  $('account-sync').onclick = action(async () => {
    await pending.catch(() => {});
    if (readyUid) await persist(structuredClone(learner()));
    await load(cloud.auth.currentUser, generation);
    $('account-copy').disabled = !readyUid;
  });
  $('account-copy').onclick = action(async () => {
    if (!readyUid) throw new Error('Load account first');
    const guest = guestProgress(),
      account = learner();
    const merge = (a, b) => [...new Map([...a, ...b].map((item) => [item.id, item])).values()];
    account.sessions = merge(guest.sessions, account.sessions).slice(-300);
    account.flightProfiles = merge(guest.flightProfiles, account.flightProfiles).slice(-30);
    save();
    await pending;
    status('Guest progress copied to your account. The browser guest profile is unchanged.');
  });
}
