export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function Login({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const error = one(sp.error) === '1';
  const next = one(sp.next);
  return (
    <div className="login">
      <form className="login-card" method="post" action="/api/login">
        <div className="eyebrow">Oneshot Board</div>
        <h1>Sign in</h1>
        {error ? <p className="login-err">That username and password didn’t match.</p> : <p className="login-sub">Your account lives in the board’s database — created with <code>npm run user:add</code>.</p>}
        <label>Username<input name="username" autoComplete="username" autoCapitalize="none" autoFocus required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
