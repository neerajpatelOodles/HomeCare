'use client';

import { useCallback, useEffect, useState } from 'react';
import { STATUS_LABEL } from '@/lib/format';

/** Load data on mount / when deps change. Returns { data, loading, error, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      setState({ data: await fn(), loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: err.message });
    }
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

export function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Notice({ children, kind = 'notice' }) {
  if (!children) return null;
  return <p className={kind === 'error' ? 'alert' : kind === 'warn' ? 'warn' : 'notice'} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function Pager({ pagination, page, setPage, loading, noun = 'item' }) {
  const p = pagination || { total: 0, totalPages: 1, page: 1 };
  return (
    <div className="pager">
      <span className="muted">{loading ? 'Loading…' : `${p.total} ${noun}${p.total === 1 ? '' : 's'}`}</span>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setPage(page - 1)} disabled={page <= 1 || loading}>Previous</button>
        <span className="page-num">Page {p.page} of {Math.max(p.totalPages, 1)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setPage(page + 1)} disabled={page >= p.totalPages || loading}>Next</button>
      </div>
    </div>
  );
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Turns an API validation error into { field: message } plus a general message. */
export function readErrors(err) {
  if (err.errors?.length) {
    const map = {};
    for (const e of err.errors) map[e.field] = e.message;
    return { fields: map, message: 'Please fix the highlighted fields.' };
  }
  return { fields: {}, message: err.message };
}

export function StatCard({ label, value, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
