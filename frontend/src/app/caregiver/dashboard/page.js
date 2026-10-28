'use client';

import Link from 'next/link';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Spinner, StatCard, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format';

function VisitCard({ v }) {
  return (
    <Link href={`/caregiver/visits/${v.id}`} className="visit-card">
      <span><strong>{fmtTime(v.startAt)} – {fmtTime(v.endAt)} · {v.client.name}</strong><small>{[v.client.address, v.client.city].filter(Boolean).join(', ') || v.serviceType}</small></span>
      <Badge status={v.status} />
    </Link>
  );
}

export default function CaregiverDashboard() {
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const { data, loading, error } = useLoad(() => api(`/api/dashboard/caregiver?tz=${encodeURIComponent(tz)}`).then((r) => r.data), [tz]);
  const p = data?.caregiverProfile;
  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>{data?.message || 'Caregiver dashboard'}</h1><p className="muted">Your schedule. Open a visit to read the care plan, add notes and mark it completed.</p></div>
        <Link href="/caregiver/visits" className="btn btn-primary btn-inline" style={{ textDecoration: 'none' }}>All my visits</Link>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : data && (
        <>
          <div className="stats">
            <StatCard label="Visits today" value={data.todayVisits.length} />
            <StatCard label="Coming up (7 days)" value={data.upcomingVisits.length} />
            <StatCard label="Completed this month" value={data.completedThisMonth} />
            {p && <StatCard label="Licence expires" value={fmtDate(p.licenseExpiry)} />}
          </div>
          <div className="cols-3">
            <section className="panel panel-tight">
              <h2>Today</h2>
              {data.todayVisits.length === 0 ? <p className="empty-note">No visits today.</p> : data.todayVisits.map((v) => <VisitCard key={v.id} v={v} />)}
            </section>
            <section className="panel panel-tight">
              <h2>Coming up</h2>
              {data.upcomingVisits.length === 0 ? <p className="empty-note">Nothing scheduled in the next 7 days.</p> : data.upcomingVisits.map((v) => (
                <Link key={v.id} href={`/caregiver/visits/${v.id}`} className="visit-card"><span><strong>{fmtDateTime(v.startAt)}</strong><small>{v.client.name}</small></span><Badge status={v.status} /></Link>
              ))}
            </section>
          </div>
        </>
      )}
    </PortalShell>
  );
}
