'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Users, MessageSquare, Radio, Clock, ShieldCheck, Heart } from 'lucide-react';

interface RoomMember {
  id: string;
  name: string;
  avatar: string;
  status: 'focusing' | 'break' | 'paused';
  timer: string;
}

const MEMBERS: RoomMember[] = [
  { id: '1', name: 'Alex Rivera', avatar: '/images/avatars/scholars/atlas.webp?v=3', status: 'focusing', timer: '42:15' },
  { id: '2', name: 'Maya Lin', avatar: '/images/avatars/scholars/lyra.webp?v=3', status: 'focusing', timer: '28:50' },
  { id: '3', name: 'Dev Sharma', avatar: '/images/avatars/scholars/cipher.webp?v=3', status: 'break', timer: '04:12' },
  { id: '4', name: 'Sophia Kim', avatar: '/images/avatars/scholars/sage1.webp?v=3', status: 'focusing', timer: '51:00' },
  { id: '5', name: 'Jordan Hayes', avatar: '/images/avatars/scholars/zenith.webp?v=3', status: 'paused', timer: '15:20' },
];

const CHAT_SEQUENCE = [
  { id: 1, user: 'Maya Lin', text: '@Alex 50-minute Calculus block done! Taking 5.', time: 'Just now' },
  { id: 2, user: 'Alex Rivera', text: 'Crushing it @Maya 🔥 Keep the streak alive.', time: '1m ago' },
  { id: 3, user: 'Dev Sharma', text: 'Back from break. Starting 45m Pomodoro.', time: '2m ago' },
];

export function RoomsSection() {
  const [activeChatIndex, setActiveChatIndex] = useState(2);

  // Soft scripted loop for chat demo
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveChatIndex((prev) => (prev + 1) % CHAT_SEQUENCE.length);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="rooms" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background radial glow */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-cyan-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-3">
          <Users className="w-3.5 h-3.5" />
          <span>Section 06 • Live Peer Presence</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Virtual Study Rooms. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Accountability with peers worldwide.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Create private or public rooms. See live member focus states, exchange encouragement in room chat, and study together in quiet synchrony.
        </p>
      </div>

      {/* Main Room Simulation UI */}
      <div className="rounded-[32px] bg-[#0C101A] border border-white/10 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.85)] max-w-4xl mx-auto">
        {/* Room Header Bar */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/[0.08] flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-hud font-bold text-white tracking-wide">
                  Deep Work Sanctuary #04
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                5 Scholars active • Silent Pomodoro session
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Room Cycle: 45m / 15m</span>
          </div>
        </div>

        {/* Room Members Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {MEMBERS.map((m) => {
            const isFocusing = m.status === 'focusing';
            const isBreak = m.status === 'break';
            return (
              <div
                key={m.id}
                className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col items-center text-center relative overflow-hidden"
              >
                {/* Status indicator dot */}
                <div className="relative mb-2">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border-2 border-white/10">
                    <Image
                      src={m.avatar}
                      alt={m.name}
                      width={48}
                      height={48}
                      className="object-cover"
                    />
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0C101A] ${
                      isFocusing ? 'bg-emerald-400' : isBreak ? 'bg-sky-400' : 'bg-amber-400'
                    }`}
                  />
                </div>

                <span className="text-xs font-semibold text-white truncate w-full">
                  {m.name}
                </span>

                <span
                  className={`text-[10px] font-mono mt-1 px-2 py-0.5 rounded-md ${
                    isFocusing
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : isBreak
                      ? 'bg-sky-500/10 text-sky-300'
                      : 'bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {isFocusing ? `Focus ${m.timer}` : isBreak ? `Break ${m.timer}` : 'Paused'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scripted Looping Chat Window */}
        <div className="rounded-2xl bg-black/40 border border-white/[0.06] p-4">
          <div className="flex items-center gap-2 pb-2 mb-3 border-b border-white/[0.06] text-xs font-mono text-slate-400 uppercase tracking-wider">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Room Chat Feed (Live Demo)</span>
          </div>

          <div className="space-y-2.5">
            {CHAT_SEQUENCE.slice(0, activeChatIndex + 1).map((msg) => (
              <div key={msg.id} className="flex items-start gap-2.5 text-xs animate-fade-in">
                <span className="font-semibold text-cyan-300 font-sans shrink-0">
                  {msg.user}:
                </span>
                <span className="text-slate-200 font-sans flex-1">
                  {msg.text}
                </span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  {msg.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
