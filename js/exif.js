// Minimal JPEG EXIF reader: capture time (DateTimeOriginal + SubSecTimeOriginal).
// Returns seconds since epoch (local wall clock treated as UTC; only differences matter) or null.

export function parseExifTime(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xFF) return null;
    const marker = v.getUint8(p + 1);
    const len = v.getUint16(p + 2);
    if (marker === 0xE1 && p + 10 <= v.byteLength &&
        v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
      return readTiff(v, p + 10, Math.min(v.byteLength, p + 2 + len));
    }
    if (marker === 0xDA) return null; // start of scan: no EXIF before image data
    p += 2 + len;
  }
  return null;
}

function readTiff(v, t, end) {
  if (t + 8 > end) return null;
  const order = v.getUint16(t);
  const le = order === 0x4949;
  if (!le && order !== 0x4D4D) return null;
  const u16 = o => v.getUint16(t + o, le);
  const u32 = o => v.getUint32(t + o, le);
  const ifd0 = u32(4);
  const exifPtr = findTag(v, t, ifd0, 0x8769, le, end);
  if (exifPtr == null) return null;
  const ifd = exifPtr.value;
  let date = null, sub = null;
  if (t + ifd + 2 > end) return null;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (t + e + 12 > end) break;
    const tag = u16(e), count = u32(e + 4);
    if (tag === 0x9003 || tag === 0x9291) {
      const off = count > 4 ? u32(e + 8) : e + 8;
      const s = ascii(v, t + off, count, end);
      if (tag === 0x9003) date = s; else sub = s;
    }
  }
  return toSeconds(date, sub);
}

function findTag(v, t, ifd, want, le, end) {
  if (t + ifd + 2 > end) return null;
  const n = v.getUint16(t + ifd, le);
  for (let i = 0; i < n; i++) {
    const e = t + ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (v.getUint16(e, le) === want) return { value: v.getUint32(e + 8, le) };
  }
  return null;
}

function ascii(v, start, count, end) {
  let s = '';
  for (let i = 0; i < count && start + i < end; i++) {
    const c = v.getUint8(start + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

export function toSeconds(date, sub) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(date || '');
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (!Number.isFinite(ms) || +m[1] < 1990) return null;
  const frac = sub && /^\d+$/.test(sub) ? +('0.' + sub) : 0;
  return ms / 1000 + frac;
}

export async function readExifTime(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    return parseExifTime(buf);
  } catch (e) {
    return null;
  }
}
