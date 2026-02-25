'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function SettingsPage() {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    // Check current settings from API (we need to create a user settings GET route)
    fetch('/api/user/settings')
      .then(r => r.json())
      .then(data => {
        setIsPushEnabled(!!data.pushSubscription);
        setGoogleConnected(!!data.googleTokens);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Check URL params for status updates
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setStatusMsg('✅ Google Account connected!');
    if (params.get('error')) setStatusMsg('❌ Failed to connect Google Account.');
  }, []);

  async function connectGoogle() {
    const res = await fetch('/api/auth/google');
    const { url } = await res.json();
    window.location.href = url;
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications not supported in this browser.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      setIsPushEnabled(true);
      setStatusMsg('✅ Notifications enabled!');
    } catch (err) {
      console.error('Push error:', err);
      setStatusMsg('❌ Failed to enable notifications.');
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">Manage your account connections and notification preferences</p>
        </div>

        {statusMsg && (
          <div className="detect-banner" style={{ marginBottom: '24px' }}>
            <span>{statusMsg}</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: '24px', maxWidth: '600px' }}>
          {/* Gmail Automation */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">📧 Gmail Automation</div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Connect your Google account to automatically scan for order confirmation emails from Amazon, Flipkart, and more.
            </p>
            {googleConnected ? (
              <div className="badge badge-success">Connected to Google</div>
            ) : (
              <button className="btn btn-primary" onClick={connectGoogle} disabled={loading}>
                Connect Google Account
              </button>
            )}
          </div>

          {/* Notifications */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">🔔 Push Notifications</div>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Get alerted on your desktop or mobile when a return window is about to close.
            </p>
            {isPushEnabled ? (
              <div className="badge badge-success">Notifications Active</div>
            ) : (
              <button className="btn btn-primary" onClick={enableNotifications} disabled={loading}>
                Enable Push Notifications
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
