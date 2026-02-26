'use client';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { icon: '📊', label: 'Dashboard', path: '/' },
  { icon: '📦', label: 'Orders', path: '/orders' },
  { icon: '🔄', label: 'Subs', path: '/subscriptions' },
  { icon: '⚙️', label: 'Settings', path: '/settings' },
];

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        return (
          <button
            key={item.path}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => router.push(item.path)}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
