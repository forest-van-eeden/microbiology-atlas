import { handleStatus } from '../../_lib/share.js';

export const onRequestGet = ({ request, env }) => handleStatus(request, env);
