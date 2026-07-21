import React, { useState, useEffect } from 'react';
// import { useAuth, useClerk, useSignUp } from '@clerk/clerk-react';
// import { useSignInSignal } from '@clerk/clerk-react/experimental';
import { Mail, ArrowRight, ShieldAlert, Shield, CheckCircle, HelpCircle, Moon, Sun, Lock, Headphones, KeyRound } from 'lucide-react';
import BuildingSketch from './shared/BuildingSketch';
import ChabadLogo from './shared/ChabadLogo';
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
  /* ==========================================================================
     CLERK AUTH HOOKS (COMMENTED OUT FOR DIRECT SALESFORCE LOGIN)
     ==========================================================================
     const clerk = useClerk();
     const { signIn, fetchStatus } = useSignInSignal();
     const { signUp } = useSignUp();
     const { userId, isSignedIn, signOut } = useAuth();
     const auth = getEffectiveAuthState(clerk, { isSignedIn, userId, isLoaded: true });
     ========================================================================== */

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [sentTo, setSentTo] = useState('');
  const [testCode, setTestCode] = useState('424242');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

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
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      authTrace('LOGIN_SUBMIT_START', { email: cleanEmail });

      // 1. Only Salesforce members may proceed — block everyone else before Clerk
      const response = await fetch(apiUrl('/api/auth/check-member'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json();

      if (!response.ok || data.allowed === false) {
        authTrace('LOGIN_SALESFORCE_DENIED', { email: cleanEmail, message: data.message });
        throw new Error(data.message || UNAUTHORIZED_MSG);
      }

      authTrace('LOGIN_SALESFORCE_OK', { email: cleanEmail, member: data.member?.name });

      // Direct Salesforce Login (Clerk authentication commented out)
      const userSession = {
        email: cleanEmail,
        name: data.member?.name || data.member?.firstName || cleanEmail.split('@')[0],
        memberDetails: data.member,
      };

      localStorage.setItem('sf_user_session', JSON.stringify(userSession));
      showToast({ message: `Welcome back, ${userSession.name}!`, type: 'success' });

      setTimeout(() => {
        window.location.replace('/');
      }, 300);

      /* ==========================================================================
         ORIGINAL CLERK MAGIC LINK SEND LOGIC (COMMENTED OUT AS REQUESTED)
         ==========================================================================
         const clerkEmail = cleanEmail.includes('+clerk_test') ? cleanEmail : cleanEmail.replace('@', '+clerk_test@');
         if (!isSignedIn && !userId && hasOrphanClerkSession(clerk)) {
           await signOut();
         }
         try {
           await sendSignInMagicLink(signIn, clerkEmail, signUp);
         } catch (sendErr) {
           if (isAlreadySignedInError(sendErr)) {
             await signOut();
             await sendSignInMagicLink(signIn, clerkEmail, signUp);
           } else {
             throw sendErr;
           }
         }
         setSentTo(cleanEmail);
         showToast({ message: 'Sign-in link sent! Enter test code 424242 to complete login.', type: 'success' });
         ========================================================================== */
    } catch (err) {
      authTrace('LOGIN_FAIL', { email, error: getClerkErrorMessage(err) || err.message });
      const clerkMessage = getClerkErrorMessage(err);
      const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
      setError(
        clerkMessage
        || (isNetworkError ? 'Unable to reach the server. Please ensure the backend is running on port 5001.' : null)
        || err.message
        || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  /* ==========================================================================
     ORIGINAL CLERK TEST OTP VERIFICATION HANDLER (COMMENTED OUT AS REQUESTED)
     ==========================================================================
  const handleTestOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!sentTo || verifyingOtp) return;
    setVerifyingOtp(true);
    setError('');

    try {
      const cleanEmail = sentTo.trim().toLowerCase();
      const clerkEmail = cleanEmail.includes('+clerk_test') ? cleanEmail : cleanEmail.replace('@', '+clerk_test@');
      let completedSessionId = null;

      const clientSignIn = clerk.client?.signIn;
      const clientSignUp = clerk.client?.signUp;

      try {
        let signInResource = clientSignIn;
        if (!signInResource || !signInResource.identifier) {
          signInResource = await clientSignIn.create({ identifier: clerkEmail });
        }

        const factor = signInResource.supportedFirstFactors?.find(
          (f) => f.strategy === 'email_code' || f.strategy === 'email_link'
        );

        if (factor && factor.emailAddressId) {
          await signInResource.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: factor.emailAddressId,
          });
        }

        const res = await signInResource.attemptFirstFactor({
          strategy: 'email_code',
          code: testCode,
        });

        if (res.status === 'complete') {
          completedSessionId = res.createdSessionId;
        }
      } catch (err1) {
        try {
          let signUpResource = clientSignUp;
          if (!signUpResource || !signUpResource.emailAddress) {
            signUpResource = await clientSignUp.create({ emailAddress: clerkEmail });
          }
          if (signUpResource.prepareEmailAddressVerification) {
            await signUpResource.prepareEmailAddressVerification({ strategy: 'email_code' });
          }
          const res2 = await signUpResource.attemptEmailAddressVerification({ code: testCode });
          if (res2.status === 'complete') {
            completedSessionId = res2.createdSessionId;
          }
        } catch (err2) {
          throw err1 || err2;
        }
      }

      if (completedSessionId) {
        await clerk.setActive({ session: completedSessionId });
        showToast({ message: 'Welcome to your member portal!', type: 'success' });
        window.location.replace('/');
      } else {
        throw new Error('Test verification failed. Please check the test code (424242).');
      }
    } catch (err) {
      console.error('Test OTP verification error:', err);
      setError(getClerkErrorMessage(err) || err.message);
    } finally {
      setVerifyingOtp(false);
    }
  };
  ========================================================================== */

  return (
    <div className="chabad-login-layout">
      {/* Top Header */}
      <header className="chabad-header">
        <div className="logo-section">
          <ChabadLogo className="chabad-logo chabad-logo--header" alt="Chabad Bedford" />
        </div>

        <div className="header-links">
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
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
                  <ChabadLogo className="chabad-logo chabad-logo--card" alt="Chabad Bedford" />
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
                  {loading ? 'Verifying...' : 'Continue'}
                  <ArrowRight size={18} className="arrow-icon" />
                </button>

                <div className="secure-link-note">
                  <Mail size={16} className="note-icon" />
                  <span>We'll email you a secure sign-in link.</span>
                </div>

                <div className="card-divider-line">
                  <span className="divider-text">Need help?</span>
                </div>

                <a href="mailto:info@chabadbedford.com" className="support-link-btn">
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
                <h2 className="card-title">Sign In Verification</h2>
                <p className="success-message-text">
                  Salesforce account verified for <strong className="highlight-email">{sentTo}</strong>.
                </p>

                {error && (
                  <div className="auth-error-box" style={{ marginTop: '12px', marginBottom: '12px' }}>
                    <ShieldAlert size={16} className="error-icon" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ==========================================================================
                   COMMENTED OUT CLERK OTP FORM (KEPT INTACT AS REQUESTED)
                   ========================================================================== */}
                {/* 
                <form onSubmit={handleTestOtpSubmit} style={{ marginTop: '16px', textAlign: 'left' }}>
                  <div className="input-field-group">
                    <label className="input-field-label">Test Verification Code (Clerk Test Mode)</label>
                    <div className="input-field-container">
                      <KeyRound size={20} className="input-field-icon" />
                      <input
                        type="text"
                        className="input-field-element"
                        placeholder="Enter 424242"
                        value={testCode}
                        onChange={(e) => setTestCode(e.target.value)}
                        required
                        disabled={verifyingOtp}
                      />
                    </div>
                  </div>

                  <button type="submit" className="submit-continue-btn" disabled={verifyingOtp} style={{ width: '100%', marginTop: '12px' }}>
                    {verifyingOtp ? 'Verifying...' : 'Sign In Now (424242)'}
                    <ArrowRight size={18} className="arrow-icon" />
                  </button>
                </form>
                */}

                <button className="dash-btn-outline" style={{ width: '100%', marginTop: '16px' }} onClick={() => setSentTo('')}>
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="chabad-footer">
        <p className="copyright-text">
          © {new Date().getFullYear()} Chabad Bedford. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
