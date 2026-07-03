import React, { useState, useEffect } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useSignInSignal } from '@clerk/clerk-react/experimental';
import { Mail, ArrowRight, ShieldAlert, Shield, CheckCircle, HelpCircle, Moon, Sun, Lock, Headphones } from 'lucide-react';

// Geometric circular emblem with Star of David at the center
const ChabadEmblem = ({ className, size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="50" cy="50" r="41" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
    
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const x = 50 + 29 * Math.cos(angle);
      const y = 50 + 29 * Math.sin(angle);
      return (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="8"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      );
    })}

    <path
      d="M50 22 L66 50 L34 50 Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M50 64 L66 36 L34 36 Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="50" cy="46" r="6" stroke="currentColor" strokeWidth="1" fill="none" />
  </svg>
);


import BuildingSketch from './shared/BuildingSketch';
import { apiUrl } from '../config/api';
import { authTrace } from '../utils/authTrace';
import {
  getClerkErrorMessage,
  getEffectiveAuthState,
  hasOrphanClerkSession,
  isAlreadySignedInError,
  sendSignInMagicLink,
} from '../utils/clerkMagicLink';
import { showToast } from '../utils/toast';

export default function Login({ initialError = '' }) {
  const clerk = useClerk();
  const { signIn, fetchStatus } = useSignInSignal();
  const { userId, isSignedIn, signOut } = useAuth();
  const auth = getEffectiveAuthState(clerk, { isSignedIn, userId, isLoaded: true });
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  // Handle theme state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const UNAUTHORIZED_MSG = 'You are not authorised to login to the member portal.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || fetchStatus === 'fetching') return;

    if (auth.authenticated) {
      window.location.replace('/');
      return;
    }

    setLoading(true);
    setError('');

    try {
      authTrace('LOGIN_SUBMIT_START', { email: email.trim().toLowerCase() });

      // 1. Only Salesforce members may proceed — block everyone else before Clerk
      const response = await fetch(apiUrl('/api/auth/check-member'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok || data.allowed === false) {
        authTrace('LOGIN_SALESFORCE_DENIED', { email, message: data.message });
        throw new Error(data.message || UNAUTHORIZED_MSG);
      }

      authTrace('LOGIN_SALESFORCE_OK', { email, member: data.member?.name });

      // Stale client session blocks magic link send — clear before attempting.
      if (!isSignedIn && !userId && hasOrphanClerkSession(clerk)) {
        authTrace('LOGIN_CLEAR_STALE_BEFORE_SEND', {
          sessionId: clerk.session?.id || clerk.client?.lastActiveSessionId,
        });
        await signOut();
      }

      // 2. Member verified in Salesforce — backend also provisions Clerk user, then send magic link
      try {
        await sendSignInMagicLink(signIn, email.trim().toLowerCase());
      } catch (sendErr) {
        if (isAlreadySignedInError(sendErr)) {
          authTrace('LOGIN_ALREADY_SIGNED_IN_RECOVERY');
          if (isSignedIn && userId) {
            window.location.replace('/');
            return;
          }
          await signOut();
          await sendSignInMagicLink(signIn, email.trim().toLowerCase());
        } else {
          throw sendErr;
        }
      }
      setSentTo(email);
      showToast({ message: 'Sign-in link sent! Check your email.', type: 'success' });
      authTrace('LOGIN_MAGIC_LINK_SENT', { email });
    } catch (err) {
      authTrace('LOGIN_FAIL', { email, error: getClerkErrorMessage(err) || err.message });
      const clerkMessage = getClerkErrorMessage(err);
      const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
      setError(
        clerkMessage
        || (isNetworkError ? 'Unable to reach the server. Please ensure the backend is running on port 5000.' : null)
        || err.message
        || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chabad-login-layout">
      {/* Top Header */}
      <header className="chabad-header">
        <div className="logo-section">
          <ChabadEmblem className="logo-emblem" size={32} />
          <div className="logo-text">
            <span className="brand-primary">CHABAD</span>
            <span className="brand-secondary">BEDFORD</span>
          </div>
        </div>
        
        <div className="header-links">
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          
          <div className="help-link">
            <HelpCircle size={18} className="help-icon" />
            <span>Need help?</span>
          </div>
          <span className="divider">|</span>
          <a href="mailto:support@chabadbedford.com" className="contact-link">Contact Support</a>
        </div>
      </header>

      {/* Main Split Body */}
      <main className="chabad-main-content">
        {/* Left Info Panel */}
        <section className="info-panel">
          <div className="info-content">
            <div className="info-top-row">
              <div className="welcome-block">
                <h1 className="welcome-heading">Welcome back</h1>
                <h2 className="membership-heading">to your membership</h2>
                <div className="gold-diamond-divider">
                  <span className="diamond">♦</span>
                </div>
                <p className="intro-text">
                  Access your membership, contributions, household information, and billing—all in one secure place.
                </p>
              </div>

              <BuildingSketch theme={theme} className="building-sketch building-sketch--login" />
            </div>
          </div>
        </section>

        {/* Right Form Card Panel */}
        <section className="form-panel">
          <div className="login-card-wrapper glass-panel">
            {!sentTo ? (
              <form onSubmit={handleSubmit}>
                <div className="card-top-icon">
                  <ChabadEmblem size={64} className="card-emblem" />
                </div>
                
                <h2 className="card-title">Sign in to your account</h2>
                <p className="card-subtitle">
                  We'll send a secure, one-time sign-in link to your email.
                </p>

                {error && (
                  <div className="auth-error-box">
                    <ShieldAlert size={16} className="error-icon" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="input-field-group">
                  <label className="input-field-label">Email address</label>
                  <div className="input-field-container">
                    <Mail size={20} className="input-field-icon" />
                    <input
                      type="email"
                      className="input-field-element"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <button type="submit" className="submit-continue-btn" disabled={loading}>
                  {loading ? 'Sending link...' : 'Continue'}
                  <ArrowRight size={18} className="arrow-icon" />
                </button>

                <div className="secure-link-note">
                  <Mail size={16} className="note-icon" />
                  <span>We'll email you a secure sign-in link.</span>
                </div>

                <div className="card-divider-line">
                  <span className="divider-text">Need help?</span>
                </div>

                <a href="mailto:support@chabadbedford.com" className="support-link-btn">
                  <Headphones size={18} className="phone-icon" />
                  <span>Contact Support</span>
                </a>

                <div className="passwordless-footer-note">
                  <Lock size={14} className="lock-icon" />
                  <span>Secure passwordless login. No password. No worries.</span>
                </div>
                <div id="clerk-captcha" />
              </form>
            ) : (
              <div className="success-body-panel">
                <div className="success-icon-badge">
                  <CheckCircle size={48} />
                </div>
                <h2 className="card-title">Check your email</h2>
                <p className="success-message-text">
                  We have sent a secure magic login link to <strong className="highlight-email">{sentTo}</strong>.<br />
                  Click the link in your email to sign in — any browser is fine.
                </p>
                <p className="success-message-text" style={{ marginTop: '0.75rem', fontSize: '0.92rem' }}>
                  You can close this tab after clicking the link, or keep it open to continue here automatically.
                </p>
                <button className="submit-continue-btn" onClick={() => setSentTo('')}>
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Page Footer */}
      <footer className="chabad-footer">
        <div className="footer-card glass-panel">
          <div className="footer-security">
            <div className="security-badge">
              <Shield size={24} />
            </div>
            <div className="security-text">
              <h4>Your security is our priority.</h4>
              <p>We use encryption and secure authentication to keep your information safe and private.</p>
            </div>
          </div>
          
          <div className="footer-links">
            <a href="#">Privacy Policy</a>
            <span className="footer-divider">|</span>
            <a href="#">Terms of Service</a>
            <span className="footer-divider">|</span>
            <a href="mailto:support@chabadbedford.com">Contact Support</a>
          </div>
        </div>
        
        <p className="copyright-text">
          © {new Date().getFullYear()} Chabad Bedford. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
