'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { NAV, ROLE_LABEL } from '@/lib/roles';

/** Shared portal frame for all roles. */
export default function PortalShell({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    setSidebarOpen(false);
    router.replace('/login');
  }

  const closeSidebar = () => setSidebarOpen(false);
  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ');
  const links = NAV[user.role] || [];
  const isActive = (href) => pathname === href || (href !== `/${user.role}/dashboard` && pathname.startsWith(`${href}/`));

  return (
    <div className={`portal-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">Home-Care Central</div>
            <div className="brand-subtitle">{ROLE_LABEL[user.role]} Portal</div>
          </div>
        </div>

        <nav className="portal-nav" aria-label="Main navigation">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={isActive(l.href) ? 'portal-link active' : 'portal-link'}
              aria-current={isActive(l.href) ? 'page' : undefined}
              onClick={closeSidebar}
            >
              <span className="portal-dot" aria-hidden="true" />
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="portal-footer">
          <div className="portal-user">
            <strong>{name || user.email}</strong>
            <span>{user.email}</span>
          </div>
          <button type="button" className="btn btn-ghost sidebar-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>{ROLE_LABEL[user.role]} Dashboard</h1>
          </div>
          <div className="header-user-box">
            <span className="header-role">{ROLE_LABEL[user.role]}</span>
            <strong>{name || user.email}</strong>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
