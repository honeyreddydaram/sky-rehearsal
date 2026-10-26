import {cloud} from '../cloud/firebase.ts';

// Explicit click only; no automatic transmission of tracks or learner identity.
export function addGeminiExplanation(container, context) {
  const button = document.createElement('button');
  button.textContent = 'Ask Gemini to explain';
  const output = document.createElement('p');
  output.setAttribute('role', 'status');
  output.textContent =
    'Optional: sends this teaching summary to Google Cloud. Sign-in required. AI explanations may be mistaken; check the reference and original metrics.';
  container.append(button, output);
  button.onclick = async () => {
    const user = cloud?.auth.currentUser;
    if (!user) {
      output.textContent = 'Sign in to use Gemini. Local hints and deterministic debriefs remain available.';
      return;
    }
    button.disabled = true;
    output.textContent = 'Requesting a Gemini explanation…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const current = () =>
      container.isConnected && button.isConnected && cloud.auth.currentUser?.uid === user.uid;
    try {
      const token = await user.getIdToken();
      if (!current()) return;
      const response = await fetch('/api/instructor', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify(context),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (typeof result.message !== 'string' || result.message.length > 2000) throw new Error('invalid');
      if (current()) output.textContent = `Gemini / Vertex AI · ${result.message}`;
    } catch {
      if (current())
        output.textContent =
          'Gemini is unavailable. Use the local hint or original debrief metrics and try again later.';
    } finally {
      clearTimeout(timeout);
      if (current()) button.disabled = false;
    }
  };
}
