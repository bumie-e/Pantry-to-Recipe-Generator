export const MAX_FRAMES = 8;
const MAX_WIDTH = 640;

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('Could not read this video.'));
    video.currentTime = time;
  });
}

/** Grabs up to `maxFrames` evenly spaced frames (about 1/sec) as downscaled JPEG blobs. */
export async function extractFrames(
  file: File,
  maxFrames = MAX_FRAMES,
  onProgress?: (fraction: number) => void,
): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not read this video.'));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read this video.');

    const count = Math.max(1, Math.min(maxFrames, Math.floor(duration)));
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');

    const frames: Blob[] = [];
    for (let i = 0; i < count; i++) {
      await seekTo(video, ((i + 0.5) * duration) / count);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
      if (blob) frames.push(blob);
      onProgress?.((i + 1) / count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
