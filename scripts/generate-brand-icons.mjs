import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const svgBrandCircle = `<svg width="512" height="512" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="31.5" fill="#0D1117" stroke="#1E293B" stroke-width="1.5"/>
  <path d="M32 20C27 16 19 16.5 16 18V44C19 42.5 27 42 32 46C37 42 45 42.5 48 44V18C45 16.5 37 16 32 20Z" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="32" y1="20" x2="32" y2="46" stroke="#10B981" stroke-width="3.8" stroke-linecap="round"/>
  <circle cx="32" cy="13.5" r="3.8" fill="#10B981"/>
</svg>`;

const svgBrandSquircle = `<svg width="512" height="512" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#0D1117" stroke="#1E293B" stroke-width="1.5"/>
  <path d="M32 20C27 16 19 16.5 16 18V44C19 42.5 27 42 32 46C37 42 45 42.5 48 44V18C45 16.5 37 16 32 20Z" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="32" y1="20" x2="32" y2="46" stroke="#10B981" stroke-width="3.8" stroke-linecap="round"/>
  <circle cx="32" cy="13.5" r="3.8" fill="#10B981"/>
</svg>`;

async function run() {
  console.log('Generating brand icons...');

  // 1. Write public/favicon.svg (Circular dark badge with pure white pages & emerald center)
  fs.writeFileSync('public/favicon.svg', svgBrandCircle, 'utf-8');
  console.log('Written public/favicon.svg');

  // 2. Generate high-res PNGs from SVG in pure RGBA format
  // public/icon-512.png (512x512)
  await sharp(Buffer.from(svgBrandCircle))
    .resize(512, 512)
    .png({ palette: false })
    .toFile('public/icon-512.png');
  console.log('Generated public/icon-512.png');

  // public/logo.png (512x512 squircle for general branding, Razorpay, social cards)
  await sharp(Buffer.from(svgBrandSquircle))
    .resize(512, 512)
    .png({ palette: false })
    .toFile('public/logo.png');
  console.log('Generated public/logo.png');

  // public/icon-192.png (192x192 circular)
  await sharp(Buffer.from(svgBrandCircle))
    .resize(192, 192)
    .png({ palette: false })
    .toFile('public/icon-192.png');
  console.log('Generated public/icon-192.png');

  // public/apple-touch-icon.png (180x180 squircle)
  await sharp(Buffer.from(svgBrandSquircle))
    .resize(180, 180)
    .png({ palette: false })
    .toFile('public/apple-touch-icon.png');
  console.log('Generated public/apple-touch-icon.png');

  // 3. Generate 48x48 PNG for favicon.ico conversion
  await sharp(Buffer.from(svgBrandCircle))
    .resize(48, 48)
    .png()
    .toFile('public/favicon-48.png');

  // 4. Use python script to generate multi-size favicon.ico
  execSync('python -c "from PIL import Image; im = Image.open(\'public/favicon-48.png\'); im.save(\'public/favicon.ico\', format=\'ICO\', sizes=[(16, 16), (32, 32), (48, 48)]); im.save(\'src/app/favicon.ico\', format=\'ICO\', sizes=[(16, 16), (32, 32), (48, 48)])"');
  console.log('Generated public/favicon.ico and src/app/favicon.ico');

  // Cleanup temporary file
  if (fs.existsSync('public/favicon-48.png')) {
    fs.unlinkSync('public/favicon-48.png');
  }

  console.log('All brand icons generated successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
