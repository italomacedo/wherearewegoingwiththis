/* istanbul ignore file — Web Worker; runs only in the browser, never in Jest */
// Kokoro TTS Web Worker — runs the neural synthesis OFF the renderer thread so
// the game never freezes during inference. The main thread (TTSService) posts
// { id, voice, text }; the worker lazily loads the model once, synthesizes, and
// posts back the WAV as a transferable ArrayBuffer ({ id, wav }) or { id, error }.
// Tries WebGPU first (much faster), falls back to WASM/q8.
import { KOKORO_MODEL_ID, KOKORO_DTYPE } from '@systems/TTSConfig';

interface SpeakMsg { id: number; voice: string; text: string; }
type Out =
  | { id: number; wav: ArrayBuffer }
  | { id: number; error: string }
  | { type: 'log'; msg: string };

interface KokoroModel { generate(text: string, opts: { voice: string }): Promise<{ toWav(): ArrayBuffer }> }

// `self` is typed as Window under the DOM lib; cast to the minimal worker surface.
const ctx = self as unknown as {
  postMessage(message: Out, transfer?: Transferable[]): void;
  addEventListener(type: 'message', cb: (e: MessageEvent<SpeakMsg>) => void): void;
};

let modelPromise: Promise<KokoroModel> | null = null;

async function loadModel(): Promise<KokoroModel> {
  const { KokoroTTS } = await import('kokoro-js');
  try {
    const m = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: 'fp32', device: 'webgpu' });
    ctx.postMessage({ type: 'log', msg: 'model ready (webgpu)' });
    return m as unknown as KokoroModel;
  } catch {
    const m = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: KOKORO_DTYPE, device: 'wasm' });
    ctx.postMessage({ type: 'log', msg: 'model ready (wasm)' });
    return m as unknown as KokoroModel;
  }
}

function getModel(): Promise<KokoroModel> {
  if (!modelPromise) {
    ctx.postMessage({ type: 'log', msg: `loading Kokoro model (first run downloads ~80MB)…` });
    modelPromise = loadModel();
  }
  return modelPromise;
}

ctx.addEventListener('message', (e: MessageEvent<SpeakMsg>) => {
  const { id, voice, text } = e.data;
  void (async (): Promise<void> => {
    try {
      const model = await getModel();
      const audio = await model.generate(text, { voice });
      const wav = audio.toWav();
      ctx.postMessage({ id, wav }, [wav]);
    } catch (err) {
      ctx.postMessage({ id, error: String(err) });
    }
  })();
});
