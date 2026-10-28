'use client';

import Link from 'next/link';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Spinner, StatCard, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function ClientDashboard() {
  const { data, loading, error } = useLoad(() => api('/api/dashboard/client').then((r) => r.data), []);
  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>{data?.message || 'Client dashboard'}</h1><p className="muted">Your upcoming and recent care visits.</p></div>
        <Link href="/client/care-plan" className="btn btn-primary btn-inline" style={{ textDecoration: 'none' }}>View my care plan</Link>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : data && (
        data.clientRecord === null ? (
          <section className="panel panel-tight"><h2>Your care profile is being set up</h2><p className="muted">Our office has not linked a care profile to your account yet. Once they do, your visits and care plan will appear here.</p></section>
        ) : (
          <>
            <div className="stats"><StatCard label="Upcoming visits" value={data.upcomingCount} /></div>
            <div className="cols-3">
              <section className="panel panel-tight">
                <h2>Upcoming visits</h2>
                {data.upcomingVisits.length === 0 ? <p className="empty-note">No upcoming visits.</p> : data.upcomingVisits.map((v) => (
                  <div key={v.id} className="visit-card"><span><strong>{fmtDateTime(v.startAt)}</strong><small>{v.caregiver ? `With ${v.caregiver.name}` : 'Caregiver to be confirmed'} · {v.serviceType}</small></span><Badge status={v.status} /></div>
                ))}
              </section>
              <section className="panel panel-tight">
                <h2>Recent visits</h2>
                {data.recentVisits.length === 0 ? <p className="empty-note">No completed visits yet.</p> : data.recentVisits.map((v) => (
                  <div key={v.id} className="visit-card"><span><strong>{fmtDateTime(v.startAt)}</strong><small>{v.caregiver ? `With ${v.caregiver.name}` : ''} · {v.serviceType}</small></span><Badge status={v.status} /></div>
                ))}
              </section>
            </div>
          </>
        )
      )}
    </PortalShell>
  );
}
