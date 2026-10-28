'use client';

import { useState } from 'react';
import PortalShell from '@/components/PortalShell';
import { Badge, Notice, Pager, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

const KIND = {
  application_received: 'Application received', hr_new_application: 'HR: new application', applicant_status: 'Applicant status update',
  caregiver_invite: 'Caregiver invite', visit_reminder: 'Visit reminder', visit_cancelled: 'Visit cancelled',
};

export default function EmailsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const { data, loading, error, reload } = useLoad(() => {
    const p = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) p.set('status', status);
    return api(`/api/admin/notifications?${p}`).then((r) => r.data);
  }, [page, status]);
  const items = data?.items || [];

  async function run() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = (await api('/api/admin/notifications/process', { method: 'POST' })).data;
      setMsg(`Worker ran: ${r.sent} sent, ${r.retrying} retrying, ${r.failed} failed, ${r.reminders} new visit reminders queued.`);
      await reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <PortalShell>
      <div className="page-head">
        <div><h1>Emails</h1><p className="muted">Every email the system sends (applications, status updates, invites, visit reminders). The message text is not shown here.</p></div>
        <button className="btn btn-primary btn-inline" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Send pending now'}</button>
      </div>
      <Notice>{msg}</Notice><Notice kind="error">{err || error}</Notice>
      <section className="panel table-panel">
        <div className="filters">
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="pending">Pending</option><option value="sent">Sent</option><option value="failed">Failed</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Created</th><th>To</th><th>Type</th><th>Subject</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id}>
                  <td>{fmtDateTime(n.createdAt)}</td><td>{n.to}</td><td>{KIND[n.kind] || n.kind}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 280 }}>{n.subject}</td>
                  <td><Badge status={n.status} /></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{n.lastError ? <span className="field-error">{n.lastError}</span> : n.sentAt ? `Sent ${fmtDateTime(n.sentAt)}` : n.attempts ? `${n.attempts} attempt(s)` : ''}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={6} className="empty">No emails yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager pagination={data?.pagination} page={page} setPage={setPage} loading={loading} noun="email" />
      </section>
    </PortalShell>
  );
}
