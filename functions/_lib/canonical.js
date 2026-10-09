export const CANONICAL_HOST = 'microbiologyatlas.com';
const REDIRECT_HOSTS = ['www.microbiologyatlas.com', 'microbiology-atlas.pages.dev'];

/** Returns a 301 Response for hosts that should move to the canonical domain, or null. */
export function canonicalRedirect(request, env = {}) {
  const canonical = env.CANONICAL_HOST || CANONICAL_HOST;
  const url = new URL(request.url);
  if (!REDIRECT_HOSTS.includes(url.hostname)) return null;
  // Only redirect page loads; API calls keep working on any host so an open tab never breaks mid-share.
  if (url.pathname.startsWith('/api/')) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  url.protocol = 'https:';
  url.hostname = canonical;
  url.port = '';
  url.hash = '';
  return new Response(null, { status: 301, headers: { location: url.toString(), 'cache-control': 'public, max-age=3600' } });
}
