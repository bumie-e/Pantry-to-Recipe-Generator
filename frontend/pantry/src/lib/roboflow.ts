import { InferenceEngine } from 'inferencejs';
import type { Ingredient } from '../types';

const MODEL_NAME = 'ingredients-detection-yolov8';
const MODEL_VERSION = 1;
const MIN_CONFIDENCE = 0.25;

let engine: InferenceEngine | null = null;
let workerId: Promise<number> | null = null;

// The model is downloaded once and runs in a web worker in the browser,
// so it works with a publishable key and needs no backend.
function getWorker(apiKey: string): Promise<number> {
  engine ??= new InferenceEngine();
  if (!workerId) {
    workerId = engine.startWorker(MODEL_NAME, MODEL_VERSION, apiKey).catch((err: unknown) => {
      workerId = null; // allow retry after a failed load
      throw err;
    });
  }
  return workerId;
}

/** Runs detection on every frame and keeps the best confidence per ingredient. */
export async function detectIngredients(
  frames: Blob[],
  onProgress?: (fraction: number, label: string) => void,
): Promise<Ingredient[]> {
  const apiKey = import.meta.env.VITE_ROBOFLOW_PUBLISHABLE_KEY as string | undefined;
  if (!apiKey) throw new Error('Missing VITE_ROBOFLOW_PUBLISHABLE_KEY.');

  onProgress?.(0, 'Loading the detection model (first time takes longer)');
  const id = await getWorker(apiKey);
  const best = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const [index, frame] of frames.entries()) {
    const bitmap = await createImageBitmap(frame);
    try {
      const predictions = (await engine!.infer(id, bitmap)) as {
        class?: string;
        confidence?: number;
      }[];
      const inFrame = new Map<string, number>();
      for (const p of predictions) {
        if (!p.class || (p.confidence ?? 0) < MIN_CONFIDENCE) continue;
        const name = p.class.trim().toLowerCase();
        if (p.confidence! > (best.get(name) ?? 0)) best.set(name, p.confidence!);
        inFrame.set(name, (inFrame.get(name) ?? 0) + 1);
      }
      // Quantity = the most of an item seen in any one frame (summing frames would double-count).
      for (const [name, n] of inFrame) counts.set(name, Math.max(counts.get(name) ?? 0, n));
    } finally {
      bitmap.close();
    }
    onProgress?.((index + 1) / frames.length, `Checking frame ${index + 1} of ${frames.length}`);
  }

  return [...best].map(([name, confidence]) => ({ class: name, confidence, quantity: counts.get(name) ?? 1 }));
}
