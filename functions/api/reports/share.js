import { handleShare } from '../../_lib/share.js';

export const onRequestPost = ({ request, env }) => handleShare(request, env);
