'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Field, Notice, Spinner, readErrors, useLoad } from '@/components/ui';
import { api, downloadFile } from '@/lib/api';
import { checkFileClient, DOC_LABEL, fmtDate, fmtSize, WEEKDAYS } from '@/lib/format';

export default function CaregiverDetail() {
  const { id } = useParams();
  const { data: c, loading, error, reload } = useLoad(() => api(`/api/caregivers/${id}`).then((r) => r.data.caregiver), [id]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileErrors, setProfileErrors] = useState({});
  const [windows, setWindows] = useState([]);
  const [areas, setAreas] = useState('');
  const [cert, setCert] = useState({ name: '', issuer: '', issuedOn: '', expiresOn: '', documentId: '' });
  const [certErrors, setCertErrors] = useState({});
  const [doc, setDoc] = useState({ docType: 'certification', file: null, error: '' });

  // Fill the editable copies whenever fresh data arrives.
  useEffect(() => {
    if (!c) return;
    setProfile({
      firstName: c.firstName || '', lastName: c.lastName || '', phone: c.phone || '', profession: c.profession,
      licenseBody: c.licenseBody || '', licenseNumber: c.licenseNumber || '', licenseExpiry: c.licenseExpiry ? String(c.licenseExpiry).slice(0, 10) : '',
      employmentStatus: c.employmentStatus, emergencyContactName: c.emergencyContactName || '', emergencyContactPhone: c.emergencyContactPhone || '', notes: c.notes || '',
    });
    setWindows(c.availability.map((w) => ({ ...w })));
    setAreas(c.serviceAreas.join(', '));
  }, [c]);

  async function run(fn, ok) {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); if (ok) setMsg(ok); await reload(); return true; }
    catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileErrors({});
    const body = {
      firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), phone: profile.phone.trim() || null,
      profession: profile.profession, licenseBody: profile.licenseBody.trim() || null, licenseNumber: profile.licenseNumber.trim() || null,
      licenseExpiry: profile.licenseExpiry || null, employmentStatus: profile.employmentStatus,
      emergencyContactName: profile.emergencyContactName.trim() || null, emergencyContactPhone: profile.emergencyContactPhone.trim() || null,
      notes: profile.notes.trim() || null,
    };
    setErr(''); setMsg(''); setBusy(true);
    try { await api(`/api/caregivers/${id}`, { method: 'PATCH', body }); setMsg('Profile saved.'); await reload(); }
    catch (e2) { const r = readErrors(e2); setProfileErrors(r.fields); setErr(r.message); }
    finally { setBusy(false); }
  }

  const saveAvailability = () => run(() => api(`/api/caregivers/${id}/availability`, { method: 'PUT', body: { availability: windows.map((w) => ({ weekday: Number(w.weekday), startTime: w.startTime, endTime: w.endTime })) } }), 'Availability saved.');
  const saveAreas = () => run(() => api(`/api/caregivers/${id}/service-areas`, { method: 'PUT', body: { serviceAreas: areas.split(',').map((s) => s.trim()).filter(Boolean) } }), 'Service areas saved.');

  async function addCert(e) {
    e.preventDefault();
    setCertErrors({}); setErr(''); setMsg(''); setBusy(true);
    try {
      const body = { name: cert.name.trim() };
      if (cert.issuer.trim()) body.issuer = cert.issuer.trim();
      if (cert.issuedOn) body.issuedOn = cert.issuedOn;
      if (cert.expiresOn) body.expiresOn = cert.expiresOn;
      if (cert.documentId) body.documentId = cert.documentId;
      await api(`/api/caregivers/${id}/certifications`, { method: 'POST', body });
      setCert({ name: '', issuer: '', issuedOn: '', expiresOn: '', documentId: '' });
      setMsg('Certification added.'); await reload();
    } catch (e2) { const r = readErrors(e2); setCertErrors(r.fields); setErr(r.message); }
    finally { setBusy(false); }
  }
  const delCert = (cid) => confirm('Remove this certification?') && run(() => api(`/api/caregivers/${id}/certifications/${cid}`, { method: 'DELETE' }), 'Certification removed.');

  const upload = () => {
    if (!doc.file) return setDoc((d) => ({ ...d, error: 'Choose a file first' }));
    const bad = checkFileClient(doc.file);
    if (bad) return setDoc((d) => ({ ...d, error: bad }));
    const fd = new FormData(); fd.append('docType', doc.docType); fd.append('file', doc.file);
    return run(async () => { await api(`/api/caregivers/${id}/documents`, { method: 'POST', body: fd }); setDoc({ docType: 'certification', file: null, error: '' }); }, 'Document uploaded.');
  };
  const download = (d) => downloadFile(`/api/caregivers/${id}/documents/${d.id}/download`, d.originalName).catch((e) => setErr(e.message));
  const resend = () => run(() => api(`/api/caregivers/${id}/resend-invite`, { method: 'POST' }), 'Invite email queued.');

  const setP = (k) => (e) => setProfile((p) => ({ ...p, [k]: e.target.value }));
  const setW = (i, k, v) => setWindows((w) => w.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  if (loading && !c) return <PortalShell><Spinner /></PortalShell>;
  if (!c || !profile) return <PortalShell><Notice kind="error">{error || 'Not found'}</Notice><Link href="/hr/caregivers" className="back">← Back to caregivers</Link></PortalShell>;

  return (
    <PortalShell>
      <Link href="/hr/caregivers" className="back">← Back to caregivers</Link>
      <div className="page-head">
        <div><h1>{c.firstName} {c.lastName}</h1><p className="muted">{c.profession} · {c.email} · hired {fmtDate(c.hireDate)}</p></div>
        <Badge status={c.employmentStatus} />
      </div>
      <Notice>{msg}</Notice>
      <Notice kind="error">{err}</Notice>
      {!c.lastLoginAt && (
        <p className="warn">This caregiver has not signed in yet. <button className="btn btn-ghost btn-sm" disabled={busy} onClick={resend}>Resend set-password email</button></p>
      )}
      {c.employmentStatus === 'inactive' && <p className="warn">Inactive caregivers cannot sign in and cannot be scheduled.</p>}

      <div className="cols">
        <div>
          <form className="panel panel-tight" onSubmit={saveProfile} noValidate>
            <h2>Profile & credentials</h2>
            <div className="grid-2">
              <Field id="fn" label="First name" error={profileErrors.firstName}><input id="fn" value={profile.firstName} onChange={setP('firstName')} /></Field>
              <Field id="ln" label="Last name" error={profileErrors.lastName}><input id="ln" value={profile.lastName} onChange={setP('lastName')} /></Field>
              <Field id="ph" label="Phone" error={profileErrors.phone}><input id="ph" value={profile.phone} onChange={setP('phone')} /></Field>
              <Field id="pr" label="Profession"><select id="pr" value={profile.profession} onChange={setP('profession')}>{['RN', 'RPN', 'PSW', 'RSW'].map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field id="lb" label="Licensing body" error={profileErrors.licenseBody}><input id="lb" value={profile.licenseBody} onChange={setP('licenseBody')} placeholder="e.g. College of Nurses of Ontario" /></Field>
              <Field id="lnum" label="Licence number" error={profileErrors.licenseNumber}><input id="lnum" value={profile.licenseNumber} onChange={setP('licenseNumber')} /></Field>
              <Field id="lexp" label="Licence expiry" error={profileErrors.licenseExpiry}><input id="lexp" type="date" value={profile.licenseExpiry} onChange={setP('licenseExpiry')} /></Field>
              <Field id="es" label="Employment status" hint="Inactive blocks sign-in immediately.">
                <select id="es" value={profile.employmentStatus} onChange={setP('employmentStatus')}><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select>
              </Field>
              <Field id="ecn" label="Emergency contact name"><input id="ecn" value={profile.emergencyContactName} onChange={setP('emergencyContactName')} /></Field>
              <Field id="ecp" label="Emergency contact phone"><input id="ecp" value={profile.emergencyContactPhone} onChange={setP('emergencyContactPhone')} /></Field>
            </div>
            <Field id="cn" label="Internal notes"><textarea id="cn" value={profile.notes} onChange={setP('notes')} /></Field>
            <div className="form-actions"><button className="btn btn-primary btn-inline" disabled={busy}>Save profile</button></div>
          </form>

          <section className="panel panel-tight">
            <h2>Weekly availability</h2>
            <p className="hint" style={{ marginTop: 0 }}>Times use the business timezone. Scheduling outside these windows shows a warning but is still allowed.</p>
            {windows.length === 0 && <p className="empty-note">No availability set.</p>}
            {windows.map((w, i) => (
              <div className="sched-row" key={i}>
                <select aria-label="Weekday" value={w.weekday} onChange={(e) => setW(i, 'weekday', Number(e.target.value))}>{WEEKDAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}</select>
                <input aria-label="From" type="time" value={w.startTime} onChange={(e) => setW(i, 'startTime', e.target.value)} />
                <input aria-label="To" type="time" value={w.endTime} onChange={(e) => setW(i, 'endTime', e.target.value)} />
                <button type="button" className="btn btn-danger" onClick={() => setWindows((x) => x.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div className="row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWindows((x) => [...x, { weekday: 1, startTime: '09:00', endTime: '17:00' }])}>+ Add window</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveAvailability}>Save availability</button>
            </div>
          </section>

          <section className="panel panel-tight">
            <h2>Service areas</h2>
            <Field id="areas" label="Cities or postal prefixes, separated by commas" hint="Used to warn the admin when a client is outside the caregiver's area.">
              <input id="areas" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Toronto, Mississauga" />
            </Field>
            <div className="form-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveAreas}>Save areas</button></div>
          </section>
        </div>

        <div>
          <section className="panel panel-tight">
            <h2>Certifications</h2>
            {c.certifications.length === 0 && <p className="empty-note">None recorded.</p>}
            <ul className="doclist">
              {c.certifications.map((x) => (
                <li key={x.id}>
                  <span><strong>{x.name}</strong><small>{x.issuer || 'No issuer'} · expires {fmtDate(x.expiresOn)}</small></span>
                  <button className="btn btn-danger" disabled={busy} onClick={() => delCert(x.id)}>Remove</button>
                </li>
              ))}
            </ul>
            <h3>Add certification</h3>
            <form onSubmit={addCert} noValidate>
              <Field id="cname" label="Name" error={certErrors.name}><input id="cname" value={cert.name} onChange={(e) => setCert({ ...cert, name: e.target.value })} placeholder="CPR / First Aid" /></Field>
              <Field id="cissuer" label="Issuer (optional)"><input id="cissuer" value={cert.issuer} onChange={(e) => setCert({ ...cert, issuer: e.target.value })} /></Field>
              <div className="grid-2">
                <Field id="cissued" label="Issued"><input id="cissued" type="date" value={cert.issuedOn} onChange={(e) => setCert({ ...cert, issuedOn: e.target.value })} /></Field>
                <Field id="cexp" label="Expires" error={certErrors.expiresOn}><input id="cexp" type="date" value={cert.expiresOn} onChange={(e) => setCert({ ...cert, expiresOn: e.target.value })} /></Field>
              </div>
              {c.documents.length > 0 && (
                <Field id="cdoc" label="Link an uploaded document (optional)">
                  <select id="cdoc" value={cert.documentId} onChange={(e) => setCert({ ...cert, documentId: e.target.value })}>
                    <option value="">None</option>{c.documents.map((d) => <option key={d.id} value={d.id}>{DOC_LABEL[d.docType]} · {d.originalName}</option>)}
                  </select>
                </Field>
              )}
              <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={busy || !cert.name.trim()}>Add</button></div>
            </form>
          </section>

          <section className="panel panel-tight">
            <h2>Documents</h2>
            {c.documents.length === 0 ? <p className="empty-note">No documents.</p> : (
              <ul className="doclist">
                {c.documents.map((d) => (
                  <li key={d.id}><span><strong>{DOC_LABEL[d.docType] || d.docType}</strong><small>{d.originalName} · {fmtSize(d.sizeBytes)}</small></span>
                    <button className="btn btn-ghost btn-sm" onClick={() => download(d)}>Download</button></li>
                ))}
              </ul>
            )}
            <h3>Add a document</h3>
            <div className="row-actions">
              <select aria-label="Document type" value={doc.docType} onChange={(e) => setDoc({ ...doc, docType: e.target.value })}>{Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input type="file" aria-label="Choose file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setDoc({ ...doc, file: e.target.files[0] || null, error: '' })} />
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={upload}>Upload</button>
            </div>
            {doc.error && <span className="field-error">{doc.error}</span>}
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
