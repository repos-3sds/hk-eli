// CSS rewrite for the <hk-eli-chatbot> web component. Kept separate from the build script so it can be tested
// (node --test scripts/).
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import postcss from 'postcss';

/** Font subsets inlined into the bundle. Others fall back to the next font in --eli-font-sans. */
export const DEFAULT_FONT_SUBSETS = ['latin', 'latin-ext'];

const TYPE_ROOT = /(^|[\s,>+~(])(html|body)(?=$|[\s.:#[,>+~)])/g;

/** :root, html and body don't exist inside a shadow root; there the widget's element is :host. */
export function toHostSelector(selector) {
  return selector.replace(/:root\b/g, ':host').replace(TYPE_ROOT, '$1:host');
}

/**
 * Splits the app's global stylesheet in two:
 * - shadowCss: everything that styles the widget, with :root/html/body rewritten to :host;
 * - documentCss: rules browsers only honour at document level (@font-face, @property), fonts inlined as data URIs.
 */
export function splitForShadow(css, { cssDir, fontSubsets = DEFAULT_FONT_SUBSETS, readFile = readFileSync } = {}) {
  const root = postcss.parse(css);
  const documentRoot = postcss.root();
  const dropped = [];
  const inlined = [];

  root.walkAtRules((rule) => {
    if (rule.name === 'property') {
      documentRoot.append(rule.clone());
      rule.remove();
      return;
    }
    if (rule.name !== 'font-face') return;
    let src = '';
    rule.walkDecls('src', (d) => (src = d.value));
    const url = /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1];
    const subset = url ? /open-sans-(.+)-wght-normal\.woff2$/.exec(basename(url))?.[1] : null;
    if (url && subset && !fontSubsets.includes(subset)) {
      dropped.push(subset);
      rule.remove();
      return;
    }
    const face = rule.clone();
    if (url && !url.startsWith('data:') && cssDir) {
      const data = readFile(resolve(cssDir, url)).toString('base64');
      face.walkDecls('src', (d) => {
        d.value = d.value.replace(/url\(["']?[^"')]+["']?\)/, `url(data:font/woff2;base64,${data})`);
      });
      inlined.push(subset ?? basename(url));
    }
    documentRoot.append(face);
    rule.remove();
  });

  root.walkRules((rule) => {
    // Keyframe steps (from, to, 50%) are not selectors to rewrite.
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    rule.selectors = [...new Set(rule.selectors.map(toHostSelector))];
  });

  return { shadowCss: root.toString(), documentCss: documentRoot.toString(), inlined, dropped };
}
