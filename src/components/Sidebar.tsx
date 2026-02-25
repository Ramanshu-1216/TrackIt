'use client';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { icon: '📊', label: 'Dashboard', path: '/' },
  { icon: '📦', label: 'Orders', path: '/orders' },
  { icon: '🔄', label: 'Subscriptions', path: '/subscriptions' },
  { icon: '⚙️', label: 'Settings', path: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

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
    </aside>
  );
}
