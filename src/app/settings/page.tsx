'use client';
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

export default function SettingsPage() {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    fetch('/api/user/settings')
      .then(r => r.json())
      .then(data => {
        setIsPushEnabled(!!data.pushSubscription);
        // If they are on this page, they are already signed in with Google
        setGoogleConnected(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setStatusMsg('✅ Google Account connected!');
  }, []);

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications not supported in this browser.');
      return;
    }

    try {
      let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      console.log('Original VAPID Key from Env:', vapidPublicKey);
      
      if (!vapidPublicKey) {
        throw new Error('VAPID Public Key not found in environment variables. Did you restart the server?');
      }

      // De-quote and trim
      vapidPublicKey = vapidPublicKey.replace(/["']/g, '').trim().replace(/\s/g, '');
      console.log('Cleaned VAPID Key:', vapidPublicKey);

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      console.log('Converted Uint8Array Key:', convertedKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      setIsPushEnabled(true);
      setStatusMsg('✅ Notifications enabled!');
    } catch (err: any) {
      console.error('Push error:', err);
      if (err.name === 'InvalidAccessError') {
        setStatusMsg('❌ Error: Invalid VAPID Public Key. Ensure it is a valid Base64URL string (usually 87 chars).');
      } else {
        setStatusMsg(`❌ Error: ${err.message || 'Failed to enable notifications.'}`);
      }
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    
    try {
      const rawData = window.atob(base64);
      console.log('Decoded rawData length:', rawData.length);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    } catch (e) {
      console.error('atob error:', e);
      throw new Error('The VAPID public key is not a valid base64 string.');
    }
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
              <div className="badge badge-success">Connected via Google Account</div>
            ) : (
              <p style={{ color: '#ef4444' }}>Please sign in with Google to enable automation.</p>
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
