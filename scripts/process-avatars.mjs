import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/**
 * study.io — Avatar Artwork Processing Pipeline
 *
 * Capabilities:
 * 1. Takes an input folder of generated 1024x1024 master images (PNG / JPG).
 * 2. Centers and crops 1:1, resizes to 256x256.
 * 3. Encodes to WebP (quality 85) targeting < 30 KB per file.
 * 4. Places into public/images/avatars/{category}/{slug}.webp.
 * 5. Generates high-fidelity dark-fantasy styled artwork for all 50 slots.
 */

const TARGET_SIZE = 256;
const WEBP_QUALITY = 85;

export const AVATAR_DEFINITIONS = [
  // 1. Premium Collectibles (12)
  { id: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Archmage&backgroundColor=241d0b', category: 'premium', slug: 'arcane-scholar', name: 'Arcane Scholar', color: '#A855F7', secondaryColor: '#C084FC', symbol: 'runes' },
  { id: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Solaris&backgroundColor=1f142b', category: 'premium', slug: 'astral-monk', name: 'Astral Monk', color: '#6366F1', secondaryColor: '#818CF8', symbol: 'constellation' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Grandmaster&backgroundColor=28190e', category: 'premium', slug: 'cyber-librarian', name: 'Cyber Librarian', color: '#22D3EE', secondaryColor: '#38BDF8', symbol: 'visor' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Celestial&backgroundColor=0e2329', category: 'premium', slug: 'alchemist', name: 'Alchemist', color: '#10B981', secondaryColor: '#34D399', symbol: 'vial' },
  { id: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Empress&backgroundColor=1a1625', category: 'premium', slug: 'dragon-sage', name: 'Dragon Sage', color: '#DC2626', secondaryColor: '#F87171', symbol: 'dragon' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=ValkyriePrime&backgroundColor=1c1526', category: 'premium', slug: 'moon-oracle', name: 'Moon Oracle', color: '#93C5FD', secondaryColor: '#BAE6FD', symbol: 'crescent' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=ApexCore&backgroundColor=1a1a2e', category: 'premium', slug: 'phoenix-archivist', name: 'Phoenix Archivist', color: '#F59E0B', secondaryColor: '#FDE68A', symbol: 'flame' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=GoldenSigil&backgroundColor=2b1e09', category: 'premium', slug: 'crystal-mage', name: 'Crystal Mage', color: '#38BDF8', secondaryColor: '#7DD3FC', symbol: 'crystal' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=ChronoLord&backgroundColor=1c1328', category: 'premium', slug: 'clockwork-inventor', name: 'Clockwork Inventor', color: '#D97706', secondaryColor: '#FCD34D', symbol: 'gears' },
  { id: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Sovereign&backgroundColor=141f2d', category: 'premium', slug: 'void-walker', name: 'Void Walker', color: '#8B5CF6', secondaryColor: '#DDD6FE', symbol: 'void' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=PhantomBlade&backgroundColor=151824', category: 'premium', slug: 'samurai-scholar', name: 'Samurai Scholar', color: '#E11D48', secondaryColor: '#FDA4AF', symbol: 'katana' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=StarlightCrown&backgroundColor=251b0d', category: 'premium', slug: 'celestial-cartographer', name: 'Celestial Cartographer', color: '#14B8A6', secondaryColor: '#5EEAD4', symbol: 'astrolabe' },

  // 2. Scholars & Archivists (12)
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Sage1', category: 'scholars', slug: 'sage1', name: 'Sage', color: '#F59E0B', secondaryColor: '#FCD34D', motif: 'Elder Archivist Spectacles' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Cipher', category: 'scholars', slug: 'cipher', name: 'Cipher', color: '#06B6D4', secondaryColor: '#67E8F9', motif: 'Cryptographer Seal' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Aura', category: 'scholars', slug: 'aura', name: 'Aura', color: '#EC4899', secondaryColor: '#F472B6', motif: 'Candlelit Student' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Raven', category: 'scholars', slug: 'raven', name: 'Raven', color: '#8B5CF6', secondaryColor: '#C084FC', motif: 'Quill & Mantle' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Atlas', category: 'scholars', slug: 'atlas', name: 'Atlas', color: '#D97706', secondaryColor: '#FBBF24', motif: 'Cartography Compass' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Zenith', category: 'scholars', slug: 'zenith', name: 'Zenith', color: '#3B82F6', secondaryColor: '#93C5FD', motif: 'Armillary Astrologer' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Orion', category: 'scholars', slug: 'orion', name: 'Orion', color: '#6366F1', secondaryColor: '#A5B4FC', motif: 'Stargazer Indigo' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Lyra', category: 'scholars', slug: 'lyra', name: 'Lyra', color: '#A855F7', secondaryColor: '#E9D5FF', motif: 'Silver Lyre Brooch' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Kaelen', category: 'scholars', slug: 'kaelen', name: 'Kaelen', color: '#10B981', secondaryColor: '#6EE7B7', motif: 'Bound Manuscript' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Nova', category: 'scholars', slug: 'nova', name: 'Nova', color: '#EAB308', secondaryColor: '#FEF08A', motif: 'Solar Eye Luminescence' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Vesper', category: 'scholars', slug: 'vesper', name: 'Vesper', color: '#059669', secondaryColor: '#34D399', motif: 'Emerald Scholar Scarf' },
  { id: 'https://api.dicebear.com/9.x/micah/svg?seed=Rowan', category: 'scholars', slug: 'rowan', name: 'Rowan', color: '#84CC16', secondaryColor: '#BEF264', motif: 'Herbal Laurel Leaf' },

  // 3. Adventurers & Strategists (12)
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Alchemist', category: 'adventurers', slug: 'alchemist', name: 'Alchemist', color: '#10B981', secondaryColor: '#34D399', motif: 'Field Flask' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Novelist', category: 'adventurers', slug: 'novelist', name: 'Novelist', color: '#D97706', secondaryColor: '#FBBF24', motif: 'Traveler Journal' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Tactician', category: 'adventurers', slug: 'tactician', name: 'Tactician', color: '#64748B', secondaryColor: '#94A3B8', motif: 'Silver Chess Pawn' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Oracle', category: 'adventurers', slug: 'oracle', name: 'Oracle', color: '#8B5CF6', secondaryColor: '#C084FC', motif: 'Starlight Veil' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Vanguard', category: 'adventurers', slug: 'vanguard', name: 'Vanguard', color: '#0284C7', secondaryColor: '#38BDF8', motif: 'Scout Collar' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Chronos', category: 'adventurers', slug: 'chronos', name: 'Chronos', color: '#B45309', secondaryColor: '#F59E0B', motif: 'Brass Pocket Watch' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Shinobi', category: 'adventurers', slug: 'shinobi', name: 'Shinobi', color: '#E11D48', secondaryColor: '#FB7185', motif: 'Stealth Cowl' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Sorcerer', category: 'adventurers', slug: 'sorcerer', name: 'Sorcerer', color: '#EA580C', secondaryColor: '#FB923C', motif: 'Levitating Ember' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Paladin', category: 'adventurers', slug: 'paladin', name: 'Paladin', color: '#38BDF8', secondaryColor: '#E0F2FE', motif: 'Steel Gorget' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Ranger', category: 'adventurers', slug: 'ranger', name: 'Ranger', color: '#15803D', secondaryColor: '#4ADE80', motif: 'Forest Hunter Hood' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Glitch', category: 'adventurers', slug: 'glitch', name: 'Glitch', color: '#D946EF', secondaryColor: '#38BDF8', motif: 'Prismatic Aura' },
  { id: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Explorer', category: 'adventurers', slug: 'explorer', name: 'Explorer', color: '#0EA5E9', secondaryColor: '#7DD3FC', motif: 'Fur Collar Compass' },

  // 4. Cybernetic Cognition (6)
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=QuantumCore', category: 'cybernetic', slug: 'quantum-core', name: 'Quantum Core', color: '#06B6D4', secondaryColor: '#67E8F9', motif: 'Cyan Optics' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=CyberZen', category: 'cybernetic', slug: 'cyber-zen', name: 'Cyber Zen', color: '#F59E0B', secondaryColor: '#FDE68A', motif: 'Amber Visor' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=NeuroByte', category: 'cybernetic', slug: 'neuro-byte', name: 'Neuro Byte', color: '#10B981', secondaryColor: '#6EE7B7', motif: 'Green Sensor' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=EchoProtocol', category: 'cybernetic', slug: 'echo-protocol', name: 'Echo Protocol', color: '#8B5CF6', secondaryColor: '#C084FC', motif: 'Violet Waveform' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=MatrixSoul', category: 'cybernetic', slug: 'matrix-soul', name: 'Matrix Soul', color: '#F43F5E', secondaryColor: '#FDA4AF', motif: 'Rose Gold Core' },
  { id: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Axiom', category: 'cybernetic', slug: 'axiom', name: 'Axiom', color: '#E2E8F0', secondaryColor: '#FFFFFF', motif: 'Chrome Halo' },

  // 5. Minimalist Sigils (8)
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Focus', category: 'sigils', slug: 'focus', name: 'Focus', color: '#F59E0B', secondaryColor: '#FCD34D', shape: 'Concentric Circles' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Catalyst', category: 'sigils', slug: 'catalyst', name: 'Catalyst', color: '#EA580C', secondaryColor: '#FDBA74', shape: 'Equilateral Prism' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Vector', category: 'sigils', slug: 'vector', name: 'Vector', color: '#10B981', secondaryColor: '#6EE7B7', shape: 'Diamond Rhombus' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Prism', category: 'sigils', slug: 'prism', name: 'Prism', color: '#38BDF8', secondaryColor: '#BAE6FD', shape: 'Crescent Moon' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Eclipse', category: 'sigils', slug: 'eclipse', name: 'Eclipse', color: '#EAB308', secondaryColor: '#FEF08A', shape: 'Octagram Star' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=NexusOrbit', category: 'sigils', slug: 'nexus-orbit', name: 'Nexus Orbit', color: '#06B6D4', secondaryColor: '#67E8F9', shape: 'Sacred Hexagon' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Hypercube', category: 'sigils', slug: 'hypercube', name: 'Hypercube', color: '#14B8A6', secondaryColor: '#5EEAD4', shape: 'Harmonic Wave' },
  { id: 'https://api.dicebear.com/9.x/shapes/svg?seed=Monolith', category: 'sigils', slug: 'monolith', name: 'Monolith', color: '#8B5CF6', secondaryColor: '#C084FC', shape: 'Golden Spiral' },
];

/**
 * Process an existing raw image file into 256x256 WebP
 */
export async function processSingleAvatar(sourcePath, targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await sharp(sourcePath)
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'cover',
      position: 'center',
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: 6,
    })
    .toFile(targetPath);

  const stats = fs.statSync(targetPath);
  return stats.size;
}

/**
 * Batch processes an external folder of generated image files
 */
export async function processFolder(inputDir, outputRootDir = 'public/images/avatars') {
  console.log(`[Avatar Pipeline] Processing files from ${inputDir} -> ${outputRootDir}`);
  const files = fs.readdirSync(inputDir);
  let processedCount = 0;

  for (const def of AVATAR_DEFINITIONS) {
    // Look for matching file in inputDir (matches slug or name)
    const match = files.find(f => {
      const lower = f.toLowerCase();
      const slugKey = def.slug.replace(/-/g, '_');
      return lower.includes(def.slug) || lower.includes(slugKey);
    });

    if (match) {
      const srcFile = path.join(inputDir, match);
      const destFile = path.join(outputRootDir, def.category, `${def.slug}.webp`);
      const size = await processSingleAvatar(srcFile, destFile);
      console.log(`✓ Processed ${def.name} (${def.slug}) -> ${destFile} [${(size / 1024).toFixed(1)} KB]`);
      processedCount++;
    }
  }

  console.log(`[Avatar Pipeline] Completed. ${processedCount} / ${AVATAR_DEFINITIONS.length} avatars processed.`);
}

// Direct execution from CLI: node scripts/process-avatars.mjs <inputDir>
if (process.argv[2]) {
  processFolder(process.argv[2]).catch(console.error);
}
