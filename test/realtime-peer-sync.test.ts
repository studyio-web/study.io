import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TimerSessionEngine } from '../src/lib/timerEngine';
import { cleanDeviceId } from '../src/lib/deviceId';

describe('Realtime Cross-Device Zero-Lag Sync Specification', () => {
  let enginePc: TimerSessionEngine;
  let enginePhone: TimerSessionEngine;
  const mockNow = 1700000000000;

  beforeEach(() => {
    enginePc = new TimerSessionEngine();
    enginePhone = new TimerSessionEngine();
  });

  it('1. Filters out self-echo broadcasts based on cleanDeviceId', () => {
    const pcDeviceId = 'device-pc-uuid-1234#countdown#sess:s-1';
    const cleanPc = cleanDeviceId(pcDeviceId);

    const sameDeviceEcho = 'device-pc-uuid-1234';
    const cleanEcho = cleanDeviceId(sameDeviceEcho);
    assert.equal(cleanPc, cleanEcho);

    const phoneDeviceId = 'device-phone-uuid-5678#countdown#sess:s-1';
    const cleanPhone = cleanDeviceId(phoneDeviceId);
    assert.notEqual(cleanPc, cleanPhone);
  });

  it('2. Synchronizes a started session instantly from PC to Phone via peer payload', () => {
    // 1. User starts session on PC
    const pcSessionId = '11111111-2222-3333-4444-555555555555';
    enginePc.startTimer({
      mode: 'stopwatch',
      sessionId: pcSessionId,
      serverNow: mockNow,
    });

    const pcState = enginePc.getState();
    assert.equal(pcState.isStudying, true);
    assert.equal(pcState.isPaused, false);

    // 2. Simulated WebSocket peer broadcast arrives at Phone within 15ms
    const phoneReceiveTime = mockNow + 15000; // 15 seconds later
    const remotePayload = {
      status: 'running' as const,
      session_id: pcSessionId,
      device_id: 'device-pc-uuid-1234',
      session_created_at: new Date(mockNow).toISOString(),
      started_at: new Date(mockNow).toISOString(),
      accumulated_seconds: 0,
      mode: 'stopwatch' as const,
      version: 1,
    };

    const syncRes = enginePhone.handleRemoteSync(remotePayload, { serverNow: phoneReceiveTime });
    assert.equal(syncRes.accepted, true);
    assert.equal(syncRes.elapsedSeconds, 15);

    // Phone engine state now mirrors PC session
    const phoneState = enginePhone.getState();
    assert.equal(phoneState.isStudying, true);
    assert.equal(phoneState.isPaused, false);
    assert.equal(phoneState.sessionId, pcSessionId);
  });

  it('3. Synchronizes a paused session instantly from Phone to PC', () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    enginePc.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });
    enginePhone.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });

    // Phone user pauses at 300 seconds
    const pauseTime = mockNow + 300000;
    enginePhone.pauseTimer({ serverNow: pauseTime });
    assert.equal(enginePhone.getState().isPaused, true);
    assert.equal(enginePhone.getState().accumulatedSeconds, 300);

    // Broadcast arrives at PC
    const pausePayload = {
      status: 'paused' as const,
      session_id: sessionId,
      device_id: 'device-phone-uuid-5678',
      session_created_at: new Date(mockNow).toISOString(),
      last_paused_at: new Date(pauseTime).toISOString(),
      accumulated_seconds: 300,
      mode: 'stopwatch' as const,
      version: 2,
    };

    const pcSyncRes = enginePc.handleRemoteSync(pausePayload, { serverNow: pauseTime + 20 });
    assert.equal(pcSyncRes.accepted, true);
    assert.equal(pcSyncRes.elapsedSeconds, 300);
    assert.equal(enginePc.getState().isPaused, true);
    assert.equal(enginePc.getState().accumulatedSeconds, 300);
  });

  it('4. Synchronizes resume immediately without lost time', () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    enginePc.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });
    enginePhone.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });

    const pauseTime = mockNow + 300000;
    enginePhone.pauseTimer({ serverNow: pauseTime });
    enginePc.pauseTimer({ serverNow: pauseTime });

    // User resumes on PC 60 seconds later
    const resumeTime = pauseTime + 60000;
    enginePc.resumeTimer({ serverNow: resumeTime });
    assert.equal(enginePc.getState().isPaused, false);

    // Broadcast arrives at Phone 10ms later
    const resumePayload = {
      status: 'running' as const,
      session_id: sessionId,
      device_id: 'device-pc-uuid-1234',
      session_created_at: new Date(mockNow).toISOString(),
      started_at: new Date(resumeTime).toISOString(),
      accumulated_seconds: 300,
      mode: 'stopwatch' as const,
      version: 3,
    };

    const phoneSyncRes = enginePhone.handleRemoteSync(resumePayload, { serverNow: resumeTime + 10 });
    assert.equal(phoneSyncRes.accepted, true);
    assert.equal(phoneSyncRes.elapsedSeconds, 300);
    assert.equal(enginePhone.getState().isPaused, false);
    assert.equal(enginePhone.getState().accumulatedSeconds, 300);
  });

  it('5. Synchronizes stop/finish across devices immediately', () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    enginePc.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });
    enginePhone.startTimer({ mode: 'stopwatch', sessionId, serverNow: mockNow });

    // PC stops session
    enginePc.stopTimer();
    assert.equal(enginePc.getState().isStudying, false);

    // Stop broadcast received on Phone
    const stopPayload = {
      status: 'idle' as const,
      session_id: sessionId,
      device_id: 'device-pc-uuid-1234',
      version: 4,
    };

    const stopRes = enginePhone.handleRemoteSync(stopPayload, { serverNow: mockNow + 50000 });
    assert.equal(stopRes.accepted, true);
    assert.equal(enginePhone.getState().isStudying, false);
  });
});
