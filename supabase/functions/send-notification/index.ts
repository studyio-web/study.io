import { createClient } from "npm:@supabase/supabase-js@2";
import admin from "npm:firebase-admin@^12.0.0";

// CORS headers for preflight and cross-origin invocations
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 1. Initialize Firebase Admin SDK (lazy singleton)
function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const rawKey = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
  if (!rawKey) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable. Add it via 'supabase secrets set'."
    );
  }

  let serviceAccount: any;
  const trimmed = rawKey.trim();
  try {
    if (trimmed.startsWith("{")) {
      serviceAccount = JSON.parse(trimmed);
    } else {
      // Base64-encoded JSON support
      const decoded = atob(trimmed);
      serviceAccount = JSON.parse(decoded);
    }
  } catch (parseErr) {
    throw new Error(
      `Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${(parseErr as Error).message}`
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 2. Initialize Supabase Service Role Client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Memory cache to deduplicate rapidly repeating events (e.g. database trigger + client invoke)
const recentEvents = new Map<string, number>();
function isDuplicateEvent(type: string, senderId: string, targetId: string, message?: string): boolean {
  // Shared key across 'chat'/'reply'/'mention' for the same sender, room, and message text
  const key = type === 'nudge'
    ? `nudge:${senderId}:${targetId}`
    : `room_msg:${senderId}:${targetId}:${(message || '').slice(0, 50)}`;
  const now = Date.now();
  const lastTime = recentEvents.get(key);
  // Short 2500ms deduplication window to absorb simultaneous DB trigger + client invoke
  // without dropping real consecutive chat messages
  const windowMs = type === 'nudge' ? 3000 : 2500;
  if (lastTime && now - lastTime < windowMs) {
    return true;
  }
  recentEvents.set(key, now);
  if (recentEvents.size > 300) {
    for (const [k, t] of recentEvents.entries()) {
      if (now - t > 15000) recentEvents.delete(k);
    }
  }
  return false;
}

interface NotificationPayload {
  sender_id?: string;
  sender_username?: string;
  sender_name?: string;
  receiver_id?: string;
  room_id?: string;
  room_name?: string;
  type?: "chat" | "nudge" | "mention" | "reply" | string;
  message?: string;
  mentions?: string[];
  reply_to_user_id?: string;
  reply_to_username?: string;
  // Database Webhook support:
  table?: string;
  record?: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: NotificationPayload = await req.json().catch(() => ({}));

    // Normalize direct payload vs Supabase Database Webhook trigger record
    let sender_id = body.sender_id;
    let sender_username = body.sender_username || body.sender_name;
    let receiver_id = body.receiver_id;
    let room_id = body.room_id;
    let room_name = body.room_name;
    let type = body.type;
    let message = body.message;
    let mentions = body.mentions;
    let reply_to_user_id = body.reply_to_user_id;
    let reply_to_username = body.reply_to_username;

    if (body.record) {
      const rec = body.record;
      sender_id = sender_id || rec.sender_id || rec.user_id;
      receiver_id = receiver_id || rec.receiver_id;
      room_id = room_id || rec.room_id;
      room_name = room_name || rec.room_name || rec.room_title;
      message = message || rec.message || rec.content;
      if (rec.reply_to_user_id) reply_to_user_id = reply_to_user_id || rec.reply_to_user_id;
      if (rec.reply_to_username) reply_to_username = reply_to_username || rec.reply_to_username;

      if (!type) {
        if (body.table === "nudges" || rec.target_user_id) {
          type = "nudge";
          receiver_id = receiver_id || rec.target_user_id;
        } else {
          type = "chat";
        }
      }
    }

    if (!receiver_id && !room_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameter 'receiver_id' or 'room_id'",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Clean message and extract reply metadata and mentions UP FRONT
    let replyUserId = reply_to_user_id;
    let replyUsername = reply_to_username ? reply_to_username.replace(/^@/, '') : undefined;
    let cleanMsg = (message || "").trim();

    // Strip surrounding quotes if present (e.g. "[REPLY:...] text" or “...”)
    cleanMsg = cleanMsg.replace(/^["'“”]([\s\S]*)["'“”]$/, '$1').trim();

    // Match [REPLY: ... ] block
    const replyTagMatch = cleanMsg.match(/\[REPLY:([\s\S]*?)\](?:\r?\n|\s|$)/);
    if (replyTagMatch) {
      const rawMeta = replyTagMatch[1];
      try {
        const meta = JSON.parse(rawMeta);
        if (!replyUserId && meta.userId) replyUserId = meta.userId;
        if (!replyUsername && meta.username) replyUsername = String(meta.username).replace(/^@/, '');
      } catch (parseErr) {
        // Fallback regex if JSON.parse fails
        const uidMatch = rawMeta.match(/"userId"\s*:\s*"([^"]+)"/);
        const unameMatch = rawMeta.match(/"username"\s*:\s*"([^"]+)"/);
        if (!replyUserId && uidMatch) replyUserId = uidMatch[1];
        if (!replyUsername && unameMatch) replyUsername = unameMatch[1].replace(/^@/, '');
      }
      // ALWAYS unconditionally strip the [REPLY:...] block so raw metadata NEVER leaks to notifications
      cleanMsg = cleanMsg.replace(/\[REPLY:[\s\S]*?\](?:\r?\n|\s)*/g, '').trim();
    }

    // Safety sweep: strip any leftover [REPLY: ...] tags or unclosed [REPLY: headers
    cleanMsg = cleanMsg.replace(/\[REPLY:[\s\S]*?(?:\]|\r?\n|$)/g, '').trim();
    cleanMsg = cleanMsg.replace(/^["'“”]([\s\S]*)["'“”]$/, '$1').trim();

    // Extract mentions from text and combine with body.mentions
    const extractedMentions = (cleanMsg.match(/@[a-zA-Z0-9_\-\.]+/g) || []).map((m) =>
      m.slice(1).toLowerCase()
    );
    const mentionsSet = new Set<string>([
      ...(mentions || []).map((m) => m.replace(/^@/, "").toLowerCase()),
      ...extractedMentions,
    ]);

    // Deduplicate rapid repeat events (e.g. database trigger + client direct invoke)
    const targetId = receiver_id || room_id || "global";
    if (sender_id && isDuplicateEvent(type || 'chat', sender_id, targetId, cleanMsg)) {
      console.log(`[send-notification] Skipping duplicate ${type} event from sender=${sender_id} to target=${targetId}`);
      return new Response(
        JSON.stringify({ success: true, delivered: false, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();
    getFirebaseAdmin();

    // Query sender profile from database to strictly enforce the in-app username
    let senderUsername = "";
    if (sender_id) {
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, username, display_name, name")
        .eq("id", sender_id)
        .maybeSingle();

      if (senderProfile) {
        // STRICTLY prefer in-app username over Google OAuth account name
        senderUsername =
          senderProfile.username ||
          senderProfile.display_name ||
          senderProfile.name ||
          "";
      }
    }
    if (!senderUsername) {
      senderUsername = sender_username || "A scholar";
    }
    // Strip leading @ so formatting is consistent
    const cleanUsername = senderUsername.startsWith("@") ? senderUsername.substring(1) : senderUsername;

    // Resolve target device tokens
    interface TargetRecipient {
      userId: string;
      fcmToken: string;
      username?: string;
    }
    const targetRecipients: TargetRecipient[] = [];
    const seenTokens = new Set<string>();

    if (receiver_id) {
      const { data: receiverProfile } = await supabase
        .from("profiles")
        .select("id, fcm_token, username, name, display_name")
        .eq("id", receiver_id)
        .maybeSingle();

      if (receiverProfile?.fcm_token) {
        seenTokens.add(receiverProfile.fcm_token);
        const uname = (receiverProfile.username || receiverProfile.display_name || receiverProfile.name || "").trim();
        targetRecipients.push({
          userId: receiverProfile.id,
          fcmToken: receiverProfile.fcm_token,
          username: uname || undefined,
        });
      }
    } else if (room_id) {
      // Find all room members except sender, checking for muted room preferences
      const { data: members } = await supabase
        .from("room_members")
        .select("user_id, is_muted")
        .eq("room_id", room_id);

      const mutedUserIds = new Set<string>();
      if (members) {
        for (const m of members) {
          if (m.is_muted) {
            mutedUserIds.add(m.user_id);
          }
        }
      }

      // Also get room host to guarantee delivery if host isn't in room_members, and query room name
      const { data: roomData } = await supabase
        .from("study_rooms")
        .select("host_id, name")
        .eq("id", room_id)
        .maybeSingle();

      if (roomData?.name && !room_name) {
        room_name = roomData.name;
      }

      const memberUserIds = new Set<string>();
      if (members) {
        for (const m of members) {
          if (m.user_id && m.user_id !== sender_id) {
            memberUserIds.add(m.user_id);
          }
        }
      }
      if (roomData?.host_id && roomData.host_id !== sender_id) {
        memberUserIds.add(roomData.host_id);
      }

      // ALWAYS guarantee the reply target receives the notification even if not in room_members
      if (replyUserId && replyUserId !== sender_id) {
        memberUserIds.add(replyUserId);
      }

      if (memberUserIds.size > 0) {
        const userIds = Array.from(memberUserIds);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, fcm_token, username, name, display_name")
          .in("id", userIds)
          .not("fcm_token", "is", null);

        if (profiles) {
          for (const p of profiles) {
            if (p.fcm_token && !seenTokens.has(p.fcm_token)) {
              seenTokens.add(p.fcm_token);
              const uname = (p.username || p.display_name || p.name || "").trim();
              targetRecipients.push({
                userId: p.id,
                fcmToken: p.fcm_token,
                username: uname || undefined,
              });
            }
          }
        }
      }

      // If any scholars were mentioned by username, ensure their tokens are resolved
      if (mentionsSet.size > 0) {
        const mentionUsernames = Array.from(mentionsSet);
        const { data: mentionedProfiles } = await supabase
          .from("profiles")
          .select("id, fcm_token, username, name, display_name")
          .in("username", mentionUsernames)
          .not("fcm_token", "is", null);

        if (mentionedProfiles) {
          for (const p of mentionedProfiles) {
            if (p.id !== sender_id && p.fcm_token && !seenTokens.has(p.fcm_token)) {
              seenTokens.add(p.fcm_token);
              const uname = (p.username || p.display_name || p.name || "").trim();
              targetRecipients.push({
                userId: p.id,
                fcmToken: p.fcm_token,
                username: uname || undefined,
              });
            }
          }
        }
      }
    }

    if (targetRecipients.length === 0) {
      console.log(`[send-notification] No registered tokens found for receiver=${receiver_id} room=${room_id}`);
      return new Response(
        JSON.stringify({
          success: true,
          delivered: false,
          reason: "No registered fcm_tokens found for recipients",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let resolvedRoomName = (room_name || "").trim();
    if (!resolvedRoomName && room_id) {
      const { data: rData } = await supabase
        .from("study_rooms")
        .select("name")
        .eq("id", room_id)
        .maybeSingle();
      if (rData?.name) {
        resolvedRoomName = rData.name.trim();
      }
    }
    if (!resolvedRoomName) {
      resolvedRoomName = "Study Room";
    }

    // Build notifications: Highlight mentions and replies ONLY for the targeted recipient; standard chat for others
    const fcmMessages: admin.messaging.Message[] = targetRecipients.map((recipient) => {
      let recipientType = "chat";
      let recipientTitle = resolvedRoomName;
      let recipientBody = `${cleanUsername}: "${cleanMsg}"`;
      // Use "social_nudges" as the base channel since it is guaranteed to exist natively with IMPORTANCE_HIGH on all installed APKs
      let recipientChannel = "social_nudges";
      let notificationColor = "#10B981";

      if (type === "nudge") {
        recipientType = "nudge";
        recipientTitle = "New Nudge!";
        recipientBody = `@${cleanUsername} nudged you to focus!`;
        notificationColor = "#10B981";
      } else {
        const recipientUsernameLower = recipient.username ? recipient.username.replace(/^@/, '').toLowerCase() : "";
        const isRepliedTo = Boolean(
          (replyUserId && recipient.userId === replyUserId) ||
          (replyUsername && recipientUsernameLower && recipientUsernameLower === replyUsername.toLowerCase())
        );

        const isMentioned = Boolean(
          recipientUsernameLower && mentionsSet.has(recipientUsernameLower)
        );

        // Check if recipient has muted this room
        const isMuted = mutedUserIds.has(recipient.userId);
        if (isMuted && !isRepliedTo && !isMentioned) {
          // Room is muted by this user: do not send general chat push notifications
          return null;
        }

        if (isRepliedTo) {
          // Highlighted Reply Notification ONLY for the user who received the reply!
          recipientType = "reply";
          recipientTitle = `↩️ ${cleanUsername} replied to you in ${resolvedRoomName}`;
          recipientBody = cleanMsg ? `"${cleanMsg}"` : 'Replied to your message';
          notificationColor = "#3B82F6";
        } else if (isMentioned) {
          // Highlighted Mention Notification ONLY for the user who was mentioned!
          recipientType = "mention";
          recipientTitle = `💬 @${cleanUsername} mentioned you in ${resolvedRoomName}`;
          recipientBody = cleanMsg ? `"${cleanMsg}"` : 'Mentioned you in chat';
          notificationColor = "#FF8A00";
        } else {
          // Normal room chat notification for everyone else
          recipientType = "chat";
          recipientTitle = resolvedRoomName;
          recipientBody = `${cleanUsername}: "${cleanMsg}"`;
          notificationColor = "#10B981";
        }
      }

      return {
        token: recipient.fcmToken,
        notification: {
          title: recipientTitle,
          body: recipientBody,
        },
        data: {
          type: String(recipientType),
          room_id: String(room_id || ""),
          sender_id: String(sender_id || ""),
          tab: "rooms",
          title: recipientTitle,
          body: recipientBody,
          channelId: recipientChannel,
          icon: "ic_stat_studyio",
        },
        android: {
          priority: "high",
          notification: {
            channelId: recipientChannel,
            icon: "ic_stat_studyio",
            color: notificationColor,
            sound: "default",
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
      };
    }).filter(Boolean) as admin.messaging.Message[];

    if (fcmMessages.length === 0) {
      console.log(`[send-notification] All eligible recipients have muted this room or were sender. Skipping FCM send.`);
      return new Response(
        JSON.stringify({
          success: true,
          delivered: false,
          reason: "All recipients have muted this room or were sender",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-notification] Sending ${fcmMessages.length} FCM message(s) for type=${type}:`, {
      room: resolvedRoomName,
      sender: cleanUsername,
      replyUserId,
      replyUsername,
      cleanMsg,
      recipients: targetRecipients.map(r => ({ userId: r.userId, uname: r.username })),
    });

    const sendResponse = await admin.messaging().sendEach(fcmMessages);

    // Clean up any stale or unregistered tokens
    if (sendResponse.failureCount > 0) {
      sendResponse.responses.forEach(async (resp, idx) => {
        if (!resp.success && resp.error) {
          const errCode = resp.error.code;
          if (
            errCode === "messaging/registration-token-not-registered" ||
            errCode === "messaging/invalid-registration-token"
          ) {
            const badRecipient = targetRecipients[idx];
            if (badRecipient?.userId) {
              console.log(`[send-notification] Cleaning up stale token for user ${badRecipient.userId}`);
              await supabase
                .from("profiles")
                .update({ fcm_token: null })
                .eq("id", badRecipient.userId);
            }
          }
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered: true,
        successCount: sendResponse.successCount,
        failureCount: sendResponse.failureCount,
        receiver_id,
        room_id,
        type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-notification] Exception encountered:", error);

    // If token is invalid or user uninstalled app, clean up stale token in database
    const errorCode = error?.code || error?.errorInfo?.code;
    if (
      errorCode === "messaging/registration-token-not-registered" ||
      errorCode === "messaging/invalid-registration-token"
    ) {
      try {
        const supabase = getSupabaseClient();
        const body: any = await req.clone().json().catch(() => ({}));
        if (body?.receiver_id) {
          console.log(`[send-notification] Clearing invalid token for receiver ${body.receiver_id}`);
          await supabase
            .from("profiles")
            .update({ fcm_token: null })
            .eq("id", body.receiver_id);
        }
      } catch (cleanErr) {
        console.warn("[send-notification] Failed to clear invalid token:", cleanErr);
      }
    }

    return new Response(
      JSON.stringify({
        error: "Failed to send notification",
        message: error?.message || String(error),
        code: errorCode,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
