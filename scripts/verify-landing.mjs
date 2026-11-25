import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('C:/Users/Lenovo/.gemini/antigravity/brain/d25f5ab0-6e73-4883-acd2-57484a9b35f3/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Testing viewports for horizontal overflow...');
  const viewports = [
    { width: 360, height: 800, name: 'mobile_360' },
    { width: 390, height: 844, name: 'mobile_390' },
    { width: 412, height: 915, name: 'mobile_412' },
    { width: 768, height: 1024, name: 'tablet_768' },
    { width: 1024, height: 768, name: 'desktop_1024' },
    { width: 1440, height: 900, name: 'desktop_1440' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    // Check horizontal scroll
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
    });

    console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): overflow=${hasOverflow}`);

    if (vp.width === 390) {
      await page.screenshot({ path: path.join(outDir, 'landing_mobile_390.png'), fullPage: true });
      console.log('Saved landing_mobile_390.png');
    }
    if (vp.width === 1440) {
      await page.screenshot({ path: path.join(outDir, 'landing_desktop_1440.png'), fullPage: true });
      console.log('Saved landing_desktop_1440.png');
    }
  }

  // Verify Native App UA bypasses landing page
  console.log('Testing Native App user agent behavior...');
  const nativeContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; StudyIoNativeApp) AppleWebKit/537.36',
  });
  const nativePage = await nativeContext.newPage();
  await nativePage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const isIntroPresent = await nativePage.evaluate(() => {
    return Boolean(document.querySelector('button') && document.body.innerText.includes('Sign in'));
  });
  console.log('Native App UA opens IntroductionAndLogin:', isIntroPresent);

  await browser.close();
  console.log('Done verification!');
}

run().catch(console.error);
