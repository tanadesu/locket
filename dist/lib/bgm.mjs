export const BGM_MODES = ["two-notes", "pulse", "three-notes", "rotation"];
const FILES = ["bgm-01-two-notes.wav", "bgm-02-pulse.wav", "bgm-03-three-notes.wav"];
const KEY = "power-charge.bgm.v1";

export class Bgm {
  constructor(storage, createAudio = () => new Audio(), onError = () => {}) {
    this.storage = storage;
    this.createAudio = createAudio;
    this.onError = onError;
    this.mode = "two-notes";
    try {
      const saved = storage.getItem(KEY);
      if (BGM_MODES.includes(saved)) this.mode = saved;
    } catch {}
    this.index = Math.max(0, BGM_MODES.indexOf(this.mode) % 3);
    this.enabled = false;
    this.suspended = false;
    this.playing = false;
    this.revision = 0;
  }
  select(mode) {
    if (!BGM_MODES.includes(mode) || mode === this.mode) return;
    this.mode = mode;
    try { this.storage.setItem(KEY, mode); } catch {}
    this.index = mode === "rotation" ? 0 : BGM_MODES.indexOf(mode);
    this.stop();
    if (this.audio) this.load();
    this.sync(this.enabled, this.suspended);
  }
  load() {
    this.audio.src = new URL(`../audio/${FILES[this.index]}`, import.meta.url).href;
    this.audio.loop = this.mode !== "rotation";
  }
  sync(enabled, suspended = false) {
    this.enabled = enabled;
    this.suspended = suspended;
    if (!enabled || suspended) { this.stop(); return; }
    if (this.playing) return;
    if (!this.audio) {
      this.audio = this.createAudio();
      this.audio.volume = 0.45;
      this.audio.onended = () => {
        if (this.mode !== "rotation" || !this.enabled || this.suspended) return;
        this.index = (this.index + 1) % FILES.length;
        this.playing = false;
        this.load();
        this.sync(this.enabled, this.suspended);
      };
      this.load();
    }
    const revision = ++this.revision;
    this.playing = true;
    Promise.resolve(this.audio.play()).catch(() => {
      if (revision !== this.revision) return;
      this.playing = false;
      this.onError();
    });
  }
  stop() {
    this.revision++;
    this.audio?.pause();
    this.playing = false;
  }
}
