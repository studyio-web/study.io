import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';
import { validateAndSaveSession } from '@/lib/server/sessionValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SyncEventRequest {
  event_id: string;
  entity_type: 'task' | 'subject' | 'setting' | 'session' | 'timer';
  action: 'create' | 'update' | 'delete' | 'upsert' | string;
  entity_id?: string;
  client_ts?: string;
  updated_at?: string;
  payload: Record<string, any>;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    let user: any = null;

    // 1. Authenticate via cookies or Authorization Bearer header
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    if (cookieUser) {
      user = cookieUser;
    } else {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
          const admin = getSupabaseAdmin();
          const { data: tokenData } = await admin.auth.getUser(token);
          if (tokenData?.user) {
            user = tokenData.user;
          }
        } catch {}
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Session missing or expired.' },
        { status: 401 }
      );
    }

    let dbClient = supabase;
    try {
      const admin = getSupabaseAdmin();
      if (admin) dbClient = admin;
    } catch {}

    const body = (await req.json().catch(() => null)) as SyncEventRequest;
    if (!body || !body.event_id || !body.entity_type) {
      return NextResponse.json(
        { success: false, error: 'event_id and entity_type are required.' },
        { status: 400 }
      );
    }

    const { event_id, entity_type, action, entity_id, updated_at, payload } = body;
    const incomingUpdatedAt = updated_at ? new Date(updated_at).getTime() : Date.now();

    // 2. Deduplication check via processed_timer_events table
    try {
      const { data: existingEvent } = await dbClient
        .from('processed_timer_events')
        .select('event_id')
        .eq('event_id', event_id)
        .maybeSingle();

      if (existingEvent) {
        return NextResponse.json({
          success: true,
          isDuplicate: true,
          message: 'Event was already processed.',
        });
      }

      await dbClient.from('processed_timer_events').insert({
        event_id,
        user_id: user.id,
        event_type: `${entity_type}:${action}`,
        processed_at: new Date().toISOString(),
      });
    } catch {
      // Table check fallback
    }

    // 3. Process entity writes with Last-Write-Wins (LWW) by updated_at
    if (entity_type === 'task') {
      const taskId = entity_id || payload.id;

      if (action === 'delete') {
        if (taskId) {
          await dbClient
            .from('todos')
            .delete()
            .eq('id', taskId)
            .eq('user_id', user.id);
        }
        return NextResponse.json({ success: true, action: 'deleted' });
      }

      // Check existing task for LWW conflict resolution
      if (taskId) {
        const { data: existingTask } = await dbClient
          .from('todos')
          .select('id, created_at')
          .eq('id', taskId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingTask) {
          // If action is create but already exists, or update:
          // Check timestamp
          const existingTime = new Date(existingTask.created_at).getTime();
          if (existingTime > incomingUpdatedAt) {
            return NextResponse.json({
              success: true,
              rejected: true,
              reason: 'Superseded by newer server record',
            });
          }

          const updateFields: Record<string, any> = {};
          if (payload.task !== undefined) updateFields.task = payload.task;
          if (payload.is_completed !== undefined) updateFields.is_completed = payload.is_completed;
          if (payload.priority !== undefined) updateFields.priority = payload.priority;
          if (payload.due_date !== undefined) updateFields.due_date = payload.due_date;
          if (payload.estimated_minutes !== undefined) updateFields.estimated_minutes = payload.estimated_minutes;
          if (payload.subject_id !== undefined) updateFields.subject_id = payload.subject_id;

          await dbClient
            .from('todos')
            .update(updateFields)
            .eq('id', taskId)
            .eq('user_id', user.id);

          return NextResponse.json({ success: true, action: 'updated' });
        }
      }

      // Insert new task
      const insertTask = {
        id: taskId || undefined,
        user_id: user.id,
        task: payload.task || 'Untitled Task',
        is_completed: Boolean(payload.is_completed),
        due_date: payload.due_date || new Date().toISOString().split('T')[0],
        priority: payload.priority || 'medium',
        estimated_minutes: payload.estimated_minutes || 30,
        subject_id: payload.subject_id || null,
        created_at: payload.created_at || new Date(incomingUpdatedAt).toISOString(),
      };

      const { data: created, error } = await dbClient
        .from('todos')
        .insert([insertTask])
        .select()
        .single();

      if (error) {
        console.warn('[Sync API] Task insert error:', error);
      }
      return NextResponse.json({ success: true, action: 'created', task: created });
    }

    if (entity_type === 'subject') {
      const subjectId = entity_id || payload.id;

      if (action === 'delete') {
        if (subjectId) {
          await dbClient
            .from('subjects')
            .update({ is_archived: true })
            .eq('id', subjectId)
            .eq('user_id', user.id);
        }
        return NextResponse.json({ success: true, action: 'deleted' });
      }

      if (subjectId) {
        const { data: existingSub } = await dbClient
          .from('subjects')
          .select('id, updated_at, created_at')
          .eq('id', subjectId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingSub) {
          const existingTime = new Date(existingSub.updated_at || existingSub.created_at).getTime();
          if (existingTime > incomingUpdatedAt) {
            return NextResponse.json({
              success: true,
              rejected: true,
              reason: 'Superseded by newer server record',
            });
          }

          const updateFields: Record<string, any> = {};
          if (payload.name !== undefined) updateFields.name = payload.name;
          if (payload.color !== undefined) updateFields.color = payload.color;
          if (payload.is_archived !== undefined) updateFields.is_archived = payload.is_archived;
          if (payload.daily_goal_minutes !== undefined) updateFields.daily_goal_minutes = payload.daily_goal_minutes;

          await dbClient
            .from('subjects')
            .update(updateFields)
            .eq('id', subjectId)
            .eq('user_id', user.id);

          return NextResponse.json({ success: true, action: 'updated' });
        }
      }

      // Insert subject
      const insertSub = {
        id: subjectId || undefined,
        user_id: user.id,
        name: payload.name || 'General',
        color: payload.color || '#10b981',
        is_archived: Boolean(payload.is_archived),
        daily_goal_minutes: payload.daily_goal_minutes || 60,
      };

      const { data: created, error } = await dbClient
        .from('subjects')
        .insert([insertSub])
        .select()
        .single();

      if (error) {
        console.warn('[Sync API] Subject insert error:', error);
      }
      return NextResponse.json({ success: true, action: 'created', subject: created });
    }

    if (entity_type === 'setting') {
      const settingKey = entity_id || payload.key;
      const settingVal = payload.value;

      if (settingKey && settingVal !== undefined) {
        // Persist to user's profile metadata or specific setting
        try {
          const updateObj: Record<string, any> = {};
          if (settingKey === 'study_mode') updateObj.study_mode = settingVal;
          if (settingKey === 'theme') updateObj.theme = settingVal;

          if (Object.keys(updateObj).length > 0) {
            await dbClient
              .from('profiles')
              .update(updateObj)
              .eq('id', user.id);
          }
        } catch {}
      }
      return NextResponse.json({ success: true, action: 'setting_saved' });
    }

    if (entity_type === 'session') {
      // Validate and record session with full server validation
      const result = await validateAndSaveSession(dbClient, user, {
        ...payload,
        offline_synced: true,
      } as any);

      return NextResponse.json({
        success: result.success,
        action: 'session_saved',
        result,
      });
    }

    return NextResponse.json({ success: true, message: 'Processed' });
  } catch (err: any) {
    console.error('[Sync API] Server error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error' },
      { status: 500 }
    );
  }
}
