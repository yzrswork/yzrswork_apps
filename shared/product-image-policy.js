// Creators images.primary.medium metadata only (longest side 160px).
// Japan license 4(n) permits image links for up to 24h; never cache image bytes.
export const MAX_IMAGE_AGE_MS = 86_400_000;
const IMAGE_HOSTS = new Set(['m.media-amazon.com']);

export function safeProductImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value) || value.includes('#')) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && IMAGE_HOSTS.has(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash &&
      /^\/images\/.+/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function validProductImage(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isFinite(now)) return null;
  const url = safeProductImageUrl(value.url);
  if (!url || !Number.isInteger(value.width) || value.width <= 0 || value.width > 160 ||
      !Number.isInteger(value.height) || value.height <= 0 || value.height > 160 ||
      !Number.isFinite(value.fetchedAt) || value.fetchedAt > now ||
      !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt <= value.fetchedAt ||
      value.expiresAt > value.fetchedAt + MAX_IMAGE_AGE_MS) return null;
  return { url, width: value.width, height: value.height, fetchedAt: value.fetchedAt, expiresAt: value.expiresAt };
}
