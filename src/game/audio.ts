type Bed = "menu" | "tension" | "ride" | "win" | "lose" | "draw" | "off";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private oscs: OscillatorNode[] = [];
  private extra: AudioNode[] = [];
  private muted = false;
  private bed: Bed = "off";

  unlock(): void {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) this.ctx = new AC({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ensure();
  }

  wake(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
  }

  setBed(bed: Bed): void {
    if (bed === this.bed && this.oscs.length) return;
    this.bed = bed;
    this.stopBed();
    if (!this.ctx || !this.music || bed === "off") return;
    if (bed === "menu") this.tone(46, "sine", 0.045, 70);
    else if (bed === "tension") this.tone(52, "sawtooth", 0.03, 180);
    else if (bed === "ride") this.tone(78, "triangle", 0.04, 240);
    else if (bed === "win") this.tone(196, "triangle", 0.04, 520);
    else if (bed === "lose") this.tone(40, "sawtooth", 0.025, 90);
    else if (bed === "draw") this.tone(63, "sine", 0.035, 140);
  }

  private ensure(): void {
    if (!this.ctx || this.master) return;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.music.gain.value = 0.9;
    this.sfx.gain.value = 0.95;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(ctx.destination);
    const n = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  private tone(freq: number, type: OscillatorType, gain: number, filterHz: number): void {
    if (!this.ctx || !this.music) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc2.type = type;
    osc.frequency.value = freq;
    osc2.frequency.value = freq * (this.bed === "draw" ? 1.04 : 1.5);
    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = this.bed === "tension" ? 0.18 : 0.08;
    lfoG.gain.value = filterHz * 0.25;
    lfo.connect(lfoG);
    lfoG.connect(filter.frequency);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.music);
    osc.start();
    osc2.start();
    lfo.start();
    this.oscs.push(osc, osc2, lfo);
    this.extra.push(filter, g, lfoG);
  }

  private stopBed(): void {
    for (const o of this.oscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already stopped */
      }
    }
    for (const n of this.extra) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.oscs = [];
    this.extra = [];
  }

  private burst(
    dur: number,
    freq: number,
    type: OscillatorType,
    gain: number,
    noiseAmt = 0,
    slideTo?: number,
  ): void {
    if (!this.ctx || !this.sfx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfx);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    if (noiseAmt > 0 && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const ng = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq * 2;
      ng.gain.setValueAtTime(noiseAmt, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfx);
      src.start(t);
      src.stop(t + dur);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        ng.disconnect();
      };
    }
  }

  foot(): void {
    const j = 0.9 + Math.random() * 0.2;
    this.burst(0.09, 90 * j, "sine", 0.16, 0.2, 50);
  }

  breath(): void {
    this.burst(0.35, 400, "sine", 0.02, 0.08);
  }

  groan(): void {
    this.burst(0.45, 110 + Math.random() * 30, "sawtooth", 0.06, 0.05, 70);
  }

  door(): void {
    this.burst(0.45, 180, "square", 0.12, 0.35, 40);
  }

  spark(): void {
    this.burst(0.12, 880 + Math.random() * 400, "square", 0.07, 0.18, 200);
  }

  cough(): void {
    this.burst(0.18, 220, "sawtooth", 0.08, 0.25);
    window.setTimeout(() => this.burst(0.14, 180, "sawtooth", 0.06, 0.2), 180);
  }

  hatch(): void {
    this.burst(0.7, 140, "triangle", 0.08, 0.12, 60);
  }

  piece(): void {
    this.burst(0.06, 520 + Math.random() * 80, "triangle", 0.08, 0.05);
  }

  capture(): void {
    this.burst(0.1, 220, "square", 0.1, 0.12, 80);
  }

  gore(): void {
    this.burst(0.6, 70, "sawtooth", 0.14, 0.4, 40);
  }

  squelch(): void {
    const wet = 70 + Math.random() * 50;
    this.burst(0.18, wet, "sine", 0.13, 0.42, 36);
    this.burst(0.1, wet * 2.1, "triangle", 0.05, 0.22, 55);
  }

  whoosh(): void {
    this.burst(0.18, 320, "sawtooth", 0.07, 0.28, 70);
  }

  crack(): void {
    this.burst(0.16, 110, "square", 0.13, 0.42, 36);
  }

  rumble(): void {
    this.burst(0.42, 46, "sawtooth", 0.07, 0.22, 28);
  }

  scrape(): void {
    this.burst(0.32, 170, "sawtooth", 0.05, 0.2, 80);
  }

  stinger(kind: "win" | "lose" | "draw"): void {
    if (kind === "win") this.burst(0.4, 330, "triangle", 0.1, 0, 520);
    else if (kind === "lose") this.gore();
    else this.burst(0.35, 196, "sine", 0.07, 0, 185);
  }

  destroy(): void {
    this.stopBed();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
