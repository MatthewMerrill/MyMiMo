const MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  not_allowed: "That Discord account isn't allowed to use this instance.",
  state_mismatch: 'Sign-in expired or was tampered with. Please try again.',
  discord_error: "Couldn't reach Discord. Please try again.",
}

export function LoginView() {
  const code = new URLSearchParams(window.location.search).get('login_error')
  return (
    <div className="login">
      <h1>mymimo</h1>
      <p className="muted">Pages, notes, and the tasks that go with them.</p>
      {code && <p className="error">{MESSAGES[code] ?? `Sign-in failed (${code}).`}</p>}
      <a className="button primary" href="/api/auth/discord/login">Sign in with Discord</a>
    </div>
  )
}
