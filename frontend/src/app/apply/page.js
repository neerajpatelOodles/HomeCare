'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Field, Notice, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { checkFileClient } from '@/lib/format';

const FILES = [
  { key: 'resume', label: 'Résumé', required: true },
  { key: 'cprFirstAid', label: 'CPR / First Aid certificate' },
  { key: 'policeCheck', label: 'Police check' },
  { key: 'governmentId', label: 'Government ID' },
];

// Public job application page: no login needed.
export default function ApplyPage() {
  const options = useLoad(() => api('/api/recruitment/options').then((r) => r.data), []);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', profession: '', licenseNumber: '', yearsExperience: '', city: '', region: '', coverNote: '', website: '' });
  const [files, setFiles] = useState({});
  const [certs, setCerts] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const professions = options.data?.professions || ['RN', 'RPN', 'PSW', 'RSW'];

  function pick(key, file) {
    const msg = checkFileClient(file);
    setErrors((e) => ({ ...e, [key]: msg }));
    setFiles((f) => ({ ...f, [key]: msg ? null : file }));
  }
  function pickCerts(list) {
    const arr = Array.from(list || []);
    const msg = arr.length > 3 ? 'You can attach up to 3 certifications' : arr.map(checkFileClient).find(Boolean) || '';
    setErrors((e) => ({ ...e, certifications: msg }));
    setCerts(msg ? [] : arr);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const local = {};
    if (!form.firstName.trim()) local.firstName = 'Required';
    if (!form.lastName.trim()) local.lastName = 'Required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) local.email = 'Enter a valid email';
    if (form.phone.trim().length < 7) local.phone = 'Enter a valid phone number';
    if (!form.profession) local.profession = 'Choose your profession';
    if (!files.resume) local.resume = errors.resume || 'Your résumé is required';
    if (Object.keys(local).length) {
      setErrors((x) => ({ ...x, ...local }));
      setError('Please fix the highlighted fields.');
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) if (v !== '') fd.append(k, v.trim ? v.trim() : v);
    for (const f of FILES) if (files[f.key]) fd.append(f.key, files[f.key]);
    for (const c of certs) fd.append('certifications', c);
    setSaving(true);
    try {
      const res = await api('/api/recruitment/applications', { method: 'POST', body: fd });
      setDone(res.data.reference);
    } catch (err) {
      if (err.errors?.length) {
        const map = {};
        for (const x of err.errors) map[x.field] = x.message;
        setErrors(map);
        setError('Please fix the highlighted fields.');
      } else setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="apply-wrap">
        <div className="card success-box">
          <h1>Application received</h1>
          <p className="muted">Thank you! We sent a confirmation to {form.email}. Our HR team will review your application and be in touch.</p>
          <p>Your reference: <strong>{done}</strong></p>
          <Link href="/login" className="link">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="apply-wrap">
      <form className="card" onSubmit={submit} noValidate>
        <div className="brand brand-lg"><span className="brand-mark" aria-hidden="true" /><span>Home-Care Central</span></div>
        <h1>Apply to join our care team</h1>
        <p className="muted">We are hiring RNs, RPNs, PSWs and RSWs. No account is needed to apply.</p>
        <Notice kind="error">{error}</Notice>

        <div className="grid-2">
          <Field id="firstName" label="First name" error={errors.firstName}><input id="firstName" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" /></Field>
          <Field id="lastName" label="Last name" error={errors.lastName}><input id="lastName" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" /></Field>
          <Field id="email" label="Email" error={errors.email}><input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
          <Field id="phone" label="Phone" error={errors.phone}><input id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
          <Field id="profession" label="Profession" error={errors.profession}>
            <select id="profession" value={form.profession} onChange={set('profession')}>
              <option value="">Select…</option>
              {professions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field id="licenseNumber" label="Licence / registration number (optional)" error={errors.licenseNumber}><input id="licenseNumber" value={form.licenseNumber} onChange={set('licenseNumber')} /></Field>
          <Field id="yearsExperience" label="Years of experience (optional)" error={errors.yearsExperience}><input id="yearsExperience" type="number" min="0" max="60" value={form.yearsExperience} onChange={set('yearsExperience')} /></Field>
          <Field id="city" label="City (optional)" error={errors.city}><input id="city" value={form.city} onChange={set('city')} /></Field>
        </div>
        <Field id="coverNote" label="Anything you'd like us to know (optional)" error={errors.coverNote}><textarea id="coverNote" value={form.coverNote} onChange={set('coverNote')} maxLength={2000} /></Field>

        <h2 style={{ fontSize: '1.05rem', margin: '18px 0 0' }}>Documents</h2>
        <p className="hint">PDF, JPG or PNG, up to {options.data?.maxFileMb || 10} MB each. Only the résumé is required now; you can send the rest later if HR asks.</p>
        <div className="grid-2">
          {FILES.map((f) => (
            <Field key={f.key} id={f.key} label={`${f.label}${f.required ? ' *' : ''}`} error={errors[f.key]}>
              <input id={f.key} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => pick(f.key, e.target.files[0])} />
            </Field>
          ))}
          <Field id="certifications" label="Certifications (up to 3)" error={errors.certifications}>
            <input id="certifications" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => pickCerts(e.target.files)} />
          </Field>
        </div>

        {/* Honeypot: hidden from people, bots fill it in. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit application'}</button>
        <p className="switch-link">Already part of the team? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
