export function adjustPixels(data, width, height, adjustments = {}) {
  if (!data || data.length !== width * height * 4) throw new RangeError('Pixel data does not match dimensions');
  const exposure = 2 ** Math.max(-4, Math.min(4, Number(adjustments.exposure) || 0));
  const contrast = Math.max(-100, Math.min(100, Number(adjustments.contrast) || 0));
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturation = Math.max(0, Math.min(200, Number(adjustments.saturation) || 0)) / 100;
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
