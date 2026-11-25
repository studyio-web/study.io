import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SHOTS = [
  { id: 'hero-timer', width: 390, height: 844 },
  { id: 'blocked-app', width: 390, height: 844 },
  { id: 'strict-mode', width: 390, height: 844 },
  { id: 'reels-blocker', width: 390, height: 844 },
  { id: 'timer-modes', width: 390, height: 844 },
  { id: 'ranks-leaderboard', width: 390, height: 844 },
  { id: 'study-rooms', width: 390, height: 844 },
  { id: 'themes-sounds', width: 390, height: 844 },
  { id: 'desktop-sync', width: 1280, height: 800 },
];

const OUT_DIR = path.resolve(process.cwd(), 'public/landing-shots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching browser to capture landing shots...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const url = `http://localhost:3000/dev/shots?shot=${shot.id}`;
    console.log(`Capturing ${shot.id} from ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const targetEl = await page.$('#shot-container');
    const pngBuffer = targetEl ? await targetEl.screenshot() : await page.screenshot();

    // Convert to high-quality 2x WebP using Sharp
    const webpPath = path.join(OUT_DIR, `${shot.id}.webp`);
    await sharp(pngBuffer)
      .webp({ quality: 90, effort: 4 })
      .toFile(webpPath);

    console.log(`Saved ${webpPath} (${fs.statSync(webpPath).size} bytes)`);
    await context.close();
  }

  await browser.close();
  console.log('All shots captured successfully!');
}

run().catch(err => {
  console.error('Error capturing shots:', err);
  process.exit(1);
});
