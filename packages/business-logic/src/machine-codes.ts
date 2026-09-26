import { escapeHtml } from "./html";

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
] as const;

export function code128Svg(rawValue: string): string {
  const value = String(rawValue || "").replace(/[^\x20-\x7E]/g, "").slice(0, 80);
  if (!value) return '<span class="missing">No barcode</span>';
  const codes = [...value].map((char) => char.charCodeAt(0) - 32);
  let checksum = 104;
  codes.forEach((code, index) => { checksum += code * (index + 1); });
  const sequence = [104, ...codes, checksum % 103, 106];
  let x = 10;
  const bars: string[] = [];
  for (const code of sequence) {
    const pattern = CODE128_PATTERNS[code];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="38"/>`);
      x += width;
    }
  }
  x += 10;
  return `<svg class="barcode-svg" viewBox="0 0 ${x} 50" role="img" aria-label="Code 128 ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${x}" height="50" fill="white"/><g fill="black">${bars.join("")}</g>
    <text x="${x / 2}" y="48" text-anchor="middle" font-size="7" font-family="Arial,sans-serif">${escapeHtml(value)}</text>
  </svg>`;
}

type QrSpec = { version: 1 | 2 | 3; size: number; dataCodewords: number; eccCodewords: number; alignmentCenter?: number };
const QR_SPECS: QrSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7 },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignmentCenter: 18 },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignmentCenter: 22 },
];

const GF_EXP = new Array<number>(512).fill(0);
const GF_LOG = new Array<number>(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (!a || !b) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMultiply(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) result[i + j] ^= gfMul(a[i], b[j]);
  return result;
}

function generator(degree: number): number[] {
  let result = [1];
  for (let i = 0; i < degree; i += 1) result = polyMultiply(result, [1, GF_EXP[i]]);
  return result;
}

function ecc(data: number[], degree: number): number[] {
  const gen = generator(degree);
  const msg = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = msg[i];
    if (!factor) continue;
    for (let j = 0; j < gen.length; j += 1) msg[i + j] ^= gfMul(gen[j], factor);
  }
  return msg.slice(data.length);
}

function appendBits(bits: boolean[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) !== 0);
}

function dataCodewords(value: string, spec: QrSpec): number[] | null {
  const bytes = [...new TextEncoder().encode(value)];
  const capacity = spec.dataCodewords * 8;
  if (4 + 8 + bytes.length * 8 > capacity) return null;
  const bits: boolean[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  for (let i = 0; i < Math.min(4, capacity - bits.length); i += 1) bits.push(false);
  while (bits.length % 8) bits.push(false);
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    result.push(byte);
  }
  let pad = 0;
  while (result.length < spec.dataCodewords) result.push((pad++ % 2) === 0 ? 0xec : 0x11);
  return result;
}

function formatBitsLMask0(): number {
  const data = 0b01000;
  let rem = data << 10;
  const generatorBits = 0x537;
  for (let bit = 14; bit >= 10; bit -= 1) if (((rem >>> bit) & 1) !== 0) rem ^= generatorBits << (bit - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function qrMatrix(value: string): boolean[][] | null {
  const utf8Length = new TextEncoder().encode(value).length;
  const spec = QR_SPECS.find((candidate) => utf8Length <= (candidate.version === 1 ? 17 : candidate.version === 2 ? 32 : 53));
  if (!spec) return null;
  const data = dataCodewords(value, spec);
  if (!data) return null;
  const codewords = [...data, ...ecc(data, spec.eccCodewords)];
  const size = spec.size;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (row: number, col: number, dark: boolean) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    modules[row][col] = dark;
    reserved[row][col] = true;
  };

  const finder = (centerRow: number, centerCol: number) => {
    for (let dr = -4; dr <= 4; dr += 1) for (let dc = -4; dc <= 4; dc += 1) {
      const row = centerRow + dr, col = centerCol + dc;
      if (row < 0 || row >= size || col < 0 || col >= size) continue;
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      const dark = distance === 3 || distance <= 1;
      set(row, col, distance === 4 ? false : dark);
    }
  };
  finder(3, 3);
  finder(3, size - 4);
  finder(size - 4, 3);

  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  if (spec.alignmentCenter) {
    const center = spec.alignmentCenter;
    for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      set(center + dr, center + dc, distance === 2 || distance === 0);
    }
  }

  const reserveFormat = (row: number, col: number) => set(row, col, false);
  for (let i = 0; i <= 5; i += 1) reserveFormat(i, 8);
  reserveFormat(7, 8); reserveFormat(8, 8); reserveFormat(8, 7);
  for (let i = 9; i < 15; i += 1) reserveFormat(8, 14 - i);
  for (let i = 0; i < 8; i += 1) reserveFormat(8, size - 1 - i);
  for (let i = 8; i < 15; i += 1) reserveFormat(size - 15 + i, 8);
  set(size - 8, 8, true);

  const dataBits: boolean[] = [];
  for (const byte of codewords) appendBits(dataBits, byte, 8);
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const row = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (reserved[row][col]) continue;
        let dark = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
        bitIndex += 1;
        if ((row + col) % 2 === 0) dark = !dark;
        modules[row][col] = dark;
      }
    }
    upward = !upward;
  }

  const format = formatBitsLMask0();
  const bit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) set(i, 8, bit(i));
  set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
  for (let i = 9; i < 15; i += 1) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i += 1) set(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i += 1) set(size - 15 + i, 8, bit(i));
  set(size - 8, 8, true);
  return modules;
}

export function qrSvg(rawValue: string): string {
  const value = String(rawValue || "").trim();
  if (!value) return '<span class="missing">No QR data</span>';
  const matrix = qrMatrix(value);
  if (!matrix) return '<span class="missing">QR data too long</span>';
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const cells: string[] = [];
  for (let row = 0; row < matrix.length; row += 1) for (let col = 0; col < matrix.length; col += 1) {
    if (matrix[row][col]) cells.push(`<rect x="${col + quiet}" y="${row + quiet}" width="1" height="1"/>`);
  }
  return `<svg class="qr-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR ${escapeHtml(value)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="white"/><g fill="black">${cells.join("")}</g>
  </svg>`;
}
