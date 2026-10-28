'use client';

import Link from 'next/link';
import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Pager, useDebounced, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, STATUS_LABEL } from '@/lib/format';

const STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

export default function ApplicantsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [profession, setProfession] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const { data, loading, error } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (status) p.set('status', status);
    if (profession) p.set('profession', profession);
    if (search) p.set('search', search);
    return api(`/api/hr/applicants?${p}`).then((r) => r.data);
  }, [page, status, profession, search]);
  const items = data?.items || [];

  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>Applicants</h1><p className="muted">People who applied through the public application page.</p></div>
        <Link href="/apply" className="link" target="_blank">Open public application page ↗</Link>
      </div>
      <section className="panel table-panel">
        <div className="filters">
          <input type="search" placeholder="Search name or email" aria-label="Search applicants" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(1); }} />
          <select aria-label="Filter by stage" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All stages</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select aria-label="Filter by profession" value={profession} onChange={(e) => { setProfession(e.target.value); setPage(1); }}>
            <option value="">All professions</option>
            {['RN', 'RPN', 'PSW', 'RSW'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <Notice kind="error">{error}</Notice>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Profession</th><th>Stage</th><th>Documents</th><th>Applied</th><th aria-label="Open" /></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.firstName} {a.lastName}</strong><br /><span className="you">{a.email}</span></td>
                  <td>{a.profession}</td>
                  <td><Badge status={a.status} /></td>
                  <td>{a.documentCount}{a.missingDocuments?.length > 0 && a.status !== 'hired' && <span className="you"> ({a.missingDocuments.length} missing)</span>}</td>
                  <td>{fmtDate(a.appliedAt)}</td>
                  <td className="actions"><Link className="btn btn-ghost btn-sm" href={`/hr/applicants/${a.id}`}>Open</Link></td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No applicants found.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="applicant" />
      </section>
    </PortalShell>
  );
}
