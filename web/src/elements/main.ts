/**
 * Entry point of the web component build (npm run build:element). Defines <hk-eli-chatbot>, which renders the
 * same widget as the standalone app into a shadow root. The standalone app (src/main.ts) is unchanged.
 */
import defaults from '../../public/config/app-config.json';
import { defineHkEliChatbot } from './hk-eli-chatbot-element';

defineHkEliChatbot(defaults);
