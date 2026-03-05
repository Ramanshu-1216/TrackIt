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
  productUrl?: string; // Added productUrl
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
  orderId: '', productId: '', productUrl: '',
  returnable: false, replaceable: false, returnPolicyDetails: '',
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
      orderId: order.orderId || '',
      productId: order.productId || '',
      productUrl: order.productUrl || '',
      returnable: order.returnable || false,
      replaceable: order.replaceable || false,
      returnPolicyDetails: order.returnPolicyDetails || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = { 
      ...form, 
      returnWindowDays: form.status === 'Kept' ? null : Number(form.returnWindowDays),
      returnable: Boolean(form.returnable),
      replaceable: Boolean(form.replaceable),
    };
    if (!payload.deliveryDate) delete (payload as any).deliveryDate;

    try {
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
    } catch (err) {
      console.error('Failed to save order:', err);
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
                <div className="order-card" key={order._id}>
                  {/* Top Row: Logo, Title, and Actions */}
                  <div className="order-card-header">
                    <div className="item-logo">
                      {marketplaceEmoji[order.marketplace] || '🏪'}
                    </div>
                    
                    <div className="order-card-info">
                      <div className="order-card-title">
                        {order.itemName}
                      </div>
                      
                      {/* Metadata Row */}
                      <div className="order-card-meta">
                        <span className="order-card-tag">
                          {order.marketplace}
                        </span>
                        
                        {order.orderId && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="order-card-id-label">ID:</span>
                            <code className="order-card-id-value">
                              {order.orderId}
                            </code>
                          </span>
                        )}

                        {order.productId && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="order-card-id-label">ASIN:</span>
                            <code className="order-card-id-value">
                              {order.productId}
                            </code>
                          </span>
                        )}
                        
                        <span style={{ color: 'var(--border)', fontSize: '14px' }}>•</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                           Purchased {formatDate(order.purchaseDate)}
                        </span>
                      </div>
                    </div>

                    {/* Right Side: Status and Main Actions */}
                    <div className="order-card-actions">
                      <span className={`badge badge-${order.status.toLowerCase().replace(/\s+/g, '-')}`} style={{ padding: '4px 12px' }}>
                        {statusEmoji[order.status]} {order.status}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {order.productUrl && (
                          <a href={order.productUrl} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Open Product Page" style={{ 
                            background: 'var(--bg-glass)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px'
                          }}>🛍️</a>
                        )}
                        <button className="btn-icon" onClick={() => openEdit(order)} title="Edit" style={{ 
                          background: 'var(--bg-glass)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}>✏️</button>
                        <button className="btn-icon" onClick={() => setDeleteId(order._id)} title="Delete" style={{ 
                          background: 'var(--danger-bg)',
                          border: '1px solid rgba(239, 68, 68, 0.1)',
                          color: 'var(--danger)',
                          borderRadius: '8px'
                        }}>🗑️</button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row: Policy Info & Deadline */}
                  <div className="order-card-footer">
                    <div className="order-card-policy">
                      <div className="policy-badges">
                        {order.returnable && (
                          <span className="policy-badge policy-badge-return">Returnable</span>
                        )}
                        {order.replaceable && (
                          <span className="policy-badge policy-badge-replace">Replaceable</span>
                        )}
                      </div>
                      
                      {order.returnPolicyDetails && !order.returnPolicyDetails.toLowerCase().includes('not found') && (
                        <div className="policy-details">
                          {order.returnPolicyDetails}
                        </div>
                      )}
                    </div>

                    <div className="order-card-deadline">
                      {order.returnDeadline && order.status !== 'Kept' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: '4px' }}>
                          <div className="deadline-label">
                            Deadline
                          </div>
                          <div className="deadline-value">
                            {formatDate(order.returnDeadline)}
                          </div>
                          <span className={`item-days ${getDaysClass(daysLeft!)}`} style={{ margin: 0 }}>
                            {getDaysLabel(daysLeft!)}
                          </span>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500 }}>
                          {order.status === 'Kept' ? 'Successfully items kept' : 
                           order.returnWindowDays === null ? 'Non-returnable' : 
                           `Return Window: ${order.returnWindowDays}d`}
                        </div>
                      )}
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
                  <label className="form-label">Order ID</label>
                  <input className="form-input" placeholder="e.g. 408-7715949-8756339"
                    value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Product ID / ASIN</label>
                  <input className="form-input" placeholder="e.g. B0F19GZXB1"
                    value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Product URL</label>
                  <input className="form-input" placeholder="https://www.amazon.in/..."
                    value={form.productUrl} onChange={e => setForm({ ...form, productUrl: e.target.value })} />
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
                <div className="form-group">
                  <label className="form-label">Return Window (days)</label>
                  <input type="number" className="form-input" min={0} max={365}
                    value={form.returnWindowDays || ''}
                    onChange={e => setForm({ ...form, returnWindowDays: Number(e.target.value) })} />
                </div>
                <div className="form-group" style={{ display: 'flex', gap: '16px', alignItems: 'center', paddingTop: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={form.returnable}
                      onChange={e => setForm({ ...form, returnable: e.target.checked })} />
                    Returnable
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="checkbox" checked={form.replaceable}
                      onChange={e => setForm({ ...form, replaceable: e.target.checked })} />
                    Replaceable
                  </label>
                </div>
                <div className="form-group full">
                  <label className="form-label">Return Policy Details</label>
                  <textarea className="form-textarea" placeholder="Paste return policy text here..."
                    style={{ height: '60px' }}
                    value={form.returnPolicyDetails} onChange={e => setForm({ ...form, returnPolicyDetails: e.target.value })} />
                </div>
                <div className="form-group full">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" placeholder="Any extra details..."
                    style={{ height: '40px' }}
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
