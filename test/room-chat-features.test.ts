import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMessageContent,
  formatReplyPayload,
  extractMentions,
} from '../src/components/rooms/ActiveRoom';

describe('Room Chat Replies and Mentions Specification', () => {
  it('correctly parses plain messages without reply metadata', () => {
    const raw = 'Hey everyone, ready for 50m focus sprint!';
    const parsed = parseMessageContent(raw);

    assert.equal(parsed.replyTo, null);
    assert.equal(parsed.text, 'Hey everyone, ready for 50m focus sprint!');
  });

  it('correctly encodes and parses reply metadata attached to a message', () => {
    const originalMessage = {
      messageId: 'msg-uuid-101',
      username: 'ajayjosephin',
      snippet: 'Are you using countdown or stopwatch today?',
    };
    const replyText = 'Countdown mode with 25 minutes!';

    // Format payload
    const payload = formatReplyPayload(originalMessage, replyText);
    assert.equal(
      payload.startsWith('[REPLY:'),
      true,
      'Payload must start with [REPLY: prefix'
    );
    assert.equal(payload.includes(']\n'), true);

    // Parse payload
    const parsed = parseMessageContent(payload);
    assert.notEqual(parsed.replyTo, null);
    assert.equal(parsed.replyTo?.id, 'msg-uuid-101');
    assert.equal(parsed.replyTo?.username, 'ajayjosephin');
    assert.equal(parsed.replyTo?.snippet, 'Are you using countdown or stopwatch today?');
    assert.equal(parsed.text, 'Countdown mode with 25 minutes!');
  });

  it('gracefully handles malformed or truncated reply payloads without throwing', () => {
    const brokenPayload = '[REPLY:{"id":"broken';
    const parsed = parseMessageContent(brokenPayload);

    assert.equal(parsed.replyTo, null);
    assert.equal(parsed.text, brokenPayload);
  });

  it('accurately extracts and normalizes user mentions from message text', () => {
    const text1 = 'Hey @trial and @Wren! Check out @trial notes.';
    const mentions1 = extractMentions(text1);
    assert.deepEqual(mentions1, ['trial', 'wren'], 'Must deduplicate and lowercase mentions');

    const text2 = 'No mentions here, just regular study talk.';
    const mentions2 = extractMentions(text2);
    assert.deepEqual(mentions2, []);

    const text3 = 'email@example.com is an email, but @amosbinu017 is a scholar mention.';
    const mentions3 = extractMentions(text3);
    assert.equal(mentions3.includes('amosbinu017'), true);
  });

  it('filters mention suggestions based on query string case-insensitively', () => {
    const roomUsers = [
      { user_id: '1', username: 'trial' },
      { user_id: '2', username: 'ajayjosephin' },
      { user_id: '3', username: 'aljin' },
      { user_id: '4', username: 'amosbinu017' },
      { user_id: '5', username: 'chackojoy21' },
      { user_id: '6', username: 'ebin' },
      { user_id: '7', username: 'wren' },
    ];

    const filterMentions = (query: string) => {
      const q = query.toLowerCase();
      return roomUsers
        .filter((u) => u.username.toLowerCase().includes(q))
        .slice(0, 6);
    };

    // '@a' matches trial, ajayjosephin, aljin, amosbinu017, chackojoy21
    const resultsA = filterMentions('a');
    assert.equal(resultsA.length, 5);
    assert.equal(resultsA[0].username, 'trial');

    // '@ch' matches chackojoy21
    const resultsCh = filterMentions('ch');
    assert.equal(resultsCh.length, 1);
    assert.equal(resultsCh[0].username, 'chackojoy21');

    // '@xyz' matches none
    const resultsNone = filterMentions('xyz');
    assert.equal(resultsNone.length, 0);
  });
});
