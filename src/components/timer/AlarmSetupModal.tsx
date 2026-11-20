'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ShieldCheck, Check, ArrowRight, Zap, ExternalLink, Play, AlertCircle } from 'lucide-react';
import { TimerNotification, isNativeAndroid, AlarmPermissionsResult } from '../../lib/timerNotificationPlugin';
import { requestNotificationPermission } from '../../lib/notifications';
import { triggerHaptic } from '../../lib/native-feel';
import toast from 'react-hot-toast';

interface AlarmSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AlarmSetupModal({ isOpen, onClose }: AlarmSetupModalProps) {
  const [mounted, setMounted] = useState(false);
  const [permissions, setPermissions] = useState<AlarmPermissionsResult>({
    exactAlarm: false,
    fullScreen: false,
    notifications: false,
    batteryOptimized: true,
  });
  const [isTesting, setIsTesting] = useState(false);

  const checkPerms = useCallback(async () => {
    if (!isNativeAndroid()) return;
    try {
      const res = await TimerNotification.checkAlarmPermissions();
      setPermissions(res);
    } catch (e) {
      console.warn('[AlarmSetupModal] Failed to check permissions', e);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      checkPerms();
    }
  }, [isOpen, checkPerms]);

  // Re-check permissions when window regains focus (user returning from settings)
  useEffect(() => {
    if (!isOpen) return;
    const handleFocus = () => {
      checkPerms();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isOpen, checkPerms]);

  const handleGrantNotifications = async () => {
    triggerHaptic('light');
    await requestNotificationPermission();
    await checkPerms();
  };

  const handleGrantExactAlarm = async () => {
    triggerHaptic('light');
    await TimerNotification.requestExactAlarmPermission();
  };

  const handleGrantFullScreen = async () => {
    triggerHaptic('light');
    await TimerNotification.requestFullScreenPermission();
  };

  const handleGrantBattery = async () => {
    triggerHaptic('light');
    await TimerNotification.requestIgnoreBatteryOptimization();
  };

  const handleTestAlarm = async () => {
    triggerHaptic('medium');
    setIsTesting(true);
    try {
      await TimerNotification.testAlarm();
      toast.success('Alarm will ring in 5 seconds! Lock your phone to test.', {
        duration: 5000,
        icon: '⏰',
      });
    } catch (err: any) {
      toast.error('Could not schedule test alarm: ' + (err?.message || err));
    } finally {
      setIsTesting(false);
    }
  };

  const handleDone = () => {
    triggerHaptic('medium');
    try {
      localStorage.setItem('studyio_alarm_setup_checked', '1');
    } catch {}
    onClose();
  };

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-setup-title"
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-sm rounded-[28px] bg-[#0A0D14] border border-white/10 p-6 sm:p-7 text-white shadow-2xl flex flex-col gap-4">
        {/* Header Emblem & Title */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 id="alarm-setup-title" className="font-hud font-bold text-lg text-white">
              Make Sure Alarm Rings
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Ensure study timer alerts wake device &amp; ring on time
            </p>
          </div>
        </div>

        {/* Permission Checklist */}
        <div className="flex flex-col gap-2.5 my-1">
          {/* 1. Notifications */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col pr-2">
              <span className="text-xs font-semibold text-white">Notifications</span>
              <span className="text-[11px] text-zinc-400 font-mono">Alerts &amp; heads-up banner</span>
            </div>
            {permissions.notifications ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Granted
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGrantNotifications}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold shrink-0 transition-colors cursor-pointer"
              >
                Grant
              </button>
            )}
          </div>

          {/* 2. Exact Alarms */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col pr-2">
              <span className="text-xs font-semibold text-white">Exact Alarms</span>
              <span className="text-[11px] text-zinc-400 font-mono">Fires precisely at 00:00:00</span>
            </div>
            {permissions.exactAlarm ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Granted
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGrantExactAlarm}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold shrink-0 transition-colors cursor-pointer"
              >
                Grant
              </button>
            )}
          </div>

          {/* 3. Full-Screen Alerts */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col pr-2">
              <span className="text-xs font-semibold text-white">Full-Screen Alerts</span>
              <span className="text-[11px] text-zinc-400 font-mono">Wake screen over lock screen</span>
            </div>
            {permissions.fullScreen ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Granted
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGrantFullScreen}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold shrink-0 transition-colors cursor-pointer"
              >
                Grant
              </button>
            )}
          </div>

          {/* 4. Battery Optimization */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col pr-2">
              <span className="text-xs font-semibold text-white">Battery Optimization</span>
              <span className="text-[11px] text-zinc-400 font-mono">Prevent Android Doze killer</span>
            </div>
            {!permissions.batteryOptimized ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[3]" /> Unrestricted
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGrantBattery}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-bold shrink-0 transition-colors cursor-pointer"
              >
                Exempt
              </button>
            )}
          </div>
        </div>

        {/* Test Alarm Button */}
        <button
          type="button"
          onClick={handleTestAlarm}
          disabled={isTesting}
          className="w-full h-11 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-amber-300 font-mono text-xs font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isTesting ? 'Scheduling...' : 'Test Alarm in 5 seconds'}</span>
        </button>

        {/* Action Buttons: Dismiss & Done */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleDone}
            className="flex-1 h-12 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 font-mono text-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="flex-1 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
