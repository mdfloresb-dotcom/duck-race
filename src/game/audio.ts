export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private tunnelWetGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private unlocked = false;
  private muted = false;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  public unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.44;
      this.master.connect(this.ctx.destination);

      this.dryBus = this.ctx.createGain();
      this.dryBus.gain.value = 1.0;
      this.dryBus.connect(this.master);

      // Tunnel echo/reverb feedback bus
      const tunnelDelay = this.ctx.createDelay(0.5);
      tunnelDelay.delayTime.value = 0.088;
      const tunnelFeedback = this.ctx.createGain();
      tunnelFeedback.gain.value = 0.34;
      const tunnelTone = this.ctx.createBiquadFilter();
      tunnelTone.type = 'bandpass';
      tunnelTone.frequency.value = 1150;
      tunnelTone.Q.value = 0.7;
      this.tunnelWetGain = this.ctx.createGain();
      this.tunnelWetGain.gain.value = 0;

      this.dryBus.connect(tunnelDelay);
      tunnelDelay.connect(tunnelTone);
      tunnelTone.connect(tunnelFeedback);
      tunnelFeedback.connect(tunnelDelay);
      tunnelTone.connect(this.tunnelWetGain);
      this.tunnelWetGain.connect(this.master);

      // Dual-oscillator hydro-jet engine synth
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';
      this.engineOsc1.frequency.value = 62;
      this.engineOsc2.frequency.value = 124;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 260;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.dryBus);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // Continuous high-speed wind / water rush loop
      const windLen = this.ctx.sampleRate * 2;
      const windBuf = this.ctx.createBuffer(1, windLen, this.ctx.sampleRate);
      const data = windBuf.getChannelData(0);
      for (let i = 0; i < windLen; i++) data[i] = Math.random() * 2 - 1;
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = windBuf;
      windSrc.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 800;
      this.windFilter.Q.value = 1.1;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;

      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.dryBus);
      windSrc.start();

      this.unlocked = true;
    } catch {
      // Audio unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.44, this.ctx.currentTime, 0.03);
    }
  }

  public setTunnelEffect(inTunnel: boolean): void {
    if (!this.ctx || !this.tunnelWetGain) return;
    this.tunnelWetGain.gain.setTargetAtTime(inTunnel ? 0.58 : 0.0, this.ctx.currentTime, 0.12);
  }

  public updateEngine(
    speedRatio: number,
    rpmRatio: number,
    gear: number,
    turboActive: boolean,
    inTunnel: boolean,
    active: boolean
  ): void {
    if (
      !this.ctx ||
      !this.engineGain ||
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineFilter ||
      !this.windGain ||
      !this.windFilter
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      this.windGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    const gearBase = 52 + (gear - 1) * 16;
    const baseFreq = gearBase + rpmRatio * 96 + speedRatio * 34 + (turboActive ? 54 : 0);
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.045);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.045);
    this.engineFilter.frequency.setTargetAtTime(
      260 + rpmRatio * 560 + speedRatio * 420 + (turboActive ? 680 : 0) + (inTunnel ? 240 : 0),
      now,
      0.045
    );
    this.engineGain.gain.setTargetAtTime(0.055 + speedRatio * 0.085, now, 0.06);

    // Aggressive wind/spray rush above 55% speed
    const rush = Math.max(0, speedRatio - 0.48);
    this.windFilter.frequency.setTargetAtTime(650 + rush * 1650 + (turboActive ? 650 : 0), now, 0.06);
    this.windGain.gain.setTargetAtTime(Math.min(0.16, rush * 0.12 + (turboActive ? 0.05 : 0)), now, 0.06);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.2,
    slideTo: number | null = null,
    delay = 0
  ): void {
    if (!this.ctx || !this.dryBus || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.dryBus);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noiseBurst(dur: number, cutoff = 900, vol = 0.16): void {
    if (!this.ctx || !this.dryBus || this.muted) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.dryBus);
    src.start(now);
  }

  public playMiniTurbo(stage: 1 | 2): void {
    this.tone(stage === 2 ? 320 : 250, stage === 2 ? 0.34 : 0.24, 'sawtooth', 0.2, stage === 2 ? 680 : 510);
    this.noiseBurst(0.22, stage === 2 ? 1850 : 1400, 0.14);
  }

  public playSplash(heavy = false): void {
    this.noiseBurst(heavy ? 0.28 : 0.14, heavy ? 680 : 1200, heavy ? 0.22 : 0.08);
  }

  public playCoin(): void {
    this.tone(988, 0.07, 'sine', 0.18);
    this.tone(1318, 0.12, 'triangle', 0.18, null, 0.055);
  }

  public playPickup(): void {
    this.tone(523, 0.1, 'triangle', 0.22, null, 0);
    this.tone(659, 0.1, 'triangle', 0.22, null, 0.07);
    this.tone(880, 0.18, 'sine', 0.24, null, 0.14);
  }

  public playTurbo(): void {
    this.tone(180, 0.45, 'sawtooth', 0.24, 540);
    this.noiseBurst(0.45, 1600, 0.2);
  }

  public playNitroOverdrive(): void {
    this.tone(220, 0.55, 'sawtooth', 0.26, 780);
    this.tone(330, 0.55, 'triangle', 0.2, 990, 0.05);
    this.noiseBurst(0.5, 2200, 0.22);
  }

  public playShield(): void {
    this.tone(420, 0.25, 'sine', 0.2, 840);
    this.tone(630, 0.3, 'triangle', 0.15, 960, 0.08);
  }

  public playWave(): void {
    this.tone(140, 0.42, 'sine', 0.32, 48);
    this.noiseBurst(0.38, 520, 0.25);
  }

  public playEmp(): void {
    this.tone(620, 0.35, 'square', 0.2, 95);
    this.tone(310, 0.4, 'sawtooth', 0.18, 65, 0.04);
  }

  public playMagnet(): void {
    this.tone(440, 0.18, 'sine', 0.2, 880);
    this.tone(660, 0.22, 'triangle', 0.2, 1320, 0.09);
  }

  public playMissile(): void {
    this.tone(720, 0.28, 'sawtooth', 0.2, 260);
  }

  public playLightning(): void {
    this.noiseBurst(0.35, 2200, 0.26);
    this.tone(980, 0.22, 'square', 0.18, 160);
  }

  public playBump(): void {
    this.tone(130, 0.12, 'triangle', 0.24, 55);
    this.playSplash(false);
  }

  public playJump(): void {
    this.tone(240, 0.22, 'sine', 0.2, 540);
  }

  public playCountdown(go = false): void {
    if (go) {
      this.tone(587, 0.24, 'triangle', 0.26);
      this.tone(880, 0.34, 'triangle', 0.26, null, 0.04);
    } else {
      this.tone(440, 0.16, 'triangle', 0.22);
    }
  }

  public playLap(): void {
    this.tone(587, 0.13, 'triangle', 0.24, null, 0);
    this.tone(880, 0.24, 'triangle', 0.26, null, 0.11);
  }

  public playVictory(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, idx) => {
      this.tone(f, idx === 3 ? 0.5 : 0.16, 'triangle', 0.26, null, idx * 0.13);
    });
  }

  public playInkSplatter(): void {
    this.noiseBurst(0.24, 520, 0.24);
    this.tone(190, 0.16, 'sine', 0.2, 72);
    this.tone(280, 0.12, 'triangle', 0.14, 95, 0.05);
  }

  public playMineExplosion(): void {
    this.noiseBurst(0.42, 340, 0.34);
    this.tone(110, 0.36, 'sawtooth', 0.3, 32);
    this.tone(68, 0.44, 'triangle', 0.28, 28, 0.03);
  }

  public playGeyser(): void {
    this.noiseBurst(0.45, 1450, 0.26);
    this.tone(160, 0.38, 'sine', 0.22, 620);
  }

  public playCannonBlast(): void {
    this.noiseBurst(0.32, 260, 0.26);
    this.tone(92, 0.28, 'triangle', 0.26, 30);
  }

  public playIceShatter(): void {
    this.noiseBurst(0.26, 2800, 0.22);
    this.tone(1420, 0.09, 'triangle', 0.18, 620);
    this.tone(1860, 0.11, 'sine', 0.15, 790, 0.04);
  }

  public playIncomingWarning(): void {
    this.tone(880, 0.09, 'square', 0.16);
    this.tone(1180, 0.11, 'square', 0.16, null, 0.1);
  }
}
