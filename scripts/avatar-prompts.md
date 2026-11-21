# study.io — Official Avatar Artwork Specification & Prompts

## 1. Universal Art Direction & Style Prefix

All avatars across **study.io** share a single, unified visual identity inspired by the app's polished rank badges:
- **Genre & Mood**: Dark fantasy meets prestige academy. Calm, studious, dignified, and focused.
- **Framing**: Centered head-and-shoulders portrait (or emblem), looking slightly toward the camera. Camera distance is consistent across the entire roster (chest-up bust).
- **Safe Zone**: All essential details (face, eyes, primary emblem, key prop) are framed strictly within the **central 80% circle** to prevent cutoff in round and rounded-square UI crops (from 32px to 96px).
- **Lighting Key**:
  - **Key Light**: Soft cinematic warm light originating from the upper-left (10 o'clock), casting gentle painterly shadows on features.
  - **Rim Light**: Vivid colored edge/rim lighting on the right side (2 o'clock to 4 o'clock) matching the character's signature color.
  - **Ambient Fill**: Subtle deep tones preserving facial clarity and detail without blown-out highlights or murky black clipping.
- **Background**: Dark, rich vignetted gradient (approaching `#07090e` at edges) with a soft radial glow in the avatar's signature tint.
- **Style**: High-fidelity digital painting with subtle painterly textures, sharp silhouette, no flat vector clip-art, no childish cartoon aesthetics, no photorealistic human replicas, no text, logos, or watermarks.

### Shared Style Prefix
```text
High-quality digital painting avatar portrait of {CHARACTER_DESCRIPTION}. Head-and-shoulders bust composition, perfectly centered, facing slightly toward the viewer. Central 80% safe zone framing. Soft warm cinematic key light from upper-left, vivid {SIGNATURE_COLOR} rim light along the right silhouette. Deep moody dark gradient background with a soft radial {SIGNATURE_COLOR} glow. Polished dark fantasy academy concept art, refined painterly shading, clean silhouette, video game avatar icon, 1024x1024 square, no text, no watermark.
```

---

## 2. Technical Export Specifications

| Attribute | Specification |
| :--- | :--- |
| **Source Master** | 1024 × 1024 px, 24-bit RGB |
| **Output Format** | **WebP** (`image/webp`) |
| **Output Dimensions** | **256 × 256 px** square |
| **Compression Quality** | `85%` (lossy WebP) |
| **Target File Size** | `< 30 KB` per avatar (typically 12 KB – 20 KB) |
| **Background** | Fully baked-in dark vignette (no transparency) to ensure seamless rendering across dark UI and round avatar crops. |

---

## 3. The Complete 50-Avatar Roster & Prompts

---

### GROUP 1: PREMIUM // ELITE SCHOLARS (12 Avatars — Pro Exclusive)
*Tier Treatment: Rich, atmospheric lighting, luminous magical artifacts, ethereal particles, dual-tone edge lighting.*

#### 1. Arcane Scholar
- **ID**: `https://api.dicebear.com/9.x/lorelei/svg?seed=Archmage&backgroundColor=241d0b`
- **Output File**: `public/images/avatars/premium/arcane-scholar.webp`
- **Rarity**: Epic
- **Signature Color**: Violet / Amethyst (`#A855F7`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of an Arcane Scholar wearing midnight velvet scholar robes with gold-trimmed lapels. Deep purple glowing runes floating gently near their temples. Inquisitive, poised expression with lilac starlight in their eyes. Soft warm key light from upper-left, radiant violet rim light on the right. Dark obsidian background with faint floating amethyst sparks. Polished dark fantasy academy concept art, central 80% safe zone, clean silhouette, video game avatar icon.
  ```

#### 2. Astral Monk
- **ID**: `https://api.dicebear.com/9.x/lorelei/svg?seed=Solaris&backgroundColor=1f142b`
- **Output File**: `public/images/avatars/premium/astral-monk.webp`
- **Rarity**: Epic
- **Signature Color**: Indigo & Silver (`#6366F1`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a serene Astral Monk in deep indigo martial cowl with silver trim. Glowing silver constellation lines gracefully traced across cheekbones. Calm meditative gaze with luminous starlight pupils. Soft warm key light from upper-left, vivid indigo and cyan rim light on the right edge. Deep cosmic nebula background with miniature distant stars. Polished dark fantasy concept art, central 80% safe zone, clean silhouette, video game avatar icon.
  ```

#### 3. Cyber Librarian
- **ID**: `https://api.dicebear.com/9.x/adventurer/svg?seed=Grandmaster&backgroundColor=28190e`
- **Output File**: `public/images/avatars/premium/cyber-librarian.webp`
- **Rarity**: Epic
- **Signature Color**: Cyan / Electric Aqua (`#22D3EE`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a sleek Cyber Librarian wearing dark techwear scholar robes with integrated glowing fiber optics. Translucent cyan holographic AR visor over one eye displaying illuminated catalog glyphs. Focused, intelligent expression. Warm amber key light from upper-left, vibrant electric cyan rim light along the right silhouette. Dark futuristic archives background with faint floating holographic data particles. Polished concept art, central 80% safe zone, clean silhouette.
  ```

#### 4. Alchemist
- **ID**: `https://api.dicebear.com/9.x/adventurer/svg?seed=Celestial&backgroundColor=0e2329`
- **Output File**: `public/images/avatars/premium/alchemist.webp`
- **Rarity**: Epic
- **Signature Color**: Emerald Glow (`#10B981`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a master Alchemist wearing a dark leather apron and bronze-buckled scholar doublet. Holding a small crystalline phial that casts a warm phosphorescent emerald luminescence upward onto their thoughtful face. Warm key light from upper-left, bright jade emerald rim light on the right. Deep shadowy laboratory background with faint green potion vapors. Polished dark fantasy concept art, central 80% safe zone, clean silhouette.
  ```

#### 5. Dragon Sage
- **ID**: `https://api.dicebear.com/9.x/lorelei/svg?seed=Empress&backgroundColor=1a1625`
- **Output File**: `public/images/avatars/premium/dragon-sage.webp`
- **Rarity**: Epic
- **Signature Color**: Crimson & Gold (`#DC2626`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a majestic Dragon Sage adorned in dark silk robes with embroidered golden dragons. A tiny crimson whelp dragon resting curled upon one shoulder, breathing faint golden sparks. Piercing amber draconic eyes, regal confident gaze. Soft warm key light from upper-left, intense crimson and gold rim lighting along the right edge. Dark volcanic gradient background with glowing embers. Polished dark fantasy art, central 80% safe zone, clean silhouette.
  ```

#### 6. Moon Oracle
- **ID**: `https://api.dicebear.com/9.x/adventurer/svg?seed=ValkyriePrime&backgroundColor=1c1526`
- **Output File**: `public/images/avatars/premium/moon-oracle.webp`
- **Rarity**: Epic
- **Signature Color**: Pale Lunar Blue (`#93C5FD`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a mystical Moon Oracle wearing a flowing silvery cowl adorned with a delicate crescent moon circlet. Soft pale blue moonlight reflecting in serene mystical eyes. Quiet, clairvoyant expression. Soft warm key light from upper-left, ethereal pale lunar blue rim lighting on the right. Deep night sky background with soft misty lunar halo. Polished dark fantasy concept art, central 80% safe zone, clean silhouette.
  ```

#### 7. Phoenix Archivist
- **ID**: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=ApexCore&backgroundColor=1a1a2e`
- **Output File**: `public/images/avatars/premium/phoenix-archivist.webp`
- **Rarity**: Legendary
- **Signature Color**: Solar Amber & Orange (`#F59E0B`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a venerable Phoenix Archivist holding an ethereal fiery quill pen that radiates golden warmth. Crimson and charcoal robes with glowing gold embroidery. Confident intellectual gaze with embers dancing in their irises. Warm key light from upper-left, blazing golden-orange rim light along the right silhouette. Dark library background with ascending golden cinders. Polished dark fantasy concept art, central 80% safe zone, clean silhouette.
  ```

#### 8. Crystal Mage
- **ID**: `https://api.dicebear.com/9.x/shapes/svg?seed=GoldenSigil&backgroundColor=2b1e09`
- **Output File**: `public/images/avatars/premium/crystal-mage.webp`
- **Rarity**: Legendary
- **Signature Color**: Ice Cerulean (`#38BDF8`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of an enigmatic Crystal Mage with geometric floating sapphire crystal shards hovering near their collar and temples. Wearing frosted dark navy robes with crystalline clasps. Cool analytical gaze. Soft warm key light from upper-left, brilliant glacial ice-blue rim light on the right. Deep cavernous dark gradient background with faint crystalline refraction flares. Polished fantasy concept art, central 80% safe zone, clean silhouette.
  ```

#### 9. Clockwork Inventor
- **ID**: `https://api.dicebear.com/9.x/micah/svg?seed=ChronoLord&backgroundColor=1c1328`
- **Output File**: `public/images/avatars/premium/clockwork-inventor.webp`
- **Rarity**: Legendary
- **Signature Color**: Copper & Burnished Amber (`#D97706`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of an eccentric Clockwork Inventor wearing an ornate brass jeweler's loupe eyepiece over one brow. High-collared leather vest with exposed miniature interlocking gears and copper pins. Ingenious, enthusiastic expression. Soft warm key light from upper-left, brilliant burnished copper rim light on the right. Dark workshop background with glowing incandescent filaments and steam. Polished steampunk fantasy concept art, central 80% safe zone.
  ```

#### 10. Void Walker
- **ID**: `https://api.dicebear.com/9.x/lorelei/svg?seed=Sovereign&backgroundColor=141f2d`
- **Output File**: `public/images/avatars/premium/void-walker.webp`
- **Rarity**: Legendary
- **Signature Color**: Deep Purple & Midnight (`#8B5CF6`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a mysterious Void Walker wearing an abyssal dark hood whose interior reveals a faint swirling galactic void. Glowing violet cosmic eyes peering from the shadow of the cowl. Mysterious and powerful countenance. Soft ethereal key light from upper-left, rich spectral violet rim lighting along the right edge. Deep abyss background with cosmic spatial distortions. Polished dark fantasy concept art, central 80% safe zone.
  ```

#### 11. Samurai Scholar
- **ID**: `https://api.dicebear.com/9.x/adventurer/svg?seed=PhantomBlade&backgroundColor=151824`
- **Output File**: `public/images/avatars/premium/samurai-scholar.webp`
- **Rarity**: Legendary
- **Signature Color**: Crimson & Charcoal (`#E11D48`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a noble Samurai Scholar wearing charcoal haori over traditional robes with subtle dark-red crane patterns. A lacquer-bound scroll tucked securely at their shoulder. Disciplined, honorable expression with razor-sharp gaze. Soft warm key light from upper-left, striking crimson edge rim light on the right. Moody dark textured background with delicate falling crimson cherry blossom petals. Polished fantasy concept art, central 80% safe zone.
  ```

#### 12. Celestial Cartographer
- **ID**: `https://api.dicebear.com/9.x/shapes/svg?seed=StarlightCrown&backgroundColor=251b0d`
- **Output File**: `public/images/avatars/premium/celestial-cartographer.webp`
- **Rarity**: Legendary
- **Signature Color**: Teal & Gold (`#14B8A6`)
- **Prompt**:
  ```text
  High-quality digital painting avatar portrait of a visionary Celestial Cartographer examining a glowing miniature spherical astrolabe in their hands. Dark teal robes with embroidered golden orbital rings and star charts. Visionary, awed expression. Soft warm key light from upper-left, radiant cyan-teal and gold rim light along the right silhouette. Deep space gradient background with delicate intersecting golden coordinate lines. Polished fantasy concept art, central 80% safe zone.
  ```

---

### GROUP 2: SCHOLARS & ARCHIVISTS (12 Avatars — Free)
*Tier Treatment: Studious, warm-toned portraits with subtle scholarly motifs (spectacles, scrolls, ink, library glow).*

1. **Sage1** (`/images/avatars/scholars/sage1.webp`): Elderly wise archivist with silver beard, rounded wire spectacles, holding an ancient rolled parchment, warm candlelight key, soft amber rim light.
2. **Cipher** (`/images/avatars/scholars/cipher.webp`): Young cryptographer with dark swept hair and an intricate brass cypher seal ring, focused gaze, soft teal rim light.
3. **Aura** (`/images/avatars/scholars/aura.webp`): Calm female student in cozy knit cowl illuminated by soft warm lantern glow, quill behind ear, warm golden rim light.
4. **Raven** (`/images/avatars/scholars/raven.webp`): Nocturnal scholar with dark hair and a raven feather pen brooch pinned to their velvet mantle, deep plum rim light.
5. **Atlas** (`/images/avatars/scholars/atlas.webp`): Sturdy geographer scholar with leather pauldron and brass compass necklace, warm terracotta rim light.
6. **Zenith** (`/images/avatars/scholars/zenith.webp`): Astrologer scholar in midnight blue robe with brass armillary sphere badge, radiant celestial blue rim light.
7. **Orion** (`/images/avatars/scholars/orion.webp`): Young stargazer with starry indigo collar and quiet thoughtful smile, soft cobalt rim light.
8. **Lyra** (`/images/avatars/scholars/lyra.webp`): Classical literature scholar with elegant braids and a miniature silver lyre pin, warm lavender rim light.
9. **Kaelen** (`/images/avatars/scholars/kaelen.webp`): Diligent student holding a leather-bound grimoire close to chest, determined expression, soft bronze rim light.
10. **Nova** (`/images/avatars/scholars/nova.webp`): Bright youthful researcher with inquisitive honey-gold eyes and messy hair, radiant warm amber rim light.
11. **Vesper** (`/images/avatars/scholars/vesper.webp`): Evening reader draped in a deep emerald scholar scarf, reading by faint candle glow, soft emerald rim light.
12. **Rowan** (`/images/avatars/scholars/rowan.webp`): Botanist scholar with a dried laurel sprig tucked in their collar, earth-toned robes, warm olive rim light.

---

### GROUP 3: ADVENTURERS & STRATEGISTS (12 Avatars — Free)
*Tier Treatment: Tacticians, navigators, and explorers with small iconic equipment (hoods, maps, goggles, compasses).*

1. **Alchemist** (`/images/avatars/adventurers/alchemist.webp`): Field researcher with leather satchel strap and small glowing amber vial, lime-gold rim light.
2. **Novelist** (`/images/avatars/adventurers/novelist.webp`): Traveling chronicler in high-collar duster coat with well-worn leather journal, warm sepia rim light.
3. **Tactician** (`/images/avatars/adventurers/tactician.webp`): Chess grandmaster with sharp intelligent gaze and silver pawn insignia on lapel, crisp platinum rim light.
4. **Oracle** (`/images/avatars/adventurers/oracle.webp`): Wandering seer wearing a sheer starlight veil across eyes, calm omniscient smile, soft violet rim light.
5. **Vanguard** (`/images/avatars/adventurers/vanguard.webp`): Resolute scout with reinforced leather mantle and vigilant gaze, steel-blue rim light.
6. **Chronos** (`/images/avatars/adventurers/chronos.webp`): Timekeeper explorer holding an open antique brass pocket watch, warm copper rim light.
7. **Shinobi** (`/images/avatars/adventurers/shinobi.webp`): Stealth researcher with dark high collar face covering and crimson headband accent, deep scarlet rim light.
8. **Sorcerer** (`/images/avatars/adventurers/sorcerer.webp`): Elemental study apprentice with a tiny floating warm ember hovering above palm, warm vermilion rim light.
9. **Paladin** (`/images/avatars/adventurers/paladin.webp`): Honorable scholar-knight with polished steel gorget collar and white mantle, pure silver rim light.
10. **Ranger** (`/images/avatars/adventurers/ranger.webp`): Wilderness tracker with deep forest hunter hood and eagle feather clasp, pine green rim light.
11. **Glitch** (`/images/avatars/adventurers/glitch.webp`): Quantum explorer with faint iridescent chromatic aberration sheen along edges, magenta/cyan dual rim light.
12. **Explorer** (`/images/avatars/adventurers/explorer.webp`): Arctic expedition surveyor in shearling-lined collar with brass directional compass, glacial cyan rim light.

---

### GROUP 4: CYBERNETIC COGNITION (6 Avatars — Free)
*Tier Treatment: Polished companion androids with friendly glowing optics, curved brushed metal plating, and signature LED colors.*

1. **QuantumCore** (`/images/avatars/cybernetic/quantum-core.webp`): Sleek dark titanium chassis with glowing electric cyan dual optics and floating circuit ring halo.
2. **CyberZen** (`/images/avatars/cybernetic/cyber-zen.webp`): Warm brushed bronze-gold companion android with peaceful meditating amber visor glow.
3. **NeuroByte** (`/images/avatars/cybernetic/neuro-byte.webp`): Dark carbon-fiber casing with emerald green pulse sensors and friendly inquisitive head tilt.
4. **EchoProtocol** (`/images/avatars/cybernetic/echo-protocol.webp`): Iridescent obsidian alloy android with neon violet waveform audio visualizer visor.
5. **MatrixSoul** (`/images/avatars/cybernetic/matrix-soul.webp`): Rose-gold chassis with warm magenta-rose LED ocular core and elegant ceramic finish.
6. **Axiom** (`/images/avatars/cybernetic/axiom.webp`): Mirror-finish polished chrome android with crisp pure white halo crown and silver sensors.

---

### GROUP 5: MINIMALIST SIGILS (8 Avatars — Free)
*Tier Treatment: Premium abstract geometric emblems with soft internal luminescence on rich dark gradient fields.*

1. **Focus** (`/images/avatars/sigils/focus.webp`): Precision concentric rings of golden light converging on a central radiant point, deep indigo-black radial field.
2. **Catalyst** (`/images/avatars/sigils/catalyst.webp`): Equilateral prism triangle with glowing internal geometric facets and amber core flare.
3. **Vector** (`/images/avatars/sigils/vector.webp`): Elegant diamond rhombus crest with radiant emerald beam accents on midnight jade vignette.
4. **Prism** (`/images/avatars/sigils/prism.webp`): Slender celestial crescent moon glyph in silver and pale cyan luminescence, deep navy field.
5. **Eclipse** (`/images/avatars/sigils/eclipse.webp`): Harmonious eight-pointed starlight burst in warm gold and solar amber on obsidian backdrop.
6. **NexusOrbit** (`/images/avatars/sigils/nexus-orbit.webp`): Sacred geometric hexagon with interlocking cyan quantum orbit rings.
7. **Hypercube** (`/images/avatars/sigils/hypercube.webp`): Flowing sinusoidal harmonic wave crest glowing in aquamarine and teal light.
8. **Monolith** (`/images/avatars/sigils/monolith.webp`): Perfect logarithmic golden spiral in radiant amethyst purple on velvet black.
