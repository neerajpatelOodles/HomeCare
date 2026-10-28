'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> go straight to the portal.
  useEffect(() => {
    if (!loading && user) router.replace(ROLE_HOME[user.role]);
  }, [user, loading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      router.replace(ROLE_HOME[u.role]); // role-based redirection
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={handleSubmit} noValidate>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          <span>Home-Care Central</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Clients, caregivers, HR and administrators sign in here.</p>

        {error && <p className="alert" role="alert">{error}</p>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className="btn btn-primary" type="submit" disabled={submitting || !email || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="switch-link">
          Need an account? <Link href="/register">Create one as a client</Link>
        </p>
        <p className="switch-link">
          Looking for a caregiving job? <Link href="/apply">Apply here</Link>
        </p>
      </form>
    </div>
  );
}
