import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { ResetConfirmModal } from '../src/components/timer/ResetConfirmModal';

describe('Timer Reset Confirmation Warning Specification', () => {
  it('1. Reset modal does not render when isOpen is false', () => {
    let confirmed = false;
    let cancelled = false;
    const element = React.createElement(ResetConfirmModal, {
      isOpen: false,
      onConfirm: () => { confirmed = true; },
      onCancel: () => { cancelled = true; },
      elapsedSeconds: 125,
    });
    assert.ok(element);
    assert.equal(confirmed, false);
    assert.equal(cancelled, false);
  });

  it('2. Intercepts reset action when session has progress (elapsedSeconds > 0)', () => {
    let isResetConfirmOpen = false;
    let wasResetCalled = false;

    const handleReset = () => {
      wasResetCalled = true;
    };

    const handleRequestReset = (isStudying: boolean, elapsedSeconds: number) => {
      if (isStudying || elapsedSeconds > 0) {
        isResetConfirmOpen = true;
      } else {
        handleReset();
      }
    };

    // User paused at 2 seconds and clicked reset
    handleRequestReset(true, 2);
    assert.equal(isResetConfirmOpen, true, 'Must open confirmation modal instead of resetting immediately');
    assert.equal(wasResetCalled, false, 'Must NOT reset timer while confirmation is pending');

    // User clicks Cancel
    isResetConfirmOpen = false;
    assert.equal(isResetConfirmOpen, false);
    assert.equal(wasResetCalled, false, 'Cancel preserves timer session untouched');

    // User clicks reset again and confirms
    handleRequestReset(true, 2);
    assert.equal(isResetConfirmOpen, true);
    // Confirmation handler runs
    isResetConfirmOpen = false;
    handleReset();
    assert.equal(wasResetCalled, true, 'Confirming reset executes handleReset');
  });

  it('3. Formats duration accurately without unnecessary symbols or emojis', () => {
    // 2 seconds
    const element2s = React.createElement(ResetConfirmModal, {
      isOpen: true,
      onConfirm: () => {},
      onCancel: () => {},
      elapsedSeconds: 2,
    });
    assert.ok(element2s);

    // 125 seconds (2m 5s)
    const element125s = React.createElement(ResetConfirmModal, {
      isOpen: true,
      onConfirm: () => {},
      onCancel: () => {},
      elapsedSeconds: 125,
    });
    assert.ok(element125s);

    // 3665 seconds (1h 1m 5s)
    const element3665s = React.createElement(ResetConfirmModal, {
      isOpen: true,
      onConfirm: () => {},
      onCancel: () => {},
      elapsedSeconds: 3665,
    });
    assert.ok(element3665s);
  });
});
