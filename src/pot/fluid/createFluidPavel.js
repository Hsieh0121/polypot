/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated docpmentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';

export function createFluidPavel({
  mountEl,
  width,
  height,
  color = "#FD6FFF",
}) {
  if (!mountEl) throw new Error("[fluid] missing mountEl");

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.touchAction = "none";
  mountEl.appendChild(canvas);

  let currentColor = hexToRgb01(color);
  function setColor(hex) {
    currentColor = hexToRgb01(hex);
    config.COLORFUL = false;
  }

  let rafId = 0;
  let destroyed = false;
  let userSplatRadius = 1.0;
  const handlers = [];

  const LAYER_ORDER = ["ink","latex","wax","chrome","pearl","clay"];
  let activeMaterialKey = "ink";

  let config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0.0,
    VELOCITY_DISSIPATION: 0.002,
    PRESSURE: 0.4,
    PRESSURE_ITERATIONS: 7,
    CURL: 0.5,
    SPLAT_RADIUS: 0.25,
    SPLAT_FORCE: 3000,
    SHADING: false,
    COLORFUL: false,
    COLOR_UPDATE_SPEED: 20,
    PAUSED: false,
    BACK_COLOR: { r: 255, g: 255, b: 255 },
    TRANSPARENT: true,
    BLOOM: false,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: false,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 1.0,
  };

  const MATERIAL_CONFIGS = {
    ink: {
      DENSITY_DISSIPATION: 0.0,
      VELOCITY_DISSIPATION: 0.002,
      CURL: 0.4,
      PRESSURE: 0.45,
      PRESSURE_ITERATIONS: 8,
      SPLAT_RADIUS: 0.08,
      SPLAT_FORCE: 3200,
      shaderMode: "default",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.10, forceJitter: 0.15 },
    },
    latex: {
      DENSITY_DISSIPATION: 0.0,
      VELOCITY_DISSIPATION: 0.003,
      CURL: 0.12,
      PRESSURE: 0.55,
      PRESSURE_ITERATIONS: 12,
      SPLAT_RADIUS: 0.07,
      SPLAT_FORCE: 3000,
      shaderMode: "latex",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.05, forceJitter: 0.08 },
    },
    wax: {
      DENSITY_DISSIPATION: 0.0,
      VELOCITY_DISSIPATION: 0.12,
      CURL: 0.02,
      PRESSURE: 0.25,
      PRESSURE_ITERATIONS: 5,
      SPLAT_RADIUS: 0.08,
      SPLAT_FORCE: 1600,
      shaderMode: "sss",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.05, forceJitter: 0.05 },
    },
    chrome: {
      DENSITY_DISSIPATION: 0.0,
      VELOCITY_DISSIPATION: 0.0005,
      CURL: 0.5,
      PRESSURE: 0.45,
      PRESSURE_ITERATIONS: 10,
      SPLAT_RADIUS: 0.08,
      SPLAT_FORCE: 3500,
      shaderMode: "chrome",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.08, forceJitter: 0.12 },
    },
    pearl: {
      DENSITY_DISSIPATION: 0.001,
      VELOCITY_DISSIPATION: 0.002,
      CURL: 0.8,
      PRESSURE: 0.4,
      PRESSURE_ITERATIONS: 9,
      SPLAT_RADIUS: 0.08,
      SPLAT_FORCE: 3500,
      shaderMode: "pearl",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.12, forceJitter: 0.14 },
    },
    clay: {
      DENSITY_DISSIPATION: 0.0,
      VELOCITY_DISSIPATION: 0.20,
      CURL: 0.0,
      PRESSURE: 0.20,
      PRESSURE_ITERATIONS: 4,
      SPLAT_RADIUS: 0.10,
      SPLAT_FORCE: 1000,
      shaderMode: "clay",
      brush: { scatter: 1, jitter: 0.0, radiusJitter: 0.03, forceJitter: 0.03 },
    },
  };

  function getActiveCfg() { return MATERIAL_CONFIGS[activeMaterialKey] || MATERIAL_CONFIGS.ink; }

  let fingerMode = false;

  function pointerPrototype() {
    this.id = -1;
    this.texcoordX = 0; this.texcoordY = 0;
    this.prevTexcoordX = 0; this.prevTexcoordY = 0;
    this.deltaX = 0; this.deltaY = 0;
    this.down = false; this.moved = false;
    this.color = { r: currentColor.r, g: currentColor.g, b: currentColor.b };
  }

  let pointers = [new pointerPrototype()];
  const { gl, ext } = getWebGLContext(canvas);

  if (isMobile()) config.DYE_RESOLUTION = 512;
  if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512;
    config.SHADING = false; config.BLOOM = false; config.SUNRAYS = false;
  }

  function getWebGLContext(c) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false };
    let gl = c.getContext("webgl2", params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = c.getContext("webgl", params) || c.getContext("experimental-webgl", params);
    let halfFloat, supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension("EXT_color_buffer_float");
      supportLinearFiltering = gl.getExtension("OES_texture_float_linear");
    } else {
      halfFloat = gl.getExtension("OES_texture_half_float");
      supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear");
    }
    gl.clearColor(0, 0, 0, 0);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA, formatRG, formatR;
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG   = getSupportedFormat(gl, gl.RG16F,   gl.RG,   halfFloatTexType);
      formatR    = getSupportedFormat(gl, gl.R16F,    gl.RED,  halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG   = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatR    = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }
    return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
  }

  function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      if (internalFormat === gl.R16F)  return getSupportedFormat(gl, gl.RG16F,   gl.RG,   type);
      if (internalFormat === gl.RG16F) return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
      return null;
    }
    return { internalFormat, format };
  }

  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  function isMobile() { return /Mobi|Android/i.test(navigator.userAgent); }

  function HSVtoRGB(h, s, v) {
    let r, g, b, i = Math.floor(h * 6), f = h * 6 - i;
    let p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r=v,g=t,b=p; break; case 1: r=q,g=v,b=p; break; case 2: r=p,g=v,b=t; break; case 3: r=p,g=q,b=v; break; case 4: r=t,g=p,b=v; break; case 5: r=v,g=p,b=q; break; }
    return { r, g, b };
  }
  function wrap(v, min, max) { let r = max - min; if (r == 0) return min; return (v - min) % r + min; }
  function getResolution(res) {
    let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (ar < 1) ar = 1 / ar;
    let min = Math.round(res), max = Math.round(res * ar);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  }
  function correctRadius(r) { let ar = canvas.width / canvas.height; if (ar > 1) r *= ar; return r; }

  class Material {
    constructor(vs, fs) { this.vertexShader = vs; this.fragmentShaderSource = fs; this.programs = []; this.activeProgram = null; this.uniforms = []; }
    setKeywords(keywords) {
      let hash = 0; for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);
      let prog = this.programs[hash];
      if (prog == null) { let fs = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords); prog = createProgram(this.vertexShader, fs); this.programs[hash] = prog; }
      if (prog == this.activeProgram) return;
      this.uniforms = getUniforms(prog); this.activeProgram = prog;
    }
    bind() { gl.useProgram(this.activeProgram); }
  }
  class Program {
    constructor(vs, fs) { this.program = createProgram(vs, fs); this.uniforms = getUniforms(this.program); }
    bind() { gl.useProgram(this.program); }
  }
  function createProgram(vs, fs) {
    let p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error("[fluid] link error:", gl.getProgramInfoLog(p));
    return p;
  }
  function getUniforms(prog) {
    let u = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { let name = gl.getActiveUniform(prog, i).name; u[name] = gl.getUniformLocation(prog, name); }
    return u;
  }
  function compileShader(type, src, kw) {
    src = addKeywords(src, kw);
    let s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("[fluid] shader compile error:", gl.getShaderInfoLog(s));
      console.error("[fluid] shader src head:", src.substring(0, 300));
    }
    return s;
  }
  function addKeywords(src, kw) {
    if (!kw || !kw.length) return src;
    let defines = "";
    kw.forEach(k => { defines += "#define " + k + "\n"; });
    return defines + src.replace(/^\s+/, "");
  }
  function hashCode(s) {
    if (!s.length) return 0;
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }

  const baseVertexShader = compileShader(gl.VERTEX_SHADER, [
    "precision highp float;",
    "attribute vec2 aPosition;",
    "varying vec2 vUv,vL,vR,vT,vB;",
    "uniform vec2 texelSize;",
    "void main(){",
    "  vUv=aPosition*0.5+0.5;",
    "  vL=vUv-vec2(texelSize.x,0.0);",
    "  vR=vUv+vec2(texelSize.x,0.0);",
    "  vT=vUv+vec2(0.0,texelSize.y);",
    "  vB=vUv-vec2(0.0,texelSize.y);",
    "  gl_Position=vec4(aPosition,0.0,1.0);",
    "}"
  ].join("\n"));

  const blurVertexShader = compileShader(gl.VERTEX_SHADER, [
    "precision highp float;",
    "attribute vec2 aPosition;",
    "varying vec2 vUv,vL,vR;",
    "uniform vec2 texelSize;",
    "void main(){",
    "  vUv=aPosition*0.5+0.5;",
    "  float o=1.33333333;",
    "  vL=vUv-texelSize*o;",
    "  vR=vUv+texelSize*o;",
    "  gl_Position=vec4(aPosition,0.0,1.0);",
    "}"
  ].join("\n"));

  const blurShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying vec2 vUv,vL,vR;",
    "uniform sampler2D uTexture;",
    "void main(){",
    "  vec4 s=texture2D(uTexture,vUv)*0.29411764;",
    "  s+=texture2D(uTexture,vL)*0.35294117;",
    "  s+=texture2D(uTexture,vR)*0.35294117;",
    "  gl_FragColor=s;",
    "}"
  ].join("\n"));

  const copyShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv;",
    "uniform sampler2D uTexture;",
    "void main(){gl_FragColor=texture2D(uTexture,vUv);}"
  ].join("\n"));

  const clearShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv;",
    "uniform sampler2D uTexture;",
    "uniform float value;",
    "void main(){gl_FragColor=value*texture2D(uTexture,vUv);}"
  ].join("\n"));

  const colorShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "uniform vec4 color;",
    "void main(){gl_FragColor=color;}"
  ].join("\n"));

  // ─── display shader ───────────────────────────────────────────────────────
  // 修改說明（只改這三個材質，chrome/pearl 完全不動）：
  // latex / sss / clay 的鄰居 mask 門檻：0.15 → 0.4
  // 原因：邊緣的鄰居像素 dyeMask ≈ 0.2~0.3，門檻 0.15 讓它們參與法線計算，
  //       導致邊緣法線朝側面，diffuse 壓暗 → 黑邊。
  //       提高到 0.4 後稀薄鄰居 fallback 到中心色，法線正面朝上，不壓暗。
const displayShaderSource = [
  "precision highp float;",
  "precision highp sampler2D;",
  "varying vec2 vUv,vL,vR,vT,vB;",
  "uniform sampler2D uDye0,uDye1,uDye2,uDye3,uDye4,uDye5;",
  "uniform sampler2D uVelocity;",
  "uniform vec2 texelSize;",
  "vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.0,0.6666667,0.3333333,3.0);vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);}",
  "vec4 blendOver(vec4 b,vec4 t){float a=t.a+(1.0-t.a)*b.a;if(a<0.0001)return vec4(0.0);return vec4((t.rgb*t.a+(1.0-t.a)*b.rgb*b.a)/a,a);}",
  "float dyeMask(vec3 c){return clamp(length(c)*5.0,0.0,1.0);}",
  "float edgeAlpha(float m){return smoothstep(0.05,0.25,m);}",
  // 保色相、亮度 floor：讓任何像素不低於 minLen
  "vec3 brightnessFloor(vec3 c,float minLen){float len=length(c);if(len<=0.00001)return c;return len<minLen?c/len*minLen:c;}",

  // ink — 純色，亮度 floor 0.35，無立體感
  "vec4 applyInk(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.02)return vec4(0.0);c=brightnessFloor(c,0.99);float a=edgeAlpha(m);return vec4(c,a);}",

  // latex — 亮度 floor 0.35，高光加亮，alpha 淡出
  "vec4 applyLatex(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.05)return vec4(0.0);c=brightnessFloor(c,0.99);float a=edgeAlpha(m);vec3 lc=clamp(texture2D(d,vL).rgb,0.0,1.0),rc=clamp(texture2D(d,vR).rgb,0.0,1.0),tc=clamp(texture2D(d,vT).rgb,0.0,1.0),bc=clamp(texture2D(d,vB).rgb,0.0,1.0);if(dyeMask(lc)<0.4)lc=c;if(dyeMask(rc)<0.4)rc=c;if(dyeMask(tc)<0.4)tc=c;if(dyeMask(bc)<0.4)bc=c;vec3 n=normalize(vec3((length(rc)-length(lc))*4.0,(length(tc)-length(bc))*4.0,0.5));float sp=pow(clamp(dot(n,normalize(vec3(0.3,0.6,1.0))),0.0,1.0),48.0)*0.6;c=clamp(c+vec3(sp),0.0,1.0);return vec4(c,a);}",

  // sss (wax) — 亮度 floor 0.35，SSS blur，alpha 淡出
  "vec4 applySss(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.05)return vec4(0.0);c=brightnessFloor(c,0.99);float a=edgeAlpha(m);vec2 o=texelSize*5.0;vec3 b=vec3(0.0);float w=0.0;vec3 s;float ms;s=clamp(texture2D(d,vUv+vec2(-o.x,-o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(0.0,-o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(o.x,-o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(-o.x,0.0)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(o.x,0.0)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(-o.x,o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(0.0,o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(o.x,o.y)).rgb,0.0,1.0);ms=dyeMask(s);b+=s*ms*0.077;w+=ms*0.077;b+=c*m*0.197;w+=m*0.197;if(w>0.001)b/=w;else b=c;c=mix(c,b,0.55);vec3 lc=clamp(texture2D(d,vL).rgb,0.0,1.0),rc=clamp(texture2D(d,vR).rgb,0.0,1.0),tc=clamp(texture2D(d,vT).rgb,0.0,1.0),bc=clamp(texture2D(d,vB).rgb,0.0,1.0);if(dyeMask(lc)<0.4)lc=c;if(dyeMask(rc)<0.4)rc=c;if(dyeMask(tc)<0.4)tc=c;if(dyeMask(bc)<0.4)bc=c;vec3 n=normalize(vec3((length(rc)-length(lc))*2.0,(length(tc)-length(bc))*2.0,0.5));float sp=pow(clamp(dot(n,normalize(vec3(0.2,0.5,1.0))),0.0,1.0),32.0)*0.45;c=clamp(c+vec3(sp),0.0,1.0);return vec4(c,a);}",

  // chrome — 完全不動
  "vec4 applyChrome(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.01)return vec4(0.0);vec3 lc=clamp(texture2D(d,vL).rgb,0.0,1.0),rc=clamp(texture2D(d,vR).rgb,0.0,1.0),tc=clamp(texture2D(d,vT).rgb,0.0,1.0),bc=clamp(texture2D(d,vB).rgb,0.0,1.0);float ml=dyeMask(lc),mr=dyeMask(rc),mt=dyeMask(tc),mb=dyeMask(bc);if(ml<0.01)lc=c;if(mr<0.01)rc=c;if(mt<0.01)tc=c;if(mb<0.01)bc=c;vec3 n=normalize(vec3((length(rc)-length(lc))*6.0,(length(tc)-length(bc))*6.0,0.5));float ey=n.y*0.5+0.5;float h=fract(atan(c.b-c.r,c.g-0.5*(c.r+c.b))/6.2832+0.5);vec3 sky=hsv2rgb(vec3(h,0.5,0.9));vec3 hor=hsv2rgb(vec3(h+0.03,0.4,0.75));vec3 gnd=hsv2rgb(vec3(h+0.08,0.6,0.25));vec3 env=ey>0.5?mix(hor,sky,(ey-0.5)*2.0):mix(gnd,hor,ey*2.0);env+=hsv2rgb(vec3(h,0.2,pow(max(dot(n,normalize(vec3(0.4,0.7,1.0))),0.0),32.0)*0.7));c=mix(c*0.05,env,clamp(length(c)*4.0,0.0,1.0));return vec4(c,m);}",

  // pearl — 完全不動
  "vec4 applyPearl(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.05)return vec4(0.0);float baseH=fract(atan(c.b-c.r,c.g-0.5*(c.r+c.b))/6.2832+0.5);vec3 plc=clamp(texture2D(d,vL).rgb,0.0,1.0),prc=clamp(texture2D(d,vR).rgb,0.0,1.0),ptc=clamp(texture2D(d,vT).rgb,0.0,1.0),pbc=clamp(texture2D(d,vB).rgb,0.0,1.0);if(dyeMask(plc)<0.15)plc=c;if(dyeMask(prc)<0.15)prc=c;if(dyeMask(ptc)<0.15)ptc=c;if(dyeMask(pbc)<0.15)pbc=c;vec2 g=vec2(length(prc)-length(plc),length(ptc)-length(pbc));float grad=clamp(length(g)*8.0,0.0,1.0);vec3 baseCol=hsv2rgb(vec3(baseH,0.15,0.96));vec3 iridCol=hsv2rgb(vec3(fract(baseH+0.5),0.45,0.94));vec3 col=mix(baseCol,iridCol,grad*0.55);vec3 n=normalize(vec3(g.x*5.0,g.y*5.0,0.5));float sp=pow(clamp(dot(n,normalize(vec3(0.3,0.5,1.0))),0.0,1.0),20.0);col=mix(col,vec3(1.0),sp*0.98);return vec4(col,m);}",

  // clay — 亮度 floor 0.35，飽和保留，啞光，陰影立體
  "vec4 applyClay(sampler2D d){vec3 c=texture2D(d,vUv).rgb;c=clamp(c,0.0,1.0);float m=dyeMask(c);if(m<0.05)return vec4(0.0);c=brightnessFloor(c,0.99);float a=edgeAlpha(m);vec2 co=texelSize*2.0;vec3 cs=vec3(0.0);float w=0.0;vec3 s;float ms;s=clamp(texture2D(d,vUv+vec2(-co.x,-co.y)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(0.0,-co.y)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(co.x,-co.y)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(-co.x,0.0)).rgb,0.0,1.0);cs+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(co.x,0.0)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(-co.x,co.y)).rgb,0.0,1.0);cs+=s*ms*0.077;w+=ms*0.077;s=clamp(texture2D(d,vUv+vec2(0.0,co.y)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.123;w+=ms*0.123;s=clamp(texture2D(d,vUv+vec2(co.x,co.y)).rgb,0.0,1.0);ms=dyeMask(s);cs+=s*ms*0.077;w+=ms*0.077;cs+=c*m*0.197;w+=m*0.197;if(w>0.001)cs/=w;else cs=c;c=mix(c,cs,0.3);c=c*0.75+0.06;vec3 lc=clamp(texture2D(d,vL).rgb,0.0,1.0),rc=clamp(texture2D(d,vR).rgb,0.0,1.0),tc=clamp(texture2D(d,vT).rgb,0.0,1.0),bc=clamp(texture2D(d,vB).rgb,0.0,1.0);if(dyeMask(lc)<0.4)lc=c;if(dyeMask(rc)<0.4)rc=c;if(dyeMask(tc)<0.4)tc=c;if(dyeMask(bc)<0.4)bc=c;vec3 n=normalize(vec3((length(rc)-length(lc))*3.0,(length(tc)-length(bc))*3.0,1.2));float diff=clamp(dot(n,normalize(vec3(0.3,0.5,1.0))),0.7,1.0);c*=diff;return vec4(c,a);}",

  "void main(){vec4 res=vec4(0.0);res=blendOver(res,applyInk(uDye0));res=blendOver(res,applyLatex(uDye1));res=blendOver(res,applySss(uDye2));res=blendOver(res,applyChrome(uDye3));res=blendOver(res,applyPearl(uDye4));res=blendOver(res,applyClay(uDye5));res.rgb*=res.a;gl_FragColor=res;}"
].join("\n");
  // ─── end display shader ───────────────────────────────────────────────────

  const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uTexture;",
    "uniform vec3 curve;",
    "uniform float threshold;",
    "void main(){",
    "  vec3 c=texture2D(uTexture,vUv).rgb;",
    "  float br=max(c.r,max(c.g,c.b));",
    "  float rq=clamp(br-curve.x,0.0,curve.y);",
    "  rq=curve.z*rq*rq;",
    "  c*=max(rq,br-threshold)/max(br,0.0001);",
    "  gl_FragColor=vec4(c,0.0);",
    "}"
  ].join("\n"));

  const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying vec2 vL,vR,vT,vB;",
    "uniform sampler2D uTexture;",
    "void main(){",
    "  vec4 s=vec4(0.0);",
    "  s+=texture2D(uTexture,vL);",
    "  s+=texture2D(uTexture,vR);",
    "  s+=texture2D(uTexture,vT);",
    "  s+=texture2D(uTexture,vB);",
    "  gl_FragColor=s*0.25;",
    "}"
  ].join("\n"));

  const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying vec2 vL,vR,vT,vB;",
    "uniform sampler2D uTexture;",
    "uniform float intensity;",
    "void main(){",
    "  vec4 s=vec4(0.0);",
    "  s+=texture2D(uTexture,vL);",
    "  s+=texture2D(uTexture,vR);",
    "  s+=texture2D(uTexture,vT);",
    "  s+=texture2D(uTexture,vB);",
    "  gl_FragColor=s*0.25*intensity;",
    "}"
  ].join("\n"));

  const sunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uTexture;",
    "void main(){",
    "  vec4 c=texture2D(uTexture,vUv);",
    "  float br=max(c.r,max(c.g,c.b));",
    "  c.a=1.0-min(max(br*20.0,0.0),0.8);",
    "  gl_FragColor=c;",
    "}"
  ].join("\n"));

  const sunraysShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uTexture;",
    "uniform float weight;",
    "#define ITERATIONS 16",
    "void main(){",
    "  float Density=0.3,Decay=0.95,Exposure=0.7;",
    "  vec2 coord=vUv,dir=(vUv-0.5)*(1.0/float(ITERATIONS)*Density);",
    "  float illum=1.0,color=texture2D(uTexture,vUv).a;",
    "  for(int i=0;i<ITERATIONS;i++){",
    "    coord-=dir;",
    "    color+=texture2D(uTexture,coord).a*illum*weight;",
    "    illum*=Decay;",
    "  }",
    "  gl_FragColor=vec4(color*Exposure,0.0,0.0,1.0);",
    "}"
  ].join("\n"));

  const splatVelocityShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uTarget;",
    "uniform float aspectRatio;",
    "uniform vec3 color;",
    "uniform vec2 point;",
    "uniform float radius;",
    "void main(){",
    "  vec2 p=vUv-point;",
    "  p.x*=aspectRatio;",
    "  vec3 sp=exp(-dot(p,p)/radius)*color;",
    "  gl_FragColor=vec4(texture2D(uTarget,vUv).xyz+sp,1.0);",
    "}"
  ].join("\n"));

  const splatDyeShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uTarget;",
    "uniform float aspectRatio;",
    "uniform vec3 color;",
    "uniform vec2 point;",
    "uniform float radius;",
    "void main(){",
    "  vec2 p=vUv-point;",
    "  p.x*=aspectRatio;",
    "  float a=exp(-dot(p,p)/radius);",
    "  vec3 base=texture2D(uTarget,vUv).xyz;",
    "  float t=smoothstep(0.05,0.4,a);",
    "  gl_FragColor=vec4(mix(base,color,t),1.0);",
    "}"
  ].join("\n"));

  const advectionShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv;",
    "uniform sampler2D uVelocity,uSource;",
    "uniform vec2 texelSize,dyeTexelSize;",
    "uniform float dt,dissipation;",
    "vec4 bilerp(sampler2D s,vec2 uv,vec2 ts){",
    "  vec2 st=uv/ts-0.5,iuv=floor(st),fuv=fract(st);",
    "  vec4 a=texture2D(s,(iuv+vec2(0.5,0.5))*ts);",
    "  vec4 b=texture2D(s,(iuv+vec2(1.5,0.5))*ts);",
    "  vec4 c=texture2D(s,(iuv+vec2(0.5,1.5))*ts);",
    "  vec4 d=texture2D(s,(iuv+vec2(1.5,1.5))*ts);",
    "  return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);",
    "}",
    "void main(){",
    "#ifdef MANUAL_FILTERING",
    "  vec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;",
    "  vec4 result=bilerp(uSource,coord,dyeTexelSize);",
    "#else",
    "  vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;",
    "  vec4 result=texture2D(uSource,coord);",
    "#endif",
    "  gl_FragColor=max(result/(1.0+dissipation*dt),vec4(0.0));",
    "}"
  ].join("\n"), ext.supportLinearFiltering ? null : ["MANUAL_FILTERING"]);

  const divergenceShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv,vL,vR,vT,vB;",
    "uniform sampler2D uVelocity;",
    "void main(){",
    "  float L=texture2D(uVelocity,vL).x,R=texture2D(uVelocity,vR).x;",
    "  float T=texture2D(uVelocity,vT).y,B=texture2D(uVelocity,vB).y;",
    "  vec2 C=texture2D(uVelocity,vUv).xy;",
    "  if(vL.x<0.0)L=-C.x;if(vR.x>1.0)R=-C.x;",
    "  if(vT.y>1.0)T=-C.y;if(vB.y<0.0)B=-C.y;",
    "  gl_FragColor=vec4(0.5*(R-L+T-B),0.0,0.0,1.0);",
    "}"
  ].join("\n"));

  const curlShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv,vL,vR,vT,vB;",
    "uniform sampler2D uVelocity;",
    "void main(){",
    "  float L=texture2D(uVelocity,vL).y,R=texture2D(uVelocity,vR).y;",
    "  float T=texture2D(uVelocity,vT).x,B=texture2D(uVelocity,vB).x;",
    "  gl_FragColor=vec4(0.5*(R-L-T+B),0.0,0.0,1.0);",
    "}"
  ].join("\n"));

  const vorticityShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision highp float;",
    "precision highp sampler2D;",
    "varying vec2 vUv,vL,vR,vT,vB;",
    "uniform sampler2D uVelocity,uCurl;",
    "uniform float curl,dt;",
    "void main(){",
    "  float L=texture2D(uCurl,vL).x,R=texture2D(uCurl,vR).x;",
    "  float T=texture2D(uCurl,vT).x,B=texture2D(uCurl,vB).x;",
    "  float C=texture2D(uCurl,vUv).x;",
    "  vec2 f=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));",
    "  f/=length(f)+0.0001;",
    "  f*=curl*C;",
    "  f.y*=-1.0;",
    "  vec2 v=texture2D(uVelocity,vUv).xy+f*dt;",
    "  gl_FragColor=vec4(min(max(v,-1000.0),1000.0),0.0,1.0);",
    "}"
  ].join("\n"));

  const pressureShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv,vL,vR,vT,vB;",
    "uniform sampler2D uPressure,uDivergence;",
    "void main(){",
    "  float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x;",
    "  float T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;",
    "  float d=texture2D(uDivergence,vUv).x;",
    "  gl_FragColor=vec4((L+R+B+T-d)*0.25,0.0,0.0,1.0);",
    "}"
  ].join("\n"));

  const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "precision mediump sampler2D;",
    "varying highp vec2 vUv,vL,vR,vT,vB;",
    "uniform sampler2D uPressure,uVelocity;",
    "void main(){",
    "  float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x;",
    "  float T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;",
    "  vec2 v=texture2D(uVelocity,vUv).xy-vec2(R-L,T-B);",
    "  gl_FragColor=vec4(v,0.0,1.0);",
    "}"
  ].join("\n"));

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (target, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear) { gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  let dyeFBOs = {};
  let velocity, divergence, curl, pressure, bloom, bloomFramebuffers = [], sunrays, sunraysTemp;

  const blurP       = new Program(blurVertexShader, blurShader);
  const copyP       = new Program(baseVertexShader, copyShader);
  const clearP      = new Program(baseVertexShader, clearShader);
  const colorP      = new Program(baseVertexShader, colorShader);
  const bloomPreP   = new Program(baseVertexShader, bloomPrefilterShader);
  const bloomBlurP  = new Program(baseVertexShader, bloomBlurShader);
  const bloomFinalP = new Program(baseVertexShader, bloomFinalShader);
  const sunraysMaskP= new Program(baseVertexShader, sunraysMaskShader);
  const sunraysP    = new Program(baseVertexShader, sunraysShader);
  const splatVelP   = new Program(baseVertexShader, splatVelocityShader);
  const splatDyeP   = new Program(baseVertexShader, splatDyeShader);
  const advectionP  = new Program(baseVertexShader, advectionShader);
  const divergenceP = new Program(baseVertexShader, divergenceShader);
  const curlP       = new Program(baseVertexShader, curlShader);
  const vorticityP  = new Program(baseVertexShader, vorticityShader);
  const pressureP   = new Program(baseVertexShader, pressureShader);
  const gradSubP    = new Program(baseVertexShader, gradientSubtractShader);
  const displayP    = new Program(baseVertexShader,
    compileShader(gl.FRAGMENT_SHADER, displayShaderSource, []));

  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture: tex, fbo, width: w, height: h,
      texelSizeX: 1/w, texelSizeY: 1/h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; }
    };
  }

  function createDoubleFBO(w, h, if_, f, t, p) {
    let f1 = createFBO(w,h,if_,f,t,p), f2 = createFBO(w,h,if_,f,t,p);
    return {
      width: w, height: h, texelSizeX: f1.texelSizeX, texelSizeY: f1.texelSizeY,
      get read() { return f1; }, set read(v) { f1 = v; },
      get write() { return f2; }, set write(v) { f2 = v; },
      swap() { let t = f1; f1 = f2; f2 = t; }
    };
  }

  function resizeFBO(target, w, h, if_, f, t, p) {
    let n = createFBO(w, h, if_, f, t, p);
    copyP.bind();
    gl.uniform1i(copyP.uniforms.uTexture, target.attach(0));
    blit(n);
    return n;
  }

  function resizeDoubleFBO(target, w, h, if_, f, t, p) {
    if (target.width == w && target.height == h) return target;
    target.read = resizeFBO(target.read, w, h, if_, f, t, p);
    target.write = createFBO(w, h, if_, f, t, p);
    target.width = w; target.height = h;
    target.texelSizeX = 1/w; target.texelSizeY = 1/h;
    return target;
  }

  function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION), dyeRes = getResolution(config.DYE_RESOLUTION);
    const tt = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
    const fil = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    velocity = velocity
      ? resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, tt, fil)
      : createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, tt, fil);

    LAYER_ORDER.forEach(key => {
      dyeFBOs[key] = dyeFBOs[key]
        ? resizeDoubleFBO(dyeFBOs[key], dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, tt, fil)
        : createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, tt, fil);
    });

    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);
    curl       = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, tt, gl.NEAREST);

    clearFBOs();

    let br = getResolution(config.BLOOM_RESOLUTION);
    bloom = createFBO(br.width, br.height, rgba.internalFormat, rgba.format, tt, fil);
    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
      let bw = br.width >> (i+1), bh = br.height >> (i+1);
      if (bw < 2 || bh < 2) break;
      bloomFramebuffers.push(createFBO(bw, bh, rgba.internalFormat, rgba.format, tt, fil));
    }
    let sr = getResolution(config.SUNRAYS_RESOLUTION);
    sunrays     = createFBO(sr.width, sr.height, r.internalFormat, r.format, tt, fil);
    sunraysTemp = createFBO(sr.width, sr.height, r.internalFormat, r.format, tt, fil);
  }

  initFramebuffers();

  function resizeCanvasTo(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; return true; }
    return false;
  }

  function getCanvasCssSize() { const r = canvas.getBoundingClientRect(); return { w: r.width || width, h: r.height || height }; }
  function addTrackedListener(t, type, fn, opts) { t.addEventListener(type, fn, opts); handlers.push([t, type, fn, opts]); }
  function getTexcoordFromEvent(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height }; }
  function getTexcoordFromTouch(t) { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) / r.width, y: 1 - (t.clientY - r.top) / r.height }; }
  function randSigned() { return Math.random() * 2 - 1; }

  function splatPointer(pointer) {
    const matCfg = getActiveCfg();
    const b = matCfg.brush || { scatter: 1, jitter: 0, radiusJitter: 0, forceJitter: 0 };
    const bdx = pointer.deltaX * matCfg.SPLAT_FORCE, bdy = pointer.deltaY * matCfg.SPLAT_FORCE;
    for (let i = 0; i < Math.max(1, b.scatter | 0); i++) {
      const jx = b.jitter ? randSigned() * b.jitter : 0, jy = b.jitter ? randSigned() * b.jitter : 0;
      const rm = 1 + (b.radiusJitter ? randSigned() * b.radiusJitter : 0);
      const fm = 1 + (b.forceJitter  ? randSigned() * b.forceJitter  : 0);
      if (fingerMode) splatVelocityOnly(pointer.texcoordX + jx, pointer.texcoordY + jy, bdx * fm, bdy * fm, rm);
      else            splat(pointer.texcoordX + jx, pointer.texcoordY + jy, bdx * fm, bdy * fm, pointer.color, rm);
    }
  }

  function splat(x, y, dx, dy, color, rm = 1) {
    const matCfg = getActiveCfg();
    const r = correctRadius(matCfg.SPLAT_RADIUS * rm * userSplatRadius);
    splatVelP.bind();
    gl.uniform1i(splatVelP.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatVelP.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatVelP.uniforms.point, x, y);
    gl.uniform3f(splatVelP.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatVelP.uniforms.radius, r);
    blit(velocity.write); velocity.swap();

    const dye = dyeFBOs[activeMaterialKey];
    splatDyeP.bind();
    gl.uniform1i(splatDyeP.uniforms.uTarget, dye.read.attach(0));
    gl.uniform1f(splatDyeP.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatDyeP.uniforms.point, x, y);
    gl.uniform3f(splatDyeP.uniforms.color, color.r, color.g, color.b);
    gl.uniform1f(splatDyeP.uniforms.radius, r);
    blit(dye.write); dye.swap();
  }

  function splatVelocityOnly(x, y, dx, dy, rm = 1) {
    const matCfg = getActiveCfg();
    const r = correctRadius(matCfg.SPLAT_RADIUS * rm * userSplatRadius);
    splatVelP.bind();
    gl.uniform1i(splatVelP.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatVelP.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatVelP.uniforms.point, x, y);
    gl.uniform3f(splatVelP.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatVelP.uniforms.radius, r);
    blit(velocity.write); velocity.swap();
  }

  function clearFBOs() {
    gl.clearColor(0, 0, 0, 0);
    LAYER_ORDER.forEach(key => {
      const dye = dyeFBOs[key];
      if (!dye) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function clearCanvas() {
    colorP.bind();
    gl.uniform4f(colorP.uniforms.color, 0, 0, 0, 0);
    LAYER_ORDER.forEach(key => {
      const dye = dyeFBOs[key];
      if (!dye) return;
      blit(dye.write, true); dye.swap();
      blit(dye.write, true); dye.swap();
    });
    blit(velocity.write, true); velocity.swap();
    blit(velocity.write, true); velocity.swap();
  }

  function applyInputs() {
    pointers.forEach(p => { if (p.moved) { p.moved = false; splatPointer(p); } });
  }

  function simStep(dt) {
    gl.disable(gl.BLEND);
    const matCfg = getActiveCfg();

    curlP.bind();
    gl.uniform2f(curlP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlP.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityP.bind();
    gl.uniform2f(vorticityP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityP.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityP.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityP.uniforms.curl, matCfg.CURL);
    gl.uniform1f(vorticityP.uniforms.dt, dt);
    blit(velocity.write); velocity.swap();

    divergenceP.bind();
    gl.uniform2f(divergenceP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceP.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearP.bind();
    gl.uniform1i(clearP.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearP.uniforms.value, matCfg.PRESSURE);
    blit(pressure.write); pressure.swap();

    pressureP.bind();
    gl.uniform2f(pressureP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureP.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < matCfg.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureP.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gradSubP.bind();
    gl.uniform2f(gradSubP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradSubP.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradSubP.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    advectionP.bind();
    gl.uniform2f(advectionP.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering) gl.uniform2f(advectionP.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let vid = velocity.read.attach(0);
    gl.uniform1i(advectionP.uniforms.uVelocity, vid);
    gl.uniform1i(advectionP.uniforms.uSource, vid);
    gl.uniform1f(advectionP.uniforms.dt, dt);
    gl.uniform1f(advectionP.uniforms.dissipation, matCfg.VELOCITY_DISSIPATION);
    blit(velocity.write); velocity.swap();

    LAYER_ORDER.forEach(key => {
      const dye = dyeFBOs[key];
      if (!dye) return;
      const dissipation = MATERIAL_CONFIGS[key]?.DENSITY_DISSIPATION ?? 0.0;
      if (!ext.supportLinearFiltering) gl.uniform2f(advectionP.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      gl.uniform1i(advectionP.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionP.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(advectionP.uniforms.dissipation, dissipation);
      blit(dye.write); dye.swap();
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function render() {
    for (let i = 0; i < 8; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // 先清成透明，不要鋪白底
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    displayP.bind();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    gl.uniform2f(displayP.uniforms.texelSize, 1.0 / w, 1.0 / h);

    LAYER_ORDER.forEach((key, i) => {
      gl.uniform1i(displayP.uniforms[`uDye${i}`], dyeFBOs[key].read.attach(i));
    });
    gl.uniform1i(displayP.uniforms.uVelocity, velocity.read.attach(6));

    blit(null);
    gl.disable(gl.BLEND);
  }

  function storeSnapshot() {
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });

    // 不填白底，保留透明背景
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);

    return offscreen;
  }

  let lastUpdateTime = Date.now();
  function calcDeltaTime() {
    const now = Date.now();
    let dt = Math.min((now - lastUpdateTime) / 1000, 0.016666);
    lastUpdateTime = now;
    return dt;
  }

  function start() {
    const loop = () => {
      if (destroyed) return;
      const { w, h } = getCanvasCssSize();
      if (resizeCanvasTo(w, h)) initFramebuffers();
      const dt = calcDeltaTime();
      applyInputs();
      if (!config.PAUSED) simStep(dt);
      render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  resizeCanvasTo(width, height);

  addTrackedListener(canvas, "mousedown", (e) => {
    const { x, y } = getTexcoordFromEvent(e);
    const p = pointers.find(p => p.id === -1) || new pointerPrototype();
    p.id = -1; p.down = true; p.moved = false;
    p.texcoordX = x; p.texcoordY = y;
    p.prevTexcoordX = x; p.prevTexcoordY = y;
    p.deltaX = 0; p.deltaY = 0;
    p.color = { r: currentColor.r, g: currentColor.g, b: currentColor.b };
    if (!pointers.includes(p)) pointers.push(p);
  });

  addTrackedListener(canvas, "mousemove", (e) => {
    const p = pointers[0]; if (!p?.down) return;
    const { x, y } = getTexcoordFromEvent(e);
    p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
    p.texcoordX = x; p.texcoordY = y;
    p.deltaX = x - p.prevTexcoordX; p.deltaY = y - p.prevTexcoordY;
    p.moved = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0;
  });

  addTrackedListener(window, "mouseup", () => { const p = pointers[0]; if (p) p.down = false; });

  addTrackedListener(canvas, "touchstart", (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length + 1 >= pointers.length) pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
      const { x, y } = getTexcoordFromTouch(touches[i]);
      const p = pointers[i + 1];
      p.id = touches[i].identifier; p.down = true; p.moved = false;
      p.texcoordX = x; p.texcoordY = y;
      p.prevTexcoordX = x; p.prevTexcoordY = y;
      p.deltaX = 0; p.deltaY = 0;
      p.color = { r: currentColor.r, g: currentColor.g, b: currentColor.b };
    }
  }, { passive: false });

  addTrackedListener(canvas, "touchmove", (e) => {
    e.preventDefault();
    for (let i = 0; i < e.targetTouches.length; i++) {
      const p = pointers.find(pp => pp.id === e.targetTouches[i].identifier);
      if (!p || !p.down) continue;
      const { x, y } = getTexcoordFromTouch(e.targetTouches[i]);
      p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
      p.texcoordX = x; p.texcoordY = y;
      p.deltaX = x - p.prevTexcoordX; p.deltaY = y - p.prevTexcoordY;
      p.moved = Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0;
    }
  }, { passive: false });

  addTrackedListener(window, "touchend", (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const p = pointers.find(pp => pp.id === e.changedTouches[i].identifier);
      if (p) p.down = false;
    }
  });

  start();

  function destroy() {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    for (const [t, type, fn, opts] of handlers) t.removeEventListener(type, fn, opts);
    handlers.length = 0;
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
  }

  return {
    canvas,
    setColor,
    setActiveMaterial(key) {
      if (!MATERIAL_CONFIGS[key]) return;
      activeMaterialKey = key;
    },
    resize(w, h) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      resizeCanvasTo(w, h);
      initFramebuffers();
    },
    destroy,
    clearCanvas,
    storeSnapshot,
    setSplatRadius: (v) => { userSplatRadius = Math.pow(v / 100, 2.0) * 2.0 + 0.05; },
    setFingerMode:  (b) => { fingerMode = b; },
  };
}

function hexToRgb01(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 1, g: 0, b: 1 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}