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

  it('correctly encodes and extracts userId in reply payload', () => {
    const originalWithUserId = {
      messageId: 'msg-uuid-202',
      userId: 'user-uuid-999',
      username: 'wren',
      snippet: 'Great job!',
    };
    const replyText = 'Thanks!';

    const payload = formatReplyPayload(originalWithUserId, replyText);
    const parsed = parseMessageContent(payload);

    assert.notEqual(parsed.replyTo, null);
    assert.equal(parsed.replyTo?.id, 'msg-uuid-202');
    assert.equal(parsed.replyTo?.userId, 'user-uuid-999');
    assert.equal(parsed.replyTo?.username, 'wren');
    assert.equal(parsed.replyTo?.snippet, 'Great job!');
    assert.equal(parsed.text, 'Thanks!');
  });

  it('accurately distinguishes notification types: reply, mention, and standard chat', () => {
    const currentUserId = 'user-me-123';
    const currentUsername = 'trial';

    const evaluateNotificationType = (rawMsg: {
      user_id: string;
      content: string;
    }): 'self' | 'reply' | 'mention' | 'chat' => {
      if (rawMsg.user_id === currentUserId) return 'self';
      const parsed = parseMessageContent(rawMsg.content);
      const isReply = Boolean(
        parsed.replyTo && (
          (parsed.replyTo.userId && parsed.replyTo.userId === currentUserId) ||
          (parsed.replyTo.username && parsed.replyTo.username.toLowerCase() === currentUsername.toLowerCase())
        )
      );
      if (isReply) return 'reply';

      const mentions = extractMentions(parsed.text);
      if (mentions.includes(currentUsername.toLowerCase())) return 'mention';

      return 'chat';
    };

    // 1. Self message
    assert.equal(
      evaluateNotificationType({ user_id: 'user-me-123', content: 'Hello everyone' }),
      'self'
    );

    // 2. Direct reply to current user
    const replyPayload = formatReplyPayload(
      { messageId: 'm1', userId: 'user-me-123', username: 'trial', snippet: 'Question' },
      'Here is the answer'
    );
    assert.equal(
      evaluateNotificationType({ user_id: 'other-user', content: replyPayload }),
      'reply'
    );

    // 3. Mention of current user
    assert.equal(
      evaluateNotificationType({ user_id: 'other-user', content: 'Hey @trial check this!' }),
      'mention'
    );

    // 4. Standard room chat
    assert.equal(
      evaluateNotificationType({ user_id: 'other-user', content: 'Good morning scholars!' }),
      'chat'
    );
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
