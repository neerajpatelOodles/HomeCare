'use client';

import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Pager, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function ClientVisits() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, loading, error } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) p.set('status', status);
    return api(`/api/client/visits?${p}`).then((r) => r.data);
  }, [page, status]);
  const items = data?.items || [];
  return (
    <PortalShell>
      <div className="page-head"><div><h1>My visits</h1><p className="muted">Visits are scheduled by our office. Call us if you need a change.</p></div></div>
      <section className="panel table-panel">
        <div className="filters">
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{['scheduled', 'completed', 'cancelled', 'missed'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Caregiver</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}><td>{fmtDateTime(v.startAt)}</td><td>{v.caregiver?.name || 'To be confirmed'}</td><td>{v.serviceType}</td><td><Badge status={v.status} /></td></tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={4} className="empty">No visits.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="visit" />
      </section>
    </PortalShell>
  );
}
