import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStoredNudgeTimestamps,
  persistNudgeTimestamp,
  getRemainingNudgeCooldownSeconds,
  formatNudgeCooldown,
  THREE_HOURS_MS,
} from '../src/lib/nudge';

// In-memory mock for localStorage
const storageMock: Record<string, string> = {};
(globalThis as any).window = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => storageMock[key] ?? null,
  setItem: (key: string, val: string) => {
    storageMock[key] = String(val);
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    for (const k of Object.keys(storageMock)) delete storageMock[k];
  },
};

describe('Nudge Sender-Scoped 3-Hour Rate Limiting', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it('restricts only the sender who sent the nudge, not other users', () => {
    const userA = 'user-alice-111';
    const userB = 'user-bob-222'; // recipient
    const userC = 'user-charlie-333'; // third party
    const roomId = 'room-alpha';
    const now = Date.now();

    // User A nudges User B
    persistNudgeTimestamp(userB, roomId, now, userA);

    // Check User A's stored cooldowns
    const userACooldowns = loadStoredNudgeTimestamps(roomId, userA);
    assert.equal(userACooldowns[userB], now, 'User B must be on cooldown for sender User A');
    assert.ok(
      getRemainingNudgeCooldownSeconds(userACooldowns[userB]) > 0,
      'User A must have active remaining cooldown seconds towards User B'
    );

    // Check User C's stored cooldowns
    const userCCooldowns = loadStoredNudgeTimestamps(roomId, userC);
    assert.equal(
      userCCooldowns[userB],
      undefined,
      'User B must NOT be on cooldown for User C when User A nudged'
    );
    assert.equal(
      getRemainingNudgeCooldownSeconds(userCCooldowns[userB]),
      0,
      'User C must have 0s cooldown towards User B and be free to nudge'
    );
  });

  it('allows multiple senders to independently nudge the same recipient', () => {
    const userA = 'user-alice-111';
    const userB = 'user-bob-222'; // recipient
    const userC = 'user-charlie-333';
    const roomId = 'room-alpha';
    const now = Date.now();

    // User A nudges User B at t = 0
    persistNudgeTimestamp(userB, roomId, now, userA);

    // 10 minutes later, User C nudges User B at t = +10m
    const tenMinutesLater = now + 10 * 60 * 1000;
    persistNudgeTimestamp(userB, roomId, tenMinutesLater, userC);

    const aMap = loadStoredNudgeTimestamps(roomId, userA);
    const cMap = loadStoredNudgeTimestamps(roomId, userC);

    assert.equal(aMap[userB], now);
    assert.equal(cMap[userB], tenMinutesLater);

    // Each user maintains their own independent cooldown timer
    assert.notEqual(aMap[userB], cMap[userB]);
  });

  it('cleans up expired cooldowns older than 3 hours', () => {
    const userA = 'user-alice-111';
    const userB = 'user-bob-222';
    const roomId = 'room-alpha';
    const expiredTimestamp = Date.now() - (THREE_HOURS_MS + 5000);

    persistNudgeTimestamp(userB, roomId, expiredTimestamp, userA);

    const cooldowns = loadStoredNudgeTimestamps(roomId, userA);
    assert.equal(cooldowns[userB], undefined, 'Expired nudge (>3h) must not be returned');
    assert.equal(getRemainingNudgeCooldownSeconds(expiredTimestamp), 0);
  });

  it('correctly formats remaining cooldown durations', () => {
    assert.equal(formatNudgeCooldown(10800), '3h');
    assert.equal(formatNudgeCooldown(10740), '2h 59m');
    assert.equal(formatNudgeCooldown(3600), '1h');
    assert.equal(formatNudgeCooldown(1800), '30m');
    assert.equal(formatNudgeCooldown(45), '45s');
    assert.equal(formatNudgeCooldown(0), '');
  });
});
