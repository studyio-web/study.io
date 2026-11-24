'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-[#07090E] text-slate-300 select-none relative flex flex-col font-sans">
      {/* Background dot grid matching app layout */}
      <div className="fixed inset-0 pointer-events-none bg-dot-grid opacity-20 z-0" />

      {/* Navigation Header */}
      <header className="relative z-10 w-full border-b border-white/[0.08] bg-[#07090E]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <Logo className="w-7 h-7" />
            <span className="text-base font-bold tracking-tight text-white font-sans">
              study.io
            </span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      {/* Main Document Body - Normal, Clean Reading Layout */}
      <main className="relative z-10 flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12 space-y-8">
        {/* Document Header */}
        <div className="border-b border-white/[0.08] pb-6 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-hud font-bold tracking-tight text-white">
            Study.io Privacy Policy
          </h1>
          <p className="text-xs font-mono text-slate-400">
            Effective Date: November 2026 &bull; Architecture Version 2.5
          </p>
        </div>

        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            1. Core Principle &amp; On-Device Architecture
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Study.io is an educational productivity tool designed to help students maintain focus, track study sessions, and avoid digital distractions. We believe that personal productivity software should respect user privacy by default.
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            Our application is architected around an on-device processing principle: all app blocking, timer countdowns, and distraction enforcement execute 100% locally on your phone. No screen recordings, app usage logs, or keystrokes ever leave your device.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            2. Data We Never Collect or Access
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Study.io operates strictly as a focus tool. We do not collect, read, store, or transmit any of the following:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-300">
            <li>Personal text messages, chat logs, emails, or communications.</li>
            <li>Passwords, login credentials, or authentication tokens.</li>
            <li>Photos, videos, audio recordings, or camera feeds.</li>
            <li>Keystrokes, text typed into inputs, or clipboard contents.</li>
            <li>Banking, payment, financial, or cryptocurrency application data.</li>
            <li>Personal contacts, phone call records, or GPS location coordinates.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-4">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            3. Android System Permissions &amp; Technical Scope
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Study.io requests certain optional system permissions to enforce focus mode when you choose to use them. These permissions are strictly opt-in and remain dormant unless a user-initiated study timer is actively running:
          </p>

          <div className="space-y-4 pt-1">
            <div className="space-y-1">
              <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wide">
                A. Accessibility Service (android.permission.BIND_ACCESSIBILITY_SERVICE)
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                <strong>Purpose:</strong> Used exclusively if you enable the optional &ldquo;Block Reels &amp; Shorts&rdquo; feature. When active, it checks window state transitions to detect when short-form video players (such as Instagram Reels or YouTube Shorts) are opened during a study session, prompting you back to your study timer.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>Guarantees:</strong> It does not monitor keyboard input, read text on your screen, inspect chat contents, or run outside an active focus session. When your timer pauses or reaches zero, this service automatically becomes inactive.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wide">
                B. Device Admin (android.permission.BIND_DEVICE_ADMIN)
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                <strong>Purpose:</strong> Used exclusively in &ldquo;Ultra Strict Mode&rdquo; to prevent impulsive app uninstallation while a locked study timer countdown is running.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>Guarantees:</strong> It is restricted solely to the Android package uninstallation block API. It has no permission to reset device passwords, modify lock screens, wipe storage, or lock your device outside an active study session. You can deactivate this permission at any time when a timer is not actively running.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wide">
                C. Usage Access (android.permission.PACKAGE_USAGE_STATS)
              </h3>
              <p className="text-sm leading-relaxed text-slate-300">
                <strong>Purpose:</strong> Used in Strict Mode to compare the active foreground package identifier against your permitted apps whitelist.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong>Guarantees:</strong> App usage evaluation is performed purely in volatile memory on your device. Your overall app usage history or browsing activity is never stored, tracked, or uploaded.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            4. Data Stored with Your Account
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            When you create an account to synchronize your progress across devices, only your core study metrics are saved to our secure, encrypted cloud database:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-300">
            <li>Your account identifier (email address and account UUID).</li>
            <li>Study session records (duration in seconds, timestamps, and chosen subject name).</li>
            <li>Rank progress (Season RP, current Rank Tier, and User Level).</li>
            <li>Daily study streak counter.</li>
            <li>Profile customizations (chosen display name and avatar style).</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            5. No Advertising &amp; No Third-Party Data Sharing
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            We do not sell, rent, monetize, or trade your personal data. Study.io contains no third-party advertising SDKs, behavioral analytics trackers, or commercial data brokers.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            6. Account Deletion &amp; Data Rights
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            You retain complete control over your data. You can permanently purge your account and delete all associated study history at any time directly within the application by navigating to <strong>Settings &rarr; Danger Zone &rarr; Delete Account</strong>.
          </p>
        </section>

        {/* Section 7 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            7. Security Standards
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            All network communication between Study.io and our database infrastructure is encrypted using Transport Layer Security (TLS/HTTPS). Production releases undergo automated security audits and malware scans prior to distribution to ensure binary safety and system integrity.
          </p>
        </section>

        {/* Section 8 */}
        <section className="space-y-3">
          <h2 className="text-base font-hud font-bold text-white tracking-wide">
            8. Questions &amp; Inquiries
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">
            If you have questions regarding this Privacy Policy or the security of your device, you can reach out through the in-app feedback tool in Settings.
          </p>
        </section>

        {/* Document Footer */}
        <footer className="pt-8 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono text-slate-500 pb-16">
          <span>Study.io &bull; All Rights Reserved</span>
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
            Return to App
          </Link>
        </footer>
      </main>
    </div>
  );
}
