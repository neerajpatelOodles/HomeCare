'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/lib/roles';

// "/" just sends people to the right place.
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? ROLE_HOME[user.role] : '/login');
  }, [user, loading, router]);

  return (
    <div className="center-screen" role="status" aria-live="polite">
      <div className="spinner" />
    </div>
  );
}
