'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(ROLE_HOME[user.role]);
  }, [user, loading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const created = await register({
        ...form,
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: 'client',
      });
      router.replace(ROLE_HOME[created.role]);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={handleSubmit} noValidate>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          <span>Home-Care Central</span>
        </div>
        <h1>Create account</h1>
        <p className="muted">New users register as a client by default.</p>

        {error && <p className="alert" role="alert">{error}</p>}

        <label htmlFor="firstName">First name</label>
        <input
          id="firstName"
          type="text"
          autoComplete="given-name"
          value={form.firstName}
          onChange={(e) => updateField('firstName', e.target.value)}
          required
        />

        <label htmlFor="lastName">Last name</label>
        <input
          id="lastName"
          type="text"
          autoComplete="family-name"
          value={form.lastName}
          onChange={(e) => updateField('lastName', e.target.value)}
          required
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => updateField('password', e.target.value)}
          required
        />

        <button
          className="btn btn-primary"
          type="submit"
          disabled={submitting || !form.firstName || !form.lastName || !form.email || !form.password}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="switch-link">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
