'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CheckSquare, BarChart3, Clock, Check, Plus, Tag } from 'lucide-react';

export function TasksAnalyticsSection() {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Calculus: Stokes Theorem problem set', subject: 'Math', duration: '45m target', completed: false, isAttached: true },
    { id: 2, title: 'Implement B-Tree rebalancing logic', subject: 'CS', duration: '60m target', completed: true, isAttached: false },
    { id: 3, title: 'Read Organic Chemistry Chapter 8', subject: 'Chem', duration: '30m target', completed: false, isAttached: false },
  ]);

  const [hasDrawn, setHasDrawn] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasDrawn(true);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  return (
    <section id="analytics" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/3 -translate-y-1/2 w-96 h-96 bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-emerald-400 text-xs font-mono uppercase tracking-wider mb-3">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Section 08 • Tasks & Analytics</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Bind Tasks to Timers. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            See your focus breakdown in real time.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Link an active study session directly to a to-do item. When the timer stops, your minutes automatically log against that specific subject.
        </p>
      </div>

      {/* Bento Layout: Interactive Tasks + Visual Subject Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Interactive Task Binder */}
        <div className="lg:col-span-6 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-hud font-bold text-white">
                  Active Task Queue
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                1 Session Linked
              </span>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    task.isAttached
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                      : task.completed
                      ? 'bg-white/[0.01] border-white/[0.04] opacity-50'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        task.completed
                          ? 'bg-emerald-500 border-emerald-500 text-black'
                          : 'border-white/20 bg-white/5'
                      }`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="min-w-0">
                      <span
                        className={`text-xs font-semibold block truncate ${
                          task.completed ? 'line-through text-slate-500' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-slate-400">
                        <span className="text-amber-300">{task.subject}</span>
                        <span>•</span>
                        <span>{task.duration}</span>
                      </div>
                    </div>
                  </div>

                  {task.isAttached && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-2 py-1 rounded-md shrink-0 border border-emerald-500/30">
                      <Clock className="w-3 h-3 animate-spin" />
                      <span>Recording</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Tap any task to test checkoff</span>
            <span className="font-mono text-[11px] text-emerald-400">2/3 Remaining</span>
          </div>
        </div>

        {/* Right: Focus Chart with Subject Breakdown */}
        <div
          ref={chartRef}
          className="lg:col-span-6 p-7 rounded-3xl bg-[#0F121C] border border-white/10 flex flex-col justify-between shadow-xl"
        >
          <div>
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-hud font-bold text-white">
                  Focus Distribution
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">This Week • 28.5 hrs</span>
            </div>

            {/* Subject Distribution Bar Breakdown */}
            <div className="space-y-4 my-4">
              {/* Mathematics */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="text-white font-medium">Mathematics & Calculus</span>
                  <span className="text-amber-400 font-bold">12.8 hrs (45%)</span>
                </div>
                <div className="h-2.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(251,191,36,0.4)]"
                    style={{ width: hasDrawn ? '45%' : '0%' }}
                  />
                </div>
              </div>

              {/* Computer Science */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="text-white font-medium">Computer Science & Systems</span>
                  <span className="text-cyan-400 font-bold">8.5 hrs (30%)</span>
                </div>
                <div className="h-2.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-1000 ease-out delay-150 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                    style={{ width: hasDrawn ? '30%' : '0%' }}
                  />
                </div>
              </div>

              {/* Physical Sciences */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="text-white font-medium">Chemistry & Physics</span>
                  <span className="text-emerald-400 font-bold">7.2 hrs (25%)</span>
                </div>
                <div className="h-2.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-1000 ease-out delay-300 shadow-[0_0_10px_rgba(52,211,153,0.4)]"
                    style={{ width: hasDrawn ? '25%' : '0%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Visualized automatically from recorded sessions</span>
            <span className="text-emerald-400 font-mono text-[11px]">+3.2h vs Last Week</span>
          </div>
        </div>
      </div>
    </section>
  );
}
