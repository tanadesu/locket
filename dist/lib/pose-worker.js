let landmarker;
onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const { FilesetResolver, PoseLandmarker } = await import(
        "../vendor/mediapipe/vision_bundle.mjs"
      );
      const files = await FilesetResolver.forVisionTasks(
        new URL("../vendor/mediapipe/wasm", self.location.href).href,
      );
      landmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL(
            "../vendor/mediapipe/pose_landmarker_lite.task",
            self.location.href,
          ).href,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputSegmentationMasks: false,
      });
      postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      try {
        const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
        postMessage({
          type: "pose",
          points: result.landmarks[0] || null,
          timestamp: data.timestamp,
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    postMessage({ type: "error", message: error.message || "POSE_FAILED" });
  }
};
