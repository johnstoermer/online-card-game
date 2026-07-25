type SoundName =
  | "hover"
  | "select"
  | "deal"
  | "discard"
  | "play"
  | "score"
  | "big-score"
  | "win"
  | "lose"
  | "join"
  | "relic";

export class TableAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = localStorage.getItem("ocg-muted") === "true";

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    localStorage.setItem("ocg-muted", String(value));
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.18, this.context!.currentTime, 0.02);
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(name: SoundName): void {
    if (this.muted) return;
    void this.unlock().then(() => {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      if (name === "hover") this.tone(180, 0.025, "square", 0.025, now);
      if (name === "select") {
        this.tone(280, 0.06, "triangle", 0.09, now);
        this.tone(420, 0.04, "sine", 0.04, now + 0.025);
      }
      if (name === "deal") {
        this.noise(0.035, 0.09, now, 1800);
        this.tone(120, 0.045, "triangle", 0.05, now);
      }
      if (name === "discard") {
        this.noise(0.08, 0.12, now, 900);
        this.slide(190, 90, 0.14, "sawtooth", 0.055, now);
      }
      if (name === "play") {
        this.noise(0.05, 0.16, now, 1500);
        this.slide(120, 260, 0.16, "triangle", 0.1, now);
      }
      if (name === "score") {
        [220, 330, 440].forEach((frequency, index) =>
          this.tone(frequency, 0.18, "triangle", 0.075, now + index * 0.055)
        );
      }
      if (name === "big-score") {
        [130.81, 196, 261.63, 329.63, 392].forEach((frequency, index) =>
          this.tone(frequency, 0.42, index < 2 ? "sawtooth" : "triangle", 0.075, now + index * 0.045)
        );
        this.noise(0.12, 0.4, now + 0.12, 2600);
      }
      if (name === "win") {
        [196, 246.94, 293.66, 392, 493.88].forEach((frequency, index) =>
          this.tone(frequency, 0.65, "triangle", 0.075, now + index * 0.1)
        );
      }
      if (name === "lose") {
        this.slide(180, 55, 0.9, "sawtooth", 0.08, now);
        this.tone(73.42, 0.8, "triangle", 0.08, now + 0.18);
      }
      if (name === "join") {
        this.tone(300, 0.12, "sine", 0.06, now);
        this.tone(450, 0.16, "triangle", 0.05, now + 0.08);
      }
      if (name === "relic") {
        this.tone(174.61, 0.3, "triangle", 0.07, now);
        this.tone(261.63, 0.4, "triangle", 0.065, now + 0.06);
        this.tone(349.23, 0.5, "sine", 0.055, now + 0.12);
      }
    });
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    start: number
  ): void {
    const oscillator = this.context!.createOscillator();
    const envelope = this.context!.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(this.master!);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private slide(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    start: number
  ): void {
    const oscillator = this.context!.createOscillator();
    const envelope = this.context!.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(this.master!);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noise(duration: number, gain: number, start: number, cutoff: number): void {
    const sampleRate = this.context!.sampleRate;
    const buffer = this.context!.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = this.context!.createBufferSource();
    const filter = this.context!.createBiquadFilter();
    const envelope = this.context!.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope).connect(this.master!);
    source.start(start);
  }
}
