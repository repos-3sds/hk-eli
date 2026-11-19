// Screenshots of the chat flow in step order, for review. Needs playwright-core and a Chromium:
//   npm i playwright-core   (anywhere; run with NODE_PATH pointing at its node_modules)
//   PW_CHROME=/path/to/chrome ELI_URL=http://127.0.0.1:8040 OUT=./shots node chatbot/scripts/walkthrough.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const URL = process.env.ELI_URL || 'http://127.0.0.1:8040';
const OUT = process.env.OUT || 'shots';
const PROVIDER = process.env.ELI_PROVIDER || 'gemini';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
let n = 0;
const shot = async (name) => { n += 1; const f = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); console.log(f); };
const waitAnswer = async () => {
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('.card');
    const last = cards[cards.length - 1];
    return last && !last.hasAttribute('aria-busy');
  }, null, { timeout: 180000 });
  await page.waitForTimeout(300);
};

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#suggestions .chip');
await page.selectOption('#provider', PROVIDER);
await shot('empty-state-wms');

// 1. Specialist: who to call, click a suggestion, watch tools and streaming.
await page.click('#suggestions .chip >> nth=0');
await page.waitForSelector('.step');
await page.waitForTimeout(400);
await shot('tools-running');
await page.waitForSelector('.answer--streaming', { timeout: 60000 }).catch(() => {});
await shot('streaming');
await waitAnswer();
await page.evaluate(() => { const l = document.getElementById('log'); l.scrollTop = l.scrollHeight; });
await shot('answer-with-check-and-followups');

// 2. Open the data used.
await page.click('details.sources >> nth=-1');
await page.evaluate(() => { const l = document.getElementById('log'); l.scrollTop = l.scrollHeight; });
await shot('data-used-expanded');

// 3. Follow-up chip keeps the conversation.
await page.click('.followups .chip >> nth=0');
await waitAnswer();
await page.evaluate(() => { const l = document.getElementById('log'); l.scrollTop = l.scrollHeight; });
await shot('follow-up-answer');

// 4. Product manager persona, typed question with the keyboard.
await page.click('#new-chat');
await page.selectOption('#persona', 'pm');
await shot('empty-state-pm');
await page.fill('#question', 'How concentrated is the book against our limits?');
await page.keyboard.press('Enter');
await waitAnswer();
await page.evaluate(() => { const l = document.getElementById('log'); l.scrollTop = l.scrollHeight; });
await shot('pm-concentration');

// 5. Out of scope and unknown client.
await page.click('#new-chat');
await page.fill('#question', 'Give me a brief on Ms Nobody Fake');
await page.keyboard.press('Enter');
await waitAnswer();
await shot('unknown-client');

// 6. Error state: model unavailable (no-model menu entry disabled is shown in the status bar instead).
await page.click('#new-chat');
await page.selectOption('#provider', 'offline');
await page.fill('#question', 'Which deals are close to their knock-out barrier?');
await page.keyboard.press('Enter');
await waitAnswer();
await shot('code-answer-offline');

// 7. Phone width.
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#new-chat');
await page.selectOption('#provider', PROVIDER);
await page.selectOption('#persona', 'tsm');
await page.click('#suggestions .chip >> nth=0');
await waitAnswer();
await shot('phone-tsm-sales');

await browser.close();
