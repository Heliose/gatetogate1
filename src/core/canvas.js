import * as THREE from 'three';

/* Canvas helpers: painters and texture wrappers (playbook §6.3–6.4) */

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* Pixel-shader style painter: fn(u, v, x, y, out) → [r,g,b]; out.h = height 0..1 */
export function paint(size, fn, withHeight = false, sizeY = size) {
  const c = makeCanvas(size, sizeY);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, sizeY);
  const d = img.data;
  let hc, hctx, himg, hd;
  if (withHeight) {
    hc = makeCanvas(size, sizeY);
    hctx = hc.getContext('2d');
    himg = hctx.createImageData(size, sizeY);
    hd = himg.data;
  }
  const out = { h: 0.5 };
  for (let y = 0; y < sizeY; y++) {
    const v = y / sizeY;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      out.h = 0.5;
      const col = fn(u, v, x, y, out);
      const i = (y * size + x) * 4;
      d[i] = col[0] < 0 ? 0 : col[0] > 255 ? 255 : col[0];
      d[i + 1] = col[1] < 0 ? 0 : col[1] > 255 ? 255 : col[1];
      d[i + 2] = col[2] < 0 ? 0 : col[2] > 255 ? 255 : col[2];
      d[i + 3] = 255;
      if (withHeight) {
        const hv = Math.max(0, Math.min(255, out.h * 255));
        hd[i] = hd[i + 1] = hd[i + 2] = hv;
        hd[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (withHeight) hctx.putImageData(himg, 0, 0);
  return { canvas: c, height: hc, ctx };
}

export function tex(canvas, { srgb = true, repeat = null, aniso = 8, wrap = true, filter = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  if (repeat) t.repeat.set(repeat, repeat);
  if (!filter) t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}

/* 1×1 fallback textures so map defines never flip */
export const flatWhite = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
})();
export const flatBump = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Text on a transparent canvas, sized to content. Returns { texture, aspect } */
export function textTexture(text, { font = '700 64px Outfit', color = '#ffffff', pad = 24, glow = 0, bg = null, height = 96 } = {}) {
  const m = makeCanvas(16, 16).getContext('2d');
  m.font = font;
  const w = Math.ceil(m.measureText(text).width) + pad * 2;
  const h = height;
  const c = makeCanvas(Math.max(8, w), h);
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, 14);
    ctx.fill();
  }
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = tex(c, { wrap: false });
  t.userData.aspect = w / h;
  return t;
}
