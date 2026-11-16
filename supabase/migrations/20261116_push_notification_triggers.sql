-- ====================================================================================
-- SUPABASE DATABASE TRIGGERS FOR OUTBOUND FCM PUSH NOTIFICATIONS
-- Project: study.io (https://igampeqlunmmdueeyymi.supabase.co)
-- Edge Function: send-notification
-- ====================================================================================

-- 1. Enable the pg_net extension to permit asynchronous HTTP calls from triggers
create extension if not exists pg_net;

-- 2. Optional: Ensure tables exist if you haven't created them yet
create table if not exists public.messages (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    receiver_id uuid references public.profiles(id) on delete cascade not null,
    message text not null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.nudges (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    receiver_id uuid references public.profiles(id) on delete cascade not null,
    message text default null,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Ensure profiles has fcm_token and fcm_updated_at columns
alter table public.profiles
    add column if not exists fcm_token text,
    add column if not exists fcm_updated_at timestamptz;

-- ------------------------------------------------------------------------------------
-- 3. Trigger Function: Send Push Notification on New Message (Chat)
-- ------------------------------------------------------------------------------------
create or replace function public.handle_new_message_push_notification()
returns trigger
language plpgsql
security definer
as $$
declare
    v_function_url text := 'https://igampeqlunmmdueeyymi.supabase.co/functions/v1/send-notification';
    v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYW1wZXFsdW5tbWR1ZWV5eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzQzNTQsImV4cCI6MjEwNDU1MDM1NH0.JSNfUISB_4BMcmS5hwFhoiPoHSyUPKuP8ZGaxwMXqqc';
    v_sender_id text;
    v_receiver_id text;
    v_content text;
    v_payload jsonb;
begin
    -- Handle flexible column names (sender_id or user_id, message or content)
    v_sender_id := coalesce(NEW.sender_id::text, null);
    v_receiver_id := coalesce(NEW.receiver_id::text, null);
    v_content := coalesce(NEW.message, '');

    -- Only send if there is a designated receiver and sender != receiver
    if v_receiver_id is not null and v_receiver_id <> v_sender_id then
        v_payload := jsonb_build_object(
            'type', 'chat',
            'sender_id', v_sender_id,
            'receiver_id', v_receiver_id,
            'message', v_content
        );

        -- Dispatch non-blocking asynchronous HTTP POST to Edge Function
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
        -- Prevent DB insertion failures if notification network call fails
        raise warning '[handle_new_message_push_notification] Error invoking edge function: %', SQLERRM;
        return NEW;
end;
$$;

-- ------------------------------------------------------------------------------------
-- 4. Trigger Function: Send Push Notification on New Nudge
-- ------------------------------------------------------------------------------------
create or replace function public.handle_new_nudge_push_notification()
returns trigger
language plpgsql
security definer
as $$
declare
    v_function_url text := 'https://igampeqlunmmdueeyymi.supabase.co/functions/v1/send-notification';
    v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYW1wZXFsdW5tbWR1ZWV5eW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzQzNTQsImV4cCI6MjEwNDU1MDM1NH0.JSNfUISB_4BMcmS5hwFhoiPoHSyUPKuP8ZGaxwMXqqc';
    v_sender_id text;
    v_receiver_id text;
    v_payload jsonb;
begin
    v_sender_id := coalesce(NEW.sender_id::text, null);
    v_receiver_id := coalesce(NEW.receiver_id::text, null);

    if v_receiver_id is not null and v_receiver_id <> v_sender_id then
        v_payload := jsonb_build_object(
            'type', 'nudge',
            'sender_id', v_sender_id,
            'receiver_id', v_receiver_id,
            'message', coalesce(NEW.message, 'nudged you to focus!')
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
        raise warning '[handle_new_nudge_push_notification] Error invoking edge function: %', SQLERRM;
        return NEW;
end;
$$;

-- ------------------------------------------------------------------------------------
-- 5. Attach Triggers to Tables
-- ------------------------------------------------------------------------------------
drop trigger if exists tr_messages_push_notification on public.messages;
create trigger tr_messages_push_notification
    after insert on public.messages
    for each row
    execute function public.handle_new_message_push_notification();

drop trigger if exists tr_nudges_push_notification on public.nudges;
create trigger tr_nudges_push_notification
    after insert on public.nudges
    for each row
    execute function public.handle_new_nudge_push_notification();
