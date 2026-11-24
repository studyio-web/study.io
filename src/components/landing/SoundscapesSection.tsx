'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Disc3, Sliders } from 'lucide-react';

interface SoundTrack {
  id: string;
  name: string;
  category: string;
  src: string;
  defaultVolume: number;
}

const TRACKS: SoundTrack[] = [
  { id: 'rain', name: 'Rainfall', category: 'Nature', src: '/audio/ambience/rain.mp3', defaultVolume: 75 },
  { id: 'campfire', name: 'Campfire', category: 'Warmth', src: '/audio/ambience/fireplace.mp3', defaultVolume: 60 },
  { id: 'white', name: 'White Noise', category: 'Static', src: '/audio/ambience/white-noise.mp3', defaultVolume: 50 },
  { id: 'waves', name: 'Ocean Waves', category: 'Nature', src: '/audio/ambience/waves.mp3', defaultVolume: 65 },
  { id: 'forest', name: 'Deep Forest', category: 'Zen', src: '/audio/ambience/zen-sanctuary.mp3', defaultVolume: 70 },
  { id: 'night', name: 'Night Ambience', category: 'Melody', src: '/audio/ambience/starlit-piano.mp3', defaultVolume: 55 },
  { id: 'wind', name: 'Wind & Air', category: 'Atmosphere', src: '/audio/ambience/calm-noise.mp3', defaultVolume: 50 },
  { id: 'brown', name: 'Brown Noise', category: 'Focus', src: '/audio/ambience/brown-noise.mp3', defaultVolume: 60 },
];

export function SoundscapesSection() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    TRACKS.forEach((t) => (init[t.id] = t.defaultVolume));
    return init;
  });
  const [activeTracks, setActiveTracks] = useState<Record<string, boolean>>({
    rain: true, // Only 1 active by default so it sounds great on play
  });
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioElementsRef.current).forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current = {};
    };
  }, []);

  const getOrCreateAudio = (track: SoundTrack) => {
    if (!audioElementsRef.current[track.id] && typeof Audio !== 'undefined') {
      const audio = new Audio(track.src);
      audio.loop = true;
      audio.volume = (volumes[track.id] || 50) / 100;
      audioElementsRef.current[track.id] = audio;
    }
    return audioElementsRef.current[track.id];
  };

  const handleMasterToggle = () => {
    if (isPlaying) {
      Object.values(audioElementsRef.current).forEach((a) => a.pause());
      setIsPlaying(false);
    } else {
      TRACKS.forEach((track) => {
        if (activeTracks[track.id]) {
          const audio = getOrCreateAudio(track);
          if (audio) {
            audio.volume = (volumes[track.id] || 50) / 100;
            audio.play().catch(() => {});
          }
        }
      });
      setIsPlaying(true);
    }
  };

  const toggleTrack = (id: string) => {
    const nextActive = !activeTracks[id];
    setActiveTracks((prev) => ({ ...prev, [id]: nextActive }));

    const track = TRACKS.find((t) => t.id === id);
    if (!track) return;

    const audio = getOrCreateAudio(track);
    if (audio) {
      if (nextActive && isPlaying) {
        audio.volume = (volumes[id] || 50) / 100;
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }
  };

  const handleVolumeChange = (id: string, newVol: number) => {
    setVolumes((prev) => ({ ...prev, [id]: newVol }));
    const audio = audioElementsRef.current[id];
    if (audio) {
      audio.volume = newVol / 100;
    }
  };

  return (
    <section id="soundscapes" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto relative">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-purple-500/[0.04] rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/[0.08] border border-purple-500/20 text-purple-300 text-xs font-mono uppercase tracking-wider mb-3">
          <Disc3 className="w-3.5 h-3.5" />
          <span>Section 07 • Ambient Soundscapes</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-hud font-bold text-white tracking-tight">
          Eight Ambient Soundscapes. <br />
          <span className="text-slate-400 font-sans font-semibold text-2xl sm:text-3xl">
            Mix and layer your ideal sound environment.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-300 font-sans leading-relaxed">
          Muted by default to respect browser autoplay policies. Click play to experience the actual audio tracks built directly into study.io.
        </p>
      </div>

      {/* Mixer Shell */}
      <div className="rounded-[32px] bg-[#0E101A] border border-white/10 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.85)] max-w-4xl mx-auto">
        {/* Master Control Bar */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/[0.08] flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleMasterToggle}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
                isPlaying
                  ? 'bg-purple-600 text-white shadow-purple-500/25'
                  : 'bg-white text-[#07090E] hover:bg-slate-100'
              }`}
              aria-label={isPlaying ? 'Pause Ambient Mixer' : 'Play Ambient Mixer'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <div>
              <h3 className="text-base font-hud font-bold text-white tracking-wide">
                {isPlaying ? 'Master Audio Playing' : 'Master Audio Paused'}
              </h3>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                {Object.values(activeTracks).filter(Boolean).length} sound layers active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-xl">
            <Sliders className="w-3.5 h-3.5" />
            <span>Multi-channel Layering</span>
          </div>
        </div>

        {/* 8 Tracks Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRACKS.map((track) => {
            const isActive = Boolean(activeTracks[track.id]);
            const vol = volumes[track.id] || 50;
            return (
              <div
                key={track.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isActive && isPlaying
                    ? 'bg-purple-950/20 border-purple-500/40 shadow-md'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {track.name}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {track.category}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleTrack(track.id)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                    aria-label={`Toggle ${track.name}`}
                  >
                    {isActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                </div>

                {/* Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Vol</span>
                    <span>{vol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={vol}
                    aria-label={`Volume for ${track.name}`}
                    onChange={(e) => handleVolumeChange(track.id, parseInt(e.target.value, 10))}
                    disabled={!isActive}
                    className="w-full accent-purple-500 h-1 bg-white/10 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
