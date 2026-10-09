// Send visitors on www. and the default pages.dev address to the one canonical
// domain, with a permanent redirect that keeps the path and query.
// Preview deployments (<hash>.microbiology-atlas.pages.dev) are left alone.
import { canonicalRedirect } from './_lib/canonical.js';

export const onRequest = async ({ request, next, env }) => canonicalRedirect(request, env) || next();
