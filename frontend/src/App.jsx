import React, { useState, useEffect } from 'react';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { authTrace, authTraceClerkState } from './utils/authTrace';
import { getEffectiveAuthState, tryRestoreOrClearSession } from './utils/clerkMagicLink';
import Login from './components/Login';
import Portal from './components/Portal';
import EmailLinkVerifier, { shouldRunEmailLinkVerifier } from './components/EmailLinkVerifier';

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
  const [token, setToken] = useState(null);

  const activeUserId = userId || resolvedUserId || clerk.user?.id;
  const user = hookUser || clerk.user;

  useEffect(() => {
    let cancelled = false;

    const loadToken = async () => {
      if (!activeUserId) {
        setToken(null);
        return;
      }
      try {
        const t = await getToken?.().catch(() => null)
          || await clerk.session?.getToken?.();
        if (!cancelled) setToken(t);
      } catch (e) {
        console.error('Failed to get Clerk token:', e);
        if (!cancelled) setToken(null);
      }
    };

    loadToken();
    return () => {
      cancelled = true;
    };
  }, [activeUserId, getToken, clerk]);

  if (!activeUserId || !user || !token) {
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
      token={token}
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

  if (shouldRunEmailLinkVerifier()) {
    return <EmailLinkVerifier />;
  }

  if (!isLoaded || restoringSession) {
    return <LoadingScreen message="Loading authentication state..." />;
  }

  if (auth.authenticated) {
    return (
      <AuthenticatedPortal
        onLogout={signOut}
        resolvedUserId={auth.effectiveUserId}
      />
    );
  }

  return <Login />;
}
