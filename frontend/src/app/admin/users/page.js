'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import PortalShell from '@/components/PortalShell';
import { ROLE_LABEL } from '@/lib/roles';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', role: 'client', password: '' };
const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const isHrManager = me?.role === 'hr';
  const roleOptions = isHrManager ? ['staff', 'caregiver'] : ['client', 'staff', 'caregiver', 'hr'];

  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');

  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (role) params.set('role', role);
    if (search) params.set('search', search);
    try {
      const res = await api(`/api/admin/users?${params}`);
      setData(res.data);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, role, search]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError('');
    setFieldErrors({});
    setNotice('');
    setShowForm(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      const res = await api('/api/admin/users', { method: 'POST', body });
      const created = res.data.user;
      setShowForm(false);
      setNotice(`${ROLE_LABEL[created.role]} account created for ${created.email}. They can log in now.`);
      setPage(1);
      await load();
    } catch (err) {
      if (err.errors?.length) {
        const map = {};
        for (const item of err.errors) map[item.field] = item.message;
        setFieldErrors(map);
        setFormError('Please fix the highlighted fields.');
      } else {
        setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    setNotice('');
    setListError('');
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
      setNotice(`${u.email} was ${u.isActive ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (err) {
      setListError(err.message);
    }
  }

  async function changeRole(u, nextRole) {
    if (nextRole === u.role || u.id === me.id) return;
    setNotice('');
    setListError('');
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: nextRole } });
      setNotice(`${u.email} role was changed to ${ROLE_LABEL[nextRole]}.`);
      await load();
    } catch (err) {
      setListError(err.message);
    }
  }

  const { items, pagination } = data;

  return (
    <PortalShell>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Create and manage Client, Staff, Caregiver, HR and Admin accounts. Caregivers are normally created automatically when HR hires an applicant.</p>
        </div>
        {!showForm && !isHrManager && (
          <button className="btn btn-primary btn-inline" onClick={openForm}>
            + Add user
          </button>
        )}
      </div>

      {notice && <p className="notice" role="status">{notice}</p>}

      {showForm && (
        <form className="panel form-panel" onSubmit={handleCreate} noValidate>
          <h2>Add user</h2>
          {formError && <p className="alert" role="alert">{formError}</p>}

          <div className="grid-2">
            <Field id="firstName" label="First name" error={fieldErrors.firstName}>
              <input id="firstName" value={form.firstName} onChange={setField('firstName')} required />
            </Field>
            <Field id="lastName" label="Last name" error={fieldErrors.lastName}>
              <input id="lastName" value={form.lastName} onChange={setField('lastName')} required />
            </Field>
            <Field id="newEmail" label="Email" error={fieldErrors.email}>
              <input id="newEmail" type="email" autoComplete="off" value={form.email} onChange={setField('email')} required />
            </Field>
            <Field id="phone" label="Phone (optional)" error={fieldErrors.phone}>
              <input id="phone" type="tel" value={form.phone} onChange={setField('phone')} />
            </Field>
            <Field id="newRole" label="Role" error={fieldErrors.role}>
              <select id="newRole" value={form.role} onChange={setField('role')}>
                {roleOptions.map((roleKey) => (
                  <option key={roleKey} value={roleKey}>{ROLE_LABEL[roleKey]}</option>
                ))}
              </select>
            </Field>
            <Field
              id="newPassword"
              label="Temporary password"
              hint="At least 8 characters, with a letter and a number."
              error={fieldErrors.password}
            >
              <input
                id="newPassword"
                type="text"
                autoComplete="new-password"
                value={form.password}
                onChange={setField('password')}
                required
              />
            </Field>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-inline" disabled={saving}>
              {saving ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      <section className="panel table-panel">
        <div className="filters">
          <input
            type="search"
            placeholder="Search name or email"
            aria-label="Search users"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="client">Clients</option>
            <option value="staff">Staff</option>
                <option value="caregiver">Caregiver</option>
            <option value="hr">HR</option>
            <option value="admin">Admins</option>
          </select>
        </div>

        {listError && <p className="alert" role="alert">{listError}</p>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const isMe = u.id === me.id;
                const name = [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || '—';
                return (
                  <tr key={u.id}>
                    <td>{name}{isMe && <span className="you"> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        className="role-select"
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                        disabled={isMe}
                        aria-label={`Change role for ${u.email}`}
                        title={isMe ? 'You cannot change your own role' : 'Change role'}
                      >
                        {roleOptions.map((roleKey) => (
                          <option key={roleKey} value={roleKey}>{ROLE_LABEL[roleKey]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={u.isActive ? 'status on' : 'status off'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleActive(u)}
                        disabled={isMe}
                        title={isMe ? 'You cannot deactivate your own account' : undefined}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span className="muted">
            {loading ? 'Loading…' : `${pagination.total} user${pagination.total === 1 ? '' : 's'}`}
          </span>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading}>
              Previous
            </button>
            <span className="page-num">Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </PortalShell>
  );
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
