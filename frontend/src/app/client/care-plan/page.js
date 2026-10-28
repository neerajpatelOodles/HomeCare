'use client';

import PortalShell from '@/components/PortalShell';
import { Notice, Spinner, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function ClientCarePlan() {
  const { data, loading, error } = useLoad(() => api('/api/client/care-plan').then((r) => r.data.carePlan), []);
  return (
    <PortalShell>
      <div className="page-head"><div><h1>My care plan</h1><p className="muted">Prepared by our care team. Ask the office if anything needs to change.</p></div></div>
      <Notice kind="error">{error}</Notice>
      {loading ? <Spinner /> : !data ? (
        <section className="panel panel-tight"><p className="empty-note">No care plan has been added yet.</p></section>
      ) : (
        <section className="panel panel-tight">
          <h2>{data.title}</h2>
          <dl className="kv">
            <dt>Summary</dt><dd className="pre">{data.summary || '—'}</dd>
            <dt>Goals</dt><dd className="pre">{data.goals || '—'}</dd>
            <dt>Daily tasks</dt><dd className="pre">{data.dailyTasks || '—'}</dd>
            <dt>Precautions</dt><dd className="pre">{data.precautions || '—'}</dd>
            <dt>Start date</dt><dd>{fmtDate(data.startDate)}</dd>
            <dt>Review date</dt><dd>{fmtDate(data.reviewDate)}</dd>
          </dl>
        </section>
      )}
    </PortalShell>
  );
}
