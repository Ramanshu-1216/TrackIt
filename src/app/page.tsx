import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';

// ... (keep interface & helper functions the same - I am replacing the whole file imports and the bottom return statement for brevity, let me just specifically target the import and the return)

interface Order {
  _id: string;
  itemName: string;
  marketplace: string;
  status: string;
  deliveryDate?: string;
  returnDeadline?: string;
  returnWindowDays: number;
}

interface Subscription {
  _id: string;
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: string;
  nextRenewalDate: string;
  status: string;
}

interface Stats {
  totalOrders: number;
  activeReturns: number;
  subscriptionsCount: number;
  monthlySpend: number;
  urgentCount: number;
}

function getDaysLeft(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function getDaysClass(days: number): string {
  if (days < 0) return 'expired';
  if (days <= 2) return 'urgent';
  if (days <= 7) return 'soon';
  return 'ok';
}

function getDaysLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Today!';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

const marketplaceEmojis: Record<string, string> = {
  Amazon: '📦', Flipkart: '🛍️', Myntra: '👗', Meesho: '🏷️',
  Ajio: '👟', Nykaa: '💄', Snapdeal: '🛒', Other: '🏪',
};

const subscriptionEmojis: Record<string, string> = {
  Netflix: '🎬', Spotify: '🎵', YouTube: '▶️', Hotstar: '🌟',
  Amazon: '📺', Apple: '🍎', Google: '🔍', Gym: '💪',
  Jio: '📱', Airtel: '📡', Other: '🔄',
};

function getEmoji(name: string, map: Record<string, string>): string {
  for (const key of Object.keys(map)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return map['Other'] || '📌';
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    activeReturns: 0,
    subscriptionsCount: 0,
    monthlySpend: 0,
    urgentCount: 0
  });
  const [upcomingReturns, setUpcomingReturns] = useState<Order[]>([]);
  const [upcomingSubscriptions, setUpcomingSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      if (data.stats) {
        setStats(data.stats);
        setUpcomingReturns(data.upcomingReturns || []);
        setUpcomingSubscriptions(data.upcomingSubscriptions || []);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncGmail = async () => {
    if (!session?.user?.hasGmailScope) {
      if (confirm('Gmail permissions are missing. Would you like to grant them now to enable syncing?')) {
        signIn('google', { callbackUrl: '/?sync=true' });
      }
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/gmail', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully synced! Found ${data.ordersCount} new orders and ${data.subscriptionsCount} new subscriptions.`);
        fetchStats();
      } else {
        alert('Sync failed: ' + (data.error || 'Check your Gmail connection in Settings'));
      }
    } catch (err) {
      alert('Error connecting to sync service');
    } finally {
      setIsSyncing(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const userName = session?.user?.name?.split(' ')[0] || 'Tracker';

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{getGreeting()}, {userName}! 👋</h1>
            <p className="page-subtitle">You have {stats.urgentCount} items closing or renewing soon.</p>
          </div>
          <button 
            className={`btn ${isSyncing ? 'btn-ghost' : 'btn-primary'}`} 
            onClick={syncGmail}
            disabled={isSyncing}
          >
            {isSyncing ? '⌛ Syncing Gmail...' : '🔄 Sync Gmail'}
          </button>
        </div>

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon purple">📦</div>
            <div>
              <div className="stat-value">{stats.totalOrders}</div>
              <div className="stat-label">Total Orders</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon yellow">⏳</div>
            <div>
              <div className="stat-value">{stats.activeReturns}</div>
              <div className="stat-label">Active Returns</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">🔄</div>
            <div>
              <div className="stat-value">{stats.subscriptionsCount}</div>
              <div className="stat-label">Subscriptions</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue">💰</div>
            <div>
              <div className="stat-value">₹{Math.round(stats.monthlySpend)}</div>
              <div className="stat-label">Monthly Spend</div>
            </div>
          </div>
        </div>

        {/* Two column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Upcoming Returns */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">⏰ Upcoming Returns</div>
              <a href="/orders" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>View all →</a>
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</p>
            ) : upcomingReturns.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No active return windows</div>
              </div>
            ) : (
              <div className="item-list">
                {upcomingReturns.map(order => {
                  const days = getDaysLeft(order.returnDeadline);
                  return (
                    <div className="item-card" key={order._id}>
                      <div className="item-logo">{getEmoji(order.marketplace, marketplaceEmojis)}</div>
                      <div className="item-info">
                        <div className="item-name">{order.itemName}</div>
                        <div className="item-meta">{order.marketplace}</div>
                      </div>
                      <div className="item-right">
                        <div className="item-date">{order.returnDeadline ? formatDate(order.returnDeadline) : 'N/A'}</div>
                        <span className={`item-days ${getDaysClass(days)}`}>{getDaysLabel(days)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Renewals */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">🔔 Upcoming Renewals</div>
              <a href="/subscriptions" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>View all →</a>
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</p>
            ) : upcomingSubscriptions.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No active subscriptions</div>
              </div>
            ) : (
              <div className="item-list">
                {upcomingSubscriptions.map(sub => {
                  const days = getDaysLeft(sub.nextRenewalDate);
                  return (
                    <div className="item-card" key={sub._id}>
                      <div className="item-logo">{getEmoji(sub.serviceName, subscriptionEmojis)}</div>
                      <div className="item-info">
                        <div className="item-name">{sub.serviceName}</div>
                        <div className="item-meta">{sub.billingCycle} · {sub.currency} {sub.cost}</div>
                      </div>
                      <div className="item-right">
                        <div className="item-date">{formatDate(sub.nextRenewalDate)}</div>
                        <span className={`item-days ${getDaysClass(days)}`}>{getDaysLabel(days)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </main>
      <MobileNav />
    </div>
  );
}
