// src/pot/ingredientInflate.js

export function clearIngredientDrawing(canvas, ctx) {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function getCanvasBoundingBox(canvas, alphaThreshold = 8) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;

  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (img[i + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: 0, height: 0, isEmpty: true };
  }

  return {
    x: minX, y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    isEmpty: false,
  };
}

export async function inflateIngredientPreview(sourceCanvas, options = {}) {
  const {
    width = 320,
    height = 180,
    padding = 20,
    alphaThreshold = 8,
    fit = "contain",
    baseColor = "#ff5cff",
    inflateRadius = Math.max(14, Math.round(Math.min(width, height) * 0.18)),
    blurPasses = 4,
    blurRadius = 3,
    _singleColor = null, // internal: if set, skip color splitting and use this color
  } = options;

  const bbox = getCanvasBoundingBox(sourceCanvas, alphaThreshold);
  if (bbox.isEmpty) return { url: null, width, height, bbox, isEmpty: true };

  // ---- 多色分層：主流程（非遞迴）才做 ----
  if (_singleColor === null) {
    const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

    // 收集所有量化顏色
    const colorSet = new Map();
    for (let i = 0; i < srcData.data.length; i += 4) {
      if (srcData.data[i + 3] <= alphaThreshold) continue;
      const r = Math.round(srcData.data[i]     / 32) * 32;
      const g = Math.round(srcData.data[i + 1] / 32) * 32;
      const b = Math.round(srcData.data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      if (!colorSet.has(key)) colorSet.set(key, { r, g, b });
    }

    // 只有一種顏色就走快速路徑
    if (colorSet.size <= 1) {
      const c = colorSet.size === 1 ? [...colorSet.values()][0] : hexToRgb(baseColor);
      return inflateIngredientPreview(sourceCanvas, {
        ...options,
        _singleColor: `rgb(${c.r},${c.g},${c.b})`,
      });
    }

    // 多色：每個顏色建立獨立 mask layer，各自 inflate 後依相對位置疊回
    // 先算整張畫布的 bbox，作為 fit 的基準
    const globalBbox = bbox; // 已在上面算好
    const scaleX = (width - padding * 2) / globalBbox.width;
    const scaleY = (height - padding * 2) / globalBbox.height;
    const scale  = Math.min(scaleX, scaleY);
    const offsetX = (width  - globalBbox.width  * scale) / 2;
    const offsetY = (height - globalBbox.height * scale) / 2;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
    outCtx.clearRect(0, 0, width, height);

    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    for (const [key, color] of colorSet) {
      // 建立只有這個顏色的 layer canvas（原始尺寸）
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = sw;
      layerCanvas.height = sh;
      const layerCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
      const layerImg = layerCtx.createImageData(sw, sh);
      for (let i = 0; i < srcData.data.length; i += 4) {
        if (srcData.data[i + 3] <= alphaThreshold) continue;
        const r = Math.round(srcData.data[i]     / 32) * 32;
        const g = Math.round(srcData.data[i + 1] / 32) * 32;
        const b = Math.round(srcData.data[i + 2] / 32) * 32;
        if (`${r},${g},${b}` !== key) continue;
        layerImg.data[i]     = srcData.data[i];
        layerImg.data[i + 1] = srcData.data[i + 1];
        layerImg.data[i + 2] = srcData.data[i + 2];
        layerImg.data[i + 3] = 255;
      }
      layerCtx.putImageData(layerImg, 0, 0);

      // 用這個 layer 自己的 bbox
      const layerBbox = getCanvasBoundingBox(layerCanvas, alphaThreshold);
      if (layerBbox.isEmpty) continue;

      // inflate 這個 layer（用小尺寸，對應 layer 自身的 bbox）
      const layerInflateW = Math.round(layerBbox.width  * scale);
      const layerInflateH = Math.round(layerBbox.height * scale);
      if (layerInflateW < 2 || layerInflateH < 2) continue;

      // 縮放這個 layer 的 mask 到對應大小
      const smallCanvas = document.createElement("canvas");
      smallCanvas.width  = layerInflateW;
      smallCanvas.height = layerInflateH;
      smallCanvas.getContext("2d", { willReadFrequently: true }).drawImage(
        layerCanvas,
        layerBbox.x, layerBbox.y, layerBbox.width, layerBbox.height,
        0, 0, layerInflateW, layerInflateH
      );

      // 對縮放後的 layer 做 inflate（_singleColor 模式，不再分層）
      const layerResult = await inflateIngredientPreview(smallCanvas, {
        ...options,
        width: layerInflateW,
        height: layerInflateH,
        padding: 0,
        _singleColor: `rgb(${color.r},${color.g},${color.b})`,
      });

      if (layerResult.url) {
        const img = await loadImage(layerResult.url);
        // 算這個 layer 在最終畫布上的位置
        const destX = offsetX + (layerBbox.x - globalBbox.x) * scale;
        const destY = offsetY + (layerBbox.y - globalBbox.y) * scale;
        outCtx.drawImage(img, destX, destY, layerInflateW, layerInflateH);
        revokePreviewUrl(layerResult.url);
      }
    }

    const blob = await new Promise(resolve => outCanvas.toBlob(resolve, "image/png"));
    const url = blob ? URL.createObjectURL(blob) : null;
    return { url, width, height, bbox, isEmpty: !url };
  }

  // ---- 單色 inflate（遞迴呼叫或單色畫布走這裡）----
  const resolvedColor = _singleColor || baseColor;

  const maskCanvas = renderMaskToFittedCanvas(sourceCanvas, { width, height, bbox, padding, fit });
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const maskImage = maskCtx.getImageData(0, 0, width, height);
  const alpha = extractAlpha(maskImage.data);

  if (!alpha.some((v) => v > alphaThreshold)) {
    return { url: null, width, height, bbox, isEmpty: true };
  }

  let heightMap = buildHeightMapFromAlpha(alpha, width, height, { alphaThreshold, inflateRadius });
  for (let i = 0; i < blurPasses; i++) {
    heightMap = boxBlurFloat(heightMap, width, height, blurRadius);
  }

  const centroid = computeMaskCentroid(alpha, width, height, alphaThreshold);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d");
  outCtx.clearRect(0, 0, width, height);

  const shaded = shadeInflatedSurface(alpha, heightMap, width, height, { baseColor: resolvedColor, centroid });

  const shadedCanvas = document.createElement("canvas");
  shadedCanvas.width = width;
  shadedCanvas.height = height;
  shadedCanvas.getContext("2d").putImageData(new ImageData(shaded, width, height), 0, 0);
  outCtx.drawImage(shadedCanvas, 0, 0);

  const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, "image/png"));
  const url = blob ? URL.createObjectURL(blob) : null;
  return { url, width, height, bbox, isEmpty: !url };
}

export function revokePreviewUrl(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function drawPreviewToCanvas(previewUrl, targetCanvas, options = {}) {
  const { clear = true, fit = "contain", padding = 0 } = options;
  if (!previewUrl || !targetCanvas) return;

  const ctx = targetCanvas.getContext("2d");
  const img = await loadImage(previewUrl);
  if (clear) ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  const scaleX = (targetCanvas.width - padding * 2) / img.width;
  const scaleY = (targetCanvas.height - padding * 2) / img.height;
  const scale  = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const drawW  = img.width * scale;
  const drawH  = img.height * scale;
  ctx.drawImage(img,
    (targetCanvas.width - drawW) / 2,
    (targetCanvas.height - drawH) / 2,
    drawW, drawH);
}

// ---------------------------
// Core shading — Illustrator inflate style
// Strategy:
//   1. Keep base hue/saturation fully intact — multiply only lightness
//   2. Screen-blend specular + gloss ON TOP (adds white without greying out)
//   3. No RGB-channel occlusion that shifts hue
// ---------------------------

function shadeInflatedSurface(alpha, heightMap, width, height, { baseColor, centroid }) {
  const out     = new Uint8ClampedArray(width * height * 4);
  const base    = hexToRgb(baseColor);
  const baseHsl = rgbToHsl(base.r, base.g, base.b);

  // Light from upper-left-front
  const lightDir = normalize3([-0.30, -0.50, 0.81]);
  const viewDir  = [0, 0, 1];
  const halfVec  = normalize3([
    lightDir[0] + viewDir[0],
    lightDir[1] + viewDir[1],
    lightDir[2] + viewDir[2],
  ]);

  // Gloss anchor: slightly above centroid
  const glossX = centroid.x;
  const glossY = centroid.y - height * 0.14;
  const glossR = Math.min(width, height) * 0.20;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = alpha[i];

      if (a <= 0) {
        const o = i * 4;
        out[o] = out[o+1] = out[o+2] = out[o+3] = 0;
        continue;
      }

      const hC = heightMap[i];

      // Surface normal from height gradient
      const hL = sampleH(heightMap, width, height, x - 1, y);
      const hR = sampleH(heightMap, width, height, x + 1, y);
      const hU = sampleH(heightMap, width, height, x,     y - 1);
      const hD = sampleH(heightMap, width, height, x,     y + 1);
      const n  = normalize3([-(hR - hL) * 1.6, -(hD - hU) * 1.6, 1.0]);

      // Diffuse lighting — high floor so color stays vivid
      const ndotl   = Math.max(0, dot3(n, lightDir));
      const diffuse = 0.58 + ndotl * 0.55;   // [0.58 .. 1.13] — never goes below 58%

      // Edge darkening: edges are hC≈0, centre is hC≈1
      // Use a soft S-curve so the transition looks round, not flat
      const edgeCurve = hC * hC * (3 - 2 * hC);              // smoothstep [0→1]
      const edgeDark  = 0.42 + edgeCurve * 0.58;             // [0.42 .. 1.00]

      // Subtle bottom shade (gravity shadow)
      const vn        = y / Math.max(1, height - 1);
      const bottomG   = 1.0 - vn * 0.12;

      // Combined lightness multiplier — applied in HSL space to preserve hue
      const lightMod = clamp01(diffuse * edgeDark * bottomG);

      // Map base lightness: in dark regions push saturation UP to stay vivid
      // (Illustrator inflate stays saturated even in shadow)
      const darknessRatio = 1 - lightMod;
      const S = clamp01(baseHsl.s + darknessRatio * 0.20);   // boost sat in shadow
      const L = clamp01(baseHsl.l * lightMod);

      const bodyRgb = hslToRgb(baseHsl.h, S, L);
      let r = bodyRgb.r;
      let g = bodyRgb.g;
      let b = bodyRgb.b;

      // --- Specular (Blinn-Phong), screen-blended so it adds brightness not hue shift ---
      const ndoth     = Math.max(0, dot3(n, halfVec));
      const specWide  = Math.pow(ndoth, 6)  * 0.38;   // broad soft sheen
      const specTight = Math.pow(ndoth, 60) * 1.00;   // tight bright highlight
      const spec      = clamp01(specWide + specTight);
      r = screenBlend(r, 255 * spec);
      g = screenBlend(g, 255 * spec);
      b = screenBlend(b, 255 * spec);

      // --- Fixed radial gloss spot (the Illustrator-style white centre dot) ---
      const dist    = Math.hypot(x - glossX, y - glossY);
      const gFall   = clamp01(1 - dist / glossR);
      const gSmooth = gFall * gFall * (3 - 2 * gFall);       // smoothstep
      const hMask   = clamp01((hC - 0.10) / 0.35);           // only on thick parts
      const gloss   = gSmooth * hMask * 0.95;
      r = screenBlend(r, 255 * gloss);
      g = screenBlend(g, 255 * gloss);
      b = screenBlend(b, 255 * gloss);

      const o = i * 4;
      out[o]   = clamp255(r);
      out[o+1] = clamp255(g);
      out[o+2] = clamp255(b);
      out[o+3] = a;
    }
  }
  return out;
}

// ---------------------------
// Internal helpers
// ---------------------------

function renderMaskToFittedCanvas(sourceCanvas, { width, height, bbox, padding, fit }) {
  const out = document.createElement("canvas");
  out.width = width; out.height = height;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  const scaleX = (width - padding * 2) / bbox.width;
  const scaleY = (height - padding * 2) / bbox.height;
  const scale  = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const drawW  = bbox.width * scale;
  const drawH  = bbox.height * scale;
  ctx.drawImage(sourceCanvas, bbox.x, bbox.y, bbox.width, bbox.height,
    (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  return out;
}

function extractAlpha(rgba) {
  const a = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) a[p] = rgba[i + 3];
  return a;
}

function computeMaskCentroid(alpha, width, height, alphaThreshold) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[y * width + x] > alphaThreshold) { sx += x; sy += y; n++; }
  return n ? { x: sx / n, y: sy / n } : { x: width / 2, y: height / 2 };
}

function buildHeightMapFromAlpha(alpha, width, height, { alphaThreshold, inflateRadius }) {
  const size = width * height;
  const f    = new Float64Array(size);
  const INF  = 1e20;
  for (let i = 0; i < size; i++) f[i] = alpha[i] > alphaThreshold ? INF : 0;
  const dist2 = edt2d(f, width, height);
  const out   = new Float32Array(size);
  const maxR  = Math.max(1, inflateRadius);
  for (let i = 0; i < size; i++) {
    if (alpha[i] <= alphaThreshold) { out[i] = 0; continue; }
    const d = Math.sqrt(dist2[i]);
    // Sine dome: flat top, smooth rolloff to edges
    const t  = Math.min(d, maxR) / maxR;
    out[i]   = Math.sin(t * Math.PI * 0.5);
  }
  return out;
}

function sampleH(arr, w, h, x, y) {
  return arr[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
}

function boxBlurFloat(src, width, height, radius = 1) {
  if (radius <= 0) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < width) { s += src[y * width + xx]; c++; }
      }
      tmp[y * width + x] = s / c;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < height) { s += tmp[yy * width + x]; c++; }
      }
      out[y * width + x] = s / c;
    }
  }
  return out;
}

function drawDropShadowFromMask(ctx, maskCanvas, { blur, offsetY, alpha }) {
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = alpha;
  ctx.drawImage(maskCanvas, 0, offsetY);
  ctx.restore();
}

// EDT — Felzenszwalb & Huttenlocher
function edt2d(f, width, height) {
  const tmp = new Float64Array(width * height);
  const d   = new Float64Array(width * height);
  const col = new Float64Array(height);
  const co  = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = f[y * width + x];
    edt1d(col, height, co);
    for (let y = 0; y < height; y++) tmp[y * width + x] = co[y];
  }
  const row = new Float64Array(width);
  const ro  = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = tmp[y * width + x];
    edt1d(row, width, ro);
    for (let x = 0; x < width; x++) d[y * width + x] = ro[x];
  }
  return d;
}

function edt1d(f, n, out) {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const vk = v[k];
      s = ((f[q] + q * q) - (f[vk] + vk * vk)) / (2 * q - 2 * vk);
      if (s <= z[k]) k--;
    } while (s <= z[k]);
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dx = q - v[k];
    out[q] = dx * dx + f[v[k]];
  }
}

// ---------------------------
// Color helpers
// ---------------------------

function hexToRgb(hex) {
  // 支援 rgb(r,g,b) 格式
  const rgbMatch = String(hex).match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  const clean = String(hex).replace("#", "").trim();
  const full  = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** RGB 0-255 → HSL { h:0-360, s:0-1, l:0-1 } */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l   = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if      (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** HSL → RGB 0-255 */
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hN = h / 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(p, q, hN + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, hN)       * 255),
    b: Math.round(hue2rgb(p, q, hN - 1/3) * 255),
  };
}

function clamp01(v)  { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

function screenBlend(base, add) {
  const b = clamp01(base / 255);
  const a = clamp01(add  / 255);
  return (1 - (1 - b) * (1 - a)) * 255;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}