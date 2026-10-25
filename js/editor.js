export function sharpestFrameIndex(items) {
  if (!items.length) return -1;
  return items.reduce((best, item, index) =>
    (Number.isFinite(item.sharpRel) ? item.sharpRel : 0) >
    (Number.isFinite(items[best].sharpRel) ? items[best].sharpRel : 0) ? index : best, 0);
}

export function bestFaceSources(items, frameIndex) {
  const target = items[frameIndex];
  if (!target) return [];
  return (target.faces || []).map((face, faceIndex) => {
    const center = { x: face.box.x + face.box.w / 2, y: face.box.y + face.box.h / 2 };
    const targetScore = face.sharp * (1 - Math.min(1, face.closed) * 0.7);
    let best = null;
    let bestScore = targetScore * 1.1;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      if (itemIndex === frameIndex) continue;
      for (let sourceFaceIndex = 0; sourceFaceIndex < (items[itemIndex].faces || []).length; sourceFaceIndex++) {
        const source = items[itemIndex].faces[sourceFaceIndex];
        const sourceCenter = { x: source.box.x + source.box.w / 2, y: source.box.y + source.box.h / 2 };
        const distance = Math.hypot(center.x - sourceCenter.x, center.y - sourceCenter.y);
        const scale = source.box.w / face.box.w;
        if (distance > 0.12 || scale < 0.65 || scale > 1.55 || Math.abs(face.yaw - source.yaw) > 20) continue;
        const score = source.sharp * (1 - Math.min(1, source.closed) * 0.7);
        if (score > bestScore) {
          best = { frameIndex: itemIndex, faceIndex: sourceFaceIndex };
          bestScore = score;
        }
      }
    }
    return best ? { faceIndex, ...best } : null;
  }).filter(Boolean);
}

export function cropRect(width, height, preset = 'original') {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive');
  }
  const aspect = { square: 1, portrait: 4 / 5, landscape: 3 / 2 }[preset];
  if (!aspect) return { x: 0, y: 0, width, height };
  const sourceAspect = width / height;
  if (sourceAspect > aspect) {
    const cropWidth = height * aspect;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / aspect;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
}

export function adjustPixels(data, width, height, adjustments = {}) {
  if (!data || data.length !== width * height * 4) throw new RangeError('Pixel data does not match dimensions');
  const exposure = 2 ** Math.max(-4, Math.min(4, Number(adjustments.exposure) || 0));
  const contrast = Math.max(-100, Math.min(100, Number(adjustments.contrast) || 0));
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturation = Math.max(0, Math.min(200, Number(adjustments.saturation ?? 100) || 0)) / 100;
  const sharpness = Math.max(0, Math.min(2, Number(adjustments.sharpness) || 0));

  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] * exposure - 128) * contrastFactor + 128;
    let g = (data[i + 1] * exposure - 128) * contrastFactor + 128;
    let b = (data[i + 2] * exposure - 128) * contrastFactor + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = gray + (r - gray) * saturation;
    data[i + 1] = gray + (g - gray) * saturation;
    data[i + 2] = gray + (b - gray) * saturation;
  }
  if (!sharpness || !width || !height) return data;

  const rowLength = width * 4;
  let previous = new Uint8ClampedArray(rowLength);
  let current = new Uint8ClampedArray(rowLength);
  let next = new Uint8ClampedArray(rowLength);
  const copyRow = (target, y) => target.set(data.subarray(y * rowLength, (y + 1) * rowLength));
  copyRow(previous, 0);
  copyRow(current, 0);
  copyRow(next, Math.min(1, height - 1));

  for (let y = 0; y < height; y++) {
    const offset = y * rowLength;
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1) * 4;
      const right = Math.min(width - 1, x + 1) * 4;
      const center = x * 4;
      for (let channel = 0; channel < 3; channel++) {
        const blurred = (
          previous[left + channel] + previous[center + channel] + previous[right + channel] +
          current[left + channel] + current[center + channel] + current[right + channel] +
          next[left + channel] + next[center + channel] + next[right + channel]
        ) / 9;
        data[offset + center + channel] = current[center + channel] +
          sharpness * (current[center + channel] - blurred);
      }
      data[offset + center + 3] = current[center + 3];
    }
    const oldPrevious = previous;
    previous = current;
    current = next;
    next = oldPrevious;
    copyRow(next, Math.min(y + 2, height - 1));
  }
  return data;
}
