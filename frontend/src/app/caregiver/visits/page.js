'use client';

import Link from 'next/link';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Pager, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function CaregiverVisits() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, loading, error } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) p.set('status', status);
    return api(`/api/caregiver/visits?${p}`).then((r) => r.data);
  }, [page, status]);
  const items = data?.items || [];
  return (
    <PortalShell>
      <div className="page-head"><div><h1>My visits</h1><p className="muted">Your schedule. Admin creates visits; you add notes and mark them completed.</p></div></div>
      <section className="panel table-panel">
        <div className="filters">
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{['scheduled', 'completed', 'cancelled', 'missed'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Client</th><th>Where</th><th>Service</th><th>Status</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>{fmtDateTime(v.startAt)}</td><td>{v.client.name}</td>
                  <td>{[v.client.address, v.client.city].filter(Boolean).join(', ') || '—'}</td><td>{v.serviceType}</td>
                  <td><Badge status={v.status} /></td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/caregiver/visits/${v.id}`}>Open</Link></td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No visits.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="visit" />
      </section>
    </PortalShell>
  );
}
