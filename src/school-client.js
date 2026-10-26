import {cloud} from './cloud/firebase.ts';

// Every school endpoint checks current membership and teaching roster on the server.
export async function schoolRequest(school, path = '', body, method) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(school)) throw Error('Enter a valid school ID.');
  const user = cloud?.auth.currentUser;
  if (!user) throw Error('Sign in to open your school.');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 25000);
  try {
    const token = await user.getIdToken();
    if (cloud.auth.currentUser?.uid !== user.uid) throw Error('Account changed.');
    const response = await fetch(`/api/schools/${school}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json();
    if (cloud.auth.currentUser?.uid !== user.uid) throw Error('Account changed.');
    if (!response.ok)
      throw Error(
        typeof result.detail === 'string'
          ? result.detail
          : 'Check the form fields or your school permissions.',
      );
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError)
      throw Error('School service unavailable. Check your connection and API setup.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
