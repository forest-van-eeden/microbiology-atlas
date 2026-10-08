import { handleConfig } from '../_lib/share.js';

export const onRequestGet = ({ env }) => handleConfig(env);
