import { apiUrl } from '../config/api';

export function authTrace(step, details = {}) {
  const payload = {
    step,
    ...details,
    at: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    path: typeof window !== 'undefined' ? window.location.pathname : '',
  };

  console.log('[AUTH]', step, payload);

  if (typeof window === 'undefined') return;

  fetch(apiUrl('/api/auth/trace'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function authTraceClerkState(clerk, label) {
  authTrace(label, {
    clerkSessionId: clerk?.session?.id || null,
    lastActiveSessionId: clerk?.client?.lastActiveSessionId || null,
    clientSessions: clerk?.client?.sessions?.map((s) => s.id) || [],
    signInStatus: clerk?.client?.signIn?.status || null,
  });
}
