import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { authTrace, authTraceClerkState } from './utils/authTrace';
import { getEffectiveAuthState, tryRestoreOrClearSession } from './utils/clerkMagicLink';
import { getFreshClerkToken } from './utils/clerkAuth';
import { showToast } from './utils/toast';
import Login from './components/Login';
import Portal from './components/Portal';
import EmailLinkVerifier, { shouldRunEmailLinkVerifier } from './components/EmailLinkVerifier';
import ToastHost from './components/shared/ToastHost';

const LOGIN_SUCCESS_FLAG = 'show_login_success';
const TOKEN_KEEPALIVE_MS = 30_000;

function LoadingScreen({ message }) {
  return (
    <div className="verify-container">
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}

function AuthenticatedPortal({ onLogout, resolvedUserId }) {
  const clerk = useClerk();
  const { userId, getToken } = useAuth();
  const { user: hookUser } = useUser();
  const [authReady, setAuthReady] = useState(false);
  const getTokenRef = useRef(getToken);
  const clerkRef = useRef(clerk);

  getTokenRef.current = getToken;
  clerkRef.current = clerk;

  const activeUserId = userId || resolvedUserId || clerk.user?.id;
  const user = hookUser || clerk.user;

  const getAuthToken = useCallback(
    () => getFreshClerkToken(getTokenRef.current, clerkRef.current),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const ensureSession = async () => {
      if (!activeUserId) {
        if (!cancelled) setAuthReady(false);
        return;
      }

      const token = await getAuthToken();
      if (cancelled) return;

      setAuthReady(Boolean(token));
      if (token && sessionStorage.getItem(LOGIN_SUCCESS_FLAG)) {
        sessionStorage.removeItem(LOGIN_SUCCESS_FLAG);
        showToast({ message: 'Welcome! You are signed in successfully.', type: 'success' });
      }
    };

    ensureSession();
    const keepAlive = setInterval(ensureSession, TOKEN_KEEPALIVE_MS);

    return () => {
      cancelled = true;
      clearInterval(keepAlive);
    };
  }, [activeUserId, getAuthToken]);

  if (!activeUserId || !user || !authReady) {
    return <LoadingScreen message="Loading your portal..." />;
  }

  return (
    <Portal
      user={{
        id: activeUserId,
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName || user.primaryEmailAddress?.emailAddress?.split('@')[0],
        role: 'Member',
      }}
      getAuthToken={getAuthToken}
      onLogout={onLogout}
    />
  );
}

export default function App() {
  const clerk = useClerk();
  const { signOut, isLoaded, userId, isSignedIn } = useAuth();
  const [restoringSession, setRestoringSession] = useState(false);
  const auth = getEffectiveAuthState(clerk, { isSignedIn, userId, isLoaded });

  useEffect(() => {
    if (!isLoaded) return;

    const route =
      shouldRunEmailLinkVerifier() ? 'verify'
      : auth.authenticated ? 'dashboard'
      : restoringSession ? 'restoring_session'
      : 'login';

    authTrace('APP_ROUTE', {
      route,
      isSignedIn,
      userId: userId || null,
      clerkUserId: auth.clerkUserId,
      effectiveUserId: auth.effectiveUserId,
      restoringSession,
    });
    authTraceClerkState(clerk, 'APP_CLERK_STATE');
  }, [isLoaded, isSignedIn, userId, restoringSession, clerk, auth.authenticated, auth.clerkUserId, auth.effectiveUserId]);

  useEffect(() => {
    if (shouldRunEmailLinkVerifier()) return;
    if (!isLoaded || isSignedIn || userId || clerk.user?.id) return;

    const sessionId = clerk.session?.id || clerk.client?.lastActiveSessionId;
    if (!sessionId) return;

    let cancelled = false;
    setRestoringSession(true);
    authTrace('APP_RESTORE_SESSION_START', { sessionId });

    tryRestoreOrClearSession(clerk, signOut)
      .then((result) => {
        if (cancelled) return;
        if (result === 'restored') {
          authTrace('APP_RESTORE_SESSION_OK', { sessionId });
        } else if (result === 'cleared') {
          authTrace('APP_STALE_SESSION_CLEARED', { sessionId });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        authTrace('APP_RESTORE_SESSION_FAIL', { sessionId, error: err.message });
        console.error('Failed to restore Clerk session:', err);
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clerk, isLoaded, isSignedIn, userId, signOut]);

  const handleLogout = () => {
    sessionStorage.removeItem(LOGIN_SUCCESS_FLAG);
    signOut();
  };

  if (shouldRunEmailLinkVerifier()) {
    return (
      <>
        <ToastHost />
        <EmailLinkVerifier />
      </>
    );
  }

  if (!isLoaded || restoringSession) {
    return (
      <>
        <ToastHost />
        <LoadingScreen message="Loading authentication state..." />
      </>
    );
  }

  if (auth.authenticated) {
    return (
      <>
        <ToastHost />
        <AuthenticatedPortal
          onLogout={handleLogout}
          resolvedUserId={auth.effectiveUserId}
        />
      </>
    );
  }

  return (
    <>
      <ToastHost />
      <Login />
    </>
  );
}
