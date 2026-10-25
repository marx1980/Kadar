import { FilesetResolver, ImageSegmenter } from '../libs/mediapipe/vision_bundle.mjs';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
let segmenterPromise;

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(new URL('../libs/mediapipe/wasm', import.meta.url).href);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
      });
    })().catch(error => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

export async function segmentForeground(image) {
  const segmenter = await getSegmenter();
  const scale = Math.min(1, 512 / Math.max(image.width, image.height));
  const input = canvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  input.getContext('2d').drawImage(image, 0, 0, input.width, input.height);

  const result = segmenter.segment(input);
  try {
    const masks = result.confidenceMasks || [];
    const mask = masks[masks.length > 1 ? 1 : 0];
    if (!mask) throw new Error('Foreground mask unavailable');
    return {
      width: mask.width,
      height: mask.height,
      data: Float32Array.from(mask.getAsFloat32Array()),
    };
  } finally {
    result.close();
  }
}
