'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const navItems = [
  { icon: '📊', label: 'Dashboard', path: '/' },
  { icon: '📦', label: 'Orders', path: '/orders' },
  { icon: '🔄', label: 'Subscriptions', path: '/subscriptions' },
  { icon: '⚙️', label: 'Settings', path: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">📌</div>
        <div className="sidebar-logo-text">
          TrackIt
          <span>Reminders & Tracking</span>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">Navigation</div>
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`nav-link ${pathname === item.path ? 'active' : ''}`}
            onClick={() => router.push(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {session?.user && (
        <div className="nav-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div className="nav-label">Account</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', marginBottom: '12px' }}>
             {session.user.image ? (
               <img src={session.user.image} alt={session.user.name || ''} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
             ) : (
               <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                 {(session.user.name || 'U').charAt(0)}
               </div>
             )}
             <div style={{ overflow: 'hidden' }}>
               <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.name}</div>
               <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</div>
             </div>
          </div>
          <button 
            className="nav-link" 
            style={{ color: '#ef4444' }}
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
          >
            <span className="nav-icon">🚪</span>
            Logout
          </button>
        </div>
      )}
    </aside>
  );
}
