'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';

// ... (keep interface & helper functions the same - targeting the import and the return)

interface Order {
  _id: string;
  orderId?: string;
  itemName: string;
  productId?: string;
  marketplace: string;
  purchaseDate: string;
  deliveryDate?: string;
  returnWindowDays: number | null;
  returnDeadline?: string;
  returnable?: boolean;
  replaceable?: boolean;
  returnPolicyDetails?: string;
  status: 'Pending' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Returned' | 'Kept';
  notes?: string;
}

const MARKETPLACES = ['Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Snapdeal', 'Other'];
const STATUSES = ['Pending', 'Shipped', 'Out for delivery', 'Delivered', 'Returned', 'Kept'];

const statusEmoji: Record<string, string> = {
  Pending: '⏳', Shipped: '🚛', 'Out for delivery': '🛵', Delivered: '📬', Returned: '↩️', Kept: '✅',
};

const marketplaceEmoji: Record<string, string> = {
  Amazon: '📦', Flipkart: '🛍️', Myntra: '👗', Meesho: '🏷️',
  Ajio: '👟', Nykaa: '💄', Snapdeal: '🛒', Other: '🏪',
};

function getDaysLeft(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
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
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Today!';
  return `${days}d left`;
}

const emptyForm = {
  itemName: '', marketplace: 'Amazon', purchaseDate: '', deliveryDate: '',
  returnWindowDays: 7, status: 'Pending', notes: '',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function fetchOrders() {
    const res = await fetch('/api/orders');
    const data = await res.json();
    setOrders(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, purchaseDate: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  }

  function openEdit(order: Order) {
    setEditing(order);
    setForm({
      itemName: order.itemName,
      marketplace: order.marketplace,
      purchaseDate: toInputDate(order.purchaseDate),
      deliveryDate: toInputDate(order.deliveryDate),
      returnWindowDays: order.returnWindowDays ?? 7,
      status: order.status,
      notes: order.notes || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = { ...form, returnWindowDays: Number(form.returnWindowDays) };
    if (!payload.deliveryDate) delete (payload as any).deliveryDate;

    if (editing) {
      await fetch(`/api/orders/${editing._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowModal(false);
    fetchOrders();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    fetchOrders();
  }

  const filtered = orders.filter(o => {
    const matchSearch = o.itemName.toLowerCase().includes(search.toLowerCase()) ||
      o.marketplace.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'All' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">📦 Orders</h1>
            <p className="page-subtitle">Track return & replacement windows for your orders</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd} id="add-order-btn">+ Add Order</button>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input" placeholder="Search orders..." value={search}
              onChange={e => setSearch(e.target.value)}
            />
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
            <div className="empty-state-title">No orders found</div>
            <div className="empty-state-text">Add your first order to start tracking return deadlines.</div>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Order</button>
          </div>
        ) : (
          <div className="item-list">
            {filtered.map(order => {
              const daysLeft = order.returnDeadline ? getDaysLeft(order.returnDeadline) : null;
              return (
                <div className="item-card" key={order._id} style={{ cursor: 'default' }}>
                  <div className="item-logo">{marketplaceEmoji[order.marketplace] || '🏪'}</div>
                  <div className="item-info">
                    <div className="item-name">{order.itemName}</div>
                    <div className="item-meta">
                      {order.orderId && `<code style="font-size: 10px; background: var(--bg-secondary); padding: 2px 4px; border-radius: 4px; margin-right: 8px;">${order.orderId}</code>`}
                      {order.marketplace} · Purchased {formatDate(order.purchaseDate)}
                      {order.deliveryDate && ` · Delivered ${formatDate(order.deliveryDate)}`}
                    </div>
                    {order.returnPolicyDetails && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                        {order.returnPolicyDetails.length > 80 ? order.returnPolicyDetails.substring(0, 80) + '...' : order.returnPolicyDetails}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      {order.returnDeadline ? (
                        <>
                          <div className="item-date">{order.replaceable && !order.returnable ? 'Replace' : 'Return'} by {formatDate(order.returnDeadline)}</div>
                          <span className={`item-days ${getDaysClass(daysLeft!)}`}>{getDaysLabel(daysLeft!)}</span>
                        </>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {order.returnWindowDays === null ? 'Non-returnable' : `Return window: ${order.returnWindowDays}d`}
                        </div>
                      )}
                    </div>
                    <span className={`badge badge-${order.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {statusEmoji[order.status]} {order.status}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" onClick={() => openEdit(order)} title="Edit">✏️</button>
                      <button className="btn-icon" onClick={() => setDeleteId(order._id)} title="Delete"
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
              <div className="modal-title">{editing ? '✏️ Edit Order' : '+ New Order'}</div>
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Item Name *</label>
                  <input className="form-input" placeholder="e.g. Wireless Headphones"
                    value={form.itemName} onChange={e => setForm({ ...form, itemName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Marketplace *</label>
                  <select className="form-select" value={form.marketplace}
                    onChange={e => setForm({ ...form, marketplace: e.target.value })}>
                    {MARKETPLACES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Date *</label>
                  <input type="date" className="form-input" value={form.purchaseDate}
                    onChange={e => setForm({ ...form, purchaseDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Date</label>
                  <input type="date" className="form-input" value={form.deliveryDate}
                    onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Return Window (days) *</label>
                  <input type="number" className="form-input" min={1} max={365}
                    value={form.returnWindowDays}
                    onChange={e => setForm({ ...form, returnWindowDays: Number(e.target.value) })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" placeholder="Any extra details..."
                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.itemName || !form.purchaseDate}>
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Order'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteId && (
          <div className="modal-overlay" onClick={() => setDeleteId(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
              <div className="modal-title">🗑️ Delete Order?</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                This action cannot be undone. The order will be permanently removed.
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
