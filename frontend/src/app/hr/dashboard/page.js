'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Spinner, StatCard, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { redirect } from 'next/navigation';

export default function HrDashboard() {
  const { user } = useAuth();
  // The HR dashboard data belongs to the HR role; admins use the admin dashboard.
  if (user.role === 'admin') redirect('/admin/dashboard');
  const { data, loading, error } = useLoad(() => api('/api/dashboard/hr').then((r) => r.data), []);
  const s = data?.applicantsByStatus;
  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>{data?.message || 'HR dashboard'}</h1><p className="muted">Applicants, hiring progress and expiring credentials.</p></div>
        <Link href="/hr/applicants" className="btn btn-primary btn-inline" style={{ textDecoration: 'none' }}>View applicants</Link>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : data && (
        <>
          <div className="stats">
            <StatCard label="New (applied)" value={s.applied} />
            <StatCard label="Screening" value={s.screening} />
            <StatCard label="Interview" value={s.interview} />
            <StatCard label="Offer" value={s.offer} />
            <StatCard label="Hired" value={s.hired} />
            <StatCard label="Rejected" value={s.rejected} />
          </div>
          <div className="cols-3">
            <section className="panel panel-tight">
              <h2>Open applicants by profession</h2>
              <div className="chips">{Object.entries(data.openApplicantsByProfession).map(([p, n]) => <span key={p} className="chip"><strong>{p}</strong> {n}</span>)}</div>
              <h3>Latest applications</h3>
              {data.recentApplicants.length === 0 ? <p className="empty-note">No applications yet.</p> : data.recentApplicants.map((a) => (
                <Link key={a.id} href={`/hr/applicants/${a.id}`} className="visit-card">
                  <span><strong>{a.name}</strong><small>{a.profession} · {fmtDate(a.appliedAt)}</small></span>
                  <Badge status={a.status} />
                </Link>
              ))}
            </section>
            <section className="panel panel-tight">
              <h2>Expiring soon (30 days)</h2>
              <h3>Licences</h3>
              {data.licensesExpiringSoon.length === 0 ? <p className="empty-note">Nothing expiring.</p> : data.licensesExpiringSoon.map((c) => (
                <Link key={c.caregiverId} href={`/hr/caregivers/${c.caregiverId}`} className="visit-card">
                  <span><strong>{c.name}</strong><small>{c.profession}</small></span><span className="status off">{fmtDate(c.licenseExpiry)}</span>
                </Link>
              ))}
              <h3>Certifications</h3>
              {data.certificationsExpiringSoon.length === 0 ? <p className="empty-note">Nothing expiring.</p> : data.certificationsExpiringSoon.map((c) => (
                <Link key={c.certificationId} href={`/hr/caregivers/${c.caregiverId}`} className="visit-card">
                  <span><strong>{c.caregiver}</strong><small>{c.certification}</small></span><span className="status off">{fmtDate(c.expiresOn)}</span>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
    </PortalShell>
  );
}
