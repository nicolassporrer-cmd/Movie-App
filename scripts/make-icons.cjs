/* Writes the PWA icons as real PNGs. Hand-rolled encoder so the app needs no
   image dependency: signature + IHDR + IDAT + IEND, RGBA, filter byte 0. */
const fs = require('fs'), zlib = require('zlib');
const OUT = 'C:/dev/Movie-App/public/';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// A film reel: dark ground, green ring, four perforations, dark hub.
const BG = [20, 20, 20], ACC = [0, 168, 90];
function reel(x, y, size) {
  const c = size / 2, dx = x - c, dy = y - c;
  const d = Math.hypot(dx, dy);
  const outer = size * 0.40, inner = size * 0.145, hub = size * 0.075;
  if (d > outer) return [BG[0], BG[1], BG[2], 255];
  if (d < hub) return [BG[0], BG[1], BG[2], 255];
  // four perforations at the diagonals
  const pr = size * 0.085, pd = size * 0.255;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    if (Math.hypot(dx - Math.cos(a) * pd, dy - Math.sin(a) * pd) < pr) return [BG[0], BG[1], BG[2], 255];
  }
  if (d < inner) return [ACC[0], ACC[1], ACC[2], 255];
  return [ACC[0], ACC[1], ACC[2], 255];
}

fs.mkdirSync(OUT, { recursive: true });
[180, 192, 512].forEach(s => {
  fs.writeFileSync(OUT + 'icon-' + s + '.png', png(s, reel));
  console.log('wrote icon-' + s + '.png');
});

fs.writeFileSync(OUT + 'manifest.webmanifest', JSON.stringify({
  name: 'Movies',
  short_name: 'Movies',
  start_url: '/Movie-App/',
  scope: '/Movie-App/',
  display: 'standalone',
  background_color: '#141414',
  theme_color: '#141414',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2));
console.log('wrote manifest.webmanifest');
