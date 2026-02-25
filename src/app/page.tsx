'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

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

function getDaysLeft(dateStr: string): number {
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/orders').then(r => r.json()),
      fetch('/api/subscriptions').then(r => r.json()),
    ]).then(([o, s]) => {
      setOrders(Array.isArray(o) ? o : []);
      setSubscriptions(Array.isArray(s) ? s : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const activeOrders = orders.filter(o => o.status === 'Delivered' && o.returnDeadline);
  const activeSubscriptions = subscriptions.filter(s => s.status === 'Active');
  const monthlyTotal = activeSubscriptions.reduce((sum, s) => {
    const cost = s.billingCycle === 'Yearly' ? s.cost / 12 : s.billingCycle === 'Weekly' ? s.cost * 4 : s.cost;
    return sum + cost;
  }, 0);

  const urgentOrders = activeOrders.filter(o => o.returnDeadline && getDaysLeft(o.returnDeadline) <= 3).length;
  const urgentSubs = activeSubscriptions.filter(s => getDaysLeft(s.nextRenewalDate) <= 3).length;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your upcoming deadlines and renewals at a glance</p>
        </div>

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon purple">📦</div>
            <div>
              <div className="stat-value">{orders.length}</div>
              <div className="stat-label">Total Orders</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon yellow">⏳</div>
            <div>
              <div className="stat-value">{activeOrders.length}</div>
              <div className="stat-label">Active Returns</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">🔄</div>
            <div>
              <div className="stat-value">{activeSubscriptions.length}</div>
              <div className="stat-label">Subscriptions</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue">💰</div>
            <div>
              <div className="stat-value">₹{Math.round(monthlyTotal)}</div>
              <div className="stat-label">Monthly Spend</div>
            </div>
          </div>
          {(urgentOrders + urgentSubs) > 0 && (
            <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
              <div className="stat-icon red">🚨</div>
              <div>
                <div className="stat-value">{urgentOrders + urgentSubs}</div>
                <div className="stat-label">Urgent (≤3 days)</div>
              </div>
            </div>
          )}
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
            ) : activeOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No active return windows</div>
              </div>
            ) : (
              <div className="item-list">
                {activeOrders.slice(0, 5).map(order => {
                  const days = getDaysLeft(order.returnDeadline!);
                  return (
                    <div className="item-card" key={order._id}>
                      <div className="item-logo">{getEmoji(order.marketplace, marketplaceEmojis)}</div>
                      <div className="item-info">
                        <div className="item-name">{order.itemName}</div>
                        <div className="item-meta">{order.marketplace}</div>
                      </div>
                      <div className="item-right">
                        <div className="item-date">{formatDate(order.returnDeadline!)}</div>
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
            ) : activeSubscriptions.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-text">No active subscriptions</div>
              </div>
            ) : (
              <div className="item-list">
                {activeSubscriptions.slice(0, 5).map(sub => {
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
    </div>
  );
}
