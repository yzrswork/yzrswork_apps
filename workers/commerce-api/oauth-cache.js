import { CommerceError, jsonRequest, retryAfter } from './http.js';

export const TOKEN_URL = 'https://api.amazon.co.jp/auth/o2/token';

export async function authKey(env) {
  if (env.CREDENTIAL_VERSION !== '3.3' || !env.TOKEN_ROTATION_EPOCH ||
      !env.AMAZON_CLIENT_ID || !env.AMAZON_CLIENT_SECRET) throw new CommerceError('credential-configuration');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.AMAZON_CLIENT_ID));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `oauth:3.3:api.amazon.co.jp:${env.TOKEN_ROTATION_EPOCH}:${fingerprint}`;
}

// Isolate-local single-flight supplements private KV; neither is a global lock.
export function createTokenCache({ fetcher, clock = Date.now, timeoutMS }) {
  const flights = new Map();
  return async function token(env, ignoredGeneration = null) {
    const key = await authKey(env);
    const flightKey = `${key}:${ignoredGeneration || ''}`;
    if (flights.has(flightKey)) return flights.get(flightKey);
    const pending = (async () => {
      let cached, cooldown;
      try {
        [cached, cooldown] = await Promise.all([
          env.COMMERCE_AUTH.get(key, 'json'), env.COMMERCE_AUTH.get(`${key}:cooldown`, 'json'),
        ]);
      } catch { throw new CommerceError('auth-cache-read'); }
      const now = clock();
      if (cached?.generation !== ignoredGeneration && typeof cached?.accessToken === 'string' &&
          cached.accessToken.length > 0 && !/\s/.test(cached.accessToken) && typeof cached.generation === 'string' &&
          Number.isFinite(cached.acquiredAt) && cached.acquiredAt <= now && cached.expiresAt > now &&
          cached.expiresAt <= cached.acquiredAt + 86_400_000) return cached;
      if (cooldown?.notBefore > now) throw new CommerceError('token-cooldown', cooldown.notBefore);
      const started = clock();
      const { response, body } = await jsonRequest(fetcher, TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.AMAZON_CLIENT_ID,
          client_secret: env.AMAZON_CLIENT_SECRET, scope: 'creatorsapi::default' }),
      }, timeoutMS);
      if (response.status === 429) {
        const notBefore = retryAfter(response.headers.get('Retry-After'), clock()) || clock() + 300_000;
        try { await env.COMMERCE_AUTH.put(`${key}:cooldown`, JSON.stringify({ notBefore }), { expiration: Math.ceil(notBefore / 1000) }); }
        catch { throw new CommerceError('auth-cache-write'); }
        throw new CommerceError('token-throttled', notBefore);
      }
      if (!response.ok) throw new CommerceError('oauth-failed');
      if (typeof body?.access_token !== 'string' || !body.access_token || /\s/.test(body.access_token) ||
          body.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(body.expires_in) ||
          body.expires_in < 120 || body.expires_in > 86_400) throw new CommerceError('invalid-token');
      const value = { accessToken: body.access_token, generation: crypto.randomUUID(), acquiredAt: started,
        expiresAt: started + body.expires_in * 1000 - 60_000 };
      if (value.expiresAt <= clock() + 60_000) throw new CommerceError('invalid-token');
      try { await env.COMMERCE_AUTH.put(key, JSON.stringify(value), { expiration: Math.floor(value.expiresAt / 1000) }); }
      catch { throw new CommerceError('auth-cache-write'); }
      return value;
    })();
    flights.set(flightKey, pending);
    try { return await pending; } finally { flights.delete(flightKey); }
  };
}
