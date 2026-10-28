'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Field, Notice } from '@/components/ui';
import { api } from '@/lib/api';

function SetPasswordForm() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('The two passwords do not match');
    setSaving(true);
    try {
      await api('/api/auth/set-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err.errors?.[0]?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="card login">
        <h1>Password set</h1>
        <p className="muted">Your account is ready.</p>
        <Link className="btn btn-primary" href="/login" style={{ textAlign: 'center', textDecoration: 'none' }}>Sign in</Link>
      </div>
    );
  }
  return (
    <form className="card login" onSubmit={submit} noValidate>
      <div className="brand brand-lg"><span className="brand-mark" aria-hidden="true" /><span>Home-Care Central</span></div>
      <h1>Set your password</h1>
      <p className="muted">Welcome to the team! Choose a password to finish setting up your caregiver account.</p>
      {!token && <Notice kind="error">This link is missing its token. Open the link from your email again.</Notice>}
      <Notice kind="error">{error}</Notice>
      <Field id="pw" label="New password" hint="At least 8 characters, with a letter and a number.">
        <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field id="pw2" label="Confirm password">
        <input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <button className="btn btn-primary" disabled={saving || !token || !password}>{saving ? 'Saving…' : 'Set password'}</button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="center-screen">
      <Suspense fallback={<div className="spinner" />}>
        <SetPasswordForm />
      </Suspense>
    </div>
  );
}
