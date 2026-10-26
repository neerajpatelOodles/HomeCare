'use client';

import Link from 'next/link';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Pager, readErrors, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, localToIso } from '@/lib/format';

const todayStr = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const EMPTY = { clientId: '', caregiverId: '', startAt: '', endAt: '', serviceType: 'Personal care', instructions: '' };

export default function SchedulePage() {
  const options = useLoad(() => api('/api/visits/options').then((r) => r.data), []);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ from: todayStr(), to: '', caregiverId: '', clientId: '', status: '', unassigned: false });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errs, setErrs] = useState({});
  const [formError, setFormError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    if (f.from) p.set('from', localToIso(`${f.from}T00:00`));
    if (f.to) p.set('to', localToIso(`${f.to}T23:59`));
    if (f.caregiverId) p.set('caregiverId', f.caregiverId);
    if (f.clientId) p.set('clientId', f.clientId);
    if (f.status) p.set('status', f.status);
    if (f.unassigned) p.set('unassigned', 'true');
    return api(`/api/visits?${p}`).then((r) => r.data);
  }, [page, f]);
  const items = data?.items || [];
  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const filter = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setPage(1); };

  async function create(e) {
    e.preventDefault();
    setErrs({}); setFormError(''); setWarnings([]); setNotice(''); setSaving(true);
    try {
      if (!form.clientId) throw Object.assign(new Error('Choose a client'), { errors: [{ field: 'clientId', message: 'Choose a client' }] });
      if (!form.startAt || !form.endAt) throw Object.assign(new Error('Choose a start and end time'), { errors: [{ field: 'startAt', message: 'Choose a start and end time' }] });
      const body = { clientId: form.clientId, caregiverId: form.caregiverId || null, startAt: localToIso(form.startAt), endAt: localToIso(form.endAt), serviceType: form.serviceType.trim() || 'Personal care' };
      if (form.instructions.trim()) body.instructions = form.instructions.trim();
      const res = await api('/api/visits', { method: 'POST', body });
      setWarnings(res.data.warnings || []);
      setNotice(form.caregiverId ? 'Visit scheduled. Reminder emails go out automatically before it starts.' : 'Visit created without a caregiver. Assign one from the visit page.');
      setForm(EMPTY); setShow(false); setPage(1); await reload();
    } catch (err) {
      const r = readErrors(err); setErrs(r.fields); setFormError(r.message);
    } finally { setSaving(false); }
  }

  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>Schedule</h1><p className="muted">Visits are created by Admin only. A caregiver cannot be double-booked.</p></div>
        {!show && <button className="btn btn-primary btn-inline" onClick={() => { setShow(true); setNotice(''); setWarnings([]); }}>+ New visit</button>}
      </div>
      <Notice>{notice}</Notice>
      {warnings.map((w) => <Notice key={w} kind="warn">Heads up: {w}. The visit was still created.</Notice>)}

      {show && (
        <form className="panel form-panel" onSubmit={create} noValidate>
          <h2>New visit</h2>
          <Notice kind="error">{formError}</Notice>
          <div className="grid-2">
            <Field id="vc" label="Client" error={errs.clientId}>
              <select id="vc" value={form.clientId} onChange={set('clientId')}><option value="">Select client…</option>{(options.data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <Field id="vg" label="Caregiver" hint="Leave empty to assign later." error={errs.caregiverId}>
              <select id="vg" value={form.caregiverId} onChange={set('caregiverId')}><option value="">Unassigned</option>{(options.data?.caregivers || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.profession ? ` (${c.profession})` : ''}</option>)}</select>
            </Field>
            <Field id="vs" label="Start" error={errs.startAt}><input id="vs" type="datetime-local" value={form.startAt} onChange={set('startAt')} /></Field>
            <Field id="ve" label="End" error={errs.endAt}><input id="ve" type="datetime-local" value={form.endAt} onChange={set('endAt')} /></Field>
            <Field id="vt" label="Service type" error={errs.serviceType}><input id="vt" value={form.serviceType} onChange={set('serviceType')} /></Field>
          </div>
          <Field id="vi" label="Instructions for the caregiver (optional)" error={errs.instructions}><textarea id="vi" value={form.instructions} onChange={set('instructions')} /></Field>
          <p className="hint">Times are in your browser's timezone.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShow(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary btn-inline" disabled={saving}>{saving ? 'Saving…' : 'Create visit'}</button>
          </div>
        </form>
      )}

      <section className="panel table-panel">
        <div className="filters">
          <label className="check-row" style={{ margin: 0 }}>From <input type="date" value={f.from} onChange={filter('from')} /></label>
          <label className="check-row" style={{ margin: 0 }}>To <input type="date" value={f.to} onChange={filter('to')} /></label>
          <select aria-label="Caregiver" value={f.caregiverId} onChange={filter('caregiverId')}><option value="">All caregivers</option>{(options.data?.caregivers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Client" value={f.clientId} onChange={filter('clientId')}><option value="">All clients</option>{(options.data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Status" value={f.status} onChange={filter('status')}><option value="">All statuses</option>{['scheduled', 'completed', 'cancelled', 'missed'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select>
          <label className="check-row" style={{ margin: 0 }}><input type="checkbox" checked={f.unassigned} onChange={filter('unassigned')} />Unassigned only</label>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Client</th><th>Caregiver</th><th>Service</th><th>Status</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>{fmtDateTime(v.startAt)}</td>
                  <td>{v.client.name}</td>
                  <td>{v.caregiver ? v.caregiver.name : <span className="status off">Unassigned</span>}</td>
                  <td>{v.serviceType}</td>
                  <td><Badge status={v.status} /></td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/admin/visits/${v.id}`}>Open</Link></td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No visits in this range.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="visit" />
      </section>
    </PortalShell>
  );
}
