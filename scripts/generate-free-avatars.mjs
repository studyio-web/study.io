import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatar } from '@dicebear/core';
import { lorelei } from '@dicebear/collection';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 12 Scholars & Archivists: Calmer, warmer palettes & intellectual, contemplative expressions
const SCHOLARS = [
  {
    id: 'sage1',
    name: 'Sage I',
    seed: 'ScholarSage1_Elysia',
    options: {
      head: ['variant01'],
      hair: ['variant14'],
      hairColor: ['2c1810'],
      skinColor: ['f8d9bd'],
      eyes: ['variant13'],
      eyebrows: ['variant03'],
      mouth: ['happy02'],
      glasses: ['variant02'],
      glassesProbability: 100,
      glassesColor: ['d97706'],
      earringsProbability: 0,
    },
    bg: { top: '#281c12', mid: '#1a120c', glow: '#f59e0b', glowOpacity: 0.35 },
  },
  {
    id: 'cipher',
    name: 'Cipher',
    seed: 'ScholarCipher_Torin',
    options: {
      head: ['variant02'],
      hair: ['variant28'],
      hairColor: ['1c1917'],
      skinColor: ['ae6a45'],
      eyes: ['variant19'],
      eyebrows: ['variant08'],
      mouth: ['happy06'],
      glassesProbability: 0,
      earrings: ['variant01'],
      earringsProbability: 100,
      earringsColor: ['f59e0b'],
    },
    bg: { top: '#2d1810', mid: '#1a0e0a', glow: '#ea580c', glowOpacity: 0.32 },
  },
  {
    id: 'aura',
    name: 'Aura',
    seed: 'ScholarAura_Selene',
    options: {
      head: ['variant03'],
      hair: ['variant41'],
      hairColor: ['e5e5e5'],
      skinColor: ['ffd8b3'],
      eyes: ['variant05'],
      eyebrows: ['variant05'],
      mouth: ['happy11'],
      glasses: ['variant05'],
      glassesProbability: 100,
      glassesColor: ['cbd5e1'],
      earringsProbability: 0,
    },
    bg: { top: '#261b2e', mid: '#18111e', glow: '#c084fc', glowOpacity: 0.30 },
  },
  {
    id: 'raven',
    name: 'Raven',
    seed: 'ScholarRaven_Corvus',
    options: {
      head: ['variant04'],
      hair: ['variant33'],
      hairColor: ['0f172a'],
      skinColor: ['d49d79'],
      eyes: ['variant07'],
      eyebrows: ['variant12'],
      mouth: ['happy13'],
      glasses: ['variant01'],
      glassesProbability: 100,
      glassesColor: ['94a3b8'],
      beardProbability: 0,
    },
    bg: { top: '#1c1b26', mid: '#121118', glow: '#818cf8', glowOpacity: 0.32 },
  },
  {
    id: 'atlas',
    name: 'Atlas',
    seed: 'ScholarAtlas_Orion',
    options: {
      head: ['variant01'],
      hair: ['variant09'],
      hairColor: ['451a03'],
      skinColor: ['fcd5b8'],
      eyes: ['variant16'],
      eyebrows: ['variant01'],
      mouth: ['happy03'],
      glasses: ['variant03'],
      glassesProbability: 100,
      glassesColor: ['b45309'],
      frecklesProbability: 0,
    },
    bg: { top: '#2e1c0d', mid: '#1c1108', glow: '#d97706', glowOpacity: 0.35 },
  },
  {
    id: 'zenith',
    name: 'Zenith',
    seed: 'ScholarZenith_Astraea',
    options: {
      head: ['variant02'],
      hair: ['variant46'],
      hairColor: ['78350f'],
      skinColor: ['ffeedb'],
      eyes: ['variant22'],
      eyebrows: ['variant04'],
      mouth: ['happy08'],
      hairAccessories: ['flowers'],
      hairAccessoriesProbability: 100,
      hairAccessoriesColor: ['fbbf24'],
      glassesProbability: 0,
    },
    bg: { top: '#2b2312', mid: '#1b160a', glow: '#eab308', glowOpacity: 0.34 },
  },
  {
    id: 'orion',
    name: 'Orion',
    seed: 'ScholarOrion_Cassian',
    options: {
      head: ['variant03'],
      hair: ['variant22'],
      hairColor: ['292524'],
      skinColor: ['8c5332'],
      eyes: ['variant10'],
      eyebrows: ['variant09'],
      mouth: ['happy05'],
      beard: ['variant01'],
      beardProbability: 100,
      glassesProbability: 0,
    },
    bg: { top: '#281912', mid: '#180f0a', glow: '#f97316', glowOpacity: 0.32 },
  },
  {
    id: 'lyra',
    name: 'Lyra',
    seed: 'ScholarLyra_Melodia',
    options: {
      head: ['variant04'],
      hair: ['variant17'],
      hairColor: ['92400e'],
      skinColor: ['fde0cb'],
      eyes: ['variant15'],
      eyebrows: ['variant06'],
      mouth: ['happy10'],
      earrings: ['variant03'],
      earringsProbability: 100,
      earringsColor: ['fbbf24'],
      glassesProbability: 0,
    },
    bg: { top: '#2a1a24', mid: '#1a1017', glow: '#f43f5e', glowOpacity: 0.32 },
  },
  {
    id: 'kaelen',
    name: 'Kaelen',
    seed: 'ScholarKaelen_Theodore',
    options: {
      head: ['variant01'],
      hair: ['variant05'],
      hairColor: ['3f2e21'],
      skinColor: ['f5cba7'],
      eyes: ['variant03'],
      eyebrows: ['variant02'],
      mouth: ['happy01'],
      glasses: ['variant04'],
      glassesProbability: 100,
      glassesColor: ['78716c'],
    },
    bg: { top: '#231e17', mid: '#16130e', glow: '#a8a29e', glowOpacity: 0.30 },
  },
  {
    id: 'nova',
    name: 'Nova',
    seed: 'ScholarNova_Hesper',
    options: {
      head: ['variant02'],
      hair: ['variant38'],
      hairColor: ['1e1b4b'],
      skinColor: ['6b3e26'],
      eyes: ['variant20'],
      eyebrows: ['variant07'],
      mouth: ['happy17'],
      earrings: ['variant02'],
      earringsProbability: 100,
      earringsColor: ['fde047'],
      glassesProbability: 0,
    },
    bg: { top: '#24172a', mid: '#160e1a', glow: '#e879f9', glowOpacity: 0.30 },
  },
  {
    id: 'vesper',
    name: 'Vesper',
    seed: 'ScholarVesper_Mireille',
    options: {
      head: ['variant03'],
      hair: ['variant25'],
      hairColor: ['713f12'],
      skinColor: ['ffdcc2'],
      eyes: ['variant01'],
      eyebrows: ['variant10'],
      mouth: ['happy07'],
      glasses: ['variant02'],
      glassesProbability: 100,
      glassesColor: ['d97706'],
    },
    bg: { top: '#291d16', mid: '#19120d', glow: '#fb923c', glowOpacity: 0.33 },
  },
  {
    id: 'rowan',
    name: 'Rowan',
    seed: 'ScholarRowan_Alasdair',
    options: {
      head: ['variant04'],
      hair: ['variant30'],
      hairColor: ['44403c'],
      skinColor: ['e8b896'],
      eyes: ['variant08'],
      eyebrows: ['variant11'],
      mouth: ['happy12'],
      freckles: ['variant01'],
      frecklesProbability: 100,
      glassesProbability: 0,
    },
    bg: { top: '#272016', mid: '#18130d', glow: '#f59e0b', glowOpacity: 0.32 },
  },
];

// 12 Adventurers & Strategists: Cooler, bolder palettes & decisive, confident, dynamic expressions
const ADVENTURERS = [
  {
    id: 'alchemist',
    name: 'Alchemist',
    seed: 'AdvAlchemist_Valen',
    options: {
      head: ['variant01'],
      hair: ['variant08'],
      hairColor: ['064e3b'],
      skinColor: ['f5d0b5'],
      eyes: ['variant18'],
      eyebrows: ['variant07'],
      mouth: ['happy09'],
      earrings: ['variant01'],
      earringsProbability: 100,
      earringsColor: ['34d399'],
      glassesProbability: 0,
    },
    bg: { top: '#0e261e', mid: '#091813', glow: '#10b981', glowOpacity: 0.36 },
  },
  {
    id: 'novelist',
    name: 'Novelist',
    seed: 'AdvNovelist_Sora',
    options: {
      head: ['variant02'],
      hair: ['variant44'],
      hairColor: ['1e293b'],
      skinColor: ['ffeedd'],
      eyes: ['variant14'],
      eyebrows: ['variant04'],
      mouth: ['happy04'],
      glasses: ['variant05'],
      glassesProbability: 100,
      glassesColor: ['38bdf8'],
    },
    bg: { top: '#0f2430', mid: '#09171f', glow: '#38bdf8', glowOpacity: 0.35 },
  },
  {
    id: 'tactician',
    name: 'Tactician',
    seed: 'AdvTactician_Ren',
    options: {
      head: ['variant03'],
      hair: ['variant20'],
      hairColor: ['0f172a'],
      skinColor: ['deb896'],
      eyes: ['variant21'],
      eyebrows: ['variant13'],
      mouth: ['happy06'],
      earringsProbability: 0,
      glassesProbability: 0,
    },
    bg: { top: '#131e34', mid: '#0b1321', glow: '#60a5fa', glowOpacity: 0.34 },
  },
  {
    id: 'oracle',
    name: 'Oracle',
    seed: 'AdvOracle_Morrigan',
    options: {
      head: ['variant04'],
      hair: ['variant35'],
      hairColor: ['4c1d95'],
      skinColor: ['fed7aa'],
      eyes: ['variant11'],
      eyebrows: ['variant03'],
      mouth: ['happy15'],
      earrings: ['variant03'],
      earringsProbability: 100,
      earringsColor: ['a78bfa'],
      glassesProbability: 0,
    },
    bg: { top: '#1f1636', mid: '#140e23', glow: '#a855f7', glowOpacity: 0.36 },
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    seed: 'AdvVanguard_Garrick',
    options: {
      head: ['variant01'],
      hair: ['variant11'],
      hairColor: ['18181b'],
      skinColor: ['a66947'],
      eyes: ['variant24'],
      eyebrows: ['variant09'],
      mouth: ['happy05'],
      beard: ['variant02'],
      beardProbability: 100,
      glassesProbability: 0,
    },
    bg: { top: '#2c1518', mid: '#1c0d0f', glow: '#f43f5e', glowOpacity: 0.34 },
  },
  {
    id: 'chronos',
    name: 'Chronos',
    seed: 'AdvChronos_Zephyr',
    options: {
      head: ['variant02'],
      hair: ['variant02'],
      hairColor: ['0284c7'],
      skinColor: ['ffe4ce'],
      eyes: ['variant09'],
      eyebrows: ['variant02'],
      mouth: ['happy14'],
      glasses: ['variant01'],
      glassesProbability: 100,
      glassesColor: ['06b6d4'],
    },
    bg: { top: '#0e2632', mid: '#091820', glow: '#06b6d4', glowOpacity: 0.36 },
  },
  {
    id: 'shinobi',
    name: 'Shinobi',
    seed: 'AdvShinobi_Hayate',
    options: {
      head: ['variant03'],
      hair: ['variant29'],
      hairColor: ['09090b'],
      skinColor: ['e0ab76'],
      eyes: ['variant06'],
      eyebrows: ['variant12'],
      mouth: ['happy03'],
      glassesProbability: 0,
      earringsProbability: 0,
    },
    bg: { top: '#181d24', mid: '#0f1217', glow: '#22d3ee', glowOpacity: 0.32 },
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    seed: 'AdvSorcerer_Ignis',
    options: {
      head: ['variant04'],
      hair: ['variant39'],
      hairColor: ['991b1b'],
      skinColor: ['f8d7be'],
      eyes: ['variant17'],
      eyebrows: ['variant08'],
      mouth: ['happy16'],
      earrings: ['variant02'],
      earringsProbability: 100,
      earringsColor: ['fb7185'],
      glassesProbability: 0,
    },
    bg: { top: '#301318', mid: '#1e0c0f', glow: '#ef4444', glowOpacity: 0.38 },
  },
  {
    id: 'paladin',
    name: 'Paladin',
    seed: 'AdvPaladin_Leona',
    options: {
      head: ['variant01'],
      hair: ['variant48'],
      hairColor: ['d97706'],
      skinColor: ['fff1e0'],
      eyes: ['variant02'],
      eyebrows: ['variant05'],
      mouth: ['happy18'],
      glassesProbability: 0,
      earrings: ['variant01'],
      earringsProbability: 100,
      earringsColor: ['fbbf24'],
    },
    bg: { top: '#2c2211', mid: '#1b150a', glow: '#f59e0b', glowOpacity: 0.36 },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    seed: 'AdvRanger_Sylas',
    options: {
      head: ['variant02'],
      hair: ['variant24'],
      hairColor: ['14532d'],
      skinColor: ['c68652'],
      eyes: ['variant23'],
      eyebrows: ['variant10'],
      mouth: ['happy08'],
      freckles: ['variant01'],
      frecklesProbability: 100,
      glassesProbability: 0,
    },
    bg: { top: '#132619', mid: '#0c1810', glow: '#22c55e', glowOpacity: 0.34 },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    seed: 'AdvGlitch_Pixel',
    options: {
      head: ['variant03'],
      hair: ['variant42'],
      hairColor: ['7c3aed'],
      skinColor: ['ffd5bf'],
      eyes: ['variant04'],
      eyebrows: ['variant06'],
      mouth: ['happy10'],
      glasses: ['variant03'],
      glassesProbability: 100,
      glassesColor: ['a855f7'],
    },
    bg: { top: '#251336', mid: '#170b22', glow: '#c084fc', glowOpacity: 0.38 },
  },
  {
    id: 'explorer',
    name: 'Explorer',
    seed: 'AdvExplorer_Kael',
    options: {
      head: ['variant04'],
      hair: ['variant16'],
      hairColor: ['27272a'],
      skinColor: ['6a3c22'],
      eyes: ['variant12'],
      eyebrows: ['variant01'],
      mouth: ['happy02'],
      earrings: ['variant03'],
      earringsProbability: 100,
      earringsColor: ['38bdf8'],
      glassesProbability: 0,
    },
    bg: { top: '#11222c', mid: '#0a151c', glow: '#0ea5e9', glowOpacity: 0.36 },
  },
];

async function generateAvatar(entry, categoryDir) {
  // Generate character via DiceBear Lorelei
  // Scale = 80, translateY = 3 so the character's head and shoulders are centered
  // and strictly bounded within the central 80% circle (radius ~90 within 256x256)
  const avatar = createAvatar(lorelei, {
    seed: entry.seed,
    scale: 80,
    translateY: 3,
    backgroundColor: ['transparent'],
    ...entry.options,
  });

  const rawSvg = avatar.toString();
  // Extract inner SVG content by stripping outer <svg> tags
  const innerElements = rawSvg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');

  const { top, mid, glow, glowOpacity } = entry.bg;
  const compositeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg-${entry.id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${top}"/>
      <stop offset="65%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="#07090e"/>
    </linearGradient>
    <radialGradient id="glow-${entry.id}" cx="50%" cy="42%" r="44%">
      <stop offset="0%" stop-color="${glow}" stop-opacity="${glowOpacity}"/>
      <stop offset="60%" stop-color="${glow}" stop-opacity="${(glowOpacity * 0.35).toFixed(3)}"/>
      <stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- Dark rich vertical gradient background -->
  <rect width="256" height="256" fill="url(#bg-${entry.id})"/>
  <!-- Soft radial glow behind head -->
  <circle cx="128" cy="112" r="92" fill="url(#glow-${entry.id})"/>
  <!-- Lorelei character bounded safely in central 80% -->
  <svg x="0" y="0" width="256" height="256" viewBox="0 0 980 980">
    ${innerElements}
  </svg>
</svg>`;

  const outWebp = path.join(categoryDir, `${entry.id}.webp`);
  const outSvg = path.join(categoryDir, `${entry.id}.svg`);

  // Write high quality WebP (< 30 KB, ~85 quality)
  const webpBuffer = await sharp(Buffer.from(compositeSvg))
    .webp({ quality: 85, effort: 6 })
    .toBuffer();

  fs.writeFileSync(outWebp, webpBuffer);
  // Also write SVG for SVG-based fallbacks
  fs.writeFileSync(outSvg, compositeSvg, 'utf8');

  const kb = (webpBuffer.length / 1024).toFixed(2);
  console.log(`  [OK] ${entry.id.padEnd(12)} -> ${kb} KB (WebP: ${outWebp})`);
}

async function run() {
  console.log('Generating Free Avatars (Scholars & Archivists, Adventurers & Strategists)...');
  console.log(`Style: DiceBear Lorelei (Creator: Lisa Wischofsky, License: CC0 1.0 Universal)`);

  const scholarsDir = path.join(rootDir, 'public', 'images', 'avatars', 'scholars');
  const adventurersDir = path.join(rootDir, 'public', 'images', 'avatars', 'adventurers');

  fs.mkdirSync(scholarsDir, { recursive: true });
  fs.mkdirSync(adventurersDir, { recursive: true });

  console.log('\n--- 12 Scholars & Archivists ---');
  for (const item of SCHOLARS) {
    await generateAvatar(item, scholarsDir);
  }

  console.log('\n--- 12 Adventurers & Strategists ---');
  for (const item of ADVENTURERS) {
    await generateAvatar(item, adventurersDir);
  }

  console.log('\nAll 24 free avatars successfully generated!');
}

run().catch((err) => {
  console.error('Error generating avatars:', err);
  process.exit(1);
});
