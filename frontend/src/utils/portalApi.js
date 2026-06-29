import { apiUrl } from '../config/api';
import { getFreshClerkToken } from './clerkAuth';

export async function fetchPortalApi(path, {
  getAuthToken,
  method = 'GET',
  body,
  retryOnUnauthorized = true,
} = {}) {
  const resolveToken = typeof getAuthToken === 'function'
    ? getAuthToken
    : () => getFreshClerkToken(null, null);

  let token = await resolveToken();
  if (!token) {
    throw new Error('Session expired. Please log in again.');
  }

  const makeRequest = async (authToken) => fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  let response = await makeRequest(token);

  if (response.status === 401 && retryOnUnauthorized) {
    token = await resolveToken();
    if (token) {
      response = await makeRequest(token);
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}
