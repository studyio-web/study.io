import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── HELPERS ────────────────────────────────────────────────────────────────

function hex2rgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function lerp(a,b,t){ return Math.round(a+(b-a)*t); }
function tint(hex, t=0.18){
  const [r,g,b]=hex2rgb(hex);
  return `rgb(${lerp(7,r,t)},${lerp(9,g,t)},${lerp(14,b,t)})`;
}

// ─── PORTRAIT GENERATOR ─────────────────────────────────────────────────────

function makePortrait({
  id, skinBase, skinHighlight, hairColor,
  rimHex, eyeHex, bgHex1, bgHex2,
  accessorySvg = '',
  feminine = false,
  aged = false,
  squareJaw = false,
}) {
  const bg1 = tint(bgHex1, 0.22);
  const bg2 = '#07090e';
  const rimColor = rimHex;
  const eyeColor = eyeHex;
  const hairC = aged ? '#c8c8d8' : hairColor;
  const hairC2 = aged ? '#a0a0b8' : hairColor;

  // Face shape varies by archetype
  const faceRx = feminine ? 34 : squareJaw ? 36 : 35;
  const faceRy = feminine ? 42 : 40;
  const jawY = feminine ? 148 : squareJaw ? 152 : 150;
  const jawRx = feminine ? 26 : squareJaw ? 34 : 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <!-- Background gradient -->
    <radialGradient id="bg-${id}" cx="50%" cy="45%" r="58%">
      <stop offset="0%" stop-color="${tint(bgHex1,0.30)}"/>
      <stop offset="60%" stop-color="${tint(bgHex1,0.12)}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </radialGradient>
    <!-- Ambient glow behind head -->
    <radialGradient id="ambi-${id}" cx="50%" cy="44%" r="38%">
      <stop offset="0%" stop-color="${rimColor}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${rimColor}" stop-opacity="0"/>
    </radialGradient>
    <!-- Skin gradient: key light upper-left, shadow lower-right -->
    <linearGradient id="skin-${id}" x1="20%" y1="15%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="${skinHighlight}"/>
      <stop offset="45%" stop-color="${skinBase}"/>
      <stop offset="100%" stop-color="${darken(skinBase,0.32)}"/>
    </linearGradient>
    <!-- Hair gradient -->
    <linearGradient id="hair-${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${lighten(hairC,0.18)}"/>
      <stop offset="100%" stop-color="${darken(hairC2,0.2)}"/>
    </linearGradient>
    <!-- Rim light -->
    <radialGradient id="rim-${id}" cx="80%" cy="50%" r="40%">
      <stop offset="0%" stop-color="${rimColor}" stop-opacity="0.70"/>
      <stop offset="100%" stop-color="${rimColor}" stop-opacity="0"/>
    </radialGradient>
    <!-- Eye glow -->
    <radialGradient id="eye-${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${lighten(eyeColor,0.5)}"/>
      <stop offset="60%" stop-color="${eyeColor}"/>
      <stop offset="100%" stop-color="${darken(eyeColor,0.3)}"/>
    </radialGradient>
    <!-- Glow filter -->
    <filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft-${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
    <filter id="rim-blur-${id}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <!-- Subtle noise texture -->
    <filter id="noise-${id}">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
      <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended"/>
      <feComposite in="blended" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>

  <!-- Layer 1: Background -->
  <rect width="256" height="256" fill="url(#bg-${id})"/>

  <!-- Layer 2: Noise texture overlay -->
  <rect width="256" height="256" fill="${tint(bgHex1,0.08)}" filter="url(#noise-${id})" opacity="0.12"/>

  <!-- Layer 3: Ambient head glow -->
  <ellipse cx="128" cy="112" rx="72" ry="68" fill="url(#ambi-${id})"/>

  <!-- Layer 4: Shoulders/torso -->
  <path d="M68,256 C68,210 82,195 98,188 L128,182 L158,188 C174,195 188,210 188,256 Z" fill="${darken(skinBase,0.45)}"/>
  <path d="M68,256 C68,210 82,195 98,188 L128,182 L158,188 C174,195 188,210 188,256 Z" fill="${tint(bgHex1,0.1)}" opacity="0.4"/>

  <!-- Layer 5: Neck -->
  <ellipse cx="128" cy="175" rx="18" ry="12" fill="url(#skin-${id})"/>
  <rect x="112" y="168" width="32" height="22" rx="8" fill="url(#skin-${id})"/>

  <!-- Layer 6: Hair back/sides -->
  <ellipse cx="128" cy="102" rx="${faceRx+10}" ry="${faceRy+8}" fill="url(#hair-${id})"/>

  <!-- Layer 7: Face/head -->
  <ellipse cx="128" cy="108" rx="${faceRx}" ry="${faceRy}" fill="url(#skin-${id})"/>
  ${feminine
    ? `<path d="M${128-jawRx},${jawY-10} Q${128-jawRx-4},${jawY+8} 128,${jawY+14} Q${128+jawRx+4},${jawY+8} ${128+jawRx},${jawY-10}" fill="url(#skin-${id})"/>`
    : squareJaw
    ? `<path d="M${128-jawRx},${jawY-8} L${128-jawRx},${jawY+10} Q128,${jawY+18} ${128+jawRx},${jawY+10} L${128+jawRx},${jawY-8}" fill="url(#skin-${id})"/>`
    : `<path d="M${128-jawRx},${jawY-8} Q${128-jawRx-2},${jawY+12} 128,${jawY+16} Q${128+jawRx+2},${jawY+12} ${128+jawRx},${jawY-8}" fill="url(#skin-${id})"/>`
  }

  <!-- Layer 8: Brow ridge -->
  ${!feminine
    ? `<ellipse cx="128" cy="${squareJaw?92:94}" rx="${squareJaw?28:26}" ry="${squareJaw?6:5}" fill="${darken(skinBase,0.18)}" opacity="0.5"/>`
    : `<ellipse cx="128" cy="95" rx="24" ry="4" fill="${darken(skinBase,0.1)}" opacity="0.3"/>`
  }

  <!-- Layer 9: Eyes -->
  <ellipse cx="112" cy="108" rx="7" ry="5" fill="#0a0c10"/>
  <ellipse cx="144" cy="108" rx="7" ry="5" fill="#0a0c10"/>
  <ellipse cx="112" cy="108" rx="4.5" ry="3.5" fill="url(#eye-${id})" filter="url(#glow-${id})"/>
  <ellipse cx="144" cy="108" rx="4.5" ry="3.5" fill="url(#eye-${id})" filter="url(#glow-${id})"/>
  <!-- Eye shine -->
  <ellipse cx="114" cy="106" rx="1.5" ry="1" fill="white" opacity="0.7"/>
  <ellipse cx="146" cy="106" rx="1.5" ry="1" fill="white" opacity="0.7"/>

  <!-- Layer 10: Nose (subtle) -->
  <path d="M124,118 Q128,126 132,118" stroke="${darken(skinBase,0.25)}" stroke-width="1.2" fill="none" opacity="0.5"/>

  <!-- Layer 11: Lips -->
  <path d="M120,133 Q128,139 136,133" stroke="${darken(skinBase,0.3)}" stroke-width="1.5" fill="none" opacity="0.6"/>

  <!-- Layer 12: Hair front/fringe -->
  ${aged
    ? `<path d="M${128-faceRx-2},100 Q${128-faceRx+4},68 128,66 Q${128+faceRx-4},68 ${128+faceRx+2},100" fill="url(#hair-${id})" opacity="0.9"/>`
    : `<path d="M${128-faceRx-2},102 Q${128-faceRx+6},64 128,62 Q${128+faceRx-6},64 ${128+faceRx+2},102" fill="url(#hair-${id})"/>`
  }

  <!-- Layer 13: Rim light (right edge of head) -->
  <ellipse cx="162" cy="108" rx="22" ry="38" fill="url(#rim-${id})" opacity="0.65"/>

  <!-- Layer 14: Key light (upper-left face) -->
  <ellipse cx="104" cy="88" rx="24" ry="20" fill="${skinHighlight}" opacity="0.18"/>

  <!-- Layer 15: Accessory / motif -->
  ${accessorySvg}

  <!-- Layer 16: Particles -->
  <circle cx="58" cy="68" r="2" fill="${rimColor}" opacity="0.35"/>
  <circle cx="192" cy="80" r="1.5" fill="${rimColor}" opacity="0.25"/>
  <circle cx="42" cy="140" r="1.2" fill="${rimColor}" opacity="0.2"/>
  <circle cx="208" cy="52" r="1.8" fill="${rimColor}" opacity="0.3"/>
  <circle cx="76" cy="192" r="1.4" fill="${rimColor}" opacity="0.18"/>
  <circle cx="184" cy="168" r="1.6" fill="${rimColor}" opacity="0.22"/>
</svg>`;
}

function darken(hex, amt) {
  if (hex.startsWith('rgb')) return hex;
  const [r,g,b]=hex2rgb(hex);
  return `rgb(${Math.max(0,Math.round(r*(1-amt)))},${Math.max(0,Math.round(g*(1-amt)))},${Math.max(0,Math.round(b*(1-amt)))})`;
}
function lighten(hex, amt) {
  if (hex.startsWith('rgb')) return hex;
  const [r,g,b]=hex2rgb(hex);
  return `rgb(${Math.min(255,Math.round(r+(255-r)*amt))},${Math.min(255,Math.round(g+(255-g)*amt))},${Math.min(255,Math.round(b+(255-b)*amt))})`;
}

// ─── ROBOT GENERATOR ────────────────────────────────────────────────────────

function makeRobot({ id, visorHex, bgHex1, bgHex2, visorHex2 }) {
  const bg1t = tint(bgHex1, 0.25);
  const bg2 = bgHex2 || '#07090e';
  const v2 = visorHex2 || lighten(visorHex, 0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg-${id}" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="${tint(bgHex1,0.28)}"/>
      <stop offset="65%" stop-color="${tint(bgHex1,0.1)}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </radialGradient>
    <radialGradient id="ambi-${id}" cx="50%" cy="44%" r="40%">
      <stop offset="0%" stop-color="${visorHex}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${visorHex}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="head-${id}" x1="20%" y1="10%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="#2a2e38"/>
      <stop offset="50%" stop-color="#181e28"/>
      <stop offset="100%" stop-color="#0d1118"/>
    </linearGradient>
    <linearGradient id="visor-${id}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${darken(visorHex,0.3)}"/>
      <stop offset="30%" stop-color="${visorHex}"/>
      <stop offset="70%" stop-color="${v2}"/>
      <stop offset="100%" stop-color="${darken(visorHex,0.2)}"/>
    </linearGradient>
    <linearGradient id="shoulder-${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#222633"/>
      <stop offset="100%" stop-color="#0e1118"/>
    </linearGradient>
    <radialGradient id="rim-${id}" cx="80%" cy="50%" r="40%">
      <stop offset="0%" stop-color="${visorHex}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${visorHex}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow-${id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft-${id}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3.5"/>
    </filter>
    <filter id="noise-${id}">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" result="n"/>
      <feColorMatrix type="saturate" values="0" in="n" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="overlay"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="256" height="256" fill="url(#bg-${id})"/>
  <rect width="256" height="256" fill="${tint(bgHex1,0.06)}" filter="url(#noise-${id})" opacity="0.1"/>

  <!-- Ambient glow -->
  <ellipse cx="128" cy="110" rx="70" ry="65" fill="url(#ambi-${id})"/>

  <!-- Shoulders -->
  <path d="M62,256 L62,205 Q62,195 72,192 L110,186 L128,184 L146,186 L184,192 Q194,195 194,205 L194,256 Z" fill="url(#shoulder-${id})"/>
  <!-- Shoulder highlight -->
  <path d="M62,210 Q80,200 128,197 Q176,200 194,210" stroke="${lighten(visorHex,0.15)}" stroke-width="1" fill="none" opacity="0.3"/>

  <!-- Neck -->
  <rect x="114" y="172" width="28" height="20" rx="5" fill="#1a1f28"/>
  <rect x="118" y="174" width="8" height="16" rx="3" fill="${tint(visorHex,0.4)}" opacity="0.5"/>
  <rect x="130" y="174" width="8" height="16" rx="3" fill="${tint(visorHex,0.4)}" opacity="0.5"/>

  <!-- Head body -->
  <rect x="82" y="72" width="92" height="104" rx="16" fill="url(#head-${id})"/>
  <!-- Head rim light -->
  <rect x="82" y="72" width="92" height="104" rx="16" fill="url(#rim-${id})" opacity="0.5"/>

  <!-- Panel lines on face -->
  <line x1="128" y1="78" x2="128" y2="168" stroke="#ffffff" stroke-width="0.5" opacity="0.08"/>
  <line x1="88" y1="120" x2="168" y2="120" stroke="#ffffff" stroke-width="0.5" opacity="0.08"/>
  <!-- Faceplate inset -->
  <rect x="90" y="80" width="76" height="88" rx="10" fill="#141820" opacity="0.6"/>

  <!-- Antenna -->
  <rect x="125" y="58" width="6" height="18" rx="3" fill="#1e242e"/>
  <circle cx="128" cy="55" r="6" fill="${visorHex}" filter="url(#glow-${id})" opacity="0.9"/>
  <circle cx="128" cy="55" r="3" fill="${lighten(visorHex,0.5)}"/>

  <!-- Visor / eye bar -->
  <rect x="92" y="102" width="72" height="22" rx="8" fill="url(#visor-${id})" filter="url(#glow-${id})"/>
  <!-- Visor sheen -->
  <rect x="92" y="102" width="72" height="10" rx="8" fill="white" opacity="0.08"/>
  <!-- Visor scan line -->
  <rect x="92" y="112" width="72" height="1.5" fill="${visorHex}" opacity="0.5"/>

  <!-- Side sensors -->
  <circle cx="85" cy="100" r="5" fill="${visorHex}" opacity="0.7" filter="url(#soft-${id})"/>
  <circle cx="171" cy="100" r="5" fill="${visorHex}" opacity="0.7" filter="url(#soft-${id})"/>
  <circle cx="85" cy="100" r="2.5" fill="${lighten(visorHex,0.5)}"/>
  <circle cx="171" cy="100" r="2.5" fill="${lighten(visorHex,0.5)}"/>

  <!-- Chin LED row -->
  <circle cx="112" cy="150" r="3" fill="${visorHex}" opacity="0.8" filter="url(#soft-${id})"/>
  <circle cx="128" cy="150" r="3" fill="${visorHex}" opacity="0.8" filter="url(#soft-${id})"/>
  <circle cx="144" cy="150" r="3" fill="${visorHex}" opacity="0.8" filter="url(#soft-${id})"/>

  <!-- Particles -->
  <circle cx="54" cy="72" r="2" fill="${visorHex}" opacity="0.3"/>
  <circle cx="196" cy="82" r="1.5" fill="${visorHex}" opacity="0.25"/>
  <circle cx="46" cy="148" r="1.4" fill="${visorHex}" opacity="0.2"/>
  <circle cx="208" cy="58" r="1.8" fill="${visorHex}" opacity="0.28"/>
  <circle cx="74" cy="196" r="1.3" fill="${visorHex}" opacity="0.18"/>
  <circle cx="186" cy="172" r="1.5" fill="${visorHex}" opacity="0.22"/>
</svg>`;
}

// ─── SIGIL GENERATOR ────────────────────────────────────────────────────────

function makeSigil({ id, shapeFunc, color1, color2, bgHex1 }) {
  const c2 = color2 || lighten(color1, 0.3);
  const bg2 = '#07090e';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg-${id}" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${tint(bgHex1,0.3)}"/>
      <stop offset="65%" stop-color="${tint(bgHex1,0.12)}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </radialGradient>
    <radialGradient id="ambi-${id}" cx="50%" cy="50%" r="42%">
      <stop offset="0%" stop-color="${color1}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${color1}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shape-${id}" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="${lighten(color1,0.3)}"/>
      <stop offset="50%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${darken(c2,0.1)}"/>
    </linearGradient>
    <radialGradient id="inner-${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${lighten(color1,0.6)}" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="${color1}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${color1}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow-${id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="blur-${id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <filter id="noise-${id}">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="n"/>
      <feColorMatrix type="saturate" values="0" in="n" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="overlay"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="256" height="256" fill="url(#bg-${id})"/>
  <rect width="256" height="256" fill="${tint(bgHex1,0.07)}" filter="url(#noise-${id})" opacity="0.12"/>

  <!-- Ambient glow -->
  <ellipse cx="128" cy="128" rx="78" ry="78" fill="url(#ambi-${id})"/>

  ${shapeFunc({ id, color1, c2 })}

  <!-- Particles -->
  <circle cx="58" cy="62" r="2.5" fill="${color1}" opacity="0.4"/>
  <circle cx="192" cy="72" r="2" fill="${c2}" opacity="0.35"/>
  <circle cx="44" cy="150" r="1.8" fill="${color1}" opacity="0.3"/>
  <circle cx="210" cy="58" r="2.2" fill="${c2}" opacity="0.32"/>
  <circle cx="72" cy="196" r="1.6" fill="${color1}" opacity="0.28"/>
  <circle cx="186" cy="180" r="2" fill="${c2}" opacity="0.25"/>
  <circle cx="40" cy="90" r="1.4" fill="${color1}" opacity="0.2"/>
  <circle cx="216" cy="170" r="1.5" fill="${c2}" opacity="0.22"/>
</svg>`;
}

// ─── SIGIL SHAPE FUNCTIONS ───────────────────────────────────────────────────

function sigilConcentric({ id, color1, c2 }) {
  return `
  <!-- Outer glow ring -->
  <circle cx="128" cy="128" r="72" fill="none" stroke="${color1}" stroke-width="4" opacity="0.15" filter="url(#blur-${id})"/>
  <circle cx="128" cy="128" r="72" fill="none" stroke="${color1}" stroke-width="2" opacity="0.4"/>
  <circle cx="128" cy="128" r="58" fill="none" stroke="${c2}" stroke-width="2" opacity="0.5"/>
  <circle cx="128" cy="128" r="44" fill="none" stroke="${color1}" stroke-width="2.5" opacity="0.65"/>
  <circle cx="128" cy="128" r="30" fill="none" stroke="${c2}" stroke-width="3" opacity="0.8"/>
  <circle cx="128" cy="128" r="30" fill="none" stroke="${c2}" stroke-width="8" opacity="0.3" filter="url(#blur-${id})"/>
  <circle cx="128" cy="128" r="16" fill="url(#inner-${id})" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="6" fill="${lighten(color1,0.6)}"/>
  <!-- Cross hairs -->
  <line x1="128" y1="56" x2="128" y2="72" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="128" y1="184" x2="128" y2="200" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="56" y1="128" x2="72" y2="128" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="184" y1="128" x2="200" y2="128" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>`;
}

function sigilTriangle({ id, color1, c2 }) {
  return `
  <!-- Outer glow triangle -->
  <polygon points="128,52 196,164 60,164" fill="${color1}" opacity="0.08" filter="url(#blur-${id})"/>
  <polygon points="128,52 196,164 60,164" fill="none" stroke="${color1}" stroke-width="2.5" opacity="0.5"/>
  <polygon points="128,66 184,158 72,158" fill="none" stroke="${c2}" stroke-width="2" opacity="0.6"/>
  <polygon points="128,80 172,152 84,152" fill="none" stroke="${color1}" stroke-width="2" opacity="0.7"/>
  <!-- Inner filled triangle -->
  <polygon points="128,96 160,146 96,146" fill="url(#shape-${id})" filter="url(#glow-${id})" opacity="0.9"/>
  <polygon points="128,96 160,146 96,146" fill="url(#inner-${id})"/>
  <!-- Center dot -->
  <circle cx="128" cy="128" r="8" fill="${lighten(color1,0.5)}" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="3" fill="white" opacity="0.8"/>
  <!-- Corner glows -->
  <circle cx="128" cy="52" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.8"/>
  <circle cx="196" cy="164" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.8"/>
  <circle cx="60" cy="164" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.8"/>`;
}

function sigilDiamond({ id, color1, c2 }) {
  return `
  <!-- Outer glow diamond -->
  <polygon points="128,48 192,128 128,208 64,128" fill="${color1}" opacity="0.08" filter="url(#blur-${id})"/>
  <polygon points="128,48 192,128 128,208 64,128" fill="none" stroke="${color1}" stroke-width="2.5" opacity="0.4"/>
  <polygon points="128,64 180,128 128,192 76,128" fill="none" stroke="${c2}" stroke-width="2" opacity="0.55"/>
  <polygon points="128,80 168,128 128,176 88,128" fill="none" stroke="${color1}" stroke-width="2" opacity="0.7"/>
  <!-- Inner filled diamond -->
  <polygon points="128,96 156,128 128,160 100,128" fill="url(#shape-${id})" filter="url(#glow-${id})"/>
  <polygon points="128,96 156,128 128,160 100,128" fill="url(#inner-${id})"/>
  <!-- Axes -->
  <line x1="128" y1="48" x2="128" y2="96" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="128" y1="160" x2="128" y2="208" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="64" y1="128" x2="100" y2="128" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <line x1="156" y1="128" x2="192" y2="128" stroke="${color1}" stroke-width="1.5" opacity="0.5"/>
  <circle cx="128" cy="128" r="6" fill="${lighten(color1,0.6)}" filter="url(#glow-${id})"/>`;
}

function sigilCrescent({ id, color1, c2 }) {
  return `
  <!-- Moon crescent -->
  <circle cx="128" cy="128" r="68" fill="${color1}" opacity="0.07" filter="url(#blur-${id})"/>
  <circle cx="128" cy="128" r="62" fill="none" stroke="${color1}" stroke-width="2" opacity="0.3"/>
  <!-- Crescent shape via two circles -->
  <circle cx="128" cy="128" r="52" fill="url(#shape-${id})" opacity="0.9" filter="url(#glow-${id})"/>
  <circle cx="148" cy="118" r="42" fill="${tint(color1,0.05)}"/>
  <circle cx="148" cy="118" r="42" fill="#07090e" opacity="0.92"/>
  <!-- Crescent outline -->
  <circle cx="128" cy="128" r="52" fill="none" stroke="${lighten(color1,0.3)}" stroke-width="1.5" opacity="0.6"/>
  <!-- Stars near crescent -->
  <circle cx="162" cy="82" r="4" fill="${c2}" filter="url(#glow-${id})" opacity="0.9"/>
  <circle cx="176" cy="102" r="2.5" fill="${c2}" filter="url(#glow-${id})" opacity="0.7"/>
  <circle cx="170" cy="68" r="2" fill="${lighten(c2,0.4)}" opacity="0.6"/>
  <!-- Inner glow core -->
  <circle cx="110" cy="128" r="20" fill="url(#inner-${id})" opacity="0.5"/>`;
}

function sigilStarburst({ id, color1, c2 }) {
  // 8-pointed star via two rotated squares
  const star8 = (cx, cy, r1, r2) => {
    let pts = [];
    for (let i=0;i<16;i++) {
      const r = i%2===0 ? r1 : r2;
      const a = (i*22.5 - 90) * Math.PI/180;
      pts.push(`${(cx+r*Math.cos(a)).toFixed(2)},${(cy+r*Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  };
  return `
  <!-- Outer glow star -->
  <polygon points="${star8(128,128,78,54)}" fill="${color1}" opacity="0.07" filter="url(#blur-${id})"/>
  <polygon points="${star8(128,128,70,46)}" fill="none" stroke="${color1}" stroke-width="2" opacity="0.3"/>
  <polygon points="${star8(128,128,62,40)}" fill="none" stroke="${c2}" stroke-width="1.5" opacity="0.5"/>
  <!-- Main star -->
  <polygon points="${star8(128,128,54,32)}" fill="url(#shape-${id})" filter="url(#glow-${id})" opacity="0.95"/>
  <polygon points="${star8(128,128,54,32)}" fill="url(#inner-${id})"/>
  <!-- Center -->
  <circle cx="128" cy="128" r="14" fill="${lighten(color1,0.4)}" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="6" fill="${lighten(color1,0.7)}"/>
  <circle cx="128" cy="128" r="2.5" fill="white" opacity="0.9"/>`;
}

function sigilHexOrbit({ id, color1, c2 }) {
  const hexPts = (cx, cy, r) => {
    let pts = [];
    for (let i=0;i<6;i++) {
      const a = (i*60-30)*Math.PI/180;
      pts.push(`${(cx+r*Math.cos(a)).toFixed(2)},${(cy+r*Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  };
  return `
  <!-- Outer glow hex -->
  <polygon points="${hexPts(128,128,76)}" fill="${color1}" opacity="0.07" filter="url(#blur-${id})"/>
  <polygon points="${hexPts(128,128,70)}" fill="none" stroke="${color1}" stroke-width="2" opacity="0.3"/>
  <polygon points="${hexPts(128,128,58)}" fill="none" stroke="${c2}" stroke-width="2" opacity="0.5"/>
  <!-- Main hex -->
  <polygon points="${hexPts(128,128,46)}" fill="url(#shape-${id})" filter="url(#glow-${id})" opacity="0.9"/>
  <polygon points="${hexPts(128,128,46)}" fill="url(#inner-${id})"/>
  <!-- Orbit ring -->
  <circle cx="128" cy="128" r="88" fill="none" stroke="${color1}" stroke-width="1.5" stroke-dasharray="6 8" opacity="0.4"/>
  <!-- Orbit dots -->
  <circle cx="128" cy="40" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.9"/>
  <circle cx="204" cy="84" r="4" fill="${c2}" filter="url(#glow-${id})" opacity="0.75"/>
  <circle cx="204" cy="172" r="3.5" fill="${c2}" opacity="0.6"/>
  <circle cx="128" cy="216" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.9"/>
  <circle cx="52" cy="172" r="4" fill="${c2}" opacity="0.6"/>
  <circle cx="52" cy="84" r="3.5" fill="${c2}" filter="url(#glow-${id})" opacity="0.75"/>
  <!-- Center -->
  <circle cx="128" cy="128" r="10" fill="${lighten(color1,0.5)}" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="4" fill="white" opacity="0.8"/>`;
}

function sigilWave({ id, color1, c2 }) {
  return `
  <!-- Sine wave sigil / hypercube -->
  <circle cx="128" cy="128" r="78" fill="none" stroke="${color1}" stroke-width="2" opacity="0.18" filter="url(#blur-${id})"/>
  <circle cx="128" cy="128" r="68" fill="none" stroke="${color1}" stroke-width="1.5" opacity="0.28"/>
  <!-- Wave path -->
  <path d="M46,128 C60,88 76,88 90,128 C104,168 120,168 134,128 C148,88 164,88 178,128 C192,168 208,168 210,128"
    fill="none" stroke="${color1}" stroke-width="3.5" stroke-linecap="round" filter="url(#glow-${id})" opacity="0.9"/>
  <path d="M46,128 C60,88 76,88 90,128 C104,168 120,168 134,128 C148,88 164,88 178,128 C192,168 208,168 210,128"
    fill="none" stroke="${lighten(color1,0.5)}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
  <!-- Second wave, offset -->
  <path d="M46,118 C60,78 76,78 90,118 C104,158 120,158 134,118 C148,78 164,78 178,118 C192,158 208,158 210,118"
    fill="none" stroke="${c2}" stroke-width="1.5" stroke-linecap="round" opacity="0.4" stroke-dasharray="4 5"/>
  <path d="M46,138 C60,98 76,98 90,138 C104,178 120,178 134,138 C148,98 164,98 178,138 C192,178 208,178 210,138"
    fill="none" stroke="${c2}" stroke-width="1.5" stroke-linecap="round" opacity="0.4" stroke-dasharray="4 5"/>
  <!-- Center node -->
  <circle cx="128" cy="128" r="10" fill="url(#inner-${id})" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="4" fill="white" opacity="0.8"/>`;
}

function sigilSpiral({ id, color1, c2 }) {
  // Golden spiral approximated with arcs
  return `
  <!-- Outer glow -->
  <circle cx="128" cy="128" r="76" fill="${color1}" opacity="0.07" filter="url(#blur-${id})"/>
  <circle cx="128" cy="128" r="70" fill="none" stroke="${color1}" stroke-width="2" opacity="0.25"/>
  <!-- Spiral arcs (golden ratio approximation) -->
  <path d="M128,56 A72,72 0 0,1 200,128 A44,44 0 0,1 156,172 A27,27 0 0,1 129,145 A16,16 0 0,1 144,129 A10,10 0 0,1 134,119 A6,6 0 0,1 128,125"
    fill="none" stroke="url(#shape-${id})" stroke-width="3" stroke-linecap="round" filter="url(#glow-${id})" opacity="0.9"/>
  <path d="M128,56 A72,72 0 0,1 200,128 A44,44 0 0,1 156,172 A27,27 0 0,1 129,145 A16,16 0 0,1 144,129 A10,10 0 0,1 134,119 A6,6 0 0,1 128,125"
    fill="none" stroke="${lighten(color1,0.5)}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
  <!-- Rectangle guides (subtle) -->
  <rect x="56" y="56" width="144" height="144" fill="none" stroke="${color1}" stroke-width="0.8" opacity="0.15"/>
  <rect x="56" y="56" width="88" height="88" fill="none" stroke="${c2}" stroke-width="0.8" opacity="0.15"/>
  <rect x="56" y="56" width="54" height="54" fill="none" stroke="${color1}" stroke-width="0.8" opacity="0.12"/>
  <!-- Core -->
  <circle cx="128" cy="128" r="8" fill="url(#inner-${id})" filter="url(#glow-${id})"/>
  <circle cx="128" cy="128" r="3.5" fill="white" opacity="0.8"/>
  <!-- Corner accent -->
  <circle cx="200" cy="128" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.8"/>
  <circle cx="128" cy="56" r="5" fill="${c2}" filter="url(#glow-${id})" opacity="0.8"/>`;
}

// ─── ACCESSORY SVGs ──────────────────────────────────────────────────────────

function scrollAccessory(rimHex) {
  return `<g transform="translate(96,170)">
    <rect x="0" y="0" width="64" height="20" rx="4" fill="#2a1f10" opacity="0.8"/>
    <rect x="4" y="3" width="56" height="14" rx="2" fill="#c8a060" opacity="0.3"/>
    <line x1="8" y1="8" x2="56" y2="8" stroke="${rimHex}" stroke-width="1" opacity="0.5"/>
    <line x1="8" y1="12" x2="40" y2="12" stroke="${rimHex}" stroke-width="1" opacity="0.4"/>
    <circle cx="2" cy="10" r="4" fill="#5a3a18"/>
    <circle cx="62" cy="10" r="4" fill="#5a3a18"/>
  </g>`;
}

function glassesAccessory(rimHex) {
  return `<g opacity="0.85">
    <circle cx="112" cy="108" r="12" fill="none" stroke="${rimHex}" stroke-width="1.8"/>
    <circle cx="144" cy="108" r="12" fill="none" stroke="${rimHex}" stroke-width="1.8"/>
    <line x1="124" y1="108" x2="132" y2="108" stroke="${rimHex}" stroke-width="1.5"/>
    <line x1="100" y1="106" x2="94" y2="104" stroke="${rimHex}" stroke-width="1.2"/>
    <line x1="156" y1="106" x2="162" y2="104" stroke="${rimHex}" stroke-width="1.2"/>
  </g>`;
}

function compassAccessory(rimHex) {
  return `<g transform="translate(154,154)">
    <circle cx="20" cy="20" r="20" fill="#1a1410" opacity="0.8"/>
    <circle cx="20" cy="20" r="16" fill="none" stroke="${rimHex}" stroke-width="1.2" opacity="0.6"/>
    <line x1="20" y1="6" x2="20" y2="34" stroke="${rimHex}" stroke-width="1.2" opacity="0.5"/>
    <line x1="6" y1="20" x2="34" y2="20" stroke="${rimHex}" stroke-width="1.2" opacity="0.5"/>
    <polygon points="20,8 23,20 20,18 17,20" fill="${rimHex}" opacity="0.9"/>
  </g>`;
}

function telescopeAccessory(rimHex) {
  return `<g transform="translate(80,164)" opacity="0.85">
    <rect x="0" y="8" width="60" height="10" rx="5" fill="#1e2430"/>
    <rect x="2" y="9" width="56" height="8" rx="4" fill="none" stroke="${rimHex}" stroke-width="1" opacity="0.5"/>
    <rect x="52" y="4" width="16" height="18" rx="6" fill="#161c26"/>
    <circle cx="68" cy="13" r="8" fill="${rimHex}" opacity="0.5" filter="url(#soft-${rimHex.replace('#','').substring(0,4)})"/>
    <circle cx="68" cy="13" r="4" fill="${rimHex}" opacity="0.8"/>
  </g>`;
}

function bookAccessory(rimHex) {
  return `<g transform="translate(94,168)" opacity="0.85">
    <rect x="0" y="0" width="68" height="22" rx="3" fill="#1a1218"/>
    <rect x="2" y="2" width="30" height="18" rx="2" fill="#2a1a2e"/>
    <rect x="34" y="2" width="30" height="18" rx="2" fill="#2a1a2e"/>
    <line x1="32" y1="2" x2="32" y2="20" stroke="${rimHex}" stroke-width="1.5" opacity="0.6"/>
    <line x1="8" y1="8" x2="28" y2="8" stroke="${rimHex}" stroke-width="0.8" opacity="0.4"/>
    <line x1="8" y1="12" x2="24" y2="12" stroke="${rimHex}" stroke-width="0.8" opacity="0.4"/>
    <line x1="38" y1="8" x2="58" y2="8" stroke="${rimHex}" stroke-width="0.8" opacity="0.4"/>
  </g>`;
}

function potionAccessory(rimHex) {
  return `<g transform="translate(154,154)" opacity="0.9">
    <path d="M12,36 Q4,30 4,22 Q4,10 20,10 Q36,10 36,22 Q36,30 28,36 Z" fill="#1a2820"/>
    <path d="M12,36 Q4,30 4,22 Q4,10 20,10 Q36,10 36,22 Q36,30 28,36 Z" fill="${rimHex}" opacity="0.3"/>
    <rect x="15" y="4" width="10" height="8" rx="3" fill="#141e1c"/>
    <ellipse cx="12" cy="22" rx="4" ry="3" fill="${rimHex}" opacity="0.6"/>
    <ellipse cx="22" cy="28" rx="3" ry="2" fill="${rimHex}" opacity="0.5"/>
  </g>`;
}

function quillAccessory(rimHex) {
  return `<g transform="translate(146,60)" opacity="0.85">
    <path d="M0,80 Q10,40 30,0" stroke="${rimHex}" stroke-width="1.5" fill="none" opacity="0.7"/>
    <path d="M30,0 Q20,20 10,30 Q18,16 28,4 Q22,22 14,38" stroke="${rimHex}" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M0,80 L4,78" stroke="${rimHex}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  </g>`;
}

function crownAccessory(rimHex) {
  return `<g transform="translate(96,66)" opacity="0.85">
    <polygon points="32,20 10,0 0,16 10,10 20,0 32,16 44,0 54,10 64,16 54,0" fill="none" stroke="${rimHex}" stroke-width="1.8" stroke-linejoin="round"/>
    <polygon points="32,20 10,0 0,16 10,10 20,0 32,16 44,0 54,10 64,16 54,0" fill="${rimHex}" opacity="0.2"/>
    <circle cx="20" cy="2" r="3" fill="${rimHex}" opacity="0.9"/>
    <circle cx="32" cy="0" r="3.5" fill="${rimHex}" opacity="0.9"/>
    <circle cx="44" cy="2" r="3" fill="${rimHex}" opacity="0.9"/>
  </g>`;
}

function mapAccessory(rimHex) {
  return `<g transform="translate(94,168)" opacity="0.85">
    <rect x="0" y="0" width="68" height="22" rx="3" fill="#1a1610"/>
    <line x1="8" y1="6" x2="60" y2="6" stroke="${rimHex}" stroke-width="0.8" opacity="0.3"/>
    <path d="M20,6 Q16,14 24,18" fill="none" stroke="${rimHex}" stroke-width="1" opacity="0.5"/>
    <path d="M36,6 Q44,14 36,18" fill="none" stroke="${rimHex}" stroke-width="1" opacity="0.5"/>
    <circle cx="34" cy="12" r="3" fill="${rimHex}" opacity="0.5"/>
  </g>`;
}

function hourglassAccessory(rimHex) {
  return `<g transform="translate(154,152)" opacity="0.9">
    <path d="M4,0 L36,0 L28,20 L36,40 L4,40 L12,20 Z" fill="#1a1a24"/>
    <path d="M4,0 L36,0 L28,20 L36,40 L4,40 L12,20 Z" fill="none" stroke="${rimHex}" stroke-width="1.5"/>
    <ellipse cx="20" cy="20" rx="6" ry="4" fill="${rimHex}" opacity="0.7"/>
    <line x1="4" y1="0" x2="36" y2="0" stroke="${rimHex}" stroke-width="2.5" opacity="0.6"/>
    <line x1="4" y1="40" x2="36" y2="40" stroke="${rimHex}" stroke-width="2.5" opacity="0.6"/>
  </g>`;
}

function swordAccessory(rimHex) {
  return `<g transform="translate(152,60)" opacity="0.8">
    <line x1="10" y1="0" x2="10" y2="90" stroke="${rimHex}" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="10" y1="0" x2="10" y2="90" stroke="${lighten(rimHex,0.4)}" stroke-width="1" opacity="0.5"/>
    <line x1="0" y1="70" x2="20" y2="70" stroke="${rimHex}" stroke-width="3" stroke-linecap="round"/>
    <polygon points="10,0 7,8 13,8" fill="${lighten(rimHex,0.5)}"/>
  </g>`;
}

function daggerAccessory(rimHex) {
  return `<g transform="translate(152,64)" opacity="0.8">
    <path d="M10,0 L14,60 L10,70 L6,60 Z" fill="${rimHex}" opacity="0.7"/>
    <path d="M10,0 L14,60 L10,70 L6,60 Z" fill="none" stroke="${lighten(rimHex,0.4)}" stroke-width="0.8"/>
    <line x1="2" y1="58" x2="18" y2="58" stroke="${rimHex}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="6" y="68" width="8" height="16" rx="3" fill="#2a2010"/>
  </g>`;
}

function wandAccessory(rimHex) {
  return `<g transform="translate(150,62)" opacity="0.85">
    <line x1="10" y1="0" x2="10" y2="82" stroke="#3a2a18" stroke-width="4" stroke-linecap="round"/>
    <circle cx="10" cy="4" r="8" fill="${rimHex}" opacity="0.8" filter="url(#glow-${rimHex.replace('#','x')})"/>
    <circle cx="10" cy="4" r="4" fill="${lighten(rimHex,0.5)}"/>
    <circle cx="10" cy="4" r="1.5" fill="white" opacity="0.9"/>
  </g>`;
}

function flaskAccessory(rimHex) {
  return `<g transform="translate(154,152)" opacity="0.9">
    <path d="M12,0 L12,20 Q2,28 2,38 Q2,48 20,48 Q38,48 38,38 Q38,28 28,20 L28,0 Z" fill="#141e18"/>
    <path d="M12,0 L12,20 Q2,28 2,38 Q2,48 20,48 Q38,48 38,38 Q38,28 28,20 L28,0 Z" fill="${rimHex}" opacity="0.25"/>
    <path d="M12,0 L12,20 Q2,28 2,38 Q2,48 20,48 Q38,48 38,38 Q38,28 28,20 L28,0 Z" fill="none" stroke="${rimHex}" stroke-width="1.5"/>
    <line x1="10" y1="0" x2="30" y2="0" stroke="${rimHex}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
    <ellipse cx="20" cy="38" rx="10" ry="6" fill="${rimHex}" opacity="0.5"/>
  </g>`;
}

// ─── AVATAR DEFINITIONS ──────────────────────────────────────────────────────

const SCHOLARS = [
  { name: 'sage1',   skin: ['#deb887','#c8956a'], hair: '#f0e8d0', rim: '#e8a030', eye: '#e8a030', bg: '#c87820', feminine: false, aged: true,  sq: false, acc: (r)=>scrollAccessory(r)+glassesAccessory(r), path: 'scholars/sage1.svg' },
  { name: 'cipher',  skin: ['#c8835a','#9e6040'], hair: '#1a2a3a', rim: '#00d4d4', eye: '#00d4d4', bg: '#008888', feminine: false, aged: false, sq: false, acc: (r)=>glassesAccessory(r), path: 'scholars/cipher.svg' },
  { name: 'aura',    skin: ['#f8d5be','#e8b898'], hair: '#4a1830', rim: '#ff8aaa', eye: '#ff6090', bg: '#c84080', feminine: true,  aged: false, sq: false, acc: (r)=>bookAccessory(r), path: 'scholars/aura.svg' },
  { name: 'raven',   skin: ['#8b5e3c','#6b3e1c'], hair: '#0a080e', rim: '#a040c0', eye: '#8830c0', bg: '#5a1888', feminine: false, aged: false, sq: false, acc: (r)=>quillAccessory(r), path: 'scholars/raven.svg' },
  { name: 'atlas',   skin: ['#c8835a','#9e6040'], hair: '#3a2010', rim: '#d2622a', eye: '#d2622a', bg: '#a04020', feminine: false, aged: false, sq: true,  acc: (r)=>mapAccessory(r), path: 'scholars/atlas.svg' },
  { name: 'zenith',  skin: ['#deb887','#c8956a'], hair: '#1a2850', rim: '#4090e8', eye: '#4090e8', bg: '#1850c0', feminine: false, aged: false, sq: false, acc: (r)=>telescopeAccessory(r), path: 'scholars/zenith.svg' },
  { name: 'orion',   skin: ['#7a5940','#5a3920'], hair: '#0a0c18', rim: '#3060c8', eye: '#3060c8', bg: '#102080', feminine: false, aged: false, sq: true,  acc: (r)=>telescopeAccessory(r), path: 'scholars/orion.svg' },
  { name: 'lyra',    skin: ['#f8d5be','#e8b898'], hair: '#5a2060', rim: '#c080e8', eye: '#c080e8', bg: '#7030b0', feminine: true,  aged: false, sq: false, acc: (r)=>bookAccessory(r), path: 'scholars/lyra.svg' },
  { name: 'kaelen',  skin: ['#c8835a','#9e6040'], hair: '#2a1808', rim: '#c87020', eye: '#c87020', bg: '#8a4c10', feminine: false, aged: false, sq: false, acc: (r)=>scrollAccessory(r), path: 'scholars/kaelen.svg' },
  { name: 'nova',    skin: ['#f8d5be','#e8b898'], hair: '#c89020', rim: '#e8b830', eye: '#e8b830', bg: '#c08010', feminine: true,  aged: false, sq: false, acc: (r)=>quillAccessory(r), path: 'scholars/nova.svg' },
  { name: 'vesper',  skin: ['#8b5e3c','#6b3e1c'], hair: '#0a1408', rim: '#20c060', eye: '#20c060', bg: '#108040', feminine: false, aged: false, sq: false, acc: (r)=>bookAccessory(r), path: 'scholars/vesper.svg' },
  { name: 'rowan',   skin: ['#deb887','#c8956a'], hair: '#3a2a10', rim: '#80a020', eye: '#80a020', bg: '#506010', feminine: false, aged: true,  sq: false, acc: (r)=>scrollAccessory(r), path: 'scholars/rowan.svg' },
];

const ADVENTURERS = [
  { name: 'alchemist', skin: ['#deb887','#c8956a'], hair: '#1a2808', rim: '#90c820', eye: '#90c820', bg: '#608010', feminine: false, aged: false, sq: false, acc: (r)=>flaskAccessory(r)+potionAccessory(r), path: 'adventurers/alchemist.svg' },
  { name: 'novelist',  skin: ['#c8835a','#9e6040'], hair: '#4a3020', rim: '#c8905a', eye: '#c8905a', bg: '#7a5030', feminine: false, aged: true,  sq: false, acc: (r)=>bookAccessory(r)+quillAccessory(r), path: 'adventurers/novelist.svg' },
  { name: 'tactician', skin: ['#f8d5be','#e8b898'], hair: '#808090', rim: '#c0c8d8', eye: '#c0c8d8', bg: '#6878a0', feminine: false, aged: true,  sq: true,  acc: (r)=>glassesAccessory(r), path: 'adventurers/tactician.svg' },
  { name: 'oracle',    skin: ['#8b5e3c','#6b3e1c'], hair: '#1a0a28', rim: '#9050d8', eye: '#9050d8', bg: '#5020a8', feminine: true,  aged: false, sq: false, acc: (r)=>crownAccessory(r), path: 'adventurers/oracle.svg' },
  { name: 'vanguard',  skin: ['#7a5940','#5a3920'], hair: '#1a2838', rim: '#4080c0', eye: '#4080c0', bg: '#204880', feminine: false, aged: false, sq: true,  acc: (r)=>swordAccessory(r), path: 'adventurers/vanguard.svg' },
  { name: 'chronos',   skin: ['#deb887','#c8956a'], hair: '#2a1808', rim: '#c87830', eye: '#c87830', bg: '#805020', feminine: false, aged: true,  sq: false, acc: (r)=>hourglassAccessory(r), path: 'adventurers/chronos.svg' },
  { name: 'shinobi',   skin: ['#7a5940','#5a3920'], hair: '#0a0808', rim: '#c82030', eye: '#c82030', bg: '#880818', feminine: false, aged: false, sq: false, acc: (r)=>daggerAccessory(r), path: 'adventurers/shinobi.svg' },
  { name: 'sorcerer',  skin: ['#c8835a','#9e6040'], hair: '#1a0808', rim: '#e05020', eye: '#e05020', bg: '#a02808', feminine: false, aged: false, sq: false, acc: (r)=>wandAccessory(r), path: 'adventurers/sorcerer.svg' },
  { name: 'paladin',   skin: ['#f8d5be','#e8b898'], hair: '#c8c8e0', rim: '#e0e8f8', eye: '#d0e0f8', bg: '#8898c8', feminine: false, aged: false, sq: true,  acc: (r)=>crownAccessory(r)+swordAccessory(r), path: 'adventurers/paladin.svg' },
  { name: 'ranger',    skin: ['#8b5e3c','#6b3e1c'], hair: '#1a2808', rim: '#288040', eye: '#288040', bg: '#104828', feminine: false, aged: false, sq: false, acc: (r)=>compassAccessory(r), path: 'adventurers/ranger.svg' },
  { name: 'glitch',    skin: ['#c8835a','#9e6040'], hair: '#0a0a1a', rim: '#e020e0', eye: '#e020e0', bg: '#800880', feminine: true,  aged: false, sq: false, acc: (r)=>glassesAccessory(r), path: 'adventurers/glitch.svg' },
  { name: 'explorer',  skin: ['#f8d5be','#e8b898'], hair: '#a0b8d0', rim: '#40c8d8', eye: '#40c8d8', bg: '#1888a8', feminine: true,  aged: false, sq: false, acc: (r)=>compassAccessory(r)+mapAccessory(r), path: 'adventurers/explorer.svg' },
];

const ROBOTS = [
  { name: 'quantum-core',   visor: '#00e8ff', visor2: '#80f8ff', bg: '#005880', path: 'cybernetic/quantum-core.svg' },
  { name: 'cyber-zen',      visor: '#e8b040', visor2: '#f8d080', bg: '#806020', path: 'cybernetic/cyber-zen.svg' },
  { name: 'neuro-byte',     visor: '#20e060', visor2: '#80f8a0', bg: '#086030', path: 'cybernetic/neuro-byte.svg' },
  { name: 'echo-protocol',  visor: '#a040e8', visor2: '#d090f8', bg: '#400880', path: 'cybernetic/echo-protocol.svg' },
  { name: 'matrix-soul',    visor: '#e040a0', visor2: '#f890d0', bg: '#800848', path: 'cybernetic/matrix-soul.svg' },
  { name: 'axiom',          visor: '#e0eaf8', visor2: '#ffffff', bg: '#5868a0', path: 'cybernetic/axiom.svg' },
];

const SIGILS = [
  { name: 'focus',       shapeFunc: sigilConcentric, color1: '#e8a030', color2: '#f8d060', bg: '#805010', path: 'sigils/focus.svg' },
  { name: 'catalyst',    shapeFunc: sigilTriangle,   color1: '#e06818', color2: '#f8b040', bg: '#882808', path: 'sigils/catalyst.svg' },
  { name: 'vector',      shapeFunc: sigilDiamond,    color1: '#28c060', color2: '#80f0a0', bg: '#086030', path: 'sigils/vector.svg' },
  { name: 'prism',       shapeFunc: sigilCrescent,   color1: '#60d0f0', color2: '#c0f0ff', bg: '#086080', path: 'sigils/prism.svg' },
  { name: 'eclipse',     shapeFunc: sigilStarburst,  color1: '#e8c020', color2: '#fff080', bg: '#806000', path: 'sigils/eclipse.svg' },
  { name: 'nexus-orbit', shapeFunc: sigilHexOrbit,   color1: '#20d0e8', color2: '#80f8ff', bg: '#005878', path: 'sigils/nexus-orbit.svg' },
  { name: 'hypercube',   shapeFunc: sigilWave,       color1: '#40e0c0', color2: '#90f8e0', bg: '#006858', path: 'sigils/hypercube.svg' },
  { name: 'monolith',    shapeFunc: sigilSpiral,     color1: '#a060e8', color2: '#d0a0f8', bg: '#400888', path: 'sigils/monolith.svg' },
];

// ─── WRITE FILES ─────────────────────────────────────────────────────────────

let count = 0;

for (const s of SCHOLARS) {
  const svg = makePortrait({
    id: s.name,
    skinBase: s.skin[0],
    skinHighlight: s.skin[1] > s.skin[0] ? s.skin[1] : s.skin[1],
    hairColor: s.hair,
    rimHex: s.rim,
    eyeHex: s.eye,
    bgHex1: s.bg,
    bgHex2: '#07090e',
    accessorySvg: s.acc(s.rim),
    feminine: s.feminine,
    aged: s.aged,
    squareJaw: s.sq,
  });
  const outPath = path.join(ROOT, 'public/images/avatars', s.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, 'utf8');
  count++;
  console.log(`✓ ${s.path} (${svg.length} bytes)`);
}

for (const a of ADVENTURERS) {
  const svg = makePortrait({
    id: a.name,
    skinBase: a.skin[0],
    skinHighlight: a.skin[1],
    hairColor: a.hair,
    rimHex: a.rim,
    eyeHex: a.eye,
    bgHex1: a.bg,
    bgHex2: '#07090e',
    accessorySvg: a.acc(a.rim),
    feminine: a.feminine,
    aged: a.aged,
    squareJaw: a.sq,
  });
  const outPath = path.join(ROOT, 'public/images/avatars', a.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, 'utf8');
  count++;
  console.log(`✓ ${a.path} (${svg.length} bytes)`);
}

for (const r of ROBOTS) {
  const svg = makeRobot({
    id: r.name,
    visorHex: r.visor,
    visorHex2: r.visor2,
    bgHex1: r.bg,
    bgHex2: '#07090e',
  });
  const outPath = path.join(ROOT, 'public/images/avatars', r.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, 'utf8');
  count++;
  console.log(`✓ ${r.path} (${svg.length} bytes)`);
}

for (const sg of SIGILS) {
  const svg = makeSigil({
    id: sg.name,
    shapeFunc: sg.shapeFunc,
    color1: sg.color1,
    color2: sg.color2,
    bgHex1: sg.bg,
  });
  const outPath = path.join(ROOT, 'public/images/avatars', sg.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, 'utf8');
  count++;
  console.log(`✓ ${sg.path} (${svg.length} bytes)`);
}

console.log(`\n✅ Done! Generated ${count} SVG avatars.`);
