/** Shared Kokoro TTS constants (no deps — safe to import from the Web Worker). */

/** Hugging Face model id for the Kokoro 82M ONNX build. */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** Quantization for the WASM fallback (q8 ≈ 80 MB). */
export const KOKORO_DTYPE = 'q8' as const;
