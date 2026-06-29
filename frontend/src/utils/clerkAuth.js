export async function getFreshClerkToken(getToken, clerk) {
  if (typeof getToken === 'function') {
    const fresh = await getToken({ skipCache: true }).catch(() => null);
    if (fresh) return fresh;
    const cached = await getToken().catch(() => null);
    if (cached) return cached;
  }

  if (typeof clerk?.session?.getToken === 'function') {
    const fresh = await clerk.session.getToken({ skipCache: true }).catch(() => null);
    if (fresh) return fresh;
    return clerk.session.getToken().catch(() => null);
  }

  return null;
}
