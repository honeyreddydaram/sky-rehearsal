import {spawnSync} from 'node:child_process';
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, {stdio: 'inherit', env: {...process.env, ...env}});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(process.execPath, ['--test', 'tests/firebase-rules.test.mjs']);
run('uv', ['run', '--project', 'backend', '--frozen', 'pytest', 'backend/tests'], {
  APP_ENV: 'development',
  RUN_FIREBASE_FULL_SUITE: 'true',
  FIREBASE_PROJECT_ID: 'demo-sky-rehearsal',
});
run('npx', ['playwright', 'test', '--config', 'firebase.playwright.config.mjs']);
