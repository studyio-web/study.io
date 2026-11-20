export interface DemoPremiumTheme {
  id: string;
  name: string;
  bg: string;
  border: string;
  accent: string;
  text: string;
  progress: string;
  desc: string;
}

export const DEMO_PREMIUM_THEMES: DemoPremiumTheme[] = [
  {
    id: 'goldleaf',
    name: 'Gold Leaf',
    bg: '#0C0A06',
    border: 'rgba(230,193,90,0.35)',
    accent: '#E6C15A',
    text: '#F5E6A8',
    progress: '68%',
    desc: 'Warm gold on dark leather with luminous amber glow',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    bg: '#0E0809',
    border: 'rgba(229,72,77,0.35)',
    accent: '#E5484D',
    text: '#FFA1A6',
    progress: '84%',
    desc: 'Deep blood red on pitch black obsidian',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    bg: '#0E0A12',
    border: 'rgba(244,114,182,0.35)',
    accent: '#F472B6',
    text: '#FBCFE8',
    progress: '76%',
    desc: 'Delicate cherry blossoms on twilight ink',
  },
  {
    id: 'espresso',
    name: 'Espresso',
    bg: '#0E0B08',
    border: 'rgba(212,163,115,0.35)',
    accent: '#D4A373',
    text: '#FAEDCD',
    progress: '90%',
    desc: 'Warm roasted caramel on dark cocoa',
  },
  {
    id: 'forest',
    name: 'Forest',
    bg: '#070D0B',
    border: 'rgba(61,190,139,0.35)',
    accent: '#3DBE8B',
    text: '#A7F3D0',
    progress: '85%',
    desc: 'Calm moss green on deep midnight forest',
  },
  {
    id: 'abyss',
    name: 'OLED Abyss',
    bg: '#000000',
    border: 'rgba(255,255,255,0.3)',
    accent: '#FFFFFF',
    text: '#E5E7EB',
    progress: '95%',
    desc: 'True pitch black OLED for battery & laser focus',
  },
  {
    id: 'matcha',
    name: 'Matcha',
    bg: '#10170A',
    border: 'rgba(163,230,53,0.35)',
    accent: '#A3E635',
    text: '#ECFCCB',
    progress: '72%',
    desc: 'Creamy green tea warm pastel atmosphere',
  },
];
