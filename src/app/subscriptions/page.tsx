'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';

// ... (keep interface & helper functions the same - targeting the import and the return)

interface Subscription {
  _id: string;
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: 'Monthly' | 'Yearly' | 'Weekly';
  nextRenewalDate: string;
  status: 'Active' | 'Cancelled' | 'Paused';
  cancellationUrl?: string;
  notes?: string;
  category?: string;
}

const BILLING_CYCLES = ['Monthly', 'Yearly', 'Weekly'];
const STATUSES = ['Active', 'Paused', 'Cancelled'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const CATEGORIES = ['Entertainment', 'Music', 'Fitness', 'Telecom', 'Software', 'Food', 'News', 'Other'];

const serviceEmoji: Record<string, string> = {
  Netflix: '🎬', Spotify: '🎵', YouTube: '▶️', Hotstar: '🌟', Prime: '📺',
  Apple: '🍎', Google: '🔍', Gym: '💪', Jio: '📱', Airtel: '📡', Other: '🔄',
};

function getEmoji(name: string): string {
  for (const key of Object.keys(serviceEmoji)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return serviceEmoji[key];
  }
  return '🔄';
}

function getDaysLeft(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toInputDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

function getDaysClass(days: number) {
  if (days < 0) return 'expired';
  if (days <= 2) return 'urgent';
  if (days <= 7) return 'soon';
  return 'ok';
}

function getDaysLabel(days: number) {
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Renews today!';
  return `${days}d to renew`;
}

const emptyForm = {
  serviceName: '', cost: '', currency: 'INR', billingCycle: 'Monthly',
  nextRenewalDate: '', status: 'Active', cancellationUrl: '', notes: '', category: 'Other',
};

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function fetchSubs() {
    const res = await fetch('/api/subscriptions');
    const data = await res.json();
    setSubs(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchSubs(); }, []);

  function openAdd() {
    setEditing(null);
    const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
    setForm({ ...emptyForm, nextRenewalDate: nextMonth.toISOString().split('T')[0] });
    setShowModal(true);
  }

  function openEdit(sub: Subscription) {
    setEditing(sub);
    setForm({
      serviceName: sub.serviceName, cost: String(sub.cost), currency: sub.currency,
      billingCycle: sub.billingCycle, nextRenewalDate: toInputDate(sub.nextRenewalDate),
      status: sub.status, cancellationUrl: sub.cancellationUrl || '',
      notes: sub.notes || '', category: sub.category || 'Other',
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = { ...form, cost: Number(form.cost) };
    if (editing) {
      await fetch(`/api/subscriptions/${editing._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowModal(false);
    fetchSubs();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    fetchSubs();
  }

  const activeSubs = subs.filter(s => s.status === 'Active');
  const monthlyTotal = activeSubs.reduce((sum, s) => {
    const cost = s.billingCycle === 'Yearly' ? s.cost / 12 : s.billingCycle === 'Weekly' ? s.cost * 4 : s.cost;
    return sum + cost;
  }, 0);
  const yearlyTotal = activeSubs.reduce((sum, s) => {
    const cost = s.billingCycle === 'Yearly' ? s.cost : s.billingCycle === 'Weekly' ? s.cost * 52 : s.cost * 12;
    return sum + cost;
  }, 0);

  const filtered = subs.filter(s => {
    const matchSearch = s.serviceName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'All' || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🔄 Subscriptions</h1>
            <p className="page-subtitle">Manage all your recurring subscriptions in one place</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd} id="add-subscription-btn">+ Add Subscription</button>
        </div>

        {/* Summary */}
        {activeSubs.length > 0 && (
          <div className="stat-grid" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-icon green">🔄</div>
              <div>
                <div className="stat-value">{activeSubs.length}</div>
                <div className="stat-label">Active</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue">📅</div>
              <div>
                <div className="stat-value">₹{Math.round(monthlyTotal)}</div>
                <div className="stat-label">Monthly Spend</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">📊</div>
              <div>
                <div className="stat-value">₹{Math.round(yearlyTotal)}</div>
                <div className="stat-label">Yearly Spend</div>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search subscriptions..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {['All', ...STATUSES].map(s => (
              <button key={s} className={`tab ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No subscriptions found</div>
            <div className="empty-state-text">Add your subscriptions to never miss a renewal.</div>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Subscription</button>
          </div>
        ) : (
          <div className="item-list">
            {filtered.map(sub => {
              const days = getDaysLeft(sub.nextRenewalDate);
              return (
                <div className="item-card" key={sub._id} style={{ cursor: 'default' }}>
                  <div className="item-logo">{getEmoji(sub.serviceName)}</div>
                  <div className="item-info">
                    <div className="item-name">{sub.serviceName}</div>
                    <div className="item-meta">{sub.billingCycle} · {sub.currency} {sub.cost.toLocaleString()}
                      {sub.category && ` · ${sub.category}`}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="item-date">Renews {formatDate(sub.nextRenewalDate)}</div>
                      {sub.status === 'Active' && (
                        <span className={`item-days ${getDaysClass(days)}`}>{getDaysLabel(days)}</span>
                      )}
                    </div>
                    <span className={`badge badge-${sub.status.toLowerCase()}`}>{sub.status}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {sub.cancellationUrl && (
                        <a href={sub.cancellationUrl} target="_blank" rel="noreferrer"
                           className="btn-icon" title="Cancel link">🔗</a>
                      )}
                      <button className="btn-icon" onClick={() => openEdit(sub)} title="Edit">✏️</button>
                      <button className="btn-icon" onClick={() => setDeleteId(sub._id)} title="Delete"
                        style={{ color: 'var(--danger)' }}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">{editing ? '✏️ Edit Subscription' : '+ New Subscription'}</div>
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Service Name *</label>
                  <input className="form-input" placeholder="e.g. Netflix, Spotify, Gym..."
                    value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost *</label>
                  <input type="number" className="form-input" placeholder="e.g. 499" min={0}
                    value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Cycle</label>
                  <select className="form-select" value={form.billingCycle}
                    onChange={e => setForm({ ...form, billingCycle: e.target.value })}>
                    {BILLING_CYCLES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Next Renewal Date *</label>
                  <input type="date" className="form-input" value={form.nextRenewalDate}
                    onChange={e => setForm({ ...form, nextRenewalDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group full">
                  <label className="form-label">Cancellation URL</label>
                  <input className="form-input" placeholder="https://..." type="url"
                    value={form.cancellationUrl} onChange={e => setForm({ ...form, cancellationUrl: e.target.value })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" placeholder="Any extra details..."
                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave}
                  disabled={saving || !form.serviceName || !form.cost || !form.nextRenewalDate}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Subscription'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteId && (
          <div className="modal-overlay" onClick={() => setDeleteId(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
              <div className="modal-title">🗑️ Delete Subscription?</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                This action cannot be undone. The subscription will be permanently removed.
              </p>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteId)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <MobileNav />
    </div>
  );
}
