import React from 'react';
export default function AccountDialog() {
  return (
    <dialog id="account-dialog">
      <div className="section-head">
        <h2>Cloud account</h2>
        <button data-close aria-label="Close">
          ×
        </button>
      </div>
      <p id="account-status" role="status">
        Guest practice · progress stays on this browser.
      </p>
      <form id="account-form">
        <label>
          Email
          <input id="account-email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            id="account-password"
            type="password"
            minLength={8}
            autoComplete="current-password"
            required
          />
        </label>
        <button id="account-signin" type="submit">
          Sign in
        </button>
        <button id="account-register" type="button">
          Create student account
        </button>
        <button id="account-google" type="button">
          Continue with Google
        </button>
        <button id="account-reset" type="button">
          Reset password
        </button>
      </form>
      <div id="account-actions" hidden>
        <label className="check">
          <input id="share-usage" type="checkbox" /> Share limited usage metrics for this signed-in session
        </label>
        <p className="micro">
          Optional: airport code, training mode and recall score. No raw flight, audio, account ID or answers
          in the event log. Operational API logs are separate.
        </p>
        <button id="account-sync">Sync progress</button>
        <button id="account-copy">Copy guest progress into account</button>
        <button id="account-signout">Sign out</button>
        <p className="micro">
          Completed sessions and imported profiles sync to your account. Copying guest progress is optional.
          Role permissions are assigned by an administrator.
        </p>
      </div>
    </dialog>
  );
}
