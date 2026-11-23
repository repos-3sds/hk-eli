#!/usr/bin/env node
// Builds the <hk-eli-chatbot> web component from the same sources as the standalone app.
//
//   npm run build:element            -> dist/web-component/hk-eli-chatbot.js (+ host page, licences, manifest)
//
// 1. ng build --configuration element  (entry src/elements/main.ts; the standalone build is untouched)
// 2. Split the global CSS: widget styles go into the shadow root (:root/html/body -> :host); @font-face and
//    @property go to the host document, with the Open Sans files inlined.
// 3. esbuild re-bundles Angular's ES modules and lazy chunks into one self-running script (IIFE), with the
//    CSS baked in. One file, no other requests, no globals besides the custom element itself.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { splitForShadow } from './web-component-css.mjs';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(webDir, 'dist/element-raw/browser');
const outDir = join(webDir, 'dist/web-component');
const bundleName = 'hk-eli-chatbot.js';
const skipNg = process.argv.includes('--skip-ng');

const pkg = JSON.parse(readFileSync(join(webDir, 'package.json'), 'utf8'));
const commit = gitCommit();
const version = commit ? `${pkg.version}+${commit}` : pkg.version;

if (!skipNg) {
  rmSync(join(webDir, 'dist/element-raw'), { recursive: true, force: true });
  const ng = join(webDir, 'node_modules/.bin', process.platform === 'win32' ? 'ng.cmd' : 'ng');
  execFileSync(ng, ['build', '--configuration', 'element'], { cwd: webDir, stdio: 'inherit', shell: process.platform === 'win32' });
}
for (const f of ['main.js', 'styles.css']) {
  if (!existsSync(join(rawDir, f))) throw new Error(`Missing ${f} in ${rawDir}. Did the Angular build fail?`);
}

const css = splitForShadow(readFileSync(join(rawDir, 'styles.css'), 'utf8'), { cssDir: rawDir });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: [join(rawDir, 'main.js')],
  outfile: join(outDir, bundleName),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
  banner: { js: `/*! <hk-eli-chatbot> ${version} · HK ELI Chatbot web component · *Will be part of Ask-MIRA in future · licences: 3rdpartylicenses.txt */` },
  define: {
    __HK_ELI_SHADOW_CSS__: JSON.stringify(css.shadowCss),
    __HK_ELI_DOCUMENT_CSS__: JSON.stringify(css.documentCss),
    __HK_ELI_VERSION__: JSON.stringify(version),
  },
});

const outputs = Object.keys(result.metafile.outputs);
if (outputs.length !== 1) throw new Error(`Expected one output file, got ${outputs.length}: ${outputs.join(', ')}`);
const js = readFileSync(join(outDir, bundleName));
if (/\bimport\s*\(/.test(js.toString())) throw new Error('The bundle still has a dynamic import(); it would request other files.');

for (const f of ['3rdpartylicenses.txt']) {
  const from = join(webDir, 'dist/element-raw', f);
  if (existsSync(from)) copyFileSync(from, join(outDir, f));
}
copyFileSync(join(webDir, 'element-host/index.html'), join(outDir, 'index.html'));

const sha256 = createHash('sha256').update(js).digest('hex');
writeFileSync(join(outDir, `${bundleName}.sha256`), `${sha256}  ${bundleName}\n`);
const manifest = {
  name: 'hk-eli-chatbot',
  tag: 'hk-eli-chatbot',
  version,
  commit,
  builtAt: new Date().toISOString(),
  file: bundleName,
  bytes: js.length,
  gzipBytes: gzipSync(js).length,
  sha256,
  fontsInlined: css.inlined,
  fontSubsetsDropped: css.dropped,
  attributes: ['api-base-url', 'config-url', 'role', 'user-name', 'time-zone', 'as-of-date', 'request-timeout-ms', 'start-tab'],
  properties: ['accessTokenProvider'],
  events: ['hk-eli-ready', 'hk-eli-error'],
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`\n<hk-eli-chatbot> ${version}`);
console.log(`  ${join('dist/web-component', bundleName)}  ${kb(statSync(join(outDir, bundleName)).size)} (gzip ${kb(manifest.gzipBytes)})`);
console.log(`  fonts inlined: ${css.inlined.join(', ') || 'none'}; dropped: ${css.dropped.join(', ') || 'none'}`);
console.log(`  sha256 ${sha256}`);

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: webDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}
