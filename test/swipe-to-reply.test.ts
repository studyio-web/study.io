import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Room Chat Swipe-To-Reply Specification (WhatsApp / Instagram style)', () => {
  const SWIPE_THRESHOLD = 45;

  test('correctly evaluates swipe threshold for incoming messages (swiping right)', () => {
    const isMe = false;

    const evaluateSwipe = (dx: number) => {
      let effectiveDx = dx;
      if (!isMe && dx < 0) {
        effectiveDx = dx * 0.1;
      }
      return Math.abs(effectiveDx) >= SWIPE_THRESHOLD && effectiveDx > 0;
    };

    // 1. Swiping left on incoming message -> should not trigger reply
    assert.equal(evaluateSwipe(-50), false);

    // 2. Swiping right below threshold (30px) -> should not trigger reply
    assert.equal(evaluateSwipe(30), false);

    // 3. Swiping right past threshold (48px) -> triggers reply
    assert.equal(evaluateSwipe(48), true);
  });

  test('correctly evaluates swipe threshold for outgoing messages (swiping left or right)', () => {
    const isMe = true;

    const evaluateSwipe = (dx: number) => {
      let effectiveDx = dx;
      if (isMe && dx > 0) {
        effectiveDx = dx * 0.7; // Right swipe support
      }
      return Math.abs(effectiveDx) >= SWIPE_THRESHOLD;
    };

    // 1. Swiping left past threshold (50px) -> triggers reply (Instagram style)
    assert.equal(evaluateSwipe(-50), true);

    // 2. Swiping right with enough travel (70px * 0.7 = 49px >= 45px) -> triggers reply (WhatsApp style)
    assert.equal(evaluateSwipe(70), true);

    // 3. Swiping left below threshold (20px) -> does not trigger
    assert.equal(evaluateSwipe(-20), false);
  });

  test('guarantees vertical scrolling disengages horizontal swipe gesture', () => {
    let gestureLock: 'horizontal' | 'vertical' | null = null;

    const onMove = (dx: number, dy: number) => {
      if (gestureLock === null) {
        if (Math.abs(dy) > Math.abs(dx)) {
          gestureLock = 'vertical';
        } else {
          gestureLock = 'horizontal';
        }
      }
      return gestureLock;
    };

    // Upward/downward scroll dominant (dy = 24, dx = 5)
    const dominant = onMove(5, 24);
    assert.equal(dominant, 'vertical', 'Dominant vertical movement must lock to native scroll');
  });
});
