/**
 * Minimal offline QR encoder for byte-mode QR versions 1-4, error correction L.
 * Intended for short product barcode/SKU payloads; no network dependency.
 */

type QrSpec = { version: number; dataCodewords: number; eccCodewords: number; byteCapacity: number };
const SPECS: QrSpec[] = [
  { version: 1, dataCodewords: 19, eccCodewords: 7, byteCapacity: 17 },
  { version: 2, dataCodewords: 34, eccCodewords: 10, byteCapacity: 32 },
  { version: 3, dataCodewords: 55, eccCodewords: 15, byteCapacity: 53 },
  { version: 4, dataCodewords: 80, eccCodewords: 20, byteCapacity: 78 },
];

const GF_EXP = new Array<number>(512).fill(0);
const GF_LOG = new Array<number>(256).fill(0);
{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (!a || !b) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function generatorPolynomial(degree: number): number[] {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= gfMul(result[j], GF_EXP[i]);
    }
    result = next;
  }
  return result;
}

function reedSolomon(data: number[], degree: number): number[] {
  const generator = generatorPolynomial(degree);
  const work = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = work[i];
    if (!factor) continue;
    for (let j = 0; j < generator.length; j += 1) work[i + j] ^= gfMul(generator[j], factor);
  }
  return work.slice(data.length);
}

function appendBits(target: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i -= 1) target.push((value >>> i) & 1);
}

function chooseSpec(byteLength: number): QrSpec {
  const spec = SPECS.find((item) => byteLength <= item.byteCapacity);
  if (!spec) throw new RangeError("QR code supports up to 78 UTF-8 bytes; shorten the product code.");
  return spec;
}

function dataCodewords(text: string, spec: QrSpec): number[] {
  const allBytes = Array.from(new TextEncoder().encode(text));
  const bytes = allBytes;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const maxBits = spec.dataCodewords * 8;
  for (let i = 0; i < Math.min(4, maxBits - bits.length); i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const result: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    result.push(value);
  }
  let pad = 0;
  while (result.length < spec.dataCodewords) {
    result.push(pad % 2 === 0 ? 0xec : 0x11);
    pad += 1;
  }
  return result;
}

function formatBits(mask = 0): number {
  const data = (0b01 << 3) | mask; // L error correction
  let remainder = data;
  for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = chooseSpec(bytes.length);
  const data = dataCodewords(text, spec);
  const codewords = [...data, ...reedSolomon(data, spec.eccCodewords)];
  const dataBits: number[] = [];
  for (const codeword of codewords) appendBits(dataBits, codeword, 8);

  const size = 17 + spec.version * 4;
  const modules: Array<Array<boolean | null>> = Array.from({ length: size }, () => Array(size).fill(null));
  const fn: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const setFunction = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    modules[row][col] = dark;
    fn[row][col] = true;
  };

  const finder = (centerRow: number, centerCol: number) => {
    for (let dr = -4; dr <= 4; dr += 1) {
      for (let dc = -4; dc <= 4; dc += 1) {
        const distance = Math.max(Math.abs(dr), Math.abs(dc));
        setFunction(centerRow + dr, centerCol + dc, distance !== 2 && distance !== 4);
      }
    }
  };
  finder(3, 3);
  finder(3, size - 4);
  finder(size - 4, 3);

  for (let i = 8; i < size - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  if (spec.version >= 2) {
    const positions = [6, size - 7];
    for (const row of positions) {
      for (const col of positions) {
        if (fn[row][col]) continue;
        for (let dr = -2; dr <= 2; dr += 1) {
          for (let dc = -2; dc <= 2; dc += 1) {
            const distance = Math.max(Math.abs(dr), Math.abs(dc));
            setFunction(row + dr, col + dc, distance !== 1);
          }
        }
      }
    }
  }

  const fmt = formatBits(0);
  const getFmt = (index: number) => ((fmt >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) setFunction(i, 8, getFmt(i));
  setFunction(7, 8, getFmt(6));
  setFunction(8, 8, getFmt(7));
  setFunction(8, 7, getFmt(8));
  for (let i = 9; i < 15; i += 1) setFunction(8, 14 - i, getFmt(i));
  for (let i = 0; i < 8; i += 1) setFunction(8, size - 1 - i, getFmt(i));
  for (let i = 8; i < 15; i += 1) setFunction(size - 15 + i, 8, getFmt(i));
  setFunction(size - 8, 8, true);

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      const row = upward ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        if (fn[row][col]) continue;
        let dark = bitIndex < dataBits.length ? dataBits[bitIndex] === 1 : false;
        bitIndex += 1;
        if ((row + col) % 2 === 0) dark = !dark; // mask 0
        modules[row][col] = dark;
      }
    }
    upward = !upward;
  }

  return modules.map((row) => row.map(Boolean));
}

export function qrSvg(text: string, label = "QR code"): string {
  const matrix = qrMatrix(String(text || ""));
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const rects: string[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (matrix[row][col]) rects.push(`<rect x="${col + quiet}" y="${row + quiet}" width="1" height="1"/>`);
    }
  }
  return `<svg class="qr-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label.replace(/[<>&"]/g, "")}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="white"/><g fill="black">${rects.join("")}</g></svg>`;
}
