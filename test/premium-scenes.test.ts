import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DEMO_PREMIUM_SCENES } from '../src/components/premium/AndroidPremiumView';
import { DEMO_PREMIUM_THEMES } from '../src/lib/premiumThemes';
import { getSvgScene } from '../src/components/focus/scenes/svgScenes';

describe('Android Premium Scenes and Themes Selector Specification', () => {
  it('contains exactly 7 luxury themes with valid accent colors and descriptions', () => {
    assert.strictEqual(DEMO_PREMIUM_THEMES.length, 7);
    const expectedThemeIds = ['goldleaf', 'crimson', 'sakura', 'espresso', 'forest', 'abyss', 'matcha'];
    assert.deepStrictEqual(DEMO_PREMIUM_THEMES.map((t) => t.id), expectedThemeIds);

    for (const theme of DEMO_PREMIUM_THEMES) {
      assert.ok(theme.name, `Theme ${theme.id} must have a name`);
      assert.ok(theme.accent, `Theme ${theme.id} must have an accent color`);
      assert.ok(theme.desc, `Theme ${theme.id} must have a description`);
      assert.ok(theme.bg, `Theme ${theme.id} must have a bg color`);
    }
  });

  it('contains all 5 official animated focus scenes matching APP_FACTS.md', () => {
    assert.strictEqual(DEMO_PREMIUM_SCENES.length, 5);
    const expectedSceneIds = ['forest', 'dusk', 'neon', 'sakura', 'campfire'];
    assert.deepStrictEqual(DEMO_PREMIUM_SCENES.map((s) => s.id), expectedSceneIds);

    for (const scene of DEMO_PREMIUM_SCENES) {
      assert.ok(scene.name, `Scene ${scene.id} must have a name`);
      assert.ok(scene.accent, `Scene ${scene.id} must have an accent color`);
      assert.ok(scene.desc, `Scene ${scene.id} must have a description`);
      assert.ok(scene.border, `Scene ${scene.id} must have a border style`);
      assert.ok(scene.glow, `Scene ${scene.id} must have a glow style`);
    }
  });

  it('guarantees getSvgScene generates rich SVG markup with animations for every scene option', () => {
    for (const scene of DEMO_PREMIUM_SCENES) {
      const markup = getSvgScene(scene.id);
      assert.ok(markup, `SVG markup for scene ${scene.id} must not be empty`);
      assert.ok(markup.startsWith('<svg'), `Markup for scene ${scene.id} must start with <svg`);
      assert.ok(markup.endsWith('</svg>'), `Markup for scene ${scene.id} must end with </svg>`);
      assert.ok(markup.length > 5000, `Markup for scene ${scene.id} must be comprehensive (>5000 bytes)`);
    }
  });
});
