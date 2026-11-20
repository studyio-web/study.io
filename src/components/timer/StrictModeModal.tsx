'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Search,
  Check,
  X,
  Settings,
  Loader2,
  Lock,
  PlaySquare,
} from 'lucide-react';
import {
  InstalledApp,
  StrictMode,
  saveAllowedApps,
} from '../../lib/strictModePlugin';
import { triggerHaptic } from '../../lib/native-feel';

interface AllowedAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allowedApps: string[];
  onSaveAllowedApps: (apps: string[]) => void;
}

const ESSENTIAL_KEYWORDS = [
  'dialer',
  'phone',
  'contact',
  'message',
  'sms',
  'calc',
  'clock',
  'calendar',
  'setting',
  'note',
];

export function StrictModeAllowedAppsModal({
  isOpen,
  onClose,
  allowedApps,
  onSaveAllowedApps,
}: AllowedAppsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set(allowedApps));
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedPackages(new Set(allowedApps));
      setSearchQuery('');
      loadApps();
    }
  }, [isOpen, allowedApps]);

  const loadApps = async () => {
    setLoading(true);
    try {
      const res = await StrictMode.getInstalledApps();
      setInstalledApps(res.apps || []);
    } catch (e) {
      console.warn('[StrictMode] Failed to load installed apps:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredApps = useMemo(() => {
    let list = installedApps;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = installedApps.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.packageName.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aSel = selectedPackages.has(a.packageName);
      const bSel = selectedPackages.has(b.packageName);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [installedApps, searchQuery, selectedPackages]);

  const selectedCountInFiltered = useMemo(() => {
    return filteredApps.filter((a) => selectedPackages.has(a.packageName)).length;
  }, [filteredApps, selectedPackages]);

  const toggleApp = (packageName: string) => {
    triggerHaptic('light');
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    triggerHaptic('medium');
    setSelectedPackages(new Set(installedApps.map((a) => a.packageName)));
  };

  const handleDeselectAll = () => {
    triggerHaptic('medium');
    setSelectedPackages(new Set());
  };

  const handleSelectEssentials = () => {
    triggerHaptic('medium');
    const essentialPkgs = installedApps
      .filter((app) => {
        const lower = (app.name + ' ' + app.packageName).toLowerCase();
        return ESSENTIAL_KEYWORDS.some((kw) => lower.includes(kw));
      })
      .map((a) => a.packageName);
    setSelectedPackages(new Set(essentialPkgs));
  };

  const handleSave = () => {
    triggerHaptic('success');
    const list = Array.from(selectedPackages);
    saveAllowedApps(list);
    onSaveAllowedApps(list);
    onClose();
  };

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[82vh] mb-16 sm:mb-0 flex flex-col rounded-3xl bg-[var(--surface,#121214)] border border-[var(--border,rgba(255,255,255,0.12))] shadow-2xl text-[var(--text,#fff)] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 text-white flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-hud text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>Allowed Apps in Strict Mode</span>
              </h3>
              <p className="text-xs text-white/50">
                Only checked apps can be opened during your focus timer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quick Filters */}
        <div className="p-4 pb-2 space-y-3 shrink-0 bg-white/[0.02]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search apps by name..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-white/30 focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-[11px] text-white/50">
              {selectedPackages.size} of {installedApps.length} allowed
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectEssentials}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors"
              >
                Essentials
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors"
              >
                All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white transition-colors"
              >
                None
              </button>
            </div>
          </div>
        </div>

        {/* App List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-white/50 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span>Scanning installed apps...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-xs">
              No matching apps found.
            </div>
          ) : (
            filteredApps.map((app, index) => {
              const isSelected = selectedPackages.has(app.packageName);
              const isFirstSelected = isSelected && index === 0;
              const prevApp = index > 0 ? filteredApps[index - 1] : null;
              const isFirstUnselected =
                !isSelected &&
                prevApp !== null &&
                selectedPackages.has(prevApp.packageName);

              return (
                <React.Fragment key={app.packageName}>
                  {isFirstSelected && (
                    <div className="pb-1 pt-0.5 px-1 flex items-center gap-2">
                      <span className="text-[10px] font-mono tracking-wider uppercase text-white/50">
                        Allowed Apps ({selectedCountInFiltered})
                      </span>
                      <div className="h-[1px] flex-1 bg-white/[0.08]" />
                    </div>
                  )}

                  {isFirstUnselected && (
                    <div className="pt-3 pb-1 px-1 flex items-center gap-2">
                      <span className="text-[10px] font-mono tracking-wider uppercase text-white/40">
                        Other Apps ({filteredApps.length - selectedCountInFiltered})
                      </span>
                      <div className="h-[1px] flex-1 bg-white/[0.08]" />
                    </div>
                  )}

                  <div
                    onClick={() => toggleApp(app.packageName)}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white/[0.08] hover:bg-white/[0.12]'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {app.icon ? (
                        <img
                          src={app.icon}
                          alt=""
                          className="w-8 h-8 rounded-lg shrink-0 object-contain"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-white/10 text-white/80 font-bold flex items-center justify-center text-xs shrink-0">
                          {app.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-medium text-white truncate">
                          {app.name}
                        </p>
                        <p className="text-[10px] font-mono text-white/40 truncate">
                          {app.packageName}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ml-3 ${
                        isSelected
                          ? 'border-white bg-white text-black'
                          : 'border-white/20 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer (Guaranteed above navigation bar with safe-area padding) */}
        <div className="p-4 pb-[max(env(safe-area-inset-bottom,0px)+16px,24px)] border-t border-white/[0.08] flex items-center justify-end gap-3 shrink-0 bg-[var(--surface,#121214)] z-20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-white hover:bg-zinc-200 text-black transition-all shadow-md active:scale-95"
          >
            Save Allowed Apps
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Permission Required Prompt Dialog
 */
interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestPermission: () => void;
}

export function StrictModePermissionModal({
  isOpen,
  onClose,
  onRequestPermission,
}: PermissionModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--surface,#121214)] border border-[var(--border,rgba(255,255,255,0.12))] p-6 shadow-2xl text-[var(--text,#fff)] text-center">
        <div className="w-14 h-14 rounded-3xl bg-white/10 border border-white/15 text-white flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="font-hud text-lg font-bold text-white tracking-wide">
          Usage Access Required
        </h3>
        <p className="mt-2 text-xs text-white/60 leading-relaxed">
          Strict Mode blocks distracting apps during your focus sessions. To detect which app is active on your screen, Android requires you to grant <strong>Usage Access</strong> permission.
        </p>

        <div className="mt-4 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/50 text-left">
          🔒 <strong>Privacy First:</strong> App usage is checked strictly on your phone to keep you focused. No app data is ever uploaded or shared.
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onRequestPermission();
            }}
            className="w-full py-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-white hover:bg-zinc-200 text-black transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span>Grant in Android Settings</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

import { LockdownSheet, LockdownSheetProps } from './LockdownSheet';
export { LockdownSheet };

/**
 * Warning Confirmation Modal before starting a Countdown with Strict Mode / Ultra Strict Mode
 * Powered by shared LockdownSheet component
 */
export interface StrictCountdownWarningModalProps {
  isOpen: boolean;
  isUltraStrict: boolean;
  countdownSeconds: number;
  subjectName?: string;
  allowedApps?: string[];
  allowedAppsCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function StrictCountdownWarningModal({
  isOpen,
  isUltraStrict,
  countdownSeconds,
  subjectName,
  allowedApps = [],
  allowedAppsCount,
  onConfirm,
  onCancel,
}: StrictCountdownWarningModalProps) {
  return (
    <LockdownSheet
      isOpen={isOpen}
      mode={isUltraStrict ? 'ultra' : 'strict'}
      countdownSeconds={countdownSeconds}
      subjectName={subjectName}
      allowedApps={allowedApps}
      allowedAppsCount={allowedAppsCount}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Blocked App Screen / Modal when non-allowed app is detected
 */
interface BlockedAppModalProps {
  isOpen: boolean;
  blockedAppName: string;
  blockedPackageName: string;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export function StrictModeBlockedModal({
  isOpen,
  blockedAppName,
  blockedPackageName,
  onDismiss,
  onOpenSettings,
}: BlockedAppModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in zoom-in-95 duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-zinc-950 border border-rose-500/30 p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-white text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4 animate-bounce">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
          Strict Mode Violation
        </span>

        <h3 className="mt-3 font-hud text-xl font-black text-white tracking-wide">
          App Blocked: {blockedAppName}
        </h3>

        <p className="mt-2 text-xs text-white/70 leading-relaxed">
          <strong>{blockedAppName}</strong> is not on your allowed apps list. Strict Mode is protecting your focus session from distractions.
        </p>

        {blockedPackageName && (
          <div className="mt-2 font-mono text-[10px] text-white/40">
            {blockedPackageName}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onDismiss();
            }}
            className="w-full py-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-white hover:bg-zinc-200 text-black transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <span>Back to Focus Timer</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenSettings();
            }}
            className="w-full py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Allow This App
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Clean, High-End Strict Mode Configuration Sheet / Modal
 */
interface StrictConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isStrictMode: boolean;
  isUltraStrict?: boolean;
  isBlockShortsReels?: boolean;
  isDeviceAdminActive?: boolean;
  isFocusing: boolean;
  onToggleStrictMode: () => void;
  onToggleUltraStrict?: () => void;
  onToggleBlockShortsReels?: () => void;
  onRequestDeviceAdmin?: () => void;
  allowedAppsCount: number;
  onOpenAllowedApps: () => void;
  hasUsagePermission: boolean;
  hasOverlayPermission: boolean;
  hasAccessibilityPermission?: boolean;
  onRequestUsagePermission: () => void;
  onRequestOverlayPermission: () => void;
  onRequestAccessibilityPermission?: () => void;
}

export function StrictModeConfigModal({
  isOpen,
  onClose,
  isStrictMode,
  isUltraStrict = false,
  isBlockShortsReels = false,
  isDeviceAdminActive = false,
  isFocusing,
  onToggleStrictMode,
  onToggleUltraStrict,
  onToggleBlockShortsReels,
  onRequestDeviceAdmin,
  allowedAppsCount,
  onOpenAllowedApps,
  hasUsagePermission,
  hasOverlayPermission,
  hasAccessibilityPermission = false,
  onRequestUsagePermission,
  onRequestOverlayPermission,
  onRequestAccessibilityPermission,
}: StrictConfigModalProps) {
  const [mounted, setMounted] = useState(false);
  const lastToggleTimeRef = useRef<{ [key: string]: number }>({});
  const canToggle = (key: string, cooldownMs = 400) => {
    const now = Date.now();
    const last = lastToggleTimeRef.current[key] || 0;
    if (now - last < cooldownMs) return false;
    lastToggleTimeRef.current[key] = now;
    return true;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  const isBlockShortsActive = Boolean(isBlockShortsReels && hasAccessibilityPermission);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 pb-[max(calc(env(safe-area-inset-bottom,0px)+16px),24px)] bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--surface,#121214)] border border-[var(--border,rgba(255,255,255,0.12))] p-5 sm:p-6 shadow-2xl text-[var(--text,#fff)] max-h-[80vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 text-white flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-hud text-base font-bold text-white tracking-wide">
                Strict Mode Settings
              </h3>
              <p className="text-xs text-white/50">
                Lock down distractions during focus sessions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 overflow-y-auto flex-1 pr-1 -mr-1">
          {/* Active Session Lock Notice */}
          {isFocusing && (
            <div className={`p-3.5 rounded-2xl border text-white/90 text-xs flex items-center gap-3 ${
              isUltraStrict
                ? 'bg-red-950/30 border-red-500/30'
                : 'bg-white/[0.04] border-white/15'
            }`}>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
                isUltraStrict
                  ? 'bg-red-500/15 border-red-500/35 text-red-400'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              }`}>
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className={`font-semibold ${isUltraStrict ? 'text-red-300' : 'text-white'}`}>
                  {isUltraStrict ? '⚡ Ultra Strict Lockdown Active' : 'Strict Mode is Locked'}
                </p>
                <p className="text-[11px] text-white/50 mt-0.5">
                  {isUltraStrict
                    ? 'Blocked apps are locked. You cannot stop or pause until your countdown timer reaches 00:00:00.'
                    : 'Locked during active focus sessions. Pause or stop your timer to modify allowed apps.'}
                </p>
              </div>
            </div>
          )}

          {/* Master Switch Card */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-4">
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Strict Mode</p>
                {isFocusing && <Lock className="w-3.5 h-3.5 text-white/40" />}
              </div>
              <p className="text-[11px] text-white/50 mt-0.5">
                Block non-allowed apps when timer is active
              </p>
            </div>
            <button
              type="button"
              disabled={isFocusing}
              onClick={() => {
                if (isFocusing || !canToggle('strict')) return;
                triggerHaptic('medium');
                onToggleStrictMode();
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isFocusing
                  ? 'opacity-40 cursor-not-allowed bg-emerald-500/40'
                  : isStrictMode
                  ? 'cursor-pointer bg-emerald-500'
                  : 'cursor-pointer bg-white/20'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isStrictMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Ultra Strict Mode Card */}
          <div className={`p-4 rounded-2xl border transition-colors flex flex-col gap-3 text-left ${
            isUltraStrict
              ? 'bg-red-500/[0.07] border-red-500/35'
              : 'bg-white/[0.03] border-white/[0.06]'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-hud font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                    isUltraStrict
                      ? 'text-red-400 bg-red-500/20 border-red-500/40'
                      : 'text-white/80 bg-white/10 border-white/15'
                  }`}>
                    ⚡ Ultra Strict Mode
                  </span>
                  {isFocusing && <Lock className="w-3.5 h-3.5 text-white/40" />}
                </div>
                <p className="text-[11px] text-white/50 mt-1 leading-snug">
                  Countdown only. No stop/save button. Blocked apps locked until timer ends.
                </p>
              </div>
              <button
                type="button"
                disabled={isFocusing}
                onClick={() => {
                  if (isFocusing || !canToggle('ultra')) return;
                  triggerHaptic('medium');
                  onToggleUltraStrict?.();
                }}
                className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isFocusing
                    ? 'opacity-40 cursor-not-allowed bg-red-500/40'
                    : isUltraStrict
                    ? 'cursor-pointer bg-red-600 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                    : 'cursor-pointer bg-white/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isUltraStrict ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Uninstall Protection Sub-Section inside Ultra Strict */}
            {isUltraStrict && (
              <div className="pt-2.5 border-t border-red-500/20 flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-white/90">🛡️ Uninstall Protection</p>
                    <p className="text-[10px] text-white/50">
                      {isDeviceAdminActive
                        ? 'Device Admin active. App deletion & force-stop locked.'
                        : 'Activate Device Admin to prevent deleting app during timer.'}
                    </p>
                  </div>
                </div>
                {!isDeviceAdminActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!canToggle('admin')) return;
                      triggerHaptic('medium');
                      onRequestDeviceAdmin?.();
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer transition-colors shadow-sm shrink-0"
                  >
                    Activate
                  </button>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                    ACTIVE
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Block Reels & Shorts Card */}
          <div className={`p-4 rounded-2xl border transition-colors flex items-center justify-between gap-4 text-left ${
            isBlockShortsActive
              ? 'bg-emerald-500/[0.06] border-emerald-500/30'
              : 'bg-white/[0.03] border-white/[0.06]'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-hud font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${
                  isBlockShortsActive
                    ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40'
                    : 'text-white/80 bg-white/10 border-white/15'
                }`}>
                  <PlaySquare className="w-3 h-3" />
                  Block Reels & Shorts
                </span>
                {isFocusing && <Lock className="w-3.5 h-3.5 text-white/40" />}
              </div>
              <p className="text-[11px] text-white/50 mt-1 leading-snug">
                Auto-exit Instagram Reels & YouTube Shorts when scrolling during study sessions.
                {!hasAccessibilityPermission && (
                  <span className="block text-amber-400 font-mono text-[10px] mt-0.5">
                    Requires Accessibility permission (Grant below to enable)
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={isFocusing}
              onClick={() => {
                if (isFocusing || !canToggle('reels')) return;
                triggerHaptic('medium');
                onToggleBlockShortsReels?.();
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isFocusing
                  ? 'opacity-40 cursor-not-allowed bg-emerald-500/40'
                  : isBlockShortsActive
                  ? 'cursor-pointer bg-emerald-500'
                  : 'cursor-pointer bg-white/20'
              }`}
              aria-label="Toggle Reels & Shorts Blocker"
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isBlockShortsActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Allowed Apps Card */}
          <div
            onClick={() => {
              if (isFocusing) return;
              triggerHaptic('light');
              onOpenAllowedApps();
            }}
            className={`p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] transition-colors flex items-center justify-between gap-4 text-left ${
              isFocusing
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-white/[0.05] cursor-pointer'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Allowed Apps</p>
                {isFocusing && <Lock className="w-3.5 h-3.5 text-white/40" />}
              </div>
              <p className="text-[11px] text-white/50 mt-0.5">
                {allowedAppsCount === 0
                  ? 'No apps permitted (all non-system apps blocked)'
                  : `${allowedAppsCount} app${allowedAppsCount === 1 ? '' : 's'} permitted during focus`}
              </p>
            </div>
            {isFocusing ? (
              <span className="text-xs font-mono text-white/40 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 shrink-0 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                <span>Locked</span>
              </span>
            ) : (
              <span className="text-xs font-mono text-white bg-white/10 px-3 py-1.5 rounded-xl border border-white/15 font-bold shrink-0">
                Manage →
              </span>
            )}
          </div>

          {/* Required Permissions Section */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-white/40">
              Android Permissions
            </p>

            {/* Usage Access */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">1. Usage Access (Detect apps)</span>
              {hasUsagePermission ? (
                <span className="text-emerald-400 font-mono text-[11px] font-bold">
                  ✓ Granted
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onRequestUsagePermission}
                  className="px-2.5 py-1 rounded-lg bg-white text-black font-bold text-[10px] uppercase tracking-wider"
                >
                  Grant
                </button>
              )}
            </div>

            {/* Display Over Apps (Overlay) */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">2. Display Over Apps (Block screen)</span>
              {hasOverlayPermission ? (
                <span className="text-emerald-400 font-mono text-[11px] font-bold">
                  ✓ Granted
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onRequestOverlayPermission}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] uppercase tracking-wider transition-colors"
                >
                  Grant
                </button>
              )}
            </div>

            {/* Accessibility Service (Reels & Shorts Blocker) */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">3. Accessibility (Reels & Shorts Blocker)</span>
              {hasAccessibilityPermission ? (
                <span className="text-emerald-400 font-mono text-[11px] font-bold">
                  ✓ Granted
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onRequestAccessibilityPermission}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-[10px] uppercase tracking-wider transition-colors"
                >
                  Grant
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Done / Keep Focusing Button (Anchored with safe bottom breathing room) */}
        <div className="pt-4 border-t border-white/[0.08] mt-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl text-xs font-hud font-bold uppercase tracking-wider bg-white text-black hover:bg-neutral-100 transition-all flex items-center justify-center cursor-pointer active:scale-[0.98] shadow-md"
          >
            {isFocusing ? 'Understood (Keep Focusing)' : 'Done'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
