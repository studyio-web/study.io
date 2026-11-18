'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Check,
  X,
  Settings,
  AlertTriangle,
  Loader2,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  InstalledApp,
  StrictMode,
  loadAllowedApps,
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
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set(allowedApps));
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!searchQuery.trim()) return installedApps;
    const q = searchQuery.toLowerCase();
    return installedApps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.packageName.toLowerCase().includes(q)
    );
  }, [installedApps, searchQuery]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-[var(--surface,#121214)] border border-[var(--border,rgba(255,255,255,0.1))] shadow-2xl text-[var(--text,#fff)] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
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
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50"
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
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 divide-y divide-white/[0.04]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-white/50 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span>Scanning installed apps...</span>
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-xs">
              No matching apps found.
            </div>
          ) : (
            filteredApps.map((app) => {
              const isSelected = selectedPackages.has(app.packageName);
              return (
                <div
                  key={app.packageName}
                  onClick={() => toggleApp(app.packageName)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors pt-2.5 ${
                    isSelected
                      ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.12]'
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
                        ? 'border-amber-400 bg-amber-400 text-black'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] flex items-center justify-end gap-2.5 shrink-0 bg-white/[0.02]">
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
            className="px-5 py-2 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-amber-400 hover:bg-amber-300 text-black transition-colors shadow-md"
          >
            Save Allowed Apps
          </button>
        </div>
      </div>
    </div>
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[var(--surface,#121214)] border border-[var(--border,rgba(255,255,255,0.1))] p-6 shadow-2xl text-[var(--text,#fff)] text-center">
        <div className="w-14 h-14 rounded-3xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
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
            className="w-full py-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-amber-400 hover:bg-amber-300 text-black transition-all shadow-md flex items-center justify-center gap-2"
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
    </div>
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in zoom-in-95 duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-rose-950/40 border border-rose-500/40 p-6 shadow-[0_0_50px_rgba(244,63,94,0.3)] text-white text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/50 text-rose-400 flex items-center justify-center mx-auto mb-4 animate-bounce">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold">
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
            className="w-full py-3 rounded-xl text-xs font-hud font-bold uppercase tracking-wider bg-rose-500 hover:bg-rose-400 text-white transition-all shadow-lg flex items-center justify-center gap-2"
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
    </div>
  );
}
