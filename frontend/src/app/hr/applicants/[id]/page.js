'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Spinner, readErrors, useLoad } from '@/components/ui';
import { api, downloadFile } from '@/lib/api';
import { checkFileClient, DOC_LABEL, fmtDate, fmtDateTime, fmtSize, STATUS_LABEL } from '@/lib/format';

const FLOW = ['applied', 'screening', 'interview', 'offer', 'hired'];
// Same rules as the backend (it enforces them again).
const NEXT = {
  applied: ['screening', 'rejected'],
  screening: ['interview', 'rejected'],
  interview: ['screening', 'offer', 'rejected'],
  offer: ['interview', 'rejected'],
  rejected: ['applied'],
  hired: [],
};
const EMAIL_STATUSES = ['screening', 'interview', 'offer', 'rejected'];

export default function ApplicantDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useLoad(() => api(`/api/hr/applicants/${id}`).then((r) => r.data.applicant), [id]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [target, setTarget] = useState(null);
  const [move, setMove] = useState({ note: '', message: '', notify: true });
  const [noteText, setNoteText] = useState('');
  const [doc, setDoc] = useState({ docType: 'police_check', file: null, error: '' });
  const [hireOpen, setHireOpen] = useState(false);
  const [hire, setHire] = useState({ licenseExpiry: '', hireDate: '', emergencyContactName: '', emergencyContactPhone: '' });
  const [hireErrors, setHireErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [hiredInfo, setHiredInfo] = useState(null);

  async function run(fn, ok) {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); if (ok) setMsg(ok); await reload(); return true; }
    catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  const submitMove = () => run(async () => {
    await api(`/api/hr/applicants/${id}/status`, {
      method: 'PATCH',
      body: { status: target, note: move.note || undefined, message: move.message || undefined, notifyApplicant: move.notify },
    });
    setTarget(null); setMove({ note: '', message: '', notify: true });
  }, `Moved to ${STATUS_LABEL[target]}.${move.notify && EMAIL_STATUSES.includes(target) ? ' The applicant was emailed.' : ''}`);

  const addNote = () => noteText.trim() && run(async () => {
    await api(`/api/hr/applicants/${id}/notes`, { method: 'POST', body: { body: noteText.trim() } });
    setNoteText('');
  }, 'Note added.');

  const upload = () => {
    if (!doc.file) return setDoc((d) => ({ ...d, error: 'Choose a file first' }));
    const bad = checkFileClient(doc.file);
    if (bad) return setDoc((d) => ({ ...d, error: bad }));
    const fd = new FormData();
    fd.append('docType', doc.docType); fd.append('file', doc.file);
    return run(async () => { await api(`/api/hr/applicants/${id}/documents`, { method: 'POST', body: fd }); setDoc({ docType: 'police_check', file: null, error: '' }); }, 'Document uploaded.');
  };

  const download = (d) => downloadFile(`/api/hr/applicants/${id}/documents/${d.id}/download`, d.originalName).catch((e) => setErr(e.message));

  async function doHire() {
    setHireErrors({}); setErr(''); setBusy(true);
    try {
      const body = {};
      for (const [k, v] of Object.entries(hire)) if (v) body[k] = v;
      const res = await api(`/api/hr/applicants/${id}/hire`, { method: 'POST', body });
      setHiredInfo(res.data.caregiver);
      setHireOpen(false);
      await reload();
    } catch (e) {
      const r = readErrors(e); setHireErrors(r.fields); setErr(r.message);
    } finally { setBusy(false); }
  }

  if (loading && !data) return <PortalShell><Spinner /></PortalShell>;
  if (!data) return <PortalShell><Notice kind="error">{error || 'Not found'}</Notice><Link href="/hr/applicants" className="back">← Back to applicants</Link></PortalShell>;
  const a = data;
  const idx = FLOW.indexOf(a.status);

  return (
    <PortalShell>
      <Link href="/hr/applicants" className="back">← Back to applicants</Link>
      <div className="page-head">
        <div><h1>{a.firstName} {a.lastName}</h1><p className="muted">{a.profession} · applied {fmtDate(a.appliedAt)}</p></div>
        <Badge status={a.status} />
      </div>

      <div className="stages" aria-label="Hiring stages">
        {FLOW.map((s, i) => (
          <span key={s} className={a.status === 'rejected' ? 'stage' : i < idx ? 'stage done' : i === idx ? 'stage current' : 'stage'}>{STATUS_LABEL[s]}</span>
        ))}
        {a.status === 'rejected' && <span className="stage rejected">Rejected</span>}
      </div>

      <Notice>{msg}</Notice>
      <Notice kind="error">{err}</Notice>
      {hiredInfo && <Notice>Hired! A caregiver login was created for {hiredInfo.email}. A set-password link was emailed to them. <Link className="link" href={`/hr/caregivers/${hiredInfo.id}`}>Open caregiver profile →</Link></Notice>}

      <div className="cols">
        <div>
          <section className="panel panel-tight">
            <h2>Move to the next stage</h2>
            {a.status === 'hired' ? (
              <p className="empty-note">This applicant is hired. <Link className="link" href={`/hr/caregivers/${a.hiredUserId}`}>Open caregiver profile →</Link></p>
            ) : (
              <>
                <div className="row-actions">
                  {NEXT[a.status].map((s) => (
                    <button key={s} className={s === 'rejected' ? 'btn btn-danger' : 'btn btn-ghost btn-sm'} disabled={busy} onClick={() => setTarget(target === s ? null : s)}>
                      {s === 'applied' ? 'Reopen' : s === 'rejected' ? 'Reject' : `→ ${STATUS_LABEL[s]}`}
                    </button>
                  ))}
                  {a.status === 'offer' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setHireOpen((v) => !v)}>Hire</button>}
                </div>
                {a.status !== 'offer' && <p className="hint">Hiring becomes available once the applicant reaches the Offer stage.</p>}

                {target && (
                  <div style={{ marginTop: 14 }}>
                    <Field id="note" label={target === 'rejected' ? 'Internal reason (never emailed)' : 'Internal note (optional, never emailed)'}>
                      <textarea id="note" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
                    </Field>
                    {EMAIL_STATUSES.includes(target) && (
                      <>
                        <label className="check-row"><input type="checkbox" checked={move.notify} onChange={(e) => setMove({ ...move, notify: e.target.checked })} />Email the applicant about this update</label>
                        {move.notify && (
                          <Field id="msg" label="Extra message for the applicant (optional)" hint="Added to the standard email.">
                            <textarea id="msg" value={move.message} onChange={(e) => setMove({ ...move, message: e.target.value })} />
                          </Field>
                        )}
                      </>
                    )}
                    <div className="form-actions">
                      <button className="btn btn-ghost" onClick={() => setTarget(null)}>Cancel</button>
                      <button className="btn btn-primary btn-inline" disabled={busy} onClick={submitMove}>Confirm: {STATUS_LABEL[target]}</button>
                    </div>
                  </div>
                )}

                {hireOpen && (
                  <div style={{ marginTop: 14 }}>
                    <p className="hint">Hiring creates the caregiver login automatically and emails them a link to choose their own password.</p>
                    <div className="grid-2">
                      <Field id="licExp" label="Licence expiry (optional)" error={hireErrors.licenseExpiry}><input id="licExp" type="date" value={hire.licenseExpiry} onChange={(e) => setHire({ ...hire, licenseExpiry: e.target.value })} /></Field>
                      <Field id="hireDate" label="Hire date (optional)" error={hireErrors.hireDate}><input id="hireDate" type="date" value={hire.hireDate} onChange={(e) => setHire({ ...hire, hireDate: e.target.value })} /></Field>
                      <Field id="ecn" label="Emergency contact name" error={hireErrors.emergencyContactName}><input id="ecn" value={hire.emergencyContactName} onChange={(e) => setHire({ ...hire, emergencyContactName: e.target.value })} /></Field>
                      <Field id="ecp" label="Emergency contact phone" error={hireErrors.emergencyContactPhone}><input id="ecp" value={hire.emergencyContactPhone} onChange={(e) => setHire({ ...hire, emergencyContactPhone: e.target.value })} /></Field>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-ghost" onClick={() => setHireOpen(false)}>Cancel</button>
                      <button className="btn btn-primary btn-inline" disabled={busy} onClick={doHire}>Confirm hire</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="panel panel-tight">
            <h2>Documents</h2>
            {a.documents.length === 0 ? <p className="empty-note">No documents.</p> : (
              <ul className="doclist">
                {a.documents.map((d) => (
                  <li key={d.id}>
                    <span><strong>{DOC_LABEL[d.docType] || d.docType}</strong><small>{d.originalName} · {fmtSize(d.sizeBytes)} · {fmtDate(d.createdAt)}</small></span>
                    <button className="btn btn-ghost btn-sm" onClick={() => download(d)}>Download</button>
                  </li>
                ))}
              </ul>
            )}
            {a.missingDocuments?.length > 0 && a.status !== 'hired' && <p className="missing">Still missing: {a.missingDocuments.map((t) => DOC_LABEL[t]).join(', ')}</p>}
            <h3>Add a document</h3>
            <div className="row-actions">
              <select aria-label="Document type" value={doc.docType} onChange={(e) => setDoc({ ...doc, docType: e.target.value })}>
                {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="file" aria-label="Choose file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setDoc({ ...doc, file: e.target.files[0] || null, error: '' })} />
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={upload}>Upload</button>
            </div>
            {doc.error && <span className="field-error">{doc.error}</span>}
            <p className="hint">PDF, JPG or PNG, up to 10 MB.</p>
          </section>

          <section className="panel panel-tight">
            <h2>Internal notes</h2>
            {a.notes.length === 0 && <p className="empty-note">No notes yet.</p>}
            {a.notes.map((n) => <div className="note" key={n.id}><p className="pre" style={{ margin: 0 }}>{n.body}</p><small>{n.author || 'Unknown'} · {fmtDateTime(n.createdAt)}</small></div>)}
            <textarea aria-label="New note" placeholder="Write a note only HR can see…" value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ width: '100%' }} />
            <div className="form-actions"><button className="btn btn-ghost btn-sm" disabled={busy || !noteText.trim()} onClick={addNote}>Add note</button></div>
          </section>
        </div>

        <div>
          <section className="panel panel-tight">
            <h2>Details</h2>
            <dl className="kv">
              <dt>Email</dt><dd>{a.email}</dd>
              <dt>Phone</dt><dd>{a.phone}</dd>
              <dt>Profession</dt><dd>{a.profession}</dd>
              <dt>Licence no.</dt><dd>{a.licenseNumber || '—'}</dd>
              <dt>Experience</dt><dd>{a.yearsExperience ?? '—'}{a.yearsExperience != null && ' years'}</dd>
              <dt>Location</dt><dd>{[a.city, a.region].filter(Boolean).join(', ') || '—'}</dd>
              {a.rejectionReason && (<><dt>Rejection reason</dt><dd>{a.rejectionReason}</dd></>)}
            </dl>
            {a.coverNote && (<><h3>Cover note</h3><p className="pre">{a.coverNote}</p></>)}
          </section>
          <section className="panel panel-tight">
            <h2>History</h2>
            <ul className="timeline">
              {a.history.map((h) => (
                <li key={h.id}>
                  <strong>{h.from ? `${STATUS_LABEL[h.from]} → ` : ''}{STATUS_LABEL[h.to]}</strong>
                  <small>{h.changedBy || 'Applicant'} · {fmtDateTime(h.createdAt)}</small>
                  {h.note && <small>{h.note}</small>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
