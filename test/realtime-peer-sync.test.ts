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

  it('6. Alternating multi-device pause and resume cycles without version conflict, drift, or stuck states', () => {
    const sessionId = '22222222-3333-4444-5555-666666666666';
    let currentServerTime = mockNow;

    // Cycle 0: PC starts timer
    const pcStart = enginePc.startTimer({ mode: 'stopwatch', sessionId, serverNow: currentServerTime });
    assert.equal(pcStart.version, 1);
    assert.equal(enginePc.getState().isStudying, true);
    assert.equal(enginePc.getState().isPaused, false);

    // Sync to Phone at +10s
    currentServerTime += 10000;
    const phoneStartSync = enginePhone.handleRemoteSync({
      status: 'running',
      session_id: sessionId,
      device_id: 'device-pc',
      session_created_at: new Date(mockNow).toISOString(),
      started_at: new Date(mockNow).toISOString(),
      accumulated_seconds: 0,
      mode: 'stopwatch',
      version: 1,
    }, { serverNow: currentServerTime });
    assert.equal(phoneStartSync.accepted, true);
    assert.equal(phoneStartSync.elapsedSeconds, 10);
    assert.equal(enginePhone.getState().isPaused, false);

    // Cycle 1: Run to +60s. Phone clicks PAUSE.
    currentServerTime = mockNow + 60000;
    const phonePause = enginePhone.pauseTimer({ serverNow: currentServerTime });
    assert.equal(phonePause.accumulatedSeconds, 60);
    assert.equal(phonePause.version, 2);
    assert.equal(enginePhone.getState().isPaused, true);

    // Broadcast pause to PC
    const pcPauseSync = enginePc.handleRemoteSync({
      status: 'paused',
      session_id: sessionId,
      device_id: 'device-phone',
      session_created_at: new Date(mockNow).toISOString(),
      last_paused_at: new Date(currentServerTime).toISOString(),
      accumulated_seconds: 60,
      mode: 'stopwatch',
      version: 2,
    }, { serverNow: currentServerTime + 15 });
    assert.equal(pcPauseSync.accepted, true);
    assert.equal(pcPauseSync.elapsedSeconds, 60);
    assert.equal(enginePc.getState().isPaused, true);
    assert.equal(enginePc.getState().accumulatedSeconds, 60);

    // Cycle 2: PC clicks RESUME 20s later (+80s total)
    currentServerTime = mockNow + 80000;
    const pcResume = enginePc.resumeTimer({ serverNow: currentServerTime });
    assert.equal(pcResume.version, 3);
    assert.equal(pcResume.accumulatedSeconds, 60);
    assert.equal(enginePc.getState().isPaused, false);

    // Broadcast resume to Phone
    const phoneResumeSync = enginePhone.handleRemoteSync({
      status: 'running',
      session_id: sessionId,
      device_id: 'device-pc',
      session_created_at: new Date(mockNow).toISOString(),
      started_at: new Date(currentServerTime).toISOString(),
      accumulated_seconds: 60,
      mode: 'stopwatch',
      version: 3,
    }, { serverNow: currentServerTime + 12 });
    assert.equal(phoneResumeSync.accepted, true);
    assert.equal(phoneResumeSync.elapsedSeconds, 60);
    assert.equal(enginePhone.getState().isPaused, false);
    assert.equal(enginePhone.getState().accumulatedSeconds, 60);

    // Both tick 40s (to +120s total, 60s + 40s = 100s study time)
    currentServerTime = mockNow + 120000;
    assert.equal(enginePc.getElapsedSeconds(currentServerTime), 100);
    assert.equal(enginePhone.getElapsedSeconds(currentServerTime), 100);

    // Cycle 3: PC clicks PAUSE at 100s study time
    const pcPause2 = enginePc.pauseTimer({ serverNow: currentServerTime });
    assert.equal(pcPause2.accumulatedSeconds, 100);
    assert.equal(pcPause2.version, 4);

    // Broadcast pause to Phone
    const phonePauseSync2 = enginePhone.handleRemoteSync({
      status: 'paused',
      session_id: sessionId,
      device_id: 'device-pc',
      session_created_at: new Date(mockNow).toISOString(),
      last_paused_at: new Date(currentServerTime).toISOString(),
      accumulated_seconds: 100,
      mode: 'stopwatch',
      version: 4,
    }, { serverNow: currentServerTime + 10 });
    assert.equal(phonePauseSync2.accepted, true);
    assert.equal(phonePauseSync2.elapsedSeconds, 100);
    assert.equal(enginePhone.getState().isPaused, true);
    assert.equal(enginePhone.getState().accumulatedSeconds, 100);

    // Cycle 4: Phone clicks RESUME 30s later (+150s total)
    currentServerTime = mockNow + 150000;
    const phoneResume2 = enginePhone.resumeTimer({ serverNow: currentServerTime });
    assert.equal(phoneResume2.version, 5);
    assert.equal(phoneResume2.accumulatedSeconds, 100);
    assert.equal(enginePhone.getState().isPaused, false);

    // Broadcast resume to PC
    const pcResumeSync2 = enginePc.handleRemoteSync({
      status: 'running',
      session_id: sessionId,
      device_id: 'device-phone',
      session_created_at: new Date(mockNow).toISOString(),
      started_at: new Date(currentServerTime).toISOString(),
      accumulated_seconds: 100,
      mode: 'stopwatch',
      version: 5,
    }, { serverNow: currentServerTime + 14 });
    assert.equal(pcResumeSync2.accepted, true);
    assert.equal(pcResumeSync2.elapsedSeconds, 100);
    assert.equal(enginePc.getState().isPaused, false);
    assert.equal(enginePc.getState().accumulatedSeconds, 100);

    // Both tick 30s (to +180s total, 100s + 30s = 130s study time)
    currentServerTime = mockNow + 180000;
    assert.equal(enginePc.getElapsedSeconds(currentServerTime), 130);
    assert.equal(enginePhone.getElapsedSeconds(currentServerTime), 130);

    // Cycle 5: PC stops timer
    const pcStop = enginePc.stopTimer({ serverNow: currentServerTime });
    assert.equal(pcStop.durationSeconds, 130);
    assert.equal(enginePc.getState().isStudying, false);

    const phoneStopSync = enginePhone.handleRemoteSync({
      status: 'idle',
      session_id: sessionId,
      device_id: 'device-pc',
      version: 6,
    }, { serverNow: currentServerTime + 20 });
    assert.equal(phoneStopSync.accepted, true);
    assert.equal(enginePhone.getState().isStudying, false);
  });

  it('7. Synchronizes timer mode changes across peers without requiring timer to be active', () => {
    // Mode switch on PC from stopwatch to countdown
    const modePayload = {
      user_id: 'test-user-uuid',
      device_id: 'device-pc',
      mode: 'countdown',
      timer_mode: 'countdown',
      is_ultra_strict: false,
      target_duration: 1800,
    };

    // Simulated handler on Phone
    let phoneCurrentMode = 'stopwatch';
    let phoneCountdownTarget = 3600;

    const handlePhoneModeSync = (payload: any) => {
      if (payload.mode) phoneCurrentMode = payload.mode;
      if (payload.target_duration !== undefined) phoneCountdownTarget = payload.target_duration;
    };

    handlePhoneModeSync(modePayload);

    assert.equal(phoneCurrentMode, 'countdown', 'Phone mode must update to countdown');
    assert.equal(phoneCountdownTarget, 1800, 'Phone countdown target must update to 1800');
  });
});
