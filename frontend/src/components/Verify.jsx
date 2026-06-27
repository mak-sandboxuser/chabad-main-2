import React, { useEffect, useState, useRef } from 'react';
import { AlertCircle, Church } from 'lucide-react';
import { apiUrl } from '../config/api';

export default function Verify({ onVerifySuccess, onGoBack, onVerifyUnauthorized }) {
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);
  const verifyAttempted = useRef(false);

  useEffect(() => {
    // Avoid double verification in React 18 strict mode
    if (verifyAttempted.current) return;
    verifyAttempted.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('No verification token found. Please request a new magic link.');
      setVerifying(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(apiUrl('/api/auth/verify'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.error === 'unauthorized_member' || response.status === 403) {
            window.history.replaceState({}, document.title, window.location.pathname);
            if (onVerifyUnauthorized) {
              onVerifyUnauthorized();
            } else {
              setError('Access Denied: This email is not registered in Salesforce.');
              setVerifying(false);
            }
            return;
          }
          throw new Error(data.error || 'Verification failed. The link may have expired.');
        }

        // Clean the URL token parameter
        window.history.replaceState({}, document.title, window.location.pathname);
        
        onVerifySuccess(data.token, data.user);
      } catch (err) {
        setError(err.message);
        setVerifying(false);
      }
    };

    verifyToken();
  }, [onVerifySuccess, onVerifyUnauthorized]);

  return (
    <div className="verify-container">
      <div className="bg-glow"></div>
      <div className="bg-glow-2"></div>

      <div className="login-card glass-panel" style={{ textAlign: 'center' }}>
        <div className="logo-header">
          <div className="logo-icon">
            <Church size={30} />
          </div>
          <h1>Verifying Link</h1>
        </div>

        {verifying ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
            <div className="spinner"></div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Confirming your security token, please wait...
            </p>
          </div>
        ) : (
          <div style={{ padding: '10px 0' }}>
            <div style={{
              background: 'var(--color-danger-light)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              padding: '16px',
              borderRadius: '10px',
              fontSize: '14px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={32} />
              <span>{error}</span>
            </div>
            
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onGoBack}>
              Return to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
