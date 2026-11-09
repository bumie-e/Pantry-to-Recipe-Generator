// inferencejs ships types its package.json "exports" doesn't expose; declare the part we use.
declare module 'inferencejs' {
  export class InferenceEngine {
    startWorker(modelName: string, modelVersion: number, publishableKey: string): Promise<number>;
    infer(workerId: number, img: ImageBitmap): Promise<unknown>;
    stopWorker(workerId: number): Promise<void>;
  }
}
