'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';

/**
 * Shared layout for the three portals. Loads the placeholder message from the
 * role's dashboard endpoint, so the page also proves the backend permission check works.
 */
export default function DashboardShell({ role }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/api/dashboard/${role}`)
      .then((res) => active && setMessage(res.data.message))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'admin') return;

    let active = true;
    setUsersLoading(true);
    api('/api/admin/users')
      .then((res) => {
        if (!active) return;
        const list = (res.data?.items || []).filter((entry) => entry.role !== 'admin');
        setUsers(list);
      })
      .catch((err) => active && setUsersError(err.message))
      .finally(() => active && setUsersLoading(false));

    return () => {
      active = false;
    };
  }, [role]);

  async function handleRoleChange(userId, nextRole) {
    try {
      setUsersError('');
      const res = await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: { role: nextRole },
      });

      setUsers((current) =>
        current.map((entry) => (entry.id === userId ? { ...entry, role: res.data.user.role } : entry))
      );
    } catch (err) {
      setUsersError(err.message);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ');

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Home-Care Central</span>
          <span className="pill">{ROLE_LABEL[role]} Portal</span>
        </div>
        <div className="topbar-right">
          <div className="who">
            <strong>{name || user.email}</strong>
            <span>{user.email}</span>
          </div>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          {error ? (
            <p className="alert" role="alert">{error}</p>
          ) : message ? (
            <h1 className="welcome">{message}</h1>
          ) : (
            <div className="spinner" />
          )}
          <p className="muted">
            {role === 'admin'
              ? 'Manage staff and client access from the list below.'
              : 'No advanced features yet. This portal is the Phase 1 foundation and is ready for Phase 2 modules.'}
          </p>
        </section>

        {role === 'admin' && (
          <section className="panel admin-panel">
            <div className="section-header">
              <h2>Staff & Client Access</h2>
              <span>{users.length} users</span>
            </div>

            {usersError ? (
              <p className="alert" role="alert">{usersError}</p>
            ) : usersLoading ? (
              <div className="spinner" />
            ) : (
              <div className="user-list">
                {users.map((entry) => (
                  <div key={entry.id} className="user-row">
                    <div className="user-meta">
                      <strong>{[entry.profile?.firstName, entry.profile?.lastName].filter(Boolean).join(' ') || entry.email}</strong>
                      <span>{entry.email}</span>
                    </div>

                    <label className="role-field">
                      <span>Role</span>
                      <select
                        value={entry.role}
                        onChange={(e) => handleRoleChange(entry.id, e.target.value)}
                        aria-label={`Change role for ${entry.email}`}
                      >
                        <option value="client">Client</option>
                        <option value="staff">Staff</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
