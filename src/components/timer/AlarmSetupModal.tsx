'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Clock,
  Maximize2,
  BatteryCharging,
  CheckCircle2,
  AlertTriangle,
  Play,
  Volume2,
  X,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { TimerNotification, isNativeAndroid, AlarmPermissionsResult } from '../../lib/timerNotificationPlugin';
import { triggerHaptic } from '../../lib/native-feel';
import { toast } from 'react-hot-toast';

interface AlarmSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
}

export function AlarmSetupModal({ isOpen, onClose, onProceed }: AlarmSetupModalProps) {
  const [permissions, setPermissions] = useState<AlarmPermissionsResult>({
    exactAlarm: false,
    fullScreen: false,
    notifications: false,
    batteryOptimized: true,
  });
  const [loading, setLoading] = useState(true);
  const [manufacturer, setManufacturer] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [testCountdown, setTestCountdown] = useState(10);

  const refreshPermissions = useCallback(async () => {
    if (!isNativeAndroid()) return;
    try {
      const perms = await TimerNotification.checkAlarmPermissions();
      setPermissions(perms);
      const dev = await TimerNotification.getDeviceManufacturer().catch(() => null);
      if (dev?.manufacturer) {
        setManufacturer(dev.manufacturer.toLowerCase());
      }
    } catch (err) {
      console.warn('[AlarmSetup] Could not check permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshPermissions();
      // Auto re-check permissions when returning from system settings
      const handleFocus = () => refreshPermissions();
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
    }
  }, [isOpen, refreshPermissions]);

  const handleTestAlarm = async () => {
    triggerHaptic('medium');
    setIsTesting(true);
    setTestCountdown(10);
    try {
      await TimerNotification.testAlarm({ seconds: 10 });
      toast.success('Test alarm scheduled for 10 seconds! Lock your phone now to test.', {
        duration: 5000,
        icon: '⏰',
      });

      const interval = setInterval(() => {
        setTestCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsTesting(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setIsTesting(false);
      toast.error(`Test alarm failed: ${err.message || 'Unknown error'}`);
    }
  };

  const allGranted =
    permissions.notifications &&
    permissions.exactAlarm &&
    permissions.fullScreen &&
    !permissions.batteryOptimized;

  const getBrandGuidance = () => {
    if (manufacturer.includes('xiaomi') || manufacturer.includes('redmi') || manufacturer.includes('poco')) {
      return {
        brand: 'Xiaomi / MIUI / HyperOS',
        hint: 'Go to Settings > Apps > Permissions > Autostart and enable Study.io so alarms fire when phone is asleep.',
      };
    }
    if (manufacturer.includes('samsung')) {
      return {
        brand: 'Samsung OneUI',
        hint: 'In Device Care > Battery > Background usage limits, add Study.io to "Never sleeping apps".',
      };
    }
    if (manufacturer.includes('oppo') || manufacturer.includes('realme')) {
      return {
        brand: 'Oppo / Realme / ColorOS',
        hint: 'Enable "Allow background activity" and "Autostart" in App Info > Battery.',
      };
    }
    if (manufacturer.includes('vivo') || manufacturer.includes('iqoo')) {
      return {
        brand: 'Vivo / Funtouch OS',
        hint: 'Allow "High background power consumption" in Settings > Battery > Background power consumption.',
      };
    }
    if (manufacturer.includes('oneplus')) {
      return {
        brand: 'OnePlus / OxygenOS',
        hint: 'Disable "Deep optimization" in Settings > Battery > Battery optimization for Study.io.',
      };
    }
    if (manufacturer.includes('huawei') || manufacturer.includes('honor')) {
      return {
        brand: 'Huawei / Honor',
        hint: 'Set App Launch to "Manage manually" and enable "Auto-launch" and "Run in background".',
      };
    }
    return null;
  };

  const brandInfo = getBrandGuidance();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0F1015] border border-white/10 shadow-2xl p-6 text-white text-left"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-wide">
                  Make sure your alarm rings
                </h3>
              </div>
              <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                Study.io rings a hardware clock alarm even when your screen is locked or the app is closed. Enable these 4 Android permissions:
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Permissions Checklist */}
          <div className="py-4 space-y-3">
            {/* 1. Notifications */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Notifications</div>
                  <div className="text-[11px] text-white/50">Required to show ringing alarm alerts</div>
                </div>
              </div>
              {permissions.notifications ? (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed</span>
                </div>
              ) : (
                <button
                  onClick={() => TimerNotification.openNotificationSettings()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 active:scale-95 transition-all"
                >
                  Enable
                </button>
              )}
            </div>

            {/* 2. Alarms & Reminders */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Alarms &amp; Reminders</div>
                  <div className="text-[11px] text-white/50">Wakes up phone at exact end time</div>
                </div>
              </div>
              {permissions.exactAlarm ? (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed</span>
                </div>
              ) : (
                <button
                  onClick={() => TimerNotification.requestExactAlarmPermission()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 active:scale-95 transition-all"
                >
                  Enable
                </button>
              )}
            </div>

            {/* 3. Full-Screen Alerts */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <Maximize2 className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Full-Screen Alerts</div>
                  <div className="text-[11px] text-white/50">Turns screen on over lock screen</div>
                </div>
              </div>
              {permissions.fullScreen ? (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed</span>
                </div>
              ) : (
                <button
                  onClick={() => TimerNotification.requestFullScreenPermission()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 active:scale-95 transition-all"
                >
                  Enable
                </button>
              )}
            </div>

            {/* 4. Unrestricted Battery Use */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-3">
                <BatteryCharging className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Unrestricted Battery</div>
                  <div className="text-[11px] text-white/50">Prevents Android killing background timer</div>
                </div>
              </div>
              {!permissions.batteryOptimized ? (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Allowed</span>
                </div>
              ) : (
                <button
                  onClick={() => TimerNotification.requestIgnoreBatteryOptimization()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 active:scale-95 transition-all"
                >
                  Enable
                </button>
              )}
            </div>
          </div>

          {/* Brand-Specific Optimization Guidance */}
          {brandInfo && (
            <div className="mb-4 p-3 rounded-2xl bg-blue-500/[0.08] border border-blue-500/20 text-blue-200 text-xs">
              <div className="font-semibold text-blue-300 flex items-center gap-1.5 mb-1">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Notice for {brandInfo.brand} devices</span>
              </div>
              <p className="text-[11px] text-blue-200/80 leading-relaxed">{brandInfo.hint}</p>
            </div>
          )}

          {/* DND & Volume Warning */}
          <div className="mb-4 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-2.5 text-[11px] text-white/50">
            <Volume2 className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
            <span>
              Tip: The alarm elevates alarm volume automatically, but Do Not Disturb or a completely muted alarm stream can still silence it.
            </span>
          </div>

          {/* Test Alarm in 10s */}
          <div className="mb-4">
            <button
              onClick={handleTestAlarm}
              disabled={isTesting}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>
                {isTesting ? `Alarm ringing in ${testCountdown}s (Lock phone now!)` : 'Test alarm in 10 seconds'}
              </span>
            </button>
          </div>

          {/* Bottom Actions */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              onClick={() => {
                try {
                  localStorage.setItem('studyio_alarm_setup_checked', '1');
                } catch {}
                onProceed();
              }}
              className="w-full py-3 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20"
            >
              <span>{allGranted ? 'Done & Start Countdown' : 'Continue to Countdown'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
