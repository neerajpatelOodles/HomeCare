'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Spinner, readErrors, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

const PLAN_EMPTY = { title: '', summary: '', goals: '', dailyTasks: '', precautions: '', startDate: '', reviewDate: '' };

export default function ClientDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const [c, p, v] = await Promise.all([
      api(`/api/clients/${id}`), api(`/api/clients/${id}/care-plans`), api(`/api/visits?clientId=${id}&limit=10`),
    ]);
    return { client: c.data.client, plans: p.data.carePlans, visits: v.data.items };
  }, [id]);
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState(PLAN_EMPTY);
  const [planErrs, setPlanErrs] = useState({});

  useEffect(() => {
    const c = data?.client;
    if (!c) return;
    setForm({
      firstName: c.firstName || '', lastName: c.lastName || '', email: c.email || '', phone: c.phone || '', status: c.status,
      addressLine1: c.addressLine1 || '', addressLine2: c.addressLine2 || '', city: c.city || '', region: c.region || '', postalCode: c.postalCode || '',
      careNeeds: c.careNeeds || '', notes: c.notes || '', emergencyContactName: c.emergencyContactName || '', emergencyContactPhone: c.emergencyContactPhone || '',
    });
  }, [data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPl = (k) => (e) => setPlan((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErrs({}); setErr(''); setMsg(''); setBusy(true);
    try {
      const body = {};
      for (const [k, v] of Object.entries(form)) body[k] = k === 'status' ? v : (v.trim() || null);
      body.firstName = form.firstName.trim(); body.lastName = form.lastName.trim();
      await api(`/api/clients/${id}`, { method: 'PATCH', body });
      setMsg('Client saved.'); await reload();
    } catch (e2) { const r = readErrors(e2); setErrs(r.fields); setErr(r.message); }
    finally { setBusy(false); }
  }

  async function createPlan(e) {
    e.preventDefault();
    setPlanErrs({}); setErr(''); setMsg(''); setBusy(true);
    try {
      const body = {};
      for (const [k, v] of Object.entries(plan)) if (v.trim()) body[k] = v.trim();
      await api(`/api/clients/${id}/care-plans`, { method: 'POST', body });
      setPlan(PLAN_EMPTY); setPlanOpen(false); setMsg('Care plan saved. The previous plan was archived.'); await reload();
    } catch (e2) { const r = readErrors(e2); setPlanErrs(r.fields); setErr(r.message); }
    finally { setBusy(false); }
  }

  function startRevision(p) {
    setPlan({ title: p.title || '', summary: p.summary || '', goals: p.goals || '', dailyTasks: p.dailyTasks || '', precautions: p.precautions || '', startDate: p.startDate ? String(p.startDate).slice(0, 10) : '', reviewDate: p.reviewDate ? String(p.reviewDate).slice(0, 10) : '' });
    setPlanOpen(true);
  }

  if (loading && !data) return <PortalShell><Spinner /></PortalShell>;
  if (!data || !form) return <PortalShell><Notice kind="error">{error || 'Not found'}</Notice><Link href="/admin/clients" className="back">← Back to clients</Link></PortalShell>;
  const { client: c, plans, visits } = data;
  const active = plans.find((p) => p.status === 'active');

  return (
    <PortalShell>
      <Link href="/admin/clients" className="back">← Back to clients</Link>
      <div className="page-head">
        <div><h1>{c.firstName} {c.lastName}</h1><p className="muted">{c.hasLogin ? `Portal login: ${c.loginEmail}` : 'No portal login'}</p></div>
        <Badge status={c.status} />
      </div>
      <Notice>{msg}</Notice>
      <Notice kind="error">{err}</Notice>
      <div className="cols">
        <div>
          <form className="panel panel-tight" onSubmit={save} noValidate>
            <h2>Client details</h2>
            <div className="grid-2">
              <Field id="fn" label="First name" error={errs.firstName}><input id="fn" value={form.firstName} onChange={set('firstName')} /></Field>
              <Field id="ln" label="Last name" error={errs.lastName}><input id="ln" value={form.lastName} onChange={set('lastName')} /></Field>
              <Field id="ph" label="Phone" error={errs.phone}><input id="ph" value={form.phone} onChange={set('phone')} /></Field>
              <Field id="em" label="Email" error={errs.email}><input id="em" type="email" value={form.email} onChange={set('email')} /></Field>
              <Field id="a1" label="Address" error={errs.addressLine1}><input id="a1" value={form.addressLine1} onChange={set('addressLine1')} /></Field>
              <Field id="a2" label="Address line 2"><input id="a2" value={form.addressLine2} onChange={set('addressLine2')} /></Field>
              <Field id="ci" label="City"><input id="ci" value={form.city} onChange={set('city')} /></Field>
              <Field id="re" label="Province / region"><input id="re" value={form.region} onChange={set('region')} /></Field>
              <Field id="po" label="Postal code"><input id="po" value={form.postalCode} onChange={set('postalCode')} /></Field>
              <Field id="st" label="Status" hint="Only active clients can be given new visits."><select id="st" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="on_hold">On hold</option><option value="inactive">Inactive</option></select></Field>
              <Field id="ec" label="Emergency contact"><input id="ec" value={form.emergencyContactName} onChange={set('emergencyContactName')} /></Field>
              <Field id="ep" label="Emergency phone"><input id="ep" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} /></Field>
            </div>
            <Field id="cn" label="Care needs" error={errs.careNeeds}><textarea id="cn" value={form.careNeeds} onChange={set('careNeeds')} /></Field>
            <Field id="no" label="Notes" error={errs.notes}><textarea id="no" value={form.notes} onChange={set('notes')} /></Field>
            <div className="form-actions"><button className="btn btn-primary btn-inline" disabled={busy}>Save client</button></div>
          </form>

          <section className="panel panel-tight">
            <div className="row-between"><h2 style={{ margin: 0 }}>Care plan</h2>
              {!planOpen && <div className="row-actions">{active && <button className="btn btn-ghost btn-sm" onClick={() => startRevision(active)}>Revise plan</button>}{!active && <button className="btn btn-primary btn-sm" onClick={() => setPlanOpen(true)}>+ Create plan</button>}</div>}
            </div>
            {planOpen ? (
              <form onSubmit={createPlan} noValidate>
                <p className="hint">Saving creates a new version and archives the current plan, so history is kept.</p>
                <Field id="pt" label="Title" error={planErrs.title}><input id="pt" value={plan.title} onChange={setPl('title')} /></Field>
                <Field id="ps" label="Summary"><textarea id="ps" value={plan.summary} onChange={setPl('summary')} /></Field>
                <Field id="pg" label="Goals"><textarea id="pg" value={plan.goals} onChange={setPl('goals')} /></Field>
                <Field id="pd" label="Daily tasks"><textarea id="pd" value={plan.dailyTasks} onChange={setPl('dailyTasks')} /></Field>
                <Field id="pp" label="Precautions"><textarea id="pp" value={plan.precautions} onChange={setPl('precautions')} /></Field>
                <div className="grid-2">
                  <Field id="psd" label="Start date" error={planErrs.startDate}><input id="psd" type="date" value={plan.startDate} onChange={setPl('startDate')} /></Field>
                  <Field id="prd" label="Review date" error={planErrs.reviewDate}><input id="prd" type="date" value={plan.reviewDate} onChange={setPl('reviewDate')} /></Field>
                </div>
                <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={() => setPlanOpen(false)}>Cancel</button><button className="btn btn-primary btn-inline" disabled={busy || !plan.title.trim()}>Save plan</button></div>
              </form>
            ) : active ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 6px' }}>{active.title}</h3>
                <dl className="kv">
                  <dt>Summary</dt><dd className="pre">{active.summary || '—'}</dd>
                  <dt>Goals</dt><dd className="pre">{active.goals || '—'}</dd>
                  <dt>Daily tasks</dt><dd className="pre">{active.dailyTasks || '—'}</dd>
                  <dt>Precautions</dt><dd className="pre">{active.precautions || '—'}</dd>
                  <dt>Start / review</dt><dd>{fmtDate(active.startDate)} → {fmtDate(active.reviewDate)}</dd>
                </dl>
              </div>
            ) : <p className="empty-note" style={{ marginTop: 12 }}>No care plan yet.</p>}
            {plans.filter((p) => p.status === 'archived').length > 0 && (
              <>
                <h3>Earlier versions</h3>
                <ul className="timeline">{plans.filter((p) => p.status === 'archived').map((p) => <li key={p.id}><strong>{p.title}</strong><small>Created {fmtDateTime(p.createdAt)}</small></li>)}</ul>
              </>
            )}
          </section>
        </div>
        <div>
          <section className="panel panel-tight">
            <div className="row-between"><h2 style={{ margin: 0 }}>Recent visits</h2><Link className="link" href="/admin/visits">Schedule →</Link></div>
            <div style={{ marginTop: 12 }}>
              {visits.length === 0 && <p className="empty-note">No visits yet.</p>}
              {visits.map((v) => (
                <Link key={v.id} href={`/admin/visits/${v.id}`} className="visit-card">
                  <span><strong>{fmtDateTime(v.startAt)}</strong><small>{v.caregiver?.name || 'Unassigned'} · {v.serviceType}</small></span><Badge status={v.status} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
