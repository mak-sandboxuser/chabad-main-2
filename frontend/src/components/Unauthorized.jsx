import React from 'react';
import { ShieldAlert, Church, ArrowRight } from 'lucide-react';

export default function Unauthorized({ onGoBack }) {
  return (
    <div className="verify-container">
      <div className="bg-glow"></div>
      <div className="bg-glow-2"></div>

      <div className="login-card glass-panel" style={{ textAlign: 'center', padding: '40px 30px' }}>
        <div className="logo-header" style={{ marginBottom: '24px' }}>
          <div className="logo-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
            <ShieldAlert size={32} />
          </div>
          <h1 style={{ color: 'var(--text-primary)', marginTop: '16px', fontSize: '24px', fontWeight: '700' }}>
            Access Denied
          </h1>
          <p style={{ color: 'var(--color-danger)', fontWeight: '500', fontSize: '14px', marginTop: '8px' }}>
            Unauthorized Member Email
          </p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          padding: '20px',
          borderRadius: '12px',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
          marginBottom: '28px',
          textAlign: 'left'
        }}>
          <p style={{ margin: '0 0 12px 0' }}>
            Your email was authenticated successfully, but we could not find an active membership record associated with this email in <strong>Salesforce</strong>.
          </p>
          <p style={{ margin: 0 }}>
            If you believe this is an error, please contact the church administration office to verify your registered email address.
          </p>
        </div>
        
        <button 
          className="btn btn-secondary" 
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} 
          onClick={onGoBack}
        >
          Return to Sign In <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
