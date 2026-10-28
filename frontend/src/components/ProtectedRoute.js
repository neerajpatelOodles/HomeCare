'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

/**
 * Guards a portal. Not logged in -> /login.
 * Logged in with the wrong role -> bounced to their own portal.
 * `roles` is the list of roles allowed in (e.g. HR and Admin share the applicant pages).
 * (The backend enforces the same rules; this only keeps the UI tidy.)
 */
export default function ProtectedRoute({ roles, role, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = roles || [role];

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!allowed.includes(user.role)) router.replace(ROLE_HOME[user.role]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router]);

  if (loading || !user || !allowed.includes(user.role)) {
    return (
      <div className="center-screen" role="status" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }
  return children;
}
