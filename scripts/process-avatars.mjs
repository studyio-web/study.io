import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PREMIUM_IDS = [
  'arcane-scholar',
  'astral-monk',
  'cyber-librarian',
  'alchemist',
  'dragon-sage',
  'moon-oracle',
  'phoenix-archivist',
  'crystal-mage',
  'clockwork-inventor',
  'void-walker',
  'samurai-scholar',
  'celestial-cartographer',
];

const ALIASES = {
  'arcane': 'arcane-scholar',
  'scholar': 'arcane-scholar',
  'astral': 'astral-monk',
  'monk': 'astral-monk',
  'cyber': 'cyber-librarian',
  'librarian': 'cyber-librarian',
  'alchemist': 'alchemist',
  'dragon': 'dragon-sage',
  'sage': 'dragon-sage',
  'moon': 'moon-oracle',
  'oracle': 'moon-oracle',
  'phoenix': 'phoenix-archivist',
  'archivist': 'phoenix-archivist',
  'crystal': 'crystal-mage',
  'mage': 'crystal-mage',
  'clockwork': 'clockwork-inventor',
  'inventor': 'clockwork-inventor',
  'void': 'void-walker',
  'walker': 'void-walker',
  'samurai': 'samurai-scholar',
  'celestial': 'celestial-cartographer',
  'cartographer': 'celestial-cartographer',
};

function matchTargetId(filename, index) {
  const clean = path.parse(filename).name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  // Exact ID match
  if (PREMIUM_IDS.includes(clean)) return clean;

  // Numbered prefix (e.g., 01, 1, 2... 12)
  const numMatch = clean.match(/^0?([1-9]|1[0-2])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < PREMIUM_IDS.length) return PREMIUM_IDS[idx];
  }

  // Alias lookup
  for (const [key, target] of Object.entries(ALIASES)) {
    if (clean.includes(key)) return target;
  }

  // Fallback by directory index if in range
  if (index >= 0 && index < PREMIUM_IDS.length) {
    return PREMIUM_IDS[index];
  }

  return clean;
}

async function processImage(inputPath, targetId, outputDir) {
  const outWebp = path.join(outputDir, `${targetId}.webp`);
  const outPng = path.join(outputDir, `${targetId}.png`);

  // Sharp: 1:1 center crop, resize to 256x256, export WebP & PNG
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  const minDim = Math.min(metadata.width || 256, metadata.height || 256);

  await image
    .extract({
      left: Math.round(((metadata.width || minDim) - minDim) / 2),
      top: Math.round(((metadata.height || minDim) - minDim) / 2),
      width: minDim,
      height: minDim,
    })
    .resize(256, 256, { fit: 'cover', position: 'center' })
    .webp({ quality: 85, effort: 6 })
    .toFile(outWebp);

  // Also write PNG for seamless in-place update if existing code references .png
  await sharp(outWebp)
    .png({ quality: 90 })
    .toFile(outPng);

  const stats = fs.statSync(outWebp);
  console.log(`  [OK] Processed ${path.basename(inputPath)} -> ${targetId}.webp (${(stats.size / 1024).toFixed(2)} KB)`);
}

async function main() {
  const args = process.argv.slice(2);
  const inputDir = args[0] || path.join(rootDir, 'scripts', 'incoming-premium');
  const outputDir = path.join(rootDir, 'public', 'images', 'avatars', 'premium');

  console.log('=== Premium Collectible Avatar Processing Pipeline ===');
  console.log(`Input directory : ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);

  if (!fs.existsSync(inputDir)) {
    console.log(`\nInput directory "${inputDir}" does not exist yet.`);
    console.log(`Usage: node scripts/process-avatars.mjs <path-to-folder-of-generated-images>`);
    console.log(`Expected 12 images matching the IDs in scripts/premium-avatar-prompts.md.`);
    return;
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.log(`No images found in "${inputDir}". Please place your generated images there and rerun.`);
    return;
  }

  console.log(`Found ${files.length} image(s). Processing to 256x256 WebP...`);
  fs.mkdirSync(outputDir, { recursive: true });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fullPath = path.join(inputDir, file);
    const targetId = matchTargetId(file, i);
    await processImage(fullPath, targetId, outputDir);
  }

  console.log('\nProcessing complete!');
}

main().catch(err => {
  console.error('Processing failed:', err);
  process.exit(1);
});
