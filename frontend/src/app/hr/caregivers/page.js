'use client';

import Link from 'next/link';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Pager, useDebounced, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function CaregiversPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [profession, setProfession] = useState('');
  const [expiring, setExpiring] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const { data, loading, error } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) p.set('employmentStatus', status);
    if (profession) p.set('profession', profession);
    if (expiring) p.set('expiringWithinDays', '30');
    if (search) p.set('search', search);
    return api(`/api/caregivers?${p}`).then((r) => r.data);
  }, [page, status, profession, expiring, search]);
  const items = data?.items || [];
  return (
    <PortalShell>
      <div className="page-head"><div><h1>Caregivers</h1><p className="muted">Hired staff. New caregivers appear here automatically when an applicant is hired.</p></div></div>
      <section className="panel table-panel">
        <div className="filters">
          <input type="search" placeholder="Search name or email" aria-label="Search caregivers" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option>
          </select>
          <select aria-label="Filter by profession" value={profession} onChange={(e) => { setProfession(e.target.value); setPage(1); }}>
            <option value="">All professions</option>{['RN', 'RPN', 'PSW', 'RSW'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <label className="check-row" style={{ margin: 0 }}><input type="checkbox" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); setPage(1); }} />Licence expiring in 30 days</label>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Profession</th><th>Status</th><th>Licence expiry</th><th>Upcoming visits</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.firstName} {c.lastName}</strong><br /><span className="you">{c.email}</span></td>
                  <td>{c.profession}</td>
                  <td><Badge status={c.employmentStatus} /></td>
                  <td>{fmtDate(c.licenseExpiry)}</td>
                  <td>{c.upcomingVisits}</td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/hr/caregivers/${c.id}`}>Open</Link></td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No caregivers found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="caregiver" />
      </section>
    </PortalShell>
  );
}
