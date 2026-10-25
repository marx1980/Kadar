export function sharpestFrameIndex(items) {
  if (!items.length) return -1;
  return items.reduce((best, item, index) =>
    (Number.isFinite(item.sharpRel) ? item.sharpRel : 0) >
    (Number.isFinite(items[best].sharpRel) ? items[best].sharpRel : 0) ? index : best, 0);
}

export function estimateTranslation(reference, candidate, width, height, maxShift = 4) {
  if (!reference || !candidate || reference.length !== width * height || candidate.length !== width * height ||
      !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Grayscale images must match their dimensions');
  }
  const limit = Math.max(0, Math.min(Math.floor(maxShift), Math.floor(Math.min(width, height) / 4)));
  let best = { x: 0, y: 0 };
  let bestError = Infinity;
  for (let dy = -limit; dy <= limit; dy++) {
    for (let dx = -limit; dx <= limit; dx++) {
      let error = 0, count = 0;
      const x0 = Math.max(0, -dx), x1 = Math.min(width, width - dx);
      const y0 = Math.max(0, -dy), y1 = Math.min(height, height - dy);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          error += Math.abs(reference[y * width + x] - candidate[(y + dy) * width + x + dx]);
          count++;
        }
      }
      const meanError = count ? error / count : Infinity;
      if (meanError < bestError) {
        best = { x: dx, y: dy };
        bestError = meanError;
      }
    }
  }
  return best;
}

export function medianFuse(frames, width, height) {
  const size = width * height * 4;
  if (!Array.isArray(frames) || frames.length < 2 ||
      !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      frames.some(frame => !frame || frame.length !== size)) {
    throw new RangeError('At least two matching RGBA frames are required');
  }
  const fused = new Uint8ClampedArray(size);
  const values = new Array(frames.length);
  for (let i = 0; i < size; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      for (let frame = 0; frame < frames.length; frame++) values[frame] = frames[frame][i + channel];
      values.sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      fused[i + channel] = values.length % 2
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2;
    }
    fused[i + 3] = 255;
  }
  return fused;
}

export function bestFaceSources(items, frameIndex) {
  const target = items[frameIndex];
  if (!target) return [];
  const validBox = box => box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
  return (target.faces || []).map((face, faceIndex) => {
    if (!validBox(face.box) || !Number.isFinite(face.yaw)) return null;
    const center = { x: face.box.x + face.box.w / 2, y: face.box.y + face.box.h / 2 };
    const quality = candidate => Number.isFinite(candidate.sharp) && Number.isFinite(candidate.closed)
      ? Math.max(0, candidate.sharp) * (1 - Math.max(0, Math.min(1, candidate.closed)) * 0.7)
      : 0;
    const targetScore = quality(face);
    let best = null;
    let bestScore = targetScore * 1.1;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      if (itemIndex === frameIndex) continue;
      for (let sourceFaceIndex = 0; sourceFaceIndex < (items[itemIndex].faces || []).length; sourceFaceIndex++) {
        const source = items[itemIndex].faces[sourceFaceIndex];
        if (!validBox(source.box) || !Number.isFinite(source.yaw) || !Number.isFinite(source.closed) || source.closed >= 0.45) continue;
        const sourceCenter = { x: source.box.x + source.box.w / 2, y: source.box.y + source.box.h / 2 };
        const distance = Math.hypot(center.x - sourceCenter.x, center.y - sourceCenter.y);
        const scale = source.box.w / face.box.w;
        if (distance > 0.12 || scale < 0.65 || scale > 1.55 || Math.abs(face.yaw - source.yaw) > 20) continue;
        const score = quality(source);
        if (score > bestScore) {
          best = { frameIndex: itemIndex, sourceFaceIndex };
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
