'use client';

import PortalShell from '@/components/PortalShell';
import { Notice, Spinner, StatCard, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

export default function StaffDashboard() {
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const { data, loading, error } = useLoad(() => api(`/api/dashboard/staff?tz=${encodeURIComponent(tz)}`).then((r) => r.data), [tz]);
  const s = data?.stats;
  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>{data?.message || 'Staff dashboard'}</h1><p className="muted">Office overview (read-only). Scheduling and records are managed by Admin.</p></div>
      </div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : s && (
        <div className="stats">
          <StatCard label="Visits today" value={s.visitsToday} />
          <StatCard label="Visits next 7 days" value={s.visitsNext7Days} />
          <StatCard label="Unassigned visits" value={s.unassignedVisits} tone={s.unassignedVisits ? 'warn' : ''} />
          <StatCard label="Active clients" value={s.activeClients} />
          <StatCard label="Active caregivers" value={s.activeCaregivers} />
        </div>
      )}
    </PortalShell>
  );
}
