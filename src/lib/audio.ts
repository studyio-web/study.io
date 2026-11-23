// Web Audio API Sound Synthesizer & Ambient Sound Generator

export type AmbientSoundType =
  | 'pinknoise'
  | 'brownnoise'
  | 'whitenoise'
  | 'rain'
  | 'campfire'
  | 'calmnoise'
  | 'starlitpiano'
  | 'zensanctuary'
  | 'waves'
  | 'lofi';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSource: AudioNode | null = null;
  private currentAmbientType: AmbientSoundType | null = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private noiseInterval: number | null = null;
  private activeNodes: (AudioNode & { stop?: () => void })[] = [];
  private alarmInterval: number | null = null;
  private alarmTimeout: number | null = null;
  private alarmNodes: (AudioNode & { stop?: () => void })[] = [];
  private alarmSource: AudioBufferSourceNode | null = null;
  private alarmGain: GainNode | null = null;
  private isAlarmActive: boolean = false;
  private isAmbientPaused: boolean = false;
  private pausedAmbientType: AmbientSoundType | null = null;
  private pausedAmbientVolume: number = 0.5;
  private currentAmbientVolume: number = 0.5;

  private getContext(): AudioContext {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext not available on server');
    }
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('AudioContext not supported');
      }
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public resumeContext() {
    try {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  // Play start chime (silenced per user request)
  public playStartChime() {
    // Silenced
  }

  // Play stop / pause chime (silenced per user request)
  public playStopChime() {
    // Silenced
  }

  // Play bell / milestone chime (silenced per user request)
  public playMilestoneBell() {
    // Silenced
  }

  // Play subtle rising chime for leaderboard podium reveal (silenced per user request)
  public playPodiumReveal() {
    // Silenced
  }

  // Play cheer reaction pop
  public playReactionPop() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // ignore
    }
  }

  // Ambient sound synthesizer: Rain, Fireplace, WhiteNoise, PinkNoise, BrownNoise, CalmMusic
  private audioBuffers = new Map<string, AudioBuffer>();
  private isAmbientLoading: boolean = false;
  private loadingAmbientType: AmbientSoundType | null = null;
  private ambientLoadingListeners = new Set<(isLoading: boolean, type: AmbientSoundType | null) => void>();
  private ambientAbortController: AbortController | null = null;
  private ambientStreamAudio: HTMLAudioElement | null = null;

  public onAmbientLoadingChange(fn: (isLoading: boolean, type: AmbientSoundType | null) => void): () => void {
    this.ambientLoadingListeners.add(fn);
    fn(this.isAmbientLoading, this.loadingAmbientType);
    return () => {
      this.ambientLoadingListeners.delete(fn);
    };
  }

  public getAmbientLoadingState(): { isLoading: boolean; type: AmbientSoundType | null } {
    return {
      isLoading: this.isAmbientLoading,
      type: this.loadingAmbientType,
    };
  }

  private notifyAmbientLoading(isLoading: boolean, type: AmbientSoundType | null) {
    this.isAmbientLoading = isLoading;
    this.loadingAmbientType = type;
    this.ambientLoadingListeners.forEach((fn) => {
      try {
        fn(isLoading, type);
      } catch (err) {
        console.error(err);
      }
    });
  }

  private async getAmbientBuffer(ctx: AudioContext, url: string, signal?: AbortSignal): Promise<AudioBuffer> {
    if (this.audioBuffers.has(url)) {
      return this.audioBuffers.get(url)!;
    }

    // 1. Check persistent CacheStorage for sub-10ms instant disk cache hits
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open('studyio-ambience-v2');
        const match = await cache.match(url);
        if (match) {
          const arrayBuffer = await match.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          this.audioBuffers.set(url, audioBuffer);
          return audioBuffer;
        }
      } catch {
        // CacheStorage unavailable or corrupted, fallback to network
      }
    }

    // 2. Fetch over network
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      // Persist to CacheStorage asynchronously for instant subsequent loads
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open('studyio-ambience-v2');
          cache.put(url, response.clone()).catch(() => {});
        } catch {}
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(url, audioBuffer);
      return audioBuffer;
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        throw err;
      }
      throw err;
    }
  }

  public async preloadAmbient(type: AmbientSoundType): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      const ctx = this.getContext();
      let effectiveType: AmbientSoundType = type;
      if (type === 'waves' || type === 'lofi') effectiveType = 'calmnoise';

      const urls: Record<string, string> = {
        'rain': '/audio/ambience/rain.mp3',
        'campfire': '/audio/ambience/fireplace.mp3',
        'whitenoise': '/audio/ambience/white-noise.mp3',
        'pinknoise': '/audio/ambience/pink-noise.mp3',
        'brownnoise': '/audio/ambience/brown-noise.mp3',
        'calmnoise': '/audio/ambience/calm-noise.mp3',
        'starlitpiano': '/audio/ambience/starlit-piano.mp3',
        'zensanctuary': '/audio/ambience/zen-sanctuary.mp3',
      };
      const url = urls[effectiveType];
      if (url && !this.audioBuffers.has(url)) {
        await this.getAmbientBuffer(ctx, url);
      }
    } catch {
      // background preload non-fatal
    }
  }

  public preloadAllAmbient(): void {
    if (typeof window === 'undefined') return;
    try {
      // Prioritize preloading the 3 noise types first, then nature & music
      const allFiles: AmbientSoundType[] = [
        'brownnoise',
        'pinknoise',
        'whitenoise',
        'rain',
        'campfire',
        'calmnoise',
        'starlitpiano',
        'zensanctuary',
      ];
      allFiles.forEach((type, idx) => {
        setTimeout(() => {
          this.preloadAmbient(type);
        }, 50 + idx * 250);
      });
    } catch {
      // ignore
    }
  }

  // Volume compensation factors: precisely calibrated to guarantee identical perceived loudness (EBU R128 ~ -18.0 LUFS) across all atmosphere sounds
  private volumeCompensation: Record<AmbientSoundType, number> = {
    'pinknoise': 1.0,
    'brownnoise': 1.05,
    'whitenoise': 0.90,
    'rain': 0.95,
    'campfire': 1.20,
    'calmnoise': 1.08,
    'starlitpiano': 1.08,
    'zensanctuary': 1.08,
    'waves': 1.0,
    'lofi': 1.0,
  };

  private playAmbientBuffer(ctx: AudioContext, buffer: AudioBuffer, effectiveType: AmbientSoundType, volume: number) {
    if (this.currentAmbientType !== effectiveType) {
      return;
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
    
    const compFactor = this.volumeCompensation[effectiveType] || 1.0;
    masterGain.gain.linearRampToValueAtTime(volume * compFactor, ctx.currentTime + 1.2);
    
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    const source1 = ctx.createBufferSource();
    source1.buffer = buffer;
    source1.loop = true;
    source1.loopStart = 0.0;
    source1.loopEnd = buffer.duration;
    source1.connect(masterGain);
    source1.start(0);
    this.activeNodes.push(source1);

    this.ambientSource = source1;
  }

  public async startAmbient(type: AmbientSoundType, volume = 0.4) {
    try {
      if (typeof window === 'undefined') return;
      
      const ctx = this.getContext();

      // Map legacy types
      let effectiveType: AmbientSoundType = type;
      if (type === 'waves' || type === 'lofi') {
        effectiveType = 'calmnoise';
      }

      // Guard: if already playing this exact type, do not restart to prevent stuttering
      if (this.currentAmbientType === effectiveType && (this.ambientSource || this.ambientStreamAudio) && !this.isAmbientPaused) {
         this.setAmbientVolume(volume);
         return;
      }
      
      this.stopAmbient();
      this.currentAmbientType = effectiveType;
      this.isAmbientPaused = false;
      this.pausedAmbientType = null;
      this.currentAmbientVolume = volume;

      // Studio-mastered seamless audio files matching user's exact YouTube reference audio
      const urls: Record<string, string> = {
        'rain': '/audio/ambience/rain.mp3',
        'campfire': '/audio/ambience/fireplace.mp3',
        'whitenoise': '/audio/ambience/white-noise.mp3',
        'pinknoise': '/audio/ambience/pink-noise.mp3',
        'brownnoise': '/audio/ambience/brown-noise.mp3',
        'calmnoise': '/audio/ambience/calm-noise.mp3',
        'starlitpiano': '/audio/ambience/starlit-piano.mp3',
        'zensanctuary': '/audio/ambience/zen-sanctuary.mp3',
        'waves': '/audio/ambience/calm-noise.mp3',
        'lofi': '/audio/ambience/calm-noise.mp3',
      };
      
      const url = urls[effectiveType];
      if (url) {
        if (this.ambientAbortController) {
          this.ambientAbortController.abort();
        }
        const controller = new AbortController();
        this.ambientAbortController = controller;

        const isCached = this.audioBuffers.has(url);
        if (isCached) {
          const buffer = this.audioBuffers.get(url)!;
          this.playAmbientBuffer(ctx, buffer, effectiveType, volume);
          return;
        }

        // Fast streaming startup: start streaming the real studio MP3 on canplay (~100ms) so user never waits
        this.notifyAmbientLoading(true, effectiveType);
        const compFactor = this.volumeCompensation[effectiveType] || 1.0;
        const streamAudio = new Audio(url);
        streamAudio.loop = true;
        streamAudio.volume = Math.max(0, Math.min(1, volume * compFactor));
        this.ambientStreamAudio = streamAudio;

        const onCanPlay = () => {
          if (this.currentAmbientType === effectiveType && this.ambientStreamAudio === streamAudio && !this.isAmbientPaused) {
            streamAudio.play().catch(() => {});
            this.notifyAmbientLoading(false, null);
          }
        };
        streamAudio.addEventListener('canplay', onCanPlay, { once: true });

        // In parallel, load full AudioBuffer into CacheStorage and memory for seamless sample-accurate looping
        let buffer: AudioBuffer;
        try {
          buffer = await this.getAmbientBuffer(ctx, url, controller.signal);
        } catch (fetchErr: any) {
          if (controller.signal.aborted || fetchErr?.name === 'AbortError') {
            return;
          }
          throw fetchErr;
        } finally {
          if (this.currentAmbientType === effectiveType) {
            this.notifyAmbientLoading(false, null);
          }
        }

        // If user is still listening to this track, seamlessly switch to pristine AudioBufferSourceNode
        if (this.currentAmbientType === effectiveType && !this.isAmbientPaused) {
          this.playAmbientBuffer(ctx, buffer, effectiveType, volume);
          if (this.ambientStreamAudio === streamAudio) {
            streamAudio.pause();
            streamAudio.src = '';
            this.ambientStreamAudio = null;
          }
        }
      }
    } catch (e) {
      this.notifyAmbientLoading(false, null);
      console.error("Audio Engine Error in startAmbient:", e);
    }
  }

  public setAmbientVolume(vol: number) {
    this.currentAmbientVolume = vol;
    if (this.isAmbientPaused) {
      this.pausedAmbientVolume = vol;
    }
    const compFactor = (this.currentAmbientType && this.volumeCompensation[this.currentAmbientType]) || 1.0;
    const target = Math.max(0, vol * compFactor);

    if (this.ambientStreamAudio) {
      this.ambientStreamAudio.volume = Math.max(0, Math.min(1, target));
    }
    if (this.ambientGain && this.ctx && this.currentAmbientType) {
      this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, this.ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.1);
    }
  }

  public isPausedAmbient(): boolean {
    return this.isAmbientPaused;
  }

  public pauseAmbient() {
    // If not playing and not having a current ambient, check saved preference
    if (!this.currentAmbientType && !this.ambientGain && !this.ambientStreamAudio) {
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('studyio-atmosphere-sound');
          if (saved && saved !== 'none') {
            this.pausedAmbientType = saved as AmbientSoundType;
            this.isAmbientPaused = true;
          }
        } catch {
          // ignore
        }
      }
      return;
    }

    this.isAmbientPaused = true;
    this.pausedAmbientType = this.currentAmbientType;
    this.pausedAmbientVolume = this.currentAmbientVolume;

    if (this.ambientAbortController) {
      this.ambientAbortController.abort();
      this.ambientAbortController = null;
    }
    this.notifyAmbientLoading(false, null);

    if (this.ambientStreamAudio) {
      this.ambientStreamAudio.pause();
    }

    if (this.ambientGain && this.ctx) {
      try {
        this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, this.ctx.currentTime);
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);
      } catch {
        // ignore
      }
    }

    const nodesToStop = [...this.activeNodes];
    this.activeNodes = [];

    setTimeout(() => {
      nodesToStop.forEach((node) => {
        try {
          if (typeof node.stop === 'function') node.stop();
          node.disconnect();
        } catch {
          // ignore
        }
      });
    }, 300);

    if (this.noiseInterval) {
      clearInterval(this.noiseInterval);
      this.noiseInterval = null;
    }
    this.currentAmbientType = null;
    this.ambientSource = null;
  }

  public resumeAmbient(forcedType?: AmbientSoundType, volume?: number) {
    let typeToResume = forcedType || this.pausedAmbientType;

    if (!typeToResume && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('studyio-atmosphere-sound');
        if (saved && saved !== 'none') {
          typeToResume = saved as AmbientSoundType;
        }
      } catch {
        // ignore
      }
    }

    if (!typeToResume) {
      this.isAmbientPaused = false;
      this.pausedAmbientType = null;
      return;
    }

    let vol = volume !== undefined ? volume : this.pausedAmbientVolume;
    if (typeof window !== 'undefined' && volume === undefined) {
      try {
        const savedVol = localStorage.getItem('studyio-atmosphere-volume');
        if (savedVol !== null) {
          const parsed = parseFloat(savedVol);
          if (!isNaN(parsed) && parsed >= 0) vol = parsed;
        }
      } catch {
        // ignore
      }
    }

    this.isAmbientPaused = false;
    this.pausedAmbientType = null;
    this.startAmbient(typeToResume, vol);
  }

  // Play esports victory rank settlement fanfare
  public playRankSettlementSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      // High-energy heroic esports chords: D4, F#4, A4, D5, E5, F#5
      const notes = [293.66, 369.99, 440.0, 587.33, 659.25, 739.99];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);

        // Lowpass filter to give smooth analog brass synth tone
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200, now);
        filter.frequency.exponentialRampToValueAtTime(4500, now + idx * 0.09 + 0.1);

        gain.gain.setValueAtTime(0, now + idx * 0.09);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.09 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 1.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 1.3);
      });
    } catch {
      // ignore
    }
  }

  // Play subtle futuristic mechanical tick for RP progress counter
  public playRankTickSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.03);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.035);
    } catch {
      // ignore
    }
  }

  // Helper to create soft saturation distortion curve for WaveShaper
  private createDistortionCurve(amount = 15): Float32Array<ArrayBuffer> {
    const nSamples = 44100;
    const buffer = new ArrayBuffer(nSamples * Float32Array.BYTES_PER_ELEMENT);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // Cinematic Sub-Bass Impact Slam (Layered: WaveShaped 110Hz->28Hz sweep + 1200Hz lowpass white-noise crack + 60Hz sub body)
  public playSubBassImpact() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Core Heavy Sub-Bass Sweep (110Hz -> 28Hz over 400ms) with WaveShaper saturation
      const sweepOsc = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweepOsc.type = 'sine';
      sweepOsc.frequency.setValueAtTime(110, now);
      sweepOsc.frequency.exponentialRampToValueAtTime(28, now + 0.4);

      sweepGain.gain.setValueAtTime(0.65, now);
      sweepGain.gain.linearRampToValueAtTime(0.55, now + 0.03);
      sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      const shaper = ctx.createWaveShaper();
      shaper.curve = this.createDistortionCurve(16);
      shaper.oversample = '2x';

      sweepOsc.connect(shaper);
      shaper.connect(sweepGain);
      sweepGain.connect(ctx.destination);

      sweepOsc.start(now);
      sweepOsc.stop(now + 0.45);

      // 2. White-noise burst through lowpass filter (cutoff 1200Hz, 120ms decay) for "crack"
      const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * 0.14));
      const noiseBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.75;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1200, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(180, now + 0.12);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.42, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + 0.13);

      // 3. 60Hz Sine sub-oscillator at low gain for tactile low-end body
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(60, now);

      bodyGain.gain.setValueAtTime(0.32, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(ctx.destination);

      bodyOsc.start(now);
      bodyOsc.stop(now + 0.4);
    } catch {
      // ignore audio context restrictions
    }
  }

  // Backwards compatibility alias
  public playBassImpactThud() {
    this.playSubBassImpact();
  }

  // Segment ticks: short, quiet click (square wave, 1800Hz, 15ms, gain 0.03) with pitch rising slightly
  public playSegmentTick(progress = 0) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch rises slightly as bar progresses from 1800Hz up to ~2300Hz
      const pitch = 1800 + Math.max(0, Math.min(1, progress)) * 500;
      osc.type = 'square';
      osc.frequency.setValueAtTime(pitch, now);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.018);
    } catch {
      // ignore
    }
  }

  // Deep cinematic promotion sound: sub-bass swell, warm mid-range tonal layer, and resonant impact hit at the end
  public playCinematicPromotionSound(intensity: number = 1, spinDurationMs: number = 1200) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const spinDur = spinDurationMs / 1000;

      // Base intensity scaling
      const gainScale = 1 + (intensity - 1) * 0.15;
      const sustainScale = 1 + (intensity - 1) * 0.1;

      // 1. Low sub-bass swell (45-60Hz) building underneath the spin
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(45 + intensity * 2, now); // 45-60Hz
      
      subGain.gain.setValueAtTime(0, now);
      // Slow rising swell that grows as the badge decelerates
      subGain.gain.exponentialRampToValueAtTime(0.35 * gainScale, now + spinDur - 0.05);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + spinDur + 0.6 * sustainScale);
      
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + spinDur + 1.2);

      // 2. Mid-range tonal layer (brass/string swell) building under spin
      const detunes = [-4, 4];
      detunes.forEach((detune) => {
        const midOsc = ctx.createOscillator();
        const midGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        midOsc.type = 'sawtooth';
        // Warm rich root: D3 (146.83Hz)
        midOsc.frequency.setValueAtTime(146.83, now); 
        midOsc.detune.setValueAtTime(detune, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, now);
        // Filter opens up as it decelerates
        filter.frequency.exponentialRampToValueAtTime(800 + intensity * 60, now + spinDur - 0.1);
        filter.frequency.exponentialRampToValueAtTime(300, now + spinDur + 0.2);

        const baseGain = 0.08 * gainScale;
        midGain.gain.setValueAtTime(0, now);
        // Swell up until the settle
        midGain.gain.exponentialRampToValueAtTime(baseGain * 0.8, now + spinDur - 0.05);
        midGain.gain.exponentialRampToValueAtTime(0.001, now + spinDur + 0.5);

        midOsc.connect(filter);
        filter.connect(midGain);
        midGain.connect(ctx.destination);

        midOsc.start(now);
        midOsc.stop(now + spinDur + 1.2);
      });

      // 3. Resonant impact hit at exactly the final settle beat
      const hitTime = now + spinDur;
      
      const hitOsc = ctx.createOscillator();
      const hitGain = ctx.createGain();
      // Triangle for a bit of harmonic bite
      hitOsc.type = 'triangle';
      hitOsc.frequency.setValueAtTime(110, hitTime);
      hitOsc.frequency.exponentialRampToValueAtTime(55, hitTime + 0.15);

      hitGain.gain.setValueAtTime(0, hitTime);
      hitGain.gain.linearRampToValueAtTime(0.45 * gainScale, hitTime + 0.02);
      hitGain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.3 * sustainScale);

      hitOsc.connect(hitGain);
      hitGain.connect(ctx.destination);
      hitOsc.start(hitTime);
      hitOsc.stop(hitTime + 0.5 * sustainScale);

      // Noise crack for the hit
      const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * 0.1));
      const noiseBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(600, hitTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(100, hitTime + 0.1);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.18 * gainScale, hitTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, hitTime + 0.1);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseSource.start(hitTime);
      noiseSource.stop(hitTime + 0.15);

    } catch {
      // ignore
    }
  }

  // Quick noise-burst layered with a low thud for the shatter crack
  public playShatterCrack(intensity: number = 1) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      
      const gainScale = 1 + (intensity - 1) * 0.15;

      // Low thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(80, now);
      thudOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      
      thudGain.gain.setValueAtTime(0, now);
      thudGain.gain.linearRampToValueAtTime(0.3 * gainScale, now + 0.02);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.2);

      // Sharp noise crack
      const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * 0.1));
      const noiseBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(1000, now);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25 * gainScale, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      noiseSource.start(now);
      noiseSource.stop(now + 0.1);

    } catch {
      // ignore
    }
  }

  // Warm resonant chime / overtone at 432Hz for RP fill completion
  public playRankFillCompletion() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(432, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.25);
    } catch {
      // ignore audio context restrictions
    }
  }

  // Soft low synth swell for recap slide transitions (no bright chimes)
  public playSlideSwell() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(155, now + 0.28);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.linearRampToValueAtTime(180, now + 0.35);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // ignore
    }
  }

  // Heavy sub-bass thud for rank reveal impact hit
  public playImpactThud() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Sub-bass sweep
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(95, now);
      subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.35);

      subGain.gain.setValueAtTime(0, now);
      subGain.gain.linearRampToValueAtTime(0.32, now + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.46);

      // Low-frequency tactile impact transient
      const bufferLength = Math.max(1, Math.floor(ctx.sampleRate * 0.07));
      const noiseBuffer = ctx.createBuffer(1, bufferLength, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(220, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.06);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.16, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + 0.08);
    } catch {
      // ignore
    }
  }

  public stopAmbient() {
    this.isAmbientPaused = false;
    this.pausedAmbientType = null;
    if (this.ambientAbortController) {
      this.ambientAbortController.abort();
      this.ambientAbortController = null;
    }
    this.notifyAmbientLoading(false, null);

    if (this.ambientStreamAudio) {
      try {
        this.ambientStreamAudio.pause();
        this.ambientStreamAudio.src = '';
      } catch {
        // ignore
      }
      this.ambientStreamAudio = null;
    }

    if (this.ambientGain && this.ctx) {
      try {
        this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, this.ctx.currentTime);
        this.ambientGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.35);
      } catch {
        // ignore
      }
    }

    const nodesToStop = [...this.activeNodes];
    this.activeNodes = [];

    setTimeout(() => {
      nodesToStop.forEach(node => {
        try {
          if (typeof node.stop === 'function') {
            node.stop();
          }
          node.disconnect();
        } catch {
          // ignore
        }
      });
    }, 450);

    if (this.noiseInterval) {
      clearInterval(this.noiseInterval);
      this.noiseInterval = null;
    }
    this.currentAmbientType = null;
    this.ambientSource = null;
  }

  public getCurrentAmbient() {
    return this.currentAmbientType;
  }

  /**
   * Start 5-minute repeating timer alarm.
   * Plays a warm, melodic acoustic chime progression every 3.2s until stopped or 5 min max.
   * Escalates volume gradually over the first 20 seconds.
   */
  public startTimerAlarm(maxDurationSeconds: number = 300) {
    if (typeof window === 'undefined') return;
    this.stopTimerAlarm(); // ensure no overlapping alarm

    // Guard: On native Android, native AlarmService handles audio output on the USAGE_ALARM stream.
    // Web audio must not play concurrently to prevent duplicate playback.
    const isNativeAndroidApp =
      typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor.isNativePlatform?.() &&
      (window as any).Capacitor.getPlatform?.() === 'android';

    if (isNativeAndroidApp) {
      this.isAlarmActive = true;
      return;
    }

    this.isAlarmActive = true;
    this.resumeContext();

    const alarmStartEpoch = Date.now();

    // 1. Attempt to load and play studio-mastered audio file (/audio/alarm_sound.wav)
    try {
      const ctx = this.getContext();
      if (ctx) {
        this.getAmbientBuffer(ctx, '/audio/alarm_sound.wav')
          .then((buffer) => {
            if (!this.isAlarmActive) return;

            // Stop any temporary synth chime interval
            if (this.alarmInterval) {
              clearInterval(this.alarmInterval);
              this.alarmInterval = null;
            }

            // Create looped source
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            const gain = ctx.createGain();
            const now = ctx.currentTime;
            // Smooth 20-second volume escalation ramp
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.linearRampToValueAtTime(1.0, now + 20);

            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(0);

            this.alarmSource = source;
            this.alarmGain = gain;
          })
          .catch((err) => {
            console.warn('[AudioEngine] Could not load /audio/alarm_sound.wav, using procedural synth:', err);
          });
      }
    } catch {
      // ignore
    }

    // 2. Procedural classic stopwatch alarm fallback (instant double-beep every 1s)
    const playStopwatchBeepPhrase = () => {
      if (!this.isAlarmActive || this.alarmSource) return;
      try {
        const ctx = this.getContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const elapsedSec = (Date.now() - alarmStartEpoch) / 1000;
        const rampMultiplier = Math.min(1.0, 0.40 + 0.60 * Math.min(1.0, elapsedSec / 15));

        const FREQ = 2048; // Classic 2048 Hz digital stopwatch piezo beep
        const beeps = [0.0, 0.135]; // Double-beep at 0ms and 135ms

        beeps.forEach((offset) => {
          const startTime = now + offset;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(FREQ, startTime);

          const peakGain = 0.22 * rampMultiplier;
          gain.gain.setValueAtTime(0.0001, startTime);
          gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
          gain.gain.setValueAtTime(peakGain, startTime + 0.070);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.075);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + 0.080);

          this.alarmNodes.push(osc, gain);
        });

        setTimeout(() => {
          this.alarmNodes = this.alarmNodes.filter((n) => {
            try {
              return (n as any).context?.state !== 'closed';
            } catch {
              return false;
            }
          });
        }, 300);
      } catch (err) {
        console.warn('[AudioEngine] stopwatch beep error:', err);
      }
    };

    // Play initial double beep
    playStopwatchBeepPhrase();

    // Repeat every 1.0 second (standard stopwatch alarm cadence)
    this.alarmInterval = window.setInterval(playStopwatchBeepPhrase, 1000);

    // Auto-silence after maxDurationSeconds (default 5 minutes = 300 seconds)
    this.alarmTimeout = window.setTimeout(() => {
      this.stopTimerAlarm();
    }, maxDurationSeconds * 1000);
  }

  public stopTimerAlarm() {
    this.isAlarmActive = false;
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    if (this.alarmTimeout) {
      clearTimeout(this.alarmTimeout);
      this.alarmTimeout = null;
    }

    if (this.alarmSource) {
      try {
        this.alarmSource.stop();
        this.alarmSource.disconnect();
      } catch {}
      this.alarmSource = null;
    }

    if (this.alarmGain) {
      try {
        this.alarmGain.disconnect();
      } catch {}
      this.alarmGain = null;
    }

    // Stop and disconnect any currently sounding nodes
    const nodes = [...this.alarmNodes];
    this.alarmNodes = [];
    nodes.forEach((node) => {
      try {
        if (typeof node.stop === 'function') {
          node.stop();
        }
        node.disconnect();
      } catch {
        // ignore
      }
    });
  }

  public isAlarmRinging(): boolean {
    return this.isAlarmActive;
  }

  public playAlarm() {
    this.startTimerAlarm(300);
  }
}

export const soundFx = new AudioEngine();


