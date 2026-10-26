export function sharpestFrameIndex(items) {
  if (!items.length) return -1;
  return items.reduce((best, item, index) =>
    (Number.isFinite(item.sharpRel) ? item.sharpRel : 0) >
    (Number.isFinite(items[best].sharpRel) ? items[best].sharpRel : 0) ? index : best, 0);
}

export function isForegroundAt(mask, x, y) {
  if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) ||
      mask.width <= 0 || mask.height <= 0 || !mask.data || mask.data.length !== mask.width * mask.height ||
      !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('A valid foreground mask and normalized point are required');
  }
  const px = Math.max(0, Math.min(mask.width - 1, Math.floor(x * mask.width)));
  const py = Math.max(0, Math.min(mask.height - 1, Math.floor(y * mask.height)));
  return mask.data[py * mask.width + px] >= 0.5;
}

export function depthAt(depth, x, y) {
  if (!depth || !Number.isInteger(depth.width) || !Number.isInteger(depth.height) ||
      depth.width <= 0 || depth.height <= 0 || !depth.data ||
      depth.data.length !== depth.width * depth.height || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('A valid depth map and normalized point are required');
  }
  const px = Math.max(0, Math.min(depth.width - 1, Math.floor(x * depth.width)));
  const py = Math.max(0, Math.min(depth.height - 1, Math.floor(y * depth.height)));
  return depth.data[py * depth.width + px];
}

export function depthFocusMask(depth, focusDepth, falloff = 0.12) {
  if (!depth || !Number.isInteger(depth.width) || !Number.isInteger(depth.height) ||
      depth.width <= 0 || depth.height <= 0 || !depth.data ||
      depth.data.length !== depth.width * depth.height || !Number.isFinite(focusDepth) ||
      focusDepth < 0 || focusDepth > 1 || !Number.isFinite(falloff) || falloff < 0 || falloff > 1) {
    throw new RangeError('A valid depth map, focus depth and falloff are required');
  }
  const transition = Math.max(0.015, falloff);
  const data = new Float32Array(depth.data.length);
  for (let i = 0; i < data.length; i++) {
    const distance = Math.abs(depth.data[i] - focusDepth);
    const t = Math.max(0, Math.min(1, distance / transition));
    data[i] = 1 - t * t * (3 - 2 * t);
  }
  return { width: depth.width, height: depth.height, data };
}

export function colorizeDepth(depth) {
  if (!depth || !Number.isInteger(depth.width) || !Number.isInteger(depth.height) ||
      depth.width <= 0 || depth.height <= 0 || !depth.data ||
      depth.data.length !== depth.width * depth.height) {
    throw new RangeError('A valid depth map is required');
  }
  const data = new Uint8ClampedArray(depth.data.length * 4);
  for (let i = 0; i < depth.data.length; i++) {
    const value = Math.max(0, Math.min(1, depth.data[i]));
    const p = i * 4;
    data[p] = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * value - 3))));
    data[p + 1] = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * value - 2))));
    data[p + 2] = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(4 * value - 1))));
    data[p + 3] = 255;
  }
  return data;
}

export function paintMask(mask, x, y, radius, value) {
  if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) ||
      mask.width <= 0 || mask.height <= 0 || !mask.data || mask.data.length !== mask.width * mask.height ||
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0 ||
      !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('A valid mask, normalized point, brush radius and mask value are required');
  }

  const centerX = Math.max(0, Math.min(1, x)) * (mask.width - 1);
  const centerY = Math.max(0, Math.min(1, y)) * (mask.height - 1);
  const innerRadius = radius * 0.7;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(mask.width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(mask.height - 1, Math.ceil(centerY + radius));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const distance = Math.hypot(px - centerX, py - centerY);
      if (distance > radius) continue;
      const blend = distance <= innerRadius ? 1 : (radius - distance) / (radius - innerRadius);
      const index = py * mask.width + px;
      mask.data[index] += (value - mask.data[index]) * blend;
    }
  }
  return mask;
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

export function cropRect(width, height, preset = 'original', options = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive');
  }
  const cropScale = Math.max(20, Math.min(100, Number(options.scale ?? 100))) / 100;
  const aspect = preset === 'free' ? width / height : { square: 1, portrait: 4 / 5, landscape: 3 / 2 }[preset];
  if (!aspect && cropScale === 1) return { x: 0, y: 0, width, height };
  const sourceAspect = width / height;
  let cropWidth, cropHeight;
  if (!aspect) {
    cropWidth = width * cropScale;
    cropHeight = height * cropScale;
  } else if (sourceAspect > aspect) {
    cropWidth = height * aspect * cropScale;
    cropHeight = height * cropScale;
  } else {
    cropWidth = width * cropScale;
    cropHeight = width / aspect * cropScale;
  }
  const xAlign = Math.max(0, Math.min(1, Number(options.x ?? 50) / 100));
  const yAlign = Math.max(0, Math.min(1, Number(options.y ?? 50) / 100));
  return {
    x: (width - cropWidth) * xAlign,
    y: (height - cropHeight) * yAlign,
    width: cropWidth,
    height: cropHeight,
  };
}

const HSL_CHANNELS = [
  ['Red', 0], ['Orange', 30], ['Yellow', 60], ['Green', 120],
  ['Aqua', 180], ['Blue', 240], ['Purple', 275], ['Magenta', 315],
];
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  const luminance = (max + min) / 2;
  let saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * luminance - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, saturation, luminance];
}
function hslToRgb(hue, saturation, luminance) {
  const c = (1 - Math.abs(2 * luminance - 1)) * saturation;
  const h = ((hue % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x]
    : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = luminance - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function toneCurveAt(value, points) {
  const input = Math.max(0, Math.min(1, value));
  if (!Array.isArray(points) || points.length !== 5 || points.some(point => !Number.isFinite(point))) return input;
  const position = input * 4;
  const index = Math.min(3, Math.floor(position));
  const fraction = position - index;
  return Math.max(0, Math.min(1, (points[index] * (1 - fraction) + points[index + 1] * fraction) / 100));
}

export function healSpotPixels(data, width, height, spot) {
  if (!data || data.length !== width * height * 4 || !Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0 || !spot ||
      ![spot.x, spot.y, spot.radius].every(Number.isFinite) || spot.x < 0 || spot.x > 1 ||
      spot.y < 0 || spot.y > 1 || spot.radius <= 0) {
    throw new RangeError('A valid image and normalized healing spot are required');
  }
  const source = new Uint8ClampedArray(data);
  const radius = Math.max(2, Math.min(Math.max(width, height) * 0.08, spot.radius * width));
  const cx = Math.round(spot.x * (width - 1)), cy = Math.round(spot.y * (height - 1));
  const outer = radius * 1.8;
  const minX = Math.max(0, Math.floor(cx - outer)), maxX = Math.min(width - 1, Math.ceil(cx + outer));
  const minY = Math.max(0, Math.floor(cy - outer)), maxY = Math.min(height - 1, Math.ceil(cy + outer));
  const samples = [[], [], []];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < radius * 1.15 || distance > outer) continue;
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) samples[channel].push(source[offset + channel]);
  }
  if (!samples[0].length) return data;
  const patchColor = samples.map(values => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const minPatchX = Math.max(0, Math.floor(cx - radius)), maxPatchX = Math.min(width - 1, Math.ceil(cx + radius));
  const minPatchY = Math.max(0, Math.floor(cy - radius)), maxPatchY = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = minPatchY; y <= maxPatchY; y++) for (let x = minPatchX; x <= maxPatchX; x++) {
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > radius) continue;
    const blend = Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius * 0.22)));
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = source[offset + channel] * (1 - blend) + patchColor[channel] * blend;
    }
  }
  return data;
}

export function warpPerspective(data, width, height, vertical = 0, horizontal = 0) {
  if (!data || data.length !== width * height * 4 || !Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0 || !Number.isFinite(vertical) || !Number.isFinite(horizontal)) {
    throw new RangeError('A valid image and perspective values are required');
  }
  const v = Math.max(-30, Math.min(30, vertical)) / 100;
  const h = Math.max(-30, Math.min(30, horizontal)) / 100;
  if (!v && !h) return data;
  const vx = Math.abs(v) * 0.35, hy = Math.abs(h) * 0.35;
  const topInset = v > 0 ? vx : 0, bottomInset = v < 0 ? vx : 0;
  const leftInset = h > 0 ? hy : 0, rightInset = h < 0 ? hy : 0;
  const corners = [
    [topInset, leftInset],
    [1 - topInset, rightInset],
    [1 - bottomInset, 1 - rightInset],
    [bottomInset, 1 - leftInset],
  ];
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(dx3) + Math.abs(dy3) > 1e-8 ? (dx3 * dy2 - dx2 * dy3) / denominator : 0;
  const f = Math.abs(dx3) + Math.abs(dy3) > 1e-8 ? (dx1 * dy3 - dx3 * dy1) / denominator : 0;
  const a = p1[0] - p0[0] + g * p1[0];
  const b = p3[0] - p0[0] + f * p3[0];
  const c = p0[0];
  const d = p1[1] - p0[1] + g * p1[1];
  const e = p3[1] - p0[1] + f * p3[1];
  const k = p0[1];
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = width > 1 ? x / (width - 1) : 0, w = height > 1 ? y / (height - 1) : 0;
    const divisor = g * u + f * w + 1;
    const sx = Math.max(0, Math.min(width - 1, (a * u + b * w + c) / divisor * (width - 1)));
    const sy = Math.max(0, Math.min(height - 1, (d * u + e * w + k) / divisor * (height - 1)));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const tx = sx - x0, ty = sy - y0, out = (y * width + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      const top = source[(y0 * width + x0) * 4 + channel] * (1 - tx) + source[(y0 * width + x1) * 4 + channel] * tx;
      const bottom = source[(y1 * width + x0) * 4 + channel] * (1 - tx) + source[(y1 * width + x1) * 4 + channel] * tx;
      data[out + channel] = top * (1 - ty) + bottom * ty;
    }
  }
  return data;
}

export function adjustPixels(data, width, height, adjustments = {}) {
  if (!data || data.length !== width * height * 4) throw new RangeError('Pixel data does not match dimensions');
  const exposure = 2 ** Math.max(-4, Math.min(4, Number(adjustments.exposure) || 0));
  const contrast = Math.max(-100, Math.min(100, Number(adjustments.contrast) || 0));
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const curve = Math.max(-100, Math.min(100, Number(adjustments.curve) || 0)) / 100;
  const tonePoints = adjustments.tonePoints;
  const saturation = Math.max(0, Math.min(200, Number(adjustments.saturation ?? 100) || 0)) / 100;
  const sharpness = Math.max(0, Math.min(2, Number(adjustments.sharpness) || 0));
  const temperature = Math.max(-100, Math.min(100, Number(adjustments.temperature) || 0));
  const tint = Math.max(-100, Math.min(100, Number(adjustments.tint) || 0));
  const highlights = Math.max(-100, Math.min(100, Number(adjustments.highlights) || 0)) / 100;
  const shadows = Math.max(-100, Math.min(100, Number(adjustments.shadows) || 0)) / 100;
  const localMask = adjustments.localMask;
  const localExposure = Number(adjustments.localExposure) || 0;
  const localSaturation = Number(adjustments.localSaturation) || 0;
  const localContrast = Math.max(-100, Math.min(100, Number(adjustments.localContrast) || 0));
  const localContrastFactor = (259 * (localContrast + 255)) / (255 * (259 - localContrast));
  const localTemperature = Math.max(-100, Math.min(100, Number(adjustments.localTemperature) || 0));
  const localTint = Math.max(-100, Math.min(100, Number(adjustments.localTint) || 0));
  const gradient = adjustments.localGradient;
  const activeHsl = HSL_CHANNELS.map(([name, center]) => {
    return {
      center,
      hue: Math.max(-180, Math.min(180, Number(adjustments[`hsl${name}Hue`]) || 0)),
      saturation: Math.max(-100, Math.min(100, Number(adjustments[`hsl${name}Saturation`]) || 0)) / 100,
      luminance: Math.max(-100, Math.min(100, Number(adjustments[`hsl${name}Luminance`]) || 0)) / 100,
      active: ['Hue', 'Saturation', 'Luminance'].some(suffix => Number(adjustments[`hsl${name}${suffix}`] || 0) !== 0),
    };
  }).filter(channel => channel.active);

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const px = pixelIndex % width;
    const py = Math.floor(pixelIndex / width);
    let r = (data[i] * exposure - 128) * contrastFactor + 128;
    let g = (data[i + 1] * exposure - 128) * contrastFactor + 128;
    let b = (data[i + 2] * exposure - 128) * contrastFactor + 128;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const highlightWeight = luminance * luminance;
    const shadowWeight = (1 - luminance) * (1 - luminance);
    r += r * highlights * highlightWeight + (255 - r) * shadows * shadowWeight;
    g += g * highlights * highlightWeight + (255 - g) * shadows * shadowWeight;
    b += b * highlights * highlightWeight + (255 - b) * shadows * shadowWeight;
    r += temperature * 0.65 - tint * 0.2;
    g += tint * 0.35;
    b -= temperature * 0.65 + tint * 0.2;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const curveX = Math.max(0, Math.min(1, gray / 255));
    const curvedGray = (Array.isArray(tonePoints) ? toneCurveAt(curveX, tonePoints)
      : curveX + curve * (curveX - 0.5) * (1 - Math.abs(2 * curveX - 1)) * 0.8) * 255;
    r += curvedGray - gray;
    g += curvedGray - gray;
    b += curvedGray - gray;
    const brushMask = localMask && localMask.data?.length === localMask.width * localMask.height
      ? localMask.data[Math.min(localMask.height - 1, Math.floor(py / height * localMask.height)) *
        localMask.width + Math.min(localMask.width - 1, Math.floor(px / width * localMask.width))]
      : 0;
    let gradientMask = 0;
    if (gradient && [gradient.x, gradient.y, gradient.endX, gradient.endY].every(Number.isFinite)) {
      const dx = gradient.endX - gradient.x, dy = gradient.endY - gradient.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared > 1e-6) {
        const projection = Math.max(0, Math.min(1, ((px / Math.max(1, width - 1) - gradient.x) * dx +
          (py / Math.max(1, height - 1) - gradient.y) * dy) / lengthSquared));
        const feather = Math.max(0.01, Math.min(1, Number(gradient.feather ?? adjustments.localGradientFeather ?? 50) / 100));
        const t = Math.max(0, Math.min(1, (1 - projection) / feather));
        gradientMask = t * t * (3 - 2 * t);
      }
    }
    const mask = Math.max(brushMask, gradientMask);
    const localExposureFactor = 2 ** (Math.max(-2, Math.min(2, localExposure)) * mask);
    const localSat = 1 + Math.max(-1, Math.min(1, localSaturation / 100)) * mask;
    r += (localTemperature * 0.65 - localTint * 0.2) * mask;
    g += localTint * 0.35 * mask;
    b -= (localTemperature * 0.65 + localTint * 0.2) * mask;
    const localGray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = ((localGray + (r - localGray) * saturation * localSat - 128) * (1 + (localContrastFactor - 1) * mask) + 128) * localExposureFactor;
    g = ((localGray + (g - localGray) * saturation * localSat - 128) * (1 + (localContrastFactor - 1) * mask) + 128) * localExposureFactor;
    b = ((localGray + (b - localGray) * saturation * localSat - 128) * (1 + (localContrastFactor - 1) * mask) + 128) * localExposureFactor;
    if (activeHsl.length) {
      const [hue, hslSaturation, luminance] = rgbToHsl(r, g, b);
      let hueShift = 0, saturationShift = 0, luminanceShift = 0, totalWeight = 0;
      for (const channel of hslSaturation > 0.001 ? activeHsl : []) {
        const distance = Math.abs(((hue - channel.center + 540) % 360) - 180);
        const weight = Math.max(0, 1 - distance / 38);
        hueShift += channel.hue * weight;
        saturationShift += channel.saturation * weight;
        luminanceShift += channel.luminance * weight;
        totalWeight += weight;
      }
      if (totalWeight) {
        [data[i], data[i + 1], data[i + 2]] = hslToRgb(
          hue + hueShift / totalWeight,
          Math.max(0, Math.min(1, hslSaturation + saturationShift / totalWeight)),
          Math.max(0, Math.min(1, luminance + luminanceShift / totalWeight)),
        );
      } else {
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    } else {
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
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
