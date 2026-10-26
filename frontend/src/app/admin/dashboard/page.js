'use client';

import Link from 'next/link';
import PortalShell from '@/components/PortalShell';
import { Notice, Spinner, StatCard, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

export default function AdminDashboard() {
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const { data, loading, error } = useLoad(() => api(`/api/dashboard/admin?tz=${encodeURIComponent(tz)}`).then((r) => r.data), [tz]);
  const s = data?.stats;
  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>{data?.message || 'Admin dashboard'}</h1><p className="muted">Today at a glance. Only Admin creates visits.</p></div>
        <Link href="/admin/visits" className="btn btn-primary btn-inline" style={{ textDecoration: 'none' }}>Open schedule</Link>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : s && (
        <>
          <div className="stats">
            <StatCard label="Visits today" value={s.visitsToday} />
            <StatCard label="Visits next 7 days" value={s.visitsNext7Days} />
            <StatCard label="Unassigned visits" value={s.unassignedVisits} tone={s.unassignedVisits ? 'warn' : ''} />
            <StatCard label="Active clients" value={s.activeClients} />
            <StatCard label="Active caregivers" value={s.activeCaregivers} />
            <StatCard label="Open applicants" value={s.openApplicants} />
            <StatCard label="Licences expiring (30 days)" value={s.licensesExpiring} tone={s.licensesExpiring ? 'warn' : ''} />
            <StatCard label="Active users" value={s.activeUsers} />
          </div>
          <div className="cols-3">
            <section className="panel panel-tight"><h2>Scheduling</h2><p className="muted">Create and manage visits for clients and caregivers.</p><Link className="link" href="/admin/visits">Go to schedule →</Link></section>
            <section className="panel panel-tight"><h2>Hiring</h2><p className="muted">Review applicants and manage caregivers.</p><Link className="link" href="/hr/applicants">Applicants →</Link> · <Link className="link" href="/hr/caregivers">Caregivers →</Link></section>
            <section className="panel panel-tight"><h2>People</h2><p className="muted">Clients, user accounts and role changes.</p><Link className="link" href="/admin/clients">Clients →</Link> · <Link className="link" href="/admin/users">Users →</Link></section>
          </div>
        </>
      )}
    </PortalShell>
  );
}
