-- ====================================================================================
-- SUPABASE DATABASE TRIGGER: ROOM CHAT PUSH NOTIFICATIONS
-- Project: study.io (https://igampeqlunmmdueeyymi.supabase.co)
-- Table: public.room_messages
-- Function: send-notification
-- ====================================================================================

-- 1. Ensure pg_net extension is enabled
create extension if not exists pg_net;

-- 2. Trigger Function: Send Push Notification on New Room Message (Chat)
create or replace function public.handle_new_room_message_push_notification()
returns trigger
language plpgsql
security definer
as $$
declare
    v_function_url text := 'https://igampeqlunmmdueeyymi.supabase.co/functions/v1/send-notification';
    v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYW1wZXFsdW5tbWR1ZWV5eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzQzNTQsImV4cCI6MjEwNDU1MDM1NH0.JSNfUISB_4BMcmS5hwFhoiPoHSyUPKuP8ZGaxwMXqqc';
    v_sender_id text;
    v_room_id text;
    v_content text;
    v_payload jsonb;
begin
    -- 1. Ignore system messages ([SYSTEM_NUDGE], [SYSTEM_BAN], [SYSTEM_UNBAN])
    if NEW.content is null or NEW.content like '[SYSTEM_%' then
        return NEW;
    end if;

    v_sender_id := coalesce(NEW.user_id::text, null);
    v_room_id := coalesce(NEW.room_id::text, null);
    v_content := coalesce(NEW.content, '');

    -- 2. Dispatch FCM push notification broadcast to room members
    if v_room_id is not null and v_sender_id is not null and length(trim(v_content)) > 0 then
        v_payload := jsonb_build_object(
            'type', 'chat',
            'room_id', v_room_id,
            'sender_id', v_sender_id,
            'message', v_content
        );

        perform net.http_post(
            url := v_function_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_anon_key
            ),
            body := v_payload
        );
    end if;

    return NEW;
exception
    when others then
        raise warning '[handle_new_room_message_push_notification] Error invoking edge function: %', SQLERRM;
        return NEW;
end;
$$;

-- 3. Attach trigger to public.room_messages
drop trigger if exists tr_room_messages_push_notification on public.room_messages;
create trigger tr_room_messages_push_notification
    after insert on public.room_messages
    for each row
    execute function public.handle_new_room_message_push_notification();
