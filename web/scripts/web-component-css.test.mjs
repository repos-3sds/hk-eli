import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitForShadow, toHostSelector } from './web-component-css.mjs';

test('root, html and body become :host', () => {
  assert.equal(toHostSelector(':root'), ':host');
  assert.equal(toHostSelector('html'), ':host');
  assert.equal(toHostSelector('body'), ':host');
  assert.equal(toHostSelector('html .eli-link'), ':host .eli-link');
  assert.equal(toHostSelector('.htmlish'), '.htmlish');
  assert.equal(toHostSelector('.body-text'), '.body-text');
  assert.equal(toHostSelector('button'), 'button');
});

test('duplicate selectors after the rewrite are merged', () => {
  const { shadowCss } = splitForShadow('html,body{margin:0}');
  assert.equal(shadowCss, ':host{margin:0}');
});

test('keyframe steps are left alone', () => {
  const { shadowCss } = splitForShadow('@keyframes spin{to{transform:rotate(360deg)}}');
  assert.match(shadowCss, /to\{transform/);
});

test('font faces move to the document; wanted subsets are inlined, others dropped', () => {
  const css =
    '@font-face{font-family:X;src:url("./media/open-sans-latin-wght-normal.woff2") format("woff2")}' +
    '@font-face{font-family:X;src:url("./media/open-sans-greek-wght-normal.woff2") format("woff2")}' +
    '@property --tw-x{syntax:"*";inherits:false}' +
    '.a{color:red}';
  const { shadowCss, documentCss, inlined, dropped } = splitForShadow(css, {
    cssDir: '/dist',
    readFile: () => Buffer.from('font'),
  });
  assert.equal(shadowCss, '.a{color:red}');
  assert.match(documentCss, /url\(data:font\/woff2;base64,Zm9udA==\)/);
  assert.match(documentCss, /@property --tw-x/);
  assert.doesNotMatch(documentCss, /greek/);
  assert.deepEqual(inlined, ['latin']);
  assert.deepEqual(dropped, ['greek']);
});
