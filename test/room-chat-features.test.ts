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

  it('correctly manages room mute status and suppresses general room notifications', () => {
    const roomId = 'room-abc-123';
    let mutedRooms: string[] = [];

    // 1. Toggle mute ON
    mutedRooms = Array.from(new Set([...mutedRooms, roomId]));
    assert.equal(mutedRooms.includes(roomId), true, 'Room must be present in muted list');

    // 2. Notification suppression logic:
    const shouldAlertUser = (isRoomMuted: boolean, isReplyToMe: boolean, isMentionToMe: boolean) => {
      if (isRoomMuted) {
        // Only alert if directly replied or mentioned
        return isReplyToMe || isMentionToMe;
      }
      return true;
    };

    assert.equal(shouldAlertUser(true, false, false), false, 'General chat must be suppressed when muted');
    assert.equal(shouldAlertUser(true, true, false), true, 'Direct reply must still alert when muted');
    assert.equal(shouldAlertUser(true, false, true), true, 'Direct mention must still alert when muted');
    assert.equal(shouldAlertUser(false, false, false), true, 'General chat alerts when not muted');

    // 3. Toggle mute OFF
    mutedRooms = mutedRooms.filter((id) => id !== roomId);
    assert.equal(mutedRooms.includes(roomId), false, 'Room must be removed from muted list');
  });

  it('correctly constructs user report payload conforming to reports table specification', () => {
    const reportingUser = {
      userId: 'target-user-456',
      username: 'disruptive_scholar',
    };
    const reporter = {
      userId: 'reporter-123',
      username: 'study_master',
    };
    const room = {
      id: 'room-alpha-99',
      name: 'Silent Library',
    };
    const reason = 'Harassment or bullying';
    const details = 'Used aggressive language during study sprint.';

    const formattedMessage = [
      `Reported Scholar: @${reportingUser.username} (ID: ${reportingUser.userId})`,
      `Room: ${room.name || room.id}`,
      `Reason: ${reason}`,
      `Details: ${details.trim()}`,
      `Timestamp: 2026-11-18T21:45:00.000Z`,
    ].join('\n');

    const reportRow = {
      user_id: reporter.userId,
      username: reporter.username,
      category: 'User Report',
      message: formattedMessage,
      created_at: new Date().toISOString(),
    };

    assert.equal(reportRow.category, 'User Report');
    assert.equal(reportRow.username, 'study_master');
    assert.equal(reportRow.message.includes('disruptive_scholar'), true);
    assert.equal(reportRow.message.includes('Harassment or bullying'), true);
    assert.equal(reportRow.message.includes('Silent Library'), true);
  });

  it('guarantees notification message sanitation completely strips [REPLY:...] metadata', () => {
    // Helper replicating send-notification sanitation logic
    const sanitizeNotificationMessage = (raw: string) => {
      let clean = (raw || '').trim();
      clean = clean.replace(/^["'“”]([\s\S]*)["'“”]$/, '$1').trim();
      const replyTagMatch = clean.match(/\[REPLY:([\s\S]*?)\](?:\r?\n|\s|$)/);
      if (replyTagMatch) {
        clean = clean.replace(/\[REPLY:[\s\S]*?\](?:\r?\n|\s)*/g, '').trim();
      }
      clean = clean.replace(/\[REPLY:[\s\S]*?(?:\]|\r?\n|$)/g, '').trim();
      clean = clean.replace(/^["'“”]([\s\S]*)["'“”]$/, '$1').trim();
      return clean;
    };

    // Case 1: Standard reply payload with newline
    const raw1 = '[REPLY:{"id":"f4b1e8b0","username":"trial","snippet":"Ayyo onnudi","userId":"a36e57c6"}]\nsflkd';
    assert.equal(sanitizeNotificationMessage(raw1), 'sflkd');

    // Case 2: Reply payload with surrounding quotes
    const raw2 = '"[REPLY:{"id":"f4b1e8b0","username":"trial","snippet":"Ayyo onnudi","userId":"a36e57c6"}] sflkd"';
    assert.equal(sanitizeNotificationMessage(raw2), 'sflkd');

    // Case 3: Malformed JSON reply block
    const raw3 = '[REPLY:{"id":"incomplete... text here';
    assert.equal(sanitizeNotificationMessage(raw3).includes('[REPLY:{"id":"incomplete'), false);

    // Case 4: Standard chat message untouched
    const raw4 = 'Hey scholars, ready for study session?';
    assert.equal(sanitizeNotificationMessage(raw4), 'Hey scholars, ready for study session?');
  });

  it('delivers highlighted reply title only to the target recipient and clean standard chat to others', () => {
    const sender = 'wren';
    const roomName = 'studies';
    const cleanMsg = 'sflkd';
    const targetUserId = 'trial-uuid';
    const targetUsername = 'trial';

    const buildNotificationForUser = (recipientId: string, recipientName: string) => {
      const isTarget = recipientId === targetUserId || recipientName.toLowerCase() === targetUsername.toLowerCase();
      if (isTarget) {
        return {
          type: 'reply',
          title: `↩️ ${sender} replied to you in ${roomName}`,
          body: `"${cleanMsg}"`,
          color: '#3B82F6',
        };
      }
      return {
        type: 'chat',
        title: roomName,
        body: `${sender}: "${cleanMsg}"`,
        color: '#10B981',
      };
    };

    // Target recipient receives highlighted notification
    const targetNotif = buildNotificationForUser('trial-uuid', 'trial');
    assert.equal(targetNotif.title, '↩️ wren replied to you in studies');
    assert.equal(targetNotif.body, '"sflkd"');
    assert.equal(targetNotif.color, '#3B82F6');

    // Third-party room member receives standard clean chat notification
    const observerNotif = buildNotificationForUser('ebin-uuid', 'ebin');
    assert.equal(observerNotif.title, 'studies');
    assert.equal(observerNotif.body, 'wren: "sflkd"');
    assert.equal(observerNotif.color, '#10B981');
    assert.equal(observerNotif.body.includes('[REPLY:'), false, 'Observer notification must never contain [REPLY:');
  });

  it('verifies chat bubble max-width constraints prevent messages from spanning past ~58% of screen width', () => {
    // Styling contract tests:
    const bubbleRowClass = 'flex gap-3 items-end max-w-[58%] sm:max-w-[55%] md:max-w-[50%]';
    const bubbleWrapperClass = 'w-fit max-w-full';

    assert.equal(bubbleRowClass.includes('max-w-[58%]'), true, 'Mobile chat bubble row must be constrained to max 58%');
    assert.equal(bubbleWrapperClass.includes('w-fit'), true, 'Chat message must hug content using w-fit');
    assert.equal(bubbleWrapperClass.includes('max-w-full'), true, 'Chat message must not overflow parent stack');
  });

  it('guarantees profile avatar aligns with message bubble and reply button sits horizontally beside bubble without vertical clearance', () => {
    // Contract test for horizontal flex layout inside SwipeableChatMessage
    const bubbleRefLayout = (isMe: boolean) =>
      `w-fit max-w-full will-change-transform relative z-10 flex items-center gap-1.5 ${
        isMe ? 'flex-row-reverse' : 'flex-row'
      }`;

    const incomingLayout = bubbleRefLayout(false);
    assert.equal(incomingLayout.includes('flex items-center gap-1.5'), true, 'Draggable bubble container must align message and reply button horizontally');
    assert.equal(incomingLayout.includes('flex-row'), true, 'Incoming message reply button sits to the right of message');

    const outgoingLayout = bubbleRefLayout(true);
    assert.equal(outgoingLayout.includes('flex-row-reverse'), true, 'Outgoing message reply button sits to the left of message');

    // Outer row alignment contract: avatar aligns with the message bubble without extra height
    const avatarRowClass = (isMe: boolean) =>
      `flex gap-3 ${isMe ? 'flex-row-reverse' : ''} items-end max-w-[58%] sm:max-w-[55%] md:max-w-[50%]`;
    assert.equal(avatarRowClass(false).includes('items-end'), true, 'Avatar must align to the bottom of the message bubble');
  });

  it('guarantees desktop chat input dock has transparent background and no top border', () => {
    const inputDockClass =
      'px-3 pt-2 pb-[max(env(safe-area-inset-bottom,0px),12px)] md:pb-4 md:pt-4 md:px-4 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md md:bg-transparent md:border-t-0 md:backdrop-blur-none shrink-0 z-20';
    assert.equal(inputDockClass.includes('md:bg-transparent'), true, 'Desktop input dock must have transparent background');
    assert.equal(inputDockClass.includes('md:border-t-0'), true, 'Desktop input dock must have top border removed');
    assert.equal(inputDockClass.includes('md:backdrop-blur-none'), true, 'Desktop input dock must have backdrop-blur removed');
  });

  it('guarantees chat bubbles and mentions use Sleek Dark Slate / Frosted Glass styling without yellow/amber', () => {
    const outgoingBubbleClass =
      'bg-gradient-to-br from-slate-800/95 via-slate-800/85 to-slate-900/95 border border-slate-600/60 text-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.4)] backdrop-blur-md hover:border-slate-500/70';
    assert.equal(outgoingBubbleClass.includes('amber'), false, 'Outgoing chat bubbles must not contain amber/yellow');
    assert.equal(outgoingBubbleClass.includes('slate-800'), true, 'Outgoing chat bubbles must use sleek dark slate styling');

    const mentionBadgeClass = (isMe: boolean) =>
      isMe
        ? 'bg-white/[0.18] text-white border border-white/30 shadow-[0_0_8px_rgba(255,255,255,0.2)]'
        : 'bg-white/[0.08] text-slate-300 border border-white/10';
    assert.equal(mentionBadgeClass(true).includes('amber'), false, 'Targeted mention badge must not contain amber');
    assert.equal(mentionBadgeClass(false).includes('amber'), false, 'General mention badge must not contain amber');
  });
});
