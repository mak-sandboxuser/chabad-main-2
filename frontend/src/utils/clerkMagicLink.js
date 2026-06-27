import { authTrace, authTraceClerkState } from './authTrace';

export const VERIFY_PATH = '/verify';

export function getVerifyUrl() {
  return `${window.location.origin}${VERIFY_PATH}`;
}

export function getClerkErrorMessage(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const clerkErrors = err.errors || err.clerkErrors;
  if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
    return clerkErrors.map((e) => e.longMessage || e.message).filter(Boolean).join(' ');
  }
  return err.message || 'Something went wrong. Please try again.';
}

function throwIfClerkError(result, fallbackMessage) {
  if (result?.error) {
    const err = new Error(result.error.longMessage || result.error.message || fallbackMessage);
    err.errors = [result.error];
    err.code = result.error.code;
    throw err;
  }
}

export function hasOrphanClerkSession(clerk) {
  return Boolean(clerk.session?.id || clerk.client?.lastActiveSessionId);
}

/** Clerk client can have an active user before useAuth() hooks catch up after setActive/reload. */
export function getEffectiveAuthState(clerk, { isSignedIn, userId, isLoaded } = {}) {
  const clerkUserId = clerk?.user?.id || null;
  const clerkSessionId = clerk?.session?.id || null;
  const effectiveUserId = userId || clerkUserId;
  const authenticated = Boolean(
    isLoaded !== false
    && effectiveUserId
    && (clerkSessionId || (isSignedIn && userId)),
  );

  return {
    effectiveUserId,
    clerkUserId,
    clerkSessionId,
    authenticated,
  };
}

export function isAlreadySignedInError(err) {
  const code = err?.code || err?.errors?.[0]?.code;
  if (code === 'session_exists') return true;
  const message = getClerkErrorMessage(err).toLowerCase();
  return message.includes('already signed in');
}

export async function tryRestoreOrClearSession(clerk, signOut) {
  const sessionId = clerk.session?.id || clerk.client?.lastActiveSessionId;
  if (!sessionId) return 'none';

  try {
    await clerk.setActive({ session: sessionId });
    authTrace('SESSION_RESTORE_SET_ACTIVE_OK', { sessionId });

    const started = Date.now();
    while (Date.now() - started < 2000) {
      if (clerk.user?.id) {
        authTrace('SESSION_RESTORE_VALID', { sessionId, userId: clerk.user.id });
        return 'restored';
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch (err) {
    authTrace('SESSION_RESTORE_FAIL', { sessionId, error: err.message });
  }

  authTrace('SESSION_CLEAR_STALE', { sessionId });
  await signOut();
  return 'cleared';
}

export async function sendSignInMagicLink(signIn, email) {
  authTrace('MAGIC_LINK_SEND_START', { email, verifyUrl: getVerifyUrl() });
  const result = await signIn.emailLink.sendLink({
    emailAddress: email.trim().toLowerCase(),
    verificationUrl: getVerifyUrl(),
  });
  throwIfClerkError(result, 'Failed to send magic link.');
  authTrace('MAGIC_LINK_SEND_OK', { email });
}

export function readEmailLinkCallbackParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    isCallback: params.has('__clerk_status') || params.has('__clerk_ticket'),
    status: params.get('__clerk_status'),
    createdSessionId: params.get('__clerk_created_session'),
  };
}

export function shouldRunEmailLinkVerifier() {
  return window.location.pathname === VERIFY_PATH || readEmailLinkCallbackParams().isCallback;
}

async function waitForActiveSession(clerk, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (clerk.session?.id) {
      return clerk.session.id;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Session could not be started. Please request a new magic link.');
}

export async function activateVerifiedEmailLinkSession(clerk, createdSessionId) {
  const sessionId =
    createdSessionId
    || clerk.client?.signIn?.createdSessionId
    || clerk.client?.lastActiveSessionId
    || clerk.client?.sessions?.[0]?.id;

  authTrace('VERIFY_SET_ACTIVE_START', {
    createdSessionId,
    resolvedSessionId: sessionId,
    clerkStatus: readEmailLinkCallbackParams().status,
  });
  authTraceClerkState(clerk, 'VERIFY_BEFORE_SET_ACTIVE');

  if (!sessionId) {
    authTrace('VERIFY_SET_ACTIVE_FAIL', { reason: 'no_session_id' });
    throw new Error('No session found from magic link.');
  }

  await clerk.setActive({ session: sessionId });
  authTrace('VERIFY_SET_ACTIVE_CALLED', { sessionId });

  const activeId = await waitForActiveSession(clerk);
  authTraceClerkState(clerk, 'VERIFY_AFTER_SET_ACTIVE');
  authTrace('VERIFY_SESSION_ACTIVE', { sessionId: activeId });

  await new Promise((resolve) => setTimeout(resolve, 300));

  authTrace('VERIFY_REDIRECT_HOME', { sessionId: activeId });
  window.location.replace(`${window.location.origin}/`);
  return sessionId;
}

export async function finalizeSignInSession(signIn, { onNavigate } = {}) {
  if (signIn.status !== 'complete') {
    throw new Error('Sign-in is not complete yet. Please request a new magic link.');
  }

  const result = await signIn.finalize({
    navigate: ({ session, decorateUrl }) => {
      if (session?.currentTask) {
        throw new Error('Additional account verification is required. Please contact support.');
      }

      const target = decorateUrl('/');
      if (onNavigate) {
        onNavigate(target);
        return;
      }

      window.location.replace(
        target.startsWith('http') ? target : `${window.location.origin}${target}`,
      );
    },
  });

  throwIfClerkError(result, 'Failed to start your session.');
}

export async function waitForEmailLinkAndFinalize(signIn, options) {
  const waitResult = await signIn.emailLink.waitForVerification();
  throwIfClerkError(waitResult, 'Magic link verification failed.');

  const verification = signIn.emailLink.verification;
  if (verification?.status === 'expired') {
    throw new Error('This sign-in link has expired. Please request a new one.');
  }
  if (verification?.status === 'failed') {
    throw new Error('This sign-in link is invalid. Please request a new one.');
  }
  if (verification?.status === 'client_mismatch') {
    throw new Error('Open the magic link in the same browser where you entered your email.');
  }

  await finalizeSignInSession(signIn, options);
}

export async function completeEmailLinkVerification({
  clerk,
  signIn,
  status,
  createdSessionId,
}) {
  authTrace('VERIFY_FLOW_START', { status, createdSessionId });

  if (status === 'expired') {
    authTrace('VERIFY_FLOW_FAIL', { reason: 'expired' });
    throw new Error('This sign-in link has expired. Please request a new one.');
  }
  if (status === 'failed') {
    authTrace('VERIFY_FLOW_FAIL', { reason: 'failed' });
    throw new Error('This sign-in link is invalid. Please request a new one.');
  }

  if (status === 'verified' && createdSessionId) {
    authTrace('VERIFY_FLOW_PATH', { path: 'direct_set_active' });
    return activateVerifiedEmailLinkSession(clerk, createdSessionId);
  }

  authTrace('VERIFY_FLOW_SKIP', {
    reason: 'no_verified_session_in_url',
    status,
    createdSessionId,
  });
  throw new Error('Invalid magic link. Please request a new sign-in link.');
}
