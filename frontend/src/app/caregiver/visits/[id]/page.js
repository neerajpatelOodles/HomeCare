'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Spinner, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

export default function CaregiverVisitDetail() {
  const { id } = useParams();
  const { data: v, loading, error, reload } = useLoad(() => api(`/api/caregiver/visits/${id}`).then((r) => r.data.visit), [id]);
  const [note, setNote] = useState('');
  const [final, setFinal] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn, ok) {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); setMsg(ok); await reload(); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  }
  const addNote = async () => { if (await run(() => api(`/api/caregiver/visits/${id}/notes`, { method: 'POST', body: { body: note.trim() } }), 'Note saved.')) setNote(''); };
  const complete = async () => { if (await run(() => api(`/api/caregiver/visits/${id}/complete`, { method: 'POST', body: { note: final.trim() || undefined } }), 'Visit marked as completed. Thank you!')) setFinal(''); };

  if (loading && !v) return <PortalShell><Spinner /></PortalShell>;
  if (!v) return <PortalShell><Notice kind="error">{error || 'Not found'}</Notice><Link href="/caregiver/visits" className="back">← Back to my visits</Link></PortalShell>;
  const notStarted = new Date(v.startAt) > new Date();
  const can = v.status === 'scheduled';
  const cd = v.clientDetails;
  const plan = v.carePlan;

  return (
    <PortalShell>
      <Link href="/caregiver/visits" className="back">← Back to my visits</Link>
      <div className="page-head">
        <div><h1>{v.client.name}</h1><p className="muted">{fmtDateTime(v.startAt)} – {fmtDateTime(v.endAt)} · {v.serviceType}</p></div>
        <Badge status={v.status} />
      </div>
      <Notice>{msg}</Notice><Notice kind="error">{err}</Notice>
      {v.status === 'cancelled' && <p className="warn">This visit was cancelled{v.cancelReason ? `: ${v.cancelReason}` : '.'}</p>}

      <div className="cols">
        <div>
          {v.instructions && <section className="panel panel-tight"><h2>Instructions from the office</h2><p className="pre">{v.instructions}</p></section>}
          <section className="panel panel-tight">
            <h2>Care plan</h2>
            {!plan ? <p className="empty-note">No care plan has been written for this client yet.</p> : (
              <>
                <h3 style={{ margin: '0 0 8px' }}>{plan.title}</h3>
                <dl className="kv">
                  <dt>Summary</dt><dd className="pre">{plan.summary || '—'}</dd>
                  <dt>Goals</dt><dd className="pre">{plan.goals || '—'}</dd>
                  <dt>Daily tasks</dt><dd className="pre">{plan.dailyTasks || '—'}</dd>
                  <dt>Precautions</dt><dd className="pre">{plan.precautions || '—'}</dd>
                  <dt>Review date</dt><dd>{fmtDate(plan.reviewDate)}</dd>
                </dl>
              </>
            )}
          </section>
          <section className="panel panel-tight">
            <h2>Visit notes</h2>
            {v.notes.length === 0 && <p className="empty-note">No notes yet.</p>}
            {v.notes.map((n) => <div className="note" key={n.id}><p className="pre" style={{ margin: 0 }}>{n.body}</p><small>{fmtDateTime(n.createdAt)}</small></div>)}
            {(v.status === 'scheduled' || v.status === 'completed') && (
              <>
                <textarea aria-label="New note" placeholder="Write a note about this visit…" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
                <div className="form-actions"><button className="btn btn-ghost btn-sm" disabled={busy || !note.trim()} onClick={addNote}>Add note</button></div>
              </>
            )}
          </section>
        </div>
        <div>
          <section className="panel panel-tight">
            <h2>Client</h2>
            <dl className="kv">
              <dt>Address</dt><dd>{[cd.addressLine1, cd.addressLine2, cd.city, cd.region, cd.postalCode].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Phone</dt><dd>{v.client.phone || '—'}</dd>
              <dt>Care needs</dt><dd className="pre">{cd.careNeeds || '—'}</dd>
              <dt>Notes</dt><dd className="pre">{cd.notes || '—'}</dd>
              <dt>Emergency contact</dt><dd>{cd.emergencyContactName ? `${cd.emergencyContactName} ${cd.emergencyContactPhone || ''}` : '—'}</dd>
            </dl>
          </section>
          {can && (
            <section className="panel panel-tight">
              <h2>Finish the visit</h2>
              {notStarted ? <p className="hint">You can mark this visit as completed once it has started.</p> : (
                <>
                  <Field id="final" label="Final note (optional)"><textarea id="final" value={final} onChange={(e) => setFinal(e.target.value)} /></Field>
                  <div className="form-actions"><button className="btn btn-primary btn-inline" disabled={busy} onClick={() => confirm('Mark this visit as completed?') && complete()}>Mark completed</button></div>
                </>
              )}
            </section>
          )}
          {v.status === 'completed' && <p className="notice">Completed {fmtDateTime(v.completedAt)}.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
