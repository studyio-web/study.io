import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRemainingNudgeCooldownSeconds,
  formatNudgeCooldown,
  loadStoredNudgeTimestamps,
} from '../src/lib/nudge';

describe('Nudge Zero-Cooldown Behavior Specification', () => {
  it('guarantees getRemainingNudgeCooldownSeconds always returns 0 (no cooldown restriction)', () => {
    assert.equal(getRemainingNudgeCooldownSeconds(Date.now()), 0);
    assert.equal(getRemainingNudgeCooldownSeconds(Date.now() - 1000), 0);
    assert.equal(getRemainingNudgeCooldownSeconds(0), 0);
    assert.equal(getRemainingNudgeCooldownSeconds(), 0);
  });

  it('guarantees stored nudge timestamps return empty map', () => {
    const active = loadStoredNudgeTimestamps('room-alpha', 'user-123');
    assert.deepEqual(active, {});
  });

  it('formats remaining durations properly when 0', () => {
    assert.equal(formatNudgeCooldown(0), '');
    assert.equal(formatNudgeCooldown(-5), '');
  });
});
