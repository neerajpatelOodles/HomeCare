'use client';

import Link from 'next/link';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Pager, readErrors, useDebounced, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', addressLine1: '', city: '', region: '', postalCode: '', careNeeds: '', notes: '', emergencyContactName: '', emergencyContactPhone: '', loginEmail: '', loginPassword: '' };

export default function ClientsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errs, setErrs] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) p.set('status', status);
    if (search) p.set('search', search);
    return api(`/api/clients?${p}`).then((r) => r.data);
  }, [page, status, search]);
  const items = data?.items || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    setErrs({}); setFormError(''); setSaving(true);
    try {
      const body = {};
      for (const k of Object.keys(EMPTY)) if (form[k].trim() && !k.startsWith('login')) body[k] = form[k].trim();
      if (form.loginEmail.trim()) body.login = { email: form.loginEmail.trim(), password: form.loginPassword };
      await api('/api/clients', { method: 'POST', body });
      setShow(false); setForm(EMPTY); setNotice(`Client ${body.firstName} ${body.lastName} created.`); setPage(1); await reload();
    } catch (err) {
      const r = readErrors(err);
      const mapped = {};
      for (const [k, v] of Object.entries(r.fields)) mapped[k.replace('login.', 'login')] = v;
      setErrs({ ...r.fields, loginEmail: r.fields['login.email'], loginPassword: r.fields['login.password'] });
      setFormError(r.message);
    } finally { setSaving(false); }
  }

  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>Clients</h1><p className="muted">People who receive care. Admin manages their details and care plans.</p></div>
        {!show && <button className="btn btn-primary btn-inline" onClick={() => { setShow(true); setNotice(''); }}>+ Add client</button>}
      </div>
      <Notice>{notice}</Notice>
      {show && (
        <form className="panel form-panel" onSubmit={create} noValidate>
          <h2>Add client</h2>
          <Notice kind="error">{formError}</Notice>
          <div className="grid-2">
            <Field id="cfn" label="First name" error={errs.firstName}><input id="cfn" value={form.firstName} onChange={set('firstName')} /></Field>
            <Field id="cln" label="Last name" error={errs.lastName}><input id="cln" value={form.lastName} onChange={set('lastName')} /></Field>
            <Field id="cph" label="Phone" error={errs.phone}><input id="cph" value={form.phone} onChange={set('phone')} /></Field>
            <Field id="cem" label="Email (optional)" error={errs.email}><input id="cem" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field id="ca1" label="Address" error={errs.addressLine1}><input id="ca1" value={form.addressLine1} onChange={set('addressLine1')} /></Field>
            <Field id="cci" label="City" error={errs.city}><input id="cci" value={form.city} onChange={set('city')} /></Field>
            <Field id="cre" label="Province / region"><input id="cre" value={form.region} onChange={set('region')} /></Field>
            <Field id="cpo" label="Postal code"><input id="cpo" value={form.postalCode} onChange={set('postalCode')} /></Field>
            <Field id="cec" label="Emergency contact"><input id="cec" value={form.emergencyContactName} onChange={set('emergencyContactName')} /></Field>
            <Field id="cep" label="Emergency phone"><input id="cep" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} /></Field>
          </div>
          <Field id="cne" label="Care needs" error={errs.careNeeds}><textarea id="cne" value={form.careNeeds} onChange={set('careNeeds')} /></Field>
          <Field id="cno" label="Notes" error={errs.notes}><textarea id="cno" value={form.notes} onChange={set('notes')} /></Field>
          <h3 style={{ margin: '16px 0 0', fontSize: '0.95rem' }}>Portal login (optional)</h3>
          <p className="hint">Give the client a login to see their visits and care plan. Leave blank for a record without a login.</p>
          <div className="grid-2">
            <Field id="cle" label="Login email" error={errs.loginEmail}><input id="cle" type="email" autoComplete="off" value={form.loginEmail} onChange={set('loginEmail')} /></Field>
            <Field id="clp" label="Temporary password" hint="At least 8 characters, a letter and a number." error={errs.loginPassword}><input id="clp" type="text" autoComplete="new-password" value={form.loginPassword} onChange={set('loginPassword')} /></Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShow(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary btn-inline" disabled={saving}>{saving ? 'Creating…' : 'Create client'}</button>
          </div>
        </form>
      )}
      <section className="panel table-panel">
        <div className="filters">
          <input type="search" placeholder="Search name, email or phone" aria-label="Search clients" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="inactive">Inactive</option>
          </select>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Status</th><th>Login</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.firstName} {c.lastName}</strong></td>
                  <td>{c.phone || '—'}</td><td>{c.city || '—'}</td>
                  <td><Badge status={c.status} /></td>
                  <td>{c.hasLogin ? c.loginEmail : <span className="you">No login</span>}</td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/admin/clients/${c.id}`}>Open</Link></td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No clients found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="client" />
      </section>
    </PortalShell>
  );
}
