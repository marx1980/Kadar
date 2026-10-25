const RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.web.js';
const MODEL = 'onnx-community/depth-anything-v2-small';
let estimatorPromise;

async function createEstimator(device, dtype) {
  const { env, pipeline } = await import(RUNTIME);
  env.allowRemoteModels = true;
  return pipeline('depth-estimation', MODEL, { device, dtype });
}

async function getEstimator() {
  if (!estimatorPromise) {
    estimatorPromise = (async () => {
      if (navigator.gpu) {
        try {
          return await createEstimator('webgpu', 'q4f16');
        } catch {}
      }
      return createEstimator('wasm', 'q8');
    })().catch(error => {
      estimatorPromise = null;
      throw error;
    });
  }
  return estimatorPromise;
}

export async function estimateDepth(image) {
  const estimator = await getEstimator();
  const result = await estimator(image);
  const { depth } = result || {};
  if (!depth || !Number.isInteger(depth.width) || !Number.isInteger(depth.height) ||
      depth.width <= 0 || depth.height <= 0 || !depth.data ||
      depth.data.length !== depth.width * depth.height) {
    throw new Error('Depth map unavailable');
  }
  const data = new Float32Array(depth.data.length);
  for (let i = 0; i < data.length; i++) data[i] = depth.data[i] / 255;
  return { width: depth.width, height: depth.height, data };
}
