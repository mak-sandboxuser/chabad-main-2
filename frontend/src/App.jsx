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

  // Direct Salesforce Login Session (Bypassing Clerk)
  const [sfUser, setSfUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sf_user_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const handleSfLogout = () => {
    localStorage.removeItem('sf_user_session');
    setSfUser(null);
    window.location.replace('/');
  };

  useEffect(() => {
    if (!isLoaded) return;

    const route =
      sfUser ? 'sf_dashboard'
      : shouldRunEmailLinkVerifier() ? 'verify'
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
  }, [isLoaded, isSignedIn, userId, restoringSession, clerk, auth.authenticated, auth.clerkUserId, auth.effectiveUserId, sfUser]);

  // If Direct Salesforce Login session exists, bypass Clerk authentication
  if (sfUser) {
    return (
      <>
        <ToastHost />
        <Portal
          user={{
            id: sfUser.email,
            email: sfUser.email,
            name: sfUser.name,
            role: 'Member',
          }}
          getAuthToken={async () => `dev:${sfUser.email}`}
          onLogout={handleSfLogout}
        />
      </>
    );
  }

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
          onLogout={() => {
            sessionStorage.removeItem(LOGIN_SUCCESS_FLAG);
            signOut();
          }}
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
