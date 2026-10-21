'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

/**
 * Guards a portal. Not logged in -> /login.
 * Logged in with the wrong role -> bounced to their own portal.
 * (The backend enforces the same rules; this only keeps the UI tidy.)
 */
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== role) router.replace(ROLE_HOME[user.role]);
  }, [user, loading, role, router]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="center-screen" role="status" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }
  return children;
}
