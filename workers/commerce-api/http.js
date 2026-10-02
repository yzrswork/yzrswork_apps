export class CommerceError extends Error {
  constructor(code, retryAt = null) { super(code); this.code = code; this.retryAt = retryAt; }
}

export function retryAfter(value, now) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : null;
  const parsed = seconds === null ? Date.parse(value) : now + seconds * 1000;
  return Number.isFinite(parsed) && parsed > now ? Math.min(parsed, now + 86_400_000) : null;
}

export async function jsonRequest(fetcher, url, init, timeoutMS = 12_000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' });
        let body;
        try { body = await response.json(); } catch { throw new CommerceError('malformed-response'); }
        return { response, body };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CommerceError('timeout')); }, timeoutMS); }),
    ]);
  } catch (error) {
    throw error instanceof CommerceError ? error : new CommerceError('network-failure');
  } finally { clearTimeout(timer); }
}
