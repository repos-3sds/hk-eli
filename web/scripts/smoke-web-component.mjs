#!/usr/bin/env node
// Quick check of the built bundle, without a browser: it loads in a DOM, registers <hk-eli-chatbot> once
// (also when loaded twice), defines no other globals, and shows a clear message when misconfigured.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const file = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist/web-component/hk-eli-chatbot.js');
const code = readFileSync(file, 'utf8');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const before = new Set(Object.keys(window));
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};

window.eval(code);
window.eval(code); // a host that includes the script twice must not throw
const Ctor = window.customElements.get('hk-eli-chatbot');
if (!Ctor) fail('<hk-eli-chatbot> is not defined');
const added = Object.keys(window).filter((k) => !before.has(k));
if (added.length) fail(`bundle added globals: ${added.join(', ')}`);

const errors = [];
window.console.error = () => {};
window.document.addEventListener('hk-eli-error', (e) => errors.push(e.detail.message));
const el = window.document.createElement('hk-eli-chatbot');
el.setAttribute('role', 'rm');
window.document.body.appendChild(el);
await new Promise((r) => setTimeout(r, 50));
const text = el.shadowRoot?.textContent ?? '';
if (!/could not start: role must be wms, pm or tsm/.test(text)) fail(`expected a start-up message, got "${text}"`);
if (errors.length !== 1) fail(`expected one hk-eli-error event, got ${errors.length}`);
if (!window.document.getElementById('hk-eli-chatbot-fonts')) fail('fonts were not registered on the document');

console.log(`OK <hk-eli-chatbot> ${Ctor.version}: defines once, no globals, start-up errors are shown`);
window.close();
