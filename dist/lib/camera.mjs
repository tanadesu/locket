/** Owns one camera stream. Cancelled permission requests never leave tracks alive. */
export class Camera {
  constructor(video, mediaDevices = globalThis.navigator?.mediaDevices) {
    this.video = video;
    this.devices = mediaDevices;
    this.stream = null;
    this.generation = 0;
    this.onDisconnect = () => {};
  }
  async start() {
    this.stop();
    const token = this.generation;
    if (!this.devices?.getUserMedia) throw new Error("SECURE_CONTEXT");
    const stream = await this.devices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    if (token !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (error) {
      this.stop();
      throw error;
    }
    if (token !== this.generation) return false;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (this.stream === stream) {
        this.stop();
        this.onDisconnect();
      }
    });
    return true;
  }
  stop() {
    this.generation++;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}
export function cameraError(error) {
  return (
    {
      NotAllowedError:
        "カメラを許可してください。ブラウザのアドレス欄からカメラ設定を変更できます。",
      NotFoundError:
        "カメラが見つかりません。カメラを接続して、もう一度お試しください。",
      NotReadableError:
        "カメラを使えません。他のカメラアプリを閉じて、もう一度お試しください。",
      SECURE_CONTEXT:
        "localhost または HTTPS で開いてください。ファイルを直接開くとカメラを利用できません。",
    }[error.name] ||
    { SECURE_CONTEXT: "localhost または HTTPS で開いてください。" }[
      error.message
    ] ||
    "カメラを起動できません。接続を確認して、もう一度お試しください。"
  );
}
