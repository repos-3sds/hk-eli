// Drives the Chat screen end to end and saves screenshots in step order to var/walkthrough/.
// Needs all three services running (scripts/start-*.sh). Usage:
//   node scripts/walkthrough.mjs            (Playwright must be resolvable; set PW_CHROME to a Chrome binary if needed)
// Steps 8 and 9 stop the skills service on purpose (SKILLS_STOP and SKILLS_START are shell commands).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PW_MODULE ?? import.meta.url);
const { chromium } = require('playwright');
const WEB = process.env.WEB_URL ?? 'http://localhost:4200';
const OUT = new URL('../var/walkthrough/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const results = [];

async function shot(name, locator) {
  const path = `${OUT}${name}.png`;
  if (locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(150);
  }
  await (locator ?? page).screenshot({ path });
  results.push(path);
}

async function ask(question, { loadingShot } = {}) {
  const cards = page.locator('eli-answer-card');
  const before = await cards.count();
  const errorsBefore = await page.locator('.error, [role="alert"]').count();
  await page.locator('#chat-ask').fill(question);
  await page.keyboard.press('Enter');
  if (loadingShot) {
    await page.waitForTimeout(60);
    await shot(loadingShot);
  }
  await page.waitForFunction(
    ([n, e]) => document.querySelectorAll('eli-answer-card').length > n || document.querySelectorAll('.error, [role="alert"]').length > e,
    [before, errorsBefore],
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
  return cards.count().then((n) => (n > before ? cards.last() : null));
}

await page.goto(`${WEB}/chat`, { waitUntil: 'networkidle' });
await shot('01-chat-empty');
// Close the first-time banner, then give the widget room so a whole answer card fits on screen.
const close = page.locator('button[aria-label^="Hide the guide"]').first();
if (await close.isVisible().catch(() => false)) await close.click();
await page.setViewportSize({ width: 1360, height: 2600 });

let card = await ask('Top concentrations against limit', { loadingShot: '02-asking' });
await card.scrollIntoViewIfNeeded();
await shot('03-concentration-answer', card);
await card.locator('.evidence summary').click();
await page.waitForTimeout(250);
await shot('04-concentration-evidence', card);
await card.locator('.evidence summary').click();

card = await ask('Maturities and rollovers across the book');
await shot('05-book-maturities', card);

card = await ask('Digibank journey this month');
await shot('06-digibank-journey', card);

card = await ask('Who matures this week?');
await shot('07-local-client-answer', card);

if (process.env.SKILLS_STOP) {
  execSync(process.env.SKILLS_STOP, { stdio: 'inherit' });
  await page.waitForTimeout(800);
  card = await ask('Top concentrations against limit');
  await shot('08-service-down-fallback', card);
  await ask('Maturities and rollovers across the book');
  await page.waitForTimeout(300);
  await shot('09-service-down-error');
  if (process.env.SKILLS_START) execSync(process.env.SKILLS_START, { stdio: 'inherit' });
}

await browser.close();
console.log(results.join('\n'));
