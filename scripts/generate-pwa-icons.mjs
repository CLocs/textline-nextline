import fs from "fs";
import zlib from "zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function png(size) {
  const lime = [201, 242, 153];
  const mint = [156, 191, 167];
  const plum = [79, 52, 90];
  const cream = [243, 238, 228];
  const pad = Math.round(size * 0.08);
  const radius = Math.round(size * 0.18);
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1));
      let r;
      let g;
      let b;
      if (t < 0.4) {
        const u = t / 0.4;
        r = lerp(lime[0], mint[0], u);
        g = lerp(lime[1], mint[1], u);
        b = lerp(lime[2], mint[2], u);
      } else {
        const u = (t - 0.4) / 0.6;
        r = lerp(mint[0], plum[0], u);
        g = lerp(mint[1], plum[1], u);
        b = lerp(mint[2], plum[2], u);
      }

      const nearLeft = x < size / 2;
      const nearTop = y < size / 2;
      const inX = x >= pad && x < size - pad;
      const inY = y >= pad && y < size - pad;
      let useCream = !(inX && inY);
      if (!useCream) {
        const ccx = nearLeft ? pad + radius : size - 1 - pad - radius;
        const ccy = nearTop ? pad + radius : size - 1 - pad - radius;
        const inCornerZone =
          (nearLeft ? x < ccx : x > ccx) && (nearTop ? y < ccy : y > ccy);
        if (inCornerZone && Math.hypot(x - ccx, y - ccy) > radius) useCream = true;
      }

      const i = 1 + x * 4;
      if (useCream) {
        row[i] = cream[0];
        row[i + 1] = cream[1];
        row[i + 2] = cream[2];
      } else {
        row[i] = r;
        row[i + 1] = g;
        row[i + 2] = b;
      }
      row[i + 3] = 255;
    }
    rows.push(row);
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync("public/icons", { recursive: true });
fs.writeFileSync("public/icons/icon-192.png", png(192));
fs.writeFileSync("public/icons/icon-512.png", png(512));
fs.writeFileSync("public/icons/apple-touch-icon.png", png(180));
console.log("wrote PWA icons");
