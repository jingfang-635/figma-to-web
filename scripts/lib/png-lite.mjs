/**
 * Minimal PNG RGBA reader + writer (IHDR/IDAT via zlib) plus the shared
 * "opaque box" measurement. Enough for gate pixel metrics, reference-shot
 * normalization, and glyph crops — no image dependency.
 */
import zlib from "node:zlib";

function readU32(buf, o) {
  return buf.readUInt32BE(o);
}

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(buf) {
  const t = crcTable();
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Figma renders a node together with its effect bleed, so a frame/modal export
 * is the card plus an asymmetric drop-shadow margin. The top-left of the
 * *opaque* box is therefore the card origin, and the opaque box size is the
 * card size. Shared by the reference exporter (to normalize) and the pixel leg
 * (to verify the reference really is normalized).
 */
export function opaqueBox(img) {
  const solid = (x, y) => img.data[(y * img.width + x) * 4 + 3] >= 250;
  let x0 = 0;
  let x1 = img.width - 1;
  let y0 = 0;
  let y1 = img.height - 1;
  const rowSolid = (y) => {
    let c = 0;
    for (let x = 0; x < img.width; x++) if (solid(x, y)) c++;
    return c > img.width * 0.5;
  };
  const colSolid = (x) => {
    let c = 0;
    for (let y = 0; y < img.height; y++) if (solid(x, y)) c++;
    return c > img.height * 0.5;
  };
  while (y0 < y1 && !rowSolid(y0)) y0++;
  while (y1 > y0 && !rowSolid(y1)) y1--;
  while (x0 < x1 && !colSolid(x0)) x0++;
  while (x1 > x0 && !colSolid(x1)) x1--;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export const PNG = {
  decode(buf) {
    if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") {
      throw new Error("not a PNG");
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    const idat = [];
    while (offset < buf.length) {
      const len = readU32(buf, offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      const data = buf.subarray(offset + 8, offset + 8 + len);
      if (type === "IHDR") {
        width = readU32(data, 0);
        height = readU32(data, 4);
        const bitDepth = data[8];
        const colorType = data[9];
        if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
          throw new Error(`unsupported PNG colorType=${colorType} bitDepth=${bitDepth}`);
        }
      } else if (type === "IDAT") {
        idat.push(data);
      } else if (type === "IEND") {
        break;
      }
      offset += 12 + len;
    }
    const compressed = Buffer.concat(idat);
    const raw = zlib.inflateSync(compressed);
    const out = Buffer.alloc(width * height * 4);
    // Detect channels from raw length
    const rowFilterRGB = 1 + width * 3;
    const rowFilterRGBA = 1 + width * 4;
    const isRGBA = raw.length >= height * rowFilterRGBA;
    const srcBpp = isRGBA ? 4 : 3;
    const rowSize = 1 + width * srcBpp;
    let prev = Buffer.alloc(width * srcBpp);
    for (let y = 0; y < height; y++) {
      const rowStart = y * rowSize;
      const filter = raw[rowStart];
      const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + rowSize));
      const recon = Buffer.alloc(width * srcBpp);
      for (let i = 0; i < row.length; i++) {
        const left = i >= srcBpp ? recon[i - srcBpp] : 0;
        const up = prev[i];
        const upLeft = i >= srcBpp ? prev[i - srcBpp] : 0;
        let v = row[i];
        if (filter === 1) v = (v + left) & 255;
        else if (filter === 2) v = (v + up) & 255;
        else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          v = (v + pr) & 255;
        } else if (filter !== 0) {
          throw new Error(`unsupported PNG filter ${filter}`);
        }
        recon[i] = v;
      }
      for (let x = 0; x < width; x++) {
        const si = x * srcBpp;
        const di = (y * width + x) * 4;
        out[di] = recon[si];
        out[di + 1] = recon[si + 1];
        out[di + 2] = recon[si + 2];
        out[di + 3] = srcBpp === 4 ? recon[si + 3] : 255;
      }
      prev = recon;
    }
    return { width, height, data: out };
  },

  /** Encode a decoded { width, height, data(RGBA) } image as an 8-bit RGBA PNG. */
  encode(img) {
    const { width, height, data } = img;
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + width * 4);
      raw[rowStart] = 0;
      data.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  },

  /** Copy a sub-rectangle out of a decoded image (clamped to its bounds). */
  crop(img, box) {
    const x0 = Math.max(0, Math.round(box.x0));
    const y0 = Math.max(0, Math.round(box.y0));
    const w = Math.min(img.width - x0, Math.round(box.w));
    const h = Math.min(img.height - y0, Math.round(box.h));
    if (w <= 0 || h <= 0) throw new Error("crop box outside image");
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      img.data.copy(
        out,
        y * w * 4,
        ((y0 + y) * img.width + x0) * 4,
        ((y0 + y) * img.width + x0 + w) * 4,
      );
    }
    return { width: w, height: h, data: out };
  },

  /** Nearest-neighbour upscale so a small glyph is legible when inspected. */
  magnify(img, factor) {
    const f = Math.max(1, Math.round(factor));
    if (f === 1) return img;
    const w = img.width * f;
    const h = img.height * f;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (Math.floor(y / f) * img.width + Math.floor(x / f)) * 4;
        const di = (y * w + x) * 4;
        out[di] = img.data[si];
        out[di + 1] = img.data[si + 1];
        out[di + 2] = img.data[si + 2];
        out[di + 3] = img.data[si + 3];
      }
    }
    return { width: w, height: h, data: out };
  },

  /** Composite one image onto another at (x,y) — used to build contact sheets. */
  blit(dst, src, atX, atY) {
    for (let y = 0; y < src.height; y++) {
      const dy = atY + y;
      if (dy < 0 || dy >= dst.height) continue;
      for (let x = 0; x < src.width; x++) {
        const dx = atX + x;
        if (dx < 0 || dx >= dst.width) continue;
        const si = (y * src.width + x) * 4;
        const di = (dy * dst.width + dx) * 4;
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = src.data[si + 3];
      }
    }
    return dst;
  },

  /** Blank RGBA canvas filled with one colour. */
  blank(width, height, rgba = [255, 255, 255, 255]) {
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = rgba[0];
      data[i * 4 + 1] = rgba[1];
      data[i * 4 + 2] = rgba[2];
      data[i * 4 + 3] = rgba[3];
    }
    return { width, height, data };
  },
};
