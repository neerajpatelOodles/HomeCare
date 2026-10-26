'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Spinner, readErrors, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime, isoToLocal, localToIso } from '@/lib/format';

export default function VisitDetail() {
  const { id } = useParams();
  const { data: v, loading, error, reload } = useLoad(() => api(`/api/visits/${id}`).then((r) => r.data.visit), [id]);
  const options = useLoad(() => api('/api/visits/options').then((r) => r.data), []);
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!v) return;
    setForm({ caregiverId: v.caregiver?.id || '', startAt: isoToLocal(v.startAt), endAt: isoToLocal(v.endAt), serviceType: v.serviceType, instructions: v.instructions || '' });
  }, [v]);

  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErrs({}); setErr(''); setMsg(''); setWarnings([]); setBusy(true);
    try {
      const res = await api(`/api/visits/${id}`, { method: 'PATCH', body: { caregiverId: form.caregiverId || null, startAt: localToIso(form.startAt), endAt: localToIso(form.endAt), serviceType: form.serviceType.trim(), instructions: form.instructions.trim() || null } });
      setWarnings(res.data.warnings || []); setMsg('Visit updated.'); await reload();
    } catch (e2) { const r = readErrors(e2); setErrs(r.fields); setErr(r.message); }
    finally { setBusy(false); }
  }
  async function act(path, body, ok) {
    setErr(''); setMsg(''); setBusy(true);
    try { await api(`/api/visits/${id}/${path}`, { method: 'POST', body }); setMsg(ok); setCancelOpen(false); await reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (loading && !v) return <PortalShell><Spinner /></PortalShell>;
  if (!v || !form) return <PortalShell><Notice kind="error">{error || 'Not found'}</Notice><Link href="/admin/visits" className="back">← Back to schedule</Link></PortalShell>;
  const editable = v.status === 'scheduled';
  const started = new Date(v.startAt) < new Date();

  return (
    <PortalShell>
      <Link href="/admin/visits" className="back">← Back to schedule</Link>
      <div className="page-head">
        <div><h1>{v.client.name}</h1><p className="muted">{fmtDateTime(v.startAt)} – {fmtDateTime(v.endAt)} · {v.serviceType}</p></div>
        <Badge status={v.status} />
      </div>
      <Notice>{msg}</Notice>
      <Notice kind="error">{err}</Notice>
      {warnings.map((w) => <Notice key={w} kind="warn">Heads up: {w}.</Notice>)}
      {v.status === 'cancelled' && v.cancelReason && <p className="warn">Cancelled: {v.cancelReason}</p>}
      {v.status === 'completed' && <p className="notice">Completed {fmtDateTime(v.completedAt)}.</p>}

      <div className="cols">
        <div>
          <form className="panel panel-tight" onSubmit={save} noValidate>
            <h2>{editable ? 'Edit visit' : 'Visit details'}</h2>
            <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="grid-2">
                <Field id="g" label="Caregiver" error={errs.caregiverId}>
                  <select id="g" value={form.caregiverId} onChange={set('caregiverId')}>
                    <option value="">Unassigned</option>
                    {(options.data?.caregivers || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.profession ? ` (${c.profession})` : ''}</option>)}
                    {v.caregiver && !(options.data?.caregivers || []).some((c) => c.id === v.caregiver.id) && <option value={v.caregiver.id}>{v.caregiver.name}</option>}
                  </select>
                </Field>
                <Field id="t" label="Service type" error={errs.serviceType}><input id="t" value={form.serviceType} onChange={set('serviceType')} /></Field>
                <Field id="s" label="Start" error={errs.startAt}><input id="s" type="datetime-local" value={form.startAt} onChange={set('startAt')} /></Field>
                <Field id="e" label="End" error={errs.endAt}><input id="e" type="datetime-local" value={form.endAt} onChange={set('endAt')} /></Field>
              </div>
              <Field id="i" label="Instructions for the caregiver" error={errs.instructions}><textarea id="i" value={form.instructions} onChange={set('instructions')} /></Field>
            </fieldset>
            {editable && <div className="form-actions"><button className="btn btn-primary btn-inline" disabled={busy}>Save changes</button></div>}
            {!editable && <p className="hint">Only scheduled visits can be changed.</p>}
          </form>

          <section className="panel panel-tight">
            <h2>Caregiver notes</h2>
            {v.notes.length === 0 ? <p className="empty-note">The caregiver has not added notes.</p> : v.notes.map((n) => (
              <div className="note" key={n.id}><p className="pre" style={{ margin: 0 }}>{n.body}</p><small>{n.author || 'Caregiver'} · {fmtDateTime(n.createdAt)}</small></div>
            ))}
          </section>
        </div>

        <div>
          <section className="panel panel-tight">
            <h2>People</h2>
            <dl className="kv">
              <dt>Client</dt><dd><Link className="link" href={`/admin/clients/${v.client.id}`}>{v.client.name}</Link></dd>
              <dt>Address</dt><dd>{[v.client.address, v.client.city].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Phone</dt><dd>{v.client.phone || '—'}</dd>
              <dt>Caregiver</dt><dd>{v.caregiver ? <Link className="link" href={`/hr/caregivers/${v.caregiver.id}`}>{v.caregiver.name}</Link> : 'Unassigned'}</dd>
            </dl>
          </section>
          {editable && (
            <section className="panel panel-tight">
              <h2>Actions</h2>
              <div className="row-actions">
                <button className="btn btn-danger" disabled={busy} onClick={() => setCancelOpen((x) => !x)}>Cancel visit</button>
                {started && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm('Mark this visit as missed?') && act('missed', undefined, 'Marked as missed.')}>Mark missed</button>}
              </div>
              {cancelOpen && (
                <div style={{ marginTop: 12 }}>
                  <Field id="r" label="Reason (optional)" hint="The caregiver and client are emailed."><textarea id="r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <div className="form-actions"><button className="btn btn-danger" disabled={busy} onClick={() => act('cancel', { reason: reason.trim() || undefined }, 'Visit cancelled.')}>Confirm cancel</button></div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
