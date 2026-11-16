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
const recentChatEvents = new Map<string, number>();
function isDuplicateChat(roomId: string, senderId: string, message: string): boolean {
  const key = `${roomId}:${senderId}:${message}`;
  const now = Date.now();
  const lastTime = recentChatEvents.get(key);
  if (lastTime && now - lastTime < 5000) {
    return true;
  }
  recentChatEvents.set(key, now);
  if (recentChatEvents.size > 200) {
    for (const [k, t] of recentChatEvents.entries()) {
      if (now - t > 30000) recentChatEvents.delete(k);
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
  type?: "chat" | "nudge" | string;
  message?: string;
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

    if (body.record) {
      const rec = body.record;
      sender_id = sender_id || rec.sender_id || rec.user_id;
      receiver_id = receiver_id || rec.receiver_id;
      room_id = room_id || rec.room_id;
      room_name = room_name || rec.room_name || rec.room_title;
      message = message || rec.message || rec.content;

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

    // Deduplicate rapid repeat events (e.g. database trigger + client call)
    if (type === "chat" && room_id && sender_id && message && isDuplicateChat(room_id, sender_id, message)) {
      console.log(`[send-notification] Skipping duplicate chat event for room=${room_id} sender=${sender_id}`);
      return new Response(
        JSON.stringify({ success: true, delivered: false, duplicate: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();
    getFirebaseAdmin();

    // 1. Query sender profile from database to strictly enforce the in-app username
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
    }
    const targetRecipients: TargetRecipient[] = [];
    const seenTokens = new Set<string>();

    if (receiver_id) {
      const { data: receiverProfile } = await supabase
        .from("profiles")
        .select("id, fcm_token")
        .eq("id", receiver_id)
        .maybeSingle();

      if (receiverProfile?.fcm_token) {
        seenTokens.add(receiverProfile.fcm_token);
        targetRecipients.push({
          userId: receiverProfile.id,
          fcmToken: receiverProfile.fcm_token,
        });
      }
    } else if (room_id) {
      // Find all room members except sender
      const { data: members } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", room_id);

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

      if (memberUserIds.size > 0) {
        const userIds = Array.from(memberUserIds);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, fcm_token")
          .in("id", userIds)
          .not("fcm_token", "is", null);

        if (profiles) {
          for (const p of profiles) {
            if (p.fcm_token && !seenTokens.has(p.fcm_token)) {
              seenTokens.add(p.fcm_token);
              targetRecipients.push({
                userId: p.id,
                fcmToken: p.fcm_token,
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

    const cleanMsg = (message || "").trim().replace(/^"(.*)"$/, "$1");
    const title = type === "nudge" ? "New Nudge!" : resolvedRoomName;
    const bodyText =
      type === "nudge"
        ? `@${cleanUsername} nudged you to focus!`
        : `${cleanUsername}: "${cleanMsg}"`;

    const fcmMessages: admin.messaging.Message[] = targetRecipients.map((recipient) => ({
      token: recipient.fcmToken,
      notification: {
        title,
        body: bodyText,
      },
      data: {
        type: String(type || "notification"),
        room_id: String(room_id || ""),
        sender_id: String(sender_id || ""),
        tab: "rooms",
        title: title,
        body: bodyText,
        icon: "ic_stat_studyio",
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'social_nudges',
          icon: 'ic_stat_studyio',
          color: '#10B981',
          sound: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
    }));

    console.log(`[send-notification] Sending ${fcmMessages.length} FCM message(s) for type=${type}:`, {
      title,
      body: bodyText,
      recipients: targetRecipients.map(r => r.userId),
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
