'use client';
import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    console.log('SignIn status:', status, session);
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="app-shell" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="page-subtitle">Loading...</p>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'radial-gradient(circle at top right, #1e1b4b, #09090b)',
      minHeight: '100vh'
    }}>
      <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📌</div>
        <h1 className="page-title" style={{ fontSize: '32px', marginBottom: '12px' }}>TrackIt</h1>
        <p className="page-subtitle" style={{ marginBottom: '32px' }}>
          Never miss a return deadline again. <br/>
          Sign in to manage your orders and subscriptions.
        </p>

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '14px', fontSize: '16px' }}
          onClick={() => signIn('google')}
        >
          Sign in with Google
        </button>

        <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
