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

interface NotificationPayload {
  sender_id?: string;
  receiver_id?: string;
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
    let receiver_id = body.receiver_id;
    let type = body.type;
    let message = body.message;

    if (body.record) {
      const rec = body.record;
      sender_id = sender_id || rec.sender_id || rec.user_id;
      receiver_id = receiver_id || rec.receiver_id;
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

    if (!receiver_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameter 'receiver_id'",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabaseClient();
    const fbApp = getFirebaseAdmin();

    // Query receiver's profile for FCM registration token
    const { data: receiverProfile, error: receiverError } = await supabase
      .from("profiles")
      .select("id, fcm_token, username, name, display_name")
      .eq("id", receiver_id)
      .maybeSingle();

    if (receiverError) {
      console.error("[send-notification] Error fetching receiver profile:", receiverError);
      return new Response(
        JSON.stringify({ error: "Failed to query receiver profile", details: receiverError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!receiverProfile || !receiverProfile.fcm_token) {
      console.log(`[send-notification] Receiver ${receiver_id} has no FCM token registered.`);
      return new Response(
        JSON.stringify({
          success: true,
          delivered: false,
          reason: `No registered fcm_token found for receiver ${receiver_id}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query sender profile to format username
    let senderUsername = "A scholar";
    if (sender_id) {
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, username, name, display_name")
        .eq("id", sender_id)
        .maybeSingle();

      if (senderProfile) {
        senderUsername =
          senderProfile.username ||
          senderProfile.display_name ||
          senderProfile.name ||
          "A scholar";
      }
    }

    // Construct Notification Title, Body, and Android Channel
    let title = "study.io";
    let bodyText = "";
    let channelId = "social_nudges";

    if (type === "nudge") {
      title = "New Nudge!";
      bodyText = `@${senderUsername} nudged you to focus.`;
      channelId = "social_nudges";
    } else if (type === "chat") {
      title = `New message from @${senderUsername}`;
      if (message && message.trim().length > 0) {
        bodyText =
          message.length > 120 ? `${message.substring(0, 117)}...` : message;
      } else {
        bodyText = "Sent you a message";
      }
      channelId = "social_nudges";
    } else {
      title = `Update from @${senderUsername}`;
      bodyText = message || "You have a new update in study.io";
      channelId = "reminders";
    }

    // FCM Message Payload
    // Top-level 'notification' block is CRITICAL for Android background & locked-screen system tray delivery
    const fcmMessage: admin.messaging.Message = {
      token: receiverProfile.fcm_token,
      notification: {
        title,
        body: bodyText,
      },
      data: {
        title: String(title),
        body: String(bodyText),
        type: String(type || "notification"),
        sender_id: String(sender_id || ""),
        receiver_id: String(receiver_id),
        channelId: String(channelId),
        tab: "rooms",
        url: "/?tab=rooms",
      },
      android: {
        priority: "high",
        notification: {
          channelId,
          icon: "ic_stat_timer",
          color: "#F59E0B",
          sound: "default",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    console.log(`[send-notification] Sending FCM to ${receiverProfile.id} (${receiverProfile.username || 'unknown'}):`, {
      title,
      body: bodyText,
      channelId,
    });

    const sendResponse = await fbApp.messaging().send(fcmMessage);

    return new Response(
      JSON.stringify({
        success: true,
        delivered: true,
        messageId: sendResponse,
        receiver_id,
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
            .update({ fcm_token: null, fcm_updated_at: new Date().toISOString() })
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
