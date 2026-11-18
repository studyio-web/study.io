import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AccessibilityBlocker } from '../src/lib/accessibility-blocker';

describe('Android Accessibility Blocker Interface Specification', () => {
  it('enables blocking mode and returns true', async () => {
    const enabled = await AccessibilityBlocker.enable();
    assert.strictEqual(enabled, true);
    const status = await AccessibilityBlocker.isEnabled();
    assert.strictEqual(status, true);
  });

  it('disables blocking mode and returns false', async () => {
    const enabled = await AccessibilityBlocker.disable();
    assert.strictEqual(enabled, false);
    const status = await AccessibilityBlocker.isEnabled();
    assert.strictEqual(status, false);
  });

  it('handles service check and settings navigation safely on web fallback', async () => {
    const isServiceEnabled = await AccessibilityBlocker.isServiceEnabled();
    assert.strictEqual(isServiceEnabled, false);

    const opened = await AccessibilityBlocker.openSettings();
    assert.strictEqual(opened, true);
  });
});
