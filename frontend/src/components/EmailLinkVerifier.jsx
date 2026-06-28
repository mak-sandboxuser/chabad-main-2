import { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useSignInSignal } from '@clerk/clerk-react/experimental';
import { authTrace } from '../utils/authTrace';
import {
  completeEmailLinkVerification,
  getClerkErrorMessage,
  readEmailLinkCallbackParams,
} from '../utils/clerkMagicLink';

export default function EmailLinkVerifier() {
  const clerk = useClerk();
  const { isLoaded: authLoaded } = useAuth();
  const { signIn, fetchStatus } = useSignInSignal();
  const [message, setMessage] = useState('Completing sign-in...');
  const [error, setError] = useState('');
  const runningRef = useRef(false);

  useEffect(() => {
    if (!authLoaded || !clerk.loaded || fetchStatus === 'fetching' || runningRef.current) return;

    const { status, createdSessionId } = readEmailLinkCallbackParams();
    runningRef.current = true;

    const finish = async () => {
      try {
        authTrace('VERIFY_PAGE_START', { status, createdSessionId });
        setMessage('Opening your portal...');
        await completeEmailLinkVerification({
          clerk,
          signIn,
          status,
          createdSessionId,
        });
        sessionStorage.setItem('show_login_success', '1');
      } catch (err) {
        authTrace('VERIFY_PAGE_FAIL', { error: getClerkErrorMessage(err) });
        console.error('Email link verification failed:', err);
        runningRef.current = false;
        setError(getClerkErrorMessage(err));
      }
    };

    finish();
  }, [authLoaded, clerk, fetchStatus, signIn]);

  if (error) {
    return (
      <div className="verify-container">
        <p style={{ color: 'var(--text-secondary)', maxWidth: 460, textAlign: 'center', lineHeight: 1.6 }}>
          {error}
        </p>
        <button
          type="button"
          className="submit-continue-btn"
          style={{ marginTop: '1.5rem' }}
          onClick={() => window.location.replace(`${window.location.origin}/`)}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="verify-container">
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}

export { shouldRunEmailLinkVerifier } from '../utils/clerkMagicLink';
