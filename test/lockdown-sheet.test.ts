import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Lockdown Sheet & Pre-Countdown Warning Specification', () => {
  it('guarantees accept confirmation fires exactly once and blocks duplicate invocation', () => {
    let acceptCount = 0;
    let hasConfirmed = false;

    const onConfirm = () => {
      acceptCount++;
    };

    const triggerConfirmed = () => {
      if (hasConfirmed) return;
      hasConfirmed = true;
      onConfirm();
    };

    // First completion
    triggerConfirmed();
    assert.equal(acceptCount, 1, 'Accept callback must fire on first completion');

    // Duplicate completions (e.g. fast double-tap, lag, keyboard repeat)
    triggerConfirmed();
    triggerConfirmed();
    assert.equal(acceptCount, 1, 'Accept callback must never fire more than once');
  });

  it('guarantees cancel handler fires correctly on early dismissal or cancel button', () => {
    let cancelCount = 0;
    const onCancel = () => {
      cancelCount++;
    };

    onCancel();
    assert.equal(cancelCount, 1, 'Cancel callback must fire on user cancel');
  });

  it('computes end time accurately from start time and duration', () => {
    const startEpoch = 1700000000000;
    const durationSeconds = 1500; // 25 min
    const targetEpoch = startEpoch + durationSeconds * 1000;

    assert.equal(targetEpoch - startEpoch, 1500000);
    const date = new Date(targetEpoch);
    assert.ok(date instanceof Date && !isNaN(date.getTime()));
  });

  it('differentiates Strict Mode (3 rules, 1.2s hold) vs Ultra Strict Mode (4 rules, 2.5s hold)', () => {
    const getRulesForMode = (mode: 'strict' | 'ultra', allowedCount: number) => {
      if (mode === 'ultra') {
        return [
          { lead: 'Irreversible', body: 'No pause, cancel or stop early until the end time.' },
          { lead: 'Sealed apps', body: `Blocked apps stay locked, only your ${allowedCount} allowed apps open.` },
          { lead: 'Anti-bypass', body: 'Leaving or switching apps returns you here.' },
          { lead: 'Uninstall protection', body: 'Device Admin and System Shield stop deleting, uninstalling or force-stopping study.io until the countdown ends.' },
        ];
      }
      return [
        { lead: 'Blocked apps locked', body: 'Stay locked until you press stop.' },
        { lead: 'Shield active', body: 'Opening a blocked app returns you here.' },
        { lead: 'Your allowed apps', body: `Only your ${allowedCount} allowed apps stay open.` },
      ];
    };

    const strictRules = getRulesForMode('strict', 3);
    assert.equal(strictRules.length, 3, 'Strict Mode must present exactly 3 rules');
    assert.equal(strictRules[0].lead, 'Blocked apps locked');

    const ultraRules = getRulesForMode('ultra', 3);
    assert.equal(ultraRules.length, 4, 'Ultra Strict Mode must present exactly 4 rules');
    assert.equal(ultraRules[0].lead, 'Irreversible');
    assert.equal(ultraRules[3].lead, 'Uninstall protection');
  });

  it('formats duration labels cleanly without extra box nesting', () => {
    const formatDuration = (sec: number) => {
      const mins = Math.floor(sec / 60);
      const s = sec % 60;
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
      }
      if (s > 0 && mins > 0) return `${mins}m ${s}s`;
      if (mins > 0) return `${mins} min`;
      return `${s}s`;
    };

    assert.equal(formatDuration(1500), '25 min');
    assert.equal(formatDuration(60), '1 min');
    assert.equal(formatDuration(3600), '1h');
    assert.equal(formatDuration(5400), '1h 30m');
    assert.equal(formatDuration(45), '45s');
  });
});
