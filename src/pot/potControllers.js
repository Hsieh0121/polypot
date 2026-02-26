import { createPotData } from "./potData.js";
import { createBallEditorFluid } from "./ballEditorFluid.js";
import { createFluidPavel } from "./fluid/createFluidPavel.js";



export function createPotController({ appEl, onClose, onRequestClose } = {}) {
  if (!appEl) throw new Error("[pot] createPotController: appEl is required");

  // ---------- state ----------
  let openFlag = false;
  let overlayEl = null;
  let panelEl = null;

  let activeTableId = null;
  let step = 0; // 0,1,2,3

  const balls = []; // {id, name, previewUrl, createdAt}
  let activeBallId = null;


  // Step1 placeholders
  let fluidCanvas = null; // 549x549 (you will replace with webgl fluid canvas later)
  // Step1 fluid runtime
  let fluidMountEl = null;   
  let fluidCtrl = null;        
  let fluidColor = "#ff5cff";  
  let ballEditor = null; 
  let listWrap = null;
  let ballListEl = null;
  let emptyTextEl = null;
  const potData = createPotData();

  // Step2
  let potCanvas = null; // 312x312
  let potCtx = null;
  let placements = [];
  let regionOverlayCanvas = null;
  let regionOverlayCtx = null;
  let step2Initialized = false;
  
  // --- Step2 cut ---
  let cutMode = false;          
  let isDrawingCut = false;
  let cutPath = [];              
  let cutLines = [];      
  let step2Bound = false;   
  let activeCutPath = [];

  // --- Step2 regions (raster partition) ---
  let regionW = 0;
  let regionH = 0;
  let regionMap = null;           // Int32Array, size = W*H, -1=outside, 0..n-1=regionId
  let regionCount = 0;

  let wallMap = null;             // Uint8Array, 1=wall(pixel blocked)
  let hoverRegionId = -1;         // 滑到哪塊
  let selectedRegionId = -1;      // 點選哪塊（你要“選到變灰”我建議用 selected）
  
  // Step3 fake diffusion
  let diffCanvas = null;
  let diffCtx = null;
  let diffOff = null;       // offscreen buffer
  let diffOffCtx = null;
  let diffRaf = 0;
  let diffRunning = false;
  let lastT = 0;

  // ---------- helpers ----------


  const UI = {
    overlayW: 1310,
    overlayH: 647,
    btnW: 234,
    btnH: 95,
    ballDivW: 234,
    ballDivH: 305,
    fluidSize: 549,
    potCanvasSize: 312,
  };

  function isOpen() {
    return openFlag;
  }

  function open({ tableId } = {}) {
    if (openFlag) return;
    openFlag = true;
    activeTableId = tableId ?? null;
    step = 0;

    mount();
    renderStep();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    activeTableId = null;
    step = 0;
    activeBallId = null;

    if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    panelEl = null;
    fluidCanvas = null;
    potCanvas = null;
    potCtx = null;

    if (typeof onClose === "function") onClose();
  }

  function requestClose() {
    if (typeof onRequestClose === "function") onRequestClose();
    else close();
  }

  function mount() {
    overlayEl = document.createElement("div");
    overlayEl.id = "pot-overlay";
    overlayEl.style.position = "absolute";
    overlayEl.style.inset = "0";
    overlayEl.style.display = "flex";
    overlayEl.style.alignItems = "center";
    overlayEl.style.justifyContent = "center";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.style.zIndex = "9999";

    const dim = document.createElement("div");
    dim.style.position = "absolute";
    dim.style.inset = "0";
    dim.style.background = "rgba(0,0,0,0.12)";
    overlayEl.appendChild(dim);
    dim.addEventListener("click", requestClose);

    panelEl = document.createElement("div");
    panelEl.style.position = "relative";
    panelEl.style.width = `${UI.overlayW}px`;
    panelEl.style.height = `${UI.overlayH}px`;
    panelEl.style.background = "#ffffff";
    panelEl.style.borderRadius = "24px";
    panelEl.style.boxShadow = "0 12px 40px rgba(0,0,0,0.18)";
    panelEl.style.overflow = "hidden";
    overlayEl.appendChild(panelEl);

    const cs = getComputedStyle(appEl);
    if (cs.position === "static") appEl.style.position = "relative";
    appEl.appendChild(overlayEl);

    // Esc to close (UI scope)
    window.addEventListener("keydown", onKeyDownWhileOpen, true);
  }

  function unmountKey() {
    window.removeEventListener("keydown", onKeyDownWhileOpen, true);
  }

  function mountFluidEditor() {
    if (!fluidMountEl) return;
    if (fluidCtrl) return;

    fluidCtrl = createFluidPavel({
      mountEl: fluidMountEl,
      width: UI.fluidSize,
      height: UI.fluidSize,
      color: fluidColor,
    });
  }

  function unmountFluidEditor() {
    if (fluidCtrl?.destroy) fluidCtrl.destroy();
    fluidCtrl = null;
    fluidCanvas = null;
    if (fluidMountEl) fluidMountEl.innerHTML = "";
  }

  function onKeyDownWhileOpen(e) {
    if (!openFlag) return;
    if (e.code === "Escape") {
      e.preventDefault();
      requestClose();
    }
  }

  function clearPanel() {
    if (!panelEl) return;
    panelEl.innerHTML = "";
  }

  function makeBtn(label, { filled = false, onClick } = {}) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.width = `${UI.btnW}px`;
    b.style.height = `${UI.btnH}px`;
    b.style.borderRadius = "48px";
    b.style.cursor = "pointer";
    b.style.fontSize = "22px";
    b.style.fontFamily = "ui-sans-serif, system-ui";
    b.style.letterSpacing = "1px";
    b.style.border = filled ? "0" : "3px solid #ff5cff";
    b.style.background = filled ? "#ff5cff" : "transparent";
    b.style.color = filled ? "#ffffff" : "#ff5cff";
    b.addEventListener("click", onClick);
    return b;
  }



  function uuid() {
    return crypto?.randomUUID?.() ?? `ball_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  // Step1: create a ball snapshot from the fluidCanvas placeholder
    function randomColor() {
    // 粉紫系先頂著，之後可改成從 preview 平均取色
    const hues = [290, 305, 315, 275, 260];
    const h = hues[Math.floor(Math.random() * hues.length)];
    return `hsl(${h} 90% 65%)`;
  }

  function createBallFromFluidSnapshot() {
    if (!fluidCanvas) return null;
    const url = fluidCanvas.toDataURL("image/png");
    const id = uuid();
    const ball = {
      id,
      name: `Ball ${balls.length + 1}`,
      previewUrl: url,
      color: randomColor(),
      createdAt: Date.now(),
    };
    balls.unshift(ball);
    return ball;
  }

    function stopDiffusion() {
    if (diffRaf) cancelAnimationFrame(diffRaf);
    diffRaf = 0;
    diffRunning = false;
    lastT = 0;
  }

  function ensureDiffusionBuffers(size) {
    if (!diffCanvas) return;

    diffCanvas.width = size;
    diffCanvas.height = size;
    diffCtx = diffCanvas.getContext("2d");

    diffOff = document.createElement("canvas");
    diffOff.width = size;
    diffOff.height = size;
    diffOffCtx = diffOff.getContext("2d");

    // init
    diffOffCtx.clearRect(0, 0, size, size);
    diffCtx.clearRect(0, 0, size, size);
  }

  function injectAt(x, y, color, r = 18) {
    if (!diffOffCtx) return;

    diffOffCtx.save();
    diffOffCtx.globalAlpha = 0.9;
    diffOffCtx.fillStyle = color || "rgba(255,92,255,0.8)";
    diffOffCtx.beginPath();
    diffOffCtx.arc(x, y, r, 0, Math.PI * 2);
    diffOffCtx.fill();
    diffOffCtx.restore();
  }

  function drawDiffusionFrame(size) {
    if (!diffCtx || !diffOffCtx) return;

    // 1) 讓 buffer 自己慢慢「糊掉」：把上一幀略微模糊、略微淡化回寫
    diffOffCtx.save();
    diffOffCtx.globalAlpha = 0.985;
    diffOffCtx.filter = "blur(2px)";
    diffOffCtx.drawImage(diffOff, 0, 0);
    diffOffCtx.restore();

    // 2) 畫到可見 canvas（更強 blur 一次，看起來像擴散）
    diffCtx.clearRect(0, 0, size, size);

    // clip 成鍋子圓形
    diffCtx.save();
    diffCtx.beginPath();
    diffCtx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    diffCtx.clip();

    diffCtx.filter = "blur(10px)";
    diffCtx.drawImage(diffOff, 0, 0);
    diffCtx.filter = "none";
    diffCtx.globalAlpha = 0.55;
    diffCtx.drawImage(diffOff, 0, 0);

    diffCtx.restore();

    // 外圈線
    diffCtx.save();
    diffCtx.beginPath();
    diffCtx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    diffCtx.strokeStyle = "rgba(255,92,255,0.65)";
    diffCtx.lineWidth = 8;
    diffCtx.stroke();
    diffCtx.restore();
  }

  function startDiffusion(size) {
    if (diffRunning) return;
    diffRunning = true;

    const loop = (t) => {
      if (!diffRunning) return;
      if (!lastT) lastT = t;

      drawDiffusionFrame(size);

      diffRaf = requestAnimationFrame(loop);
    };

    diffRaf = requestAnimationFrame(loop);
  }

  // Step2: draw the selected ball preview onto potCanvas (MVP preview)
  function placeActiveBallPreviewAt(x, y) {
    if (!potCtx) return;
    const ball = balls.find(b => b.id === activeBallId);
    if (!ball) return;

    const img = new Image();
    img.onload = () => {
      // draw as a circle stamp
      const r = 34;
      potCtx.save();
      potCtx.beginPath();
      potCtx.arc(x, y, r, 0, Math.PI * 2);
      potCtx.closePath();
      potCtx.clip();
      potCtx.drawImage(img, x - r, y - r, r * 2, r * 2);
      potCtx.restore();

      // outline
      potCtx.beginPath();
      potCtx.arc(x, y, r, 0, Math.PI * 2);
      potCtx.strokeStyle = "rgba(255,92,255,0.6)";
      potCtx.lineWidth = 3;
      potCtx.stroke();
    };
    img.src = ball.previewUrl;
  }

  // ---------- render steps ----------
  function renderStep() {
    if (!panelEl) return;
    // 若離開 step1，確保 fluid 釋放
    if (step !== 1) unmountFluidEditor();
    clearPanel();

    // top-left debug title
    const debug = document.createElement("div");
    debug.textContent = `table=${activeTableId ?? "-"}  step=${step}`;
    debug.style.position = "absolute";
    debug.style.left = "18px";
    debug.style.top = "14px";
    debug.style.fontFamily = "ui-monospace, SFMono-Regular";
    debug.style.fontSize = "12px";
    debug.style.color = "rgba(0,0,0,0.35)";
    panelEl.appendChild(debug);

    if (step === 0) return renderStep0();
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3();
  }

  // Step0 UI
  function renderStep0() {
    // center: pot placeholder (you will later mount GLB render / or image)
    const center = document.createElement("div");
    center.style.position = "absolute";
    center.style.left = "50%";
    center.style.top = "50%";
    center.style.transform = "translate(-50%,-50%)";
    center.style.width = "520px";
    center.style.height = "520px";
    center.style.borderRadius = "999px";
    center.style.border = "6px solid rgba(255,92,255,0.35)";
    center.style.display = "flex";
    center.style.alignItems = "center";
    center.style.justifyContent = "center";
    center.style.color = "#ff5cff";
    center.style.fontFamily = "ui-sans-serif, system-ui";
    center.style.fontSize = "20px";
    center.textContent = "Pot preview placeholder";
    panelEl.appendChild(center);

    // button: 編輯 (go to step1)
    const btnEdit = makeBtn("編輯", {
      filled: false,
      onClick: () => {
        step = 1;
        renderStep();
      },
    });
    btnEdit.style.position = "absolute";
    btnEdit.style.right = "90px";
    btnEdit.style.bottom = "70px";
    panelEl.appendChild(btnEdit);
  }

  // Step1 UI (fluid editor)
  function renderStep1() {
    // ---- left: color picker ----
    const picker = document.createElement("div");
    picker.style.position = "absolute";
    picker.style.left = "70px";
    picker.style.top = "90px";
    picker.style.width = "230px";
    picker.style.height = "480px";
    picker.style.borderRadius = "16px";
    picker.style.background = "#f2f2f2";
    picker.style.padding = "16px";
    picker.style.boxSizing = "border-box";
    picker.style.fontFamily = "ui-sans-serif, system-ui";
    panelEl.appendChild(picker);

    const label = document.createElement("div");
    label.textContent = "Color";
    label.style.color = "#666";
    label.style.marginBottom = "10px";
    label.style.fontSize = "14px";
    picker.appendChild(label);

    const input = document.createElement("input");
    input.type = "color";
    input.value = fluidColor;
    input.style.width = "100%";
    input.style.height = "56px";
    input.style.border = "0";
    input.style.background = "transparent";
    input.style.cursor = "pointer";
    picker.appendChild(input);

    input.addEventListener("input", () => {
      fluidColor = input.value;
      fluidCtrl?.setColor?.(fluidColor);
    });
    // ---- left: material picker ----
    renderMaterialPicker(picker, () => fluidCtrl);

    // ---- center: fluid mount ----
    // ✅ 用外層變數，不要 const shadow
    fluidMountEl = document.createElement("div");
    fluidMountEl.style.position = "absolute";
    fluidMountEl.style.left = "50%";
    fluidMountEl.style.top = "50%";
    fluidMountEl.style.transform = "translate(-50%,-50%)";
    fluidMountEl.style.width = `${UI.fluidSize}px`;
    fluidMountEl.style.height = `${UI.fluidSize}px`;
    fluidMountEl.style.border = "4px solid rgba(255,92,255,0.6)";
    fluidMountEl.style.borderRadius = "6px";
    fluidMountEl.style.overflow = "hidden";
    panelEl.appendChild(fluidMountEl);

    // ✅ 先不要塞 placeholder canvas（避免兩個 canvas）
    // 如果你真的想要 loading 底圖：
    // fluidMountEl.innerHTML = '<div style="width:100%;height:100%;background:#fff"></div>';

    // ✅ mount 真正 fluid（讓它自己 append canvas）
    mountFluidEditor();

    // ---- right: ball list ----
    const ui1 = mountBallListUI({ panelEl, side: "right" });
    // ui1.ballListEl / ui1.emptyTextEl 才是真的

    ballEditor = createBallEditorFluid({
      getTableId: () => activeTableId,
      getFluidCanvas: () => fluidCtrl?.canvas,
      data: potData,
      ui: { ballListEl: ui1.ballListEl, emptyTextEl: ui1.emptyText },
    });

    ballEditor.renderBallList();

    // ---- name input ----
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Ball name";
    nameInput.style.position = "absolute";
    nameInput.style.right = "90px";
    nameInput.style.bottom = "250px";
    nameInput.style.width = "234px";
    nameInput.style.height = "42px";
    nameInput.style.borderRadius = "12px";
    nameInput.style.border = "2px solid rgba(255,92,255,0.35)";
    nameInput.style.padding = "0 12px";
    nameInput.style.boxSizing = "border-box";
    nameInput.style.fontSize = "16px";
    nameInput.style.fontFamily = "ui-sans-serif, system-ui";
    nameInput.style.transform = "translateY(-50px)";  
    nameInput.style.willChange = "transform";
    panelEl.appendChild(nameInput);

    // ---- buttons: 存取 / 完成 ----
    const btnSave = makeBtn("存取", {
      filled: true,
      onClick: () => {
        const nm = nameInput.value.trim();
        const b = ballEditor?.storeSnapshot?.(nm);
        if (!b) return;
        nameInput.value = "";
      },
    });
    btnSave.style.position = "absolute";
    btnSave.style.right = "90px";
    btnSave.style.bottom = "180px";
    panelEl.appendChild(btnSave);

    const btnDone = makeBtn("完成", {
      filled: false,
      onClick: () => {
        step = 2;
        leaveStep1(),
        enterStep2();
        renderStep();
      },
    });
    btnDone.style.position = "absolute";
    btnDone.style.right = "90px";
    btnDone.style.bottom = "70px";
    panelEl.appendChild(btnDone);
  }

  function leaveStep1() {
    fluidCtrl?.destroy?.();
    fluidCtrl = null;
    // 不一定要清 ballEditor，因為它只管 list（但 UI DOM 會重建，所以通常也要重建）
    ballEditor = null;
    fluidMountEl = null;
  }

   function mountBallListUI({ panelEl, side = "right" }) {
    // right: ball list container
    const listWrap = document.createElement("div");
    listWrap.style.position = "absolute";
    listWrap.style.top = "120px";
    listWrap.style.width = "234px";
    listWrap.style.height = "305px";
    listWrap.style.background = "#F7F7F7";
    listWrap.style.borderRadius = "16px";
    listWrap.style.padding = "12px";
    listWrap.style.boxSizing = "border-box";
    listWrap.style.overflowY = "auto";
    listWrap.style.transform = "translateY(-80px)";  
    listWrap.style.willChange = "transform";

    if (side === "right") listWrap.style.right = "90px";
    else listWrap.style.left = "90px";

    panelEl.appendChild(listWrap);

    const emptyText = document.createElement("div");
    emptyText.textContent = "No balls yet";
    emptyText.style.color = "#999";
    emptyText.style.fontFamily = "ui-sans-serif, system-ui";
    emptyText.style.fontSize = "16px";
    emptyText.style.padding = "8px";
    listWrap.appendChild(emptyText);

    const ballListEl = document.createElement("div");
    listWrap.appendChild(ballListEl);

    return { listWrap, emptyText, ballListEl };
  }

  // Step2 UI (partition + placement preview on canvas)

function canvasXY(e) {
  const rect = potCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (potCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (potCanvas.height / rect.height);
  return { x, y };
}

function isNearRim(p, tol = 26) {
  const s = UI.potCanvasSize;
  const cx = s / 2, cy = s / 2;
  const r = s / 2 - 10;
  const d = Math.hypot(p.x - cx, p.y - cy);
  return Math.abs(d - r) <= tol;
}

// --- 平滑：Chaikin (很便宜又夠用) ---
function smoothChaikin(points, iterations = 2) {
  if (!points || points.length < 3) return points || [];
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const Q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
      const R = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
      out.push(Q, R);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function strokePath(ctx, pts, smooth = true) {
  if (!pts || pts.length < 2) return;
  const p = smooth ? smoothChaikin(pts, 2) : pts;

  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.stroke();
}

function redrawStep2Base() {
  console.log("[draw] cutLines len =", cutLines?.length, "cutPath len =", cutPath?.length);
  if (!potCtx || !potCanvas) return;

  const s = UI.potCanvasSize;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 10;

  // 0) clear
  potCtx.clearRect(0, 0, s, s);

  // 1) 圓形內容（全部都在 clip 內畫）
  potCtx.save();
  potCtx.beginPath();
  potCtx.arc(cx, cy, r, 0, Math.PI * 2);
  potCtx.clip();

  // 1-1) 底色
  potCtx.fillStyle = "rgba(255,92,255,0.12)";
  potCtx.fillRect(0, 0, s, s);

  // 1-2) placements preview（球）
  // ---- Diffusion Preview Layer ----
  if (placements.length > 0 && regionMap) {
    for (let rid = 0; rid < regionCount; rid++) {

      const preview = document.createElement("canvas");
      preview.width = s;
      preview.height = s;
      const pctx = preview.getContext("2d");

      for (const p of placements) {
        if (p.regionId !== rid) continue;
        pctx.fillStyle = p.color ?? "rgba(0,0,0,0.6)";
        pctx.beginPath();
        pctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        pctx.fill();
      }

      pctx.filter = "blur(35px)";
      pctx.globalCompositeOperation = "lighter";

      // clip 到該 region
      const mask = potCtx.createImageData(regionW, regionH);
      const d = mask.data;
      for (let i = 0; i < regionMap.length; i++) {
        if (regionMap[i] === rid) {
          const k = i * 4;
          d[k+3] = 255;
        }
      }

      pctx.globalCompositeOperation = "destination-in";
      pctx.putImageData(mask, 0, 0);

      potCtx.drawImage(preview, 0, 0);
    }
  }

  // 1-3) 已完成 cut lines
  potCtx.strokeStyle = "rgba(255,92,255,0.85)";
  potCtx.lineWidth = 6;
  potCtx.lineCap = "round";
  potCtx.lineJoin = "round";
  for (const line of cutLines) strokePath(potCtx, line, true);

  // 1-4) 正在畫的線（cutPath）
  if (cutPath && cutPath.length >= 2) {
    strokePath(potCtx, cutPath, true);
  }

  // 1-5) hover / selected 遮罩
  // 規則：hover 只在 cutMode 時顯示；selected 永遠顯示（如果有選）
  if (regionMap && regionW === s && regionH === s) {
    // hover (淡)
    if (cutMode && hoverRegionId >= 0) {
      const img = potCtx.createImageData(regionW, regionH);
      const d = img.data;
      for (let i = 0; i < regionMap.length; i++) {
        if (regionMap[i] !== hoverRegionId) continue;
        const k = i * 4;
        d[k + 0] = 0;
        d[k + 1] = 0;
        d[k + 2] = 0;
        d[k + 3] = 22; // hover alpha
      }
      potCtx.putImageData(img, 0, 0);
    }

    // selected (深)
    if (selectedRegionId >= 0) {
      const img = potCtx.createImageData(regionW, regionH);
      const d = img.data;
      for (let i = 0; i < regionMap.length; i++) {
        if (regionMap[i] !== selectedRegionId) continue;
        const k = i * 4;
        d[k + 0] = 0;
        d[k + 1] = 0;
        d[k + 2] = 0;
        d[k + 3] = 70; // selected alpha
      }
      potCtx.putImageData(img, 0, 0);
    }
  }

  potCtx.restore(); // 結束 clip

  // 2) 外圈線（不在 clip 內）
  potCtx.beginPath();
  potCtx.arc(cx, cy, r, 0, Math.PI * 2);
  potCtx.strokeStyle = "rgba(255,92,255,0.65)";
  potCtx.lineWidth = 8;
  potCtx.stroke();

  // 3) hint 文案
  potCtx.fillStyle = "rgba(0,0,0,0.25)";
  potCtx.font = "16px ui-sans-serif, system-ui";
  potCtx.fillText(cutMode ? "Cut mode: draw rim-to-rim" : "Place mode: click to place", 18, 28);
}

function renderMaterialPicker(pickerEl, getFluidCtrl) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "14px";
  wrap.style.paddingTop = "12px";
  wrap.style.borderTop = "1px solid rgba(0,0,0,0.08)";
  pickerEl.appendChild(wrap);

  const title = document.createElement("div");
  title.textContent = "Material";
  title.style.color = "#666";
  title.style.marginBottom = "10px";
  title.style.fontSize = "14px";
  wrap.appendChild(title);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(3, 1fr)";
  grid.style.gap = "8px";
  wrap.appendChild(grid);

  const items = [
    { key: "ink", label: "Ink" },
    { key: "coral", label: "Coral" },
    { key: "ring", label: "Ring" },
    { key: "grain", label: "Grain" },
    { key: "snow", label: "Snow" },
  ];

  let selectedKey = "ink";

  function updateSelectedStyles() {
    [...grid.children].forEach((btn) => {
      const key = btn.dataset.key;
      const active = key === selectedKey;
      btn.style.borderColor = active ? "#111" : "#ddd";
      btn.style.boxShadow = active ? "0 0 0 1px #111 inset" : "none";
    });
  }

  items.forEach((it) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.key = it.key;
    btn.textContent = it.label;

    btn.style.height = "36px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid #ddd";
    btn.style.background = "#fff";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.style.color = "#222";
    btn.style.userSelect = "none";

    btn.addEventListener("click", () => {
      selectedKey = it.key;
      updateSelectedStyles();

      const fluidCtrl = getFluidCtrl?.();
      if (!fluidCtrl?.applyMaterial) {
        console.warn("[material] fluidCtrl not ready or applyMaterial missing");
        return;
      }
      fluidCtrl.applyMaterial(it.key);
    });

    grid.appendChild(btn);
  });

  updateSelectedStyles();

  // 回傳一個 handle，讓你需要時可以手動同步狀態/禁用
  return {
    setSelected(key) {
      selectedKey = key;
      updateSelectedStyles();
    },
  };
}

// --- Step2 interactions ---
function onStep2Click(e) {
  if (cutMode) return;
  const { x, y } = canvasXY(e);

  // 先確保 regionMap 有
  if (!regionMap) rebuildRegions();

  // 永遠允許「點一下就選區」
  const id = regionAtCanvasXY(x, y);
  if (id >= 0) {
    selectedRegionId = id;
  } else {
    selectedRegionId = -1;
  }

  // 放球：要有 activeBall + 選到區塊，且點擊位置在該區塊內
  if (!activeBallId) {
    redrawStep2Base();
    return;
  }
  if (selectedRegionId < 0) {
    console.log("[place] no selected region yet");
    redrawStep2Base();
    return;
  }
  if (id !== selectedRegionId) {
    // 理論上不會發生（因為我們剛用 id 設 selectedRegionId）
    console.log("[place] clicked outside selected region");
    redrawStep2Base();
    return;
  }

  const ball = balls.find(b => b.id === activeBallId);
  if (!ball) {
    redrawStep2Base();
    return;
  }

  placements.push({
    ballId: ball.id,
    x,
    y,
    color: ball.color,
    regionId: selectedRegionId, // ✅ 存一下，後面 Step3/擴散要用也方便
  });

  redrawStep2Base();
}

function onPointerDown(e) {
  console.log("[cut] down", { cutMode, x: e.clientX, y: e.clientY, target: e.target });
  if (!cutMode) return;

  const p0raw = canvasXY(e);
  if (!isNearRim(p0raw)) return;     // 仍然要求從 rim 附近開始

  isDrawingCut = true;

  const p0 = snapToRim(p0raw);       // ✅ 起點吸到 rim
  cutPath = [p0];

  potCanvas.setPointerCapture?.(e.pointerId);
  redrawStep2Base();
}

function onPointerMove(e) {
  const p = canvasXY(e);

  // A) 切割模式 + 正在畫線：記錄 path
  if (cutMode && isDrawingCut) {
    const last = cutPath[cutPath.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    cutPath.push(p);
    redrawStep2Base();
    return;
  }

  // B) hover
  const id = regionAtCanvasXY(p.x, p.y);
  if (id !== hoverRegionId) {
    hoverRegionId = id;
    redrawStep2Base();
  }
}

function onPointerUp(e) {
  if (!cutMode || !isDrawingCut) return;
  isDrawingCut = false;

  if (!cutPath || cutPath.length < 2) {
    cutPath = [];
    redrawStep2Base();
    return;
  }

  const end = cutPath[cutPath.length - 1];
  const ok = isNearRim(end);

  if (ok) {
    cutLines.push(cutPath);
    cutPath = [];

    rebuildRegions();        // ✅ 重建牆/區塊
    selectedRegionId = -1;   // ✅ 重要：切完讓使用者重新選區，避免舊 id 不存在
  } else {
    cutPath = [];
  }

  redrawStep2Base();
}

function snapToRim(p) {
  const s = UI.potCanvasSize;
  const cx = s / 2, cy = s / 2;
  const r  = s / 2 - 10; // 要跟你畫鍋子圓的半徑一致
  const dx = p.x - cx, dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r };
}

function bindStep2CanvasEvents() {
  if (step2Bound) return;
  if (!potCanvas) return;

  potCanvas.addEventListener("click", onStep2Click);

  potCanvas.addEventListener("pointerdown", onPointerDown);
  potCanvas.addEventListener("pointermove", onPointerMove);
  potCanvas.addEventListener("pointerup", onPointerUp);

  // 防止手指/滑鼠跑出 canvas 時卡住
  potCanvas.addEventListener("pointercancel", onPointerUp);
  potCanvas.addEventListener("pointerleave", onPointerUp);
  potCanvas.addEventListener("lostpointercapture", onPointerUp);

  step2Bound = true;
}

function enterStep2() {
  console.log("[step2] enterStep2 called");
  console.trace("[TRACE enterStep2]");
  if (step2Initialized) {
    console.log("[step2] enterStep2 skipped (already initialized)");
    return;
  }
  step2Initialized = true;

  cutPath = [];
  placements = [];
  cutLines = [];
  isDrawingCut = false;
  cutMode = false;

  // 分區相關也一起 reset，避免殘留
  regionMap = null;
  wallMap = null;
  regionCount = 0;
  hoverRegionId = -1;
  selectedRegionId = -1;

  console.log("[step2] initialized (state cleared)");
  redrawStep2Base();
}
function buildWallMapFromCuts(W, H, cutLines, wallThicknessPx = 6) {
  const wall = new Uint8Array(W * H);

  const put = (x, y) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    wall[y * W + x] = 1;
  };

  // 用簡單 stamp：沿著線段每隔 1px 放一個圓
  function stampDisc(cx, cy, r) {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) put(x, y);
      }
    }
  }

  for (const line of cutLines) {
    if (!line || line.length < 2) continue;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        stampDisc(x, y, wallThicknessPx / 2);
      }
    }
  }

  return wall;
}
function buildRegionMap(W, H, wall, circleCx, circleCy, circleR) {
  const map = new Int32Array(W * H);
  map.fill(-1);

  // 先標出圓內可走的地方：-2 = unvisited inside
  const r2 = circleR * circleR;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - circleCx;
      const dy = y - circleCy;
      const inside = (dx * dx + dy * dy <= r2);
      const idx = y * W + x;
      if (!inside) continue;
      if (wall[idx]) continue;       // 牆本身不屬於任何區域
      map[idx] = -2;
    }
  }

  // flood fill
  let regionId = 0;
  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const startIdx = y * W + x;
      if (map[startIdx] !== -2) continue;

      // BFS
      let head = 0, tail = 0;
      qx[tail] = x; qy[tail] = y; tail++;
      map[startIdx] = regionId;

      while (head < tail) {
        const cx = qx[head], cy = qy[head]; head++;
        // 4-neighbors
        const n = [
          [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
        ];
        for (const [nx, ny] of n) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (map[ni] !== -2) continue;
          map[ni] = regionId;
          qx[tail] = nx; qy[tail] = ny; tail++;
        }
      }

      regionId++;
    }
  }

  return { map, count: regionId };
}
function rebuildRegions() {
  const W = UI.potCanvasSize;
  const H = UI.potCanvasSize;
  const cx = W / 2;
  const cy = H / 2;
  const r  = W / 2 - 10;

  regionW = W;
  regionH = H;

  wallMap = buildWallMapFromCuts(W, H, cutLines, 8);
  const { map, count } = buildRegionMap(W, H, wallMap, cx, cy, r);

  regionMap = map;
  regionCount = count;

  // 如果原本選到的區塊不存在了，就清掉
  if (selectedRegionId >= regionCount) selectedRegionId = -1;
  if (hoverRegionId >= regionCount) hoverRegionId = -1;

  console.log("[region] rebuilt count=", regionCount);
}
function regionAtCanvasXY(x, y) {
  if (!regionMap) return -1;
  const ix = Math.max(0, Math.min(regionW - 1, x | 0));
  const iy = Math.max(0, Math.min(regionH - 1, y | 0));
  const id = regionMap[iy * regionW + ix];
  return id; // -1 outside, 0..n-1 region
}


function renderStep2() {
  console.log("[step2] renderStep2 called. cutLines len =", cutLines.length);

  const ui2 = mountBallListUI({ panelEl, side: "left" }); // 你截圖 step2 是左邊
  ui2.listWrap.style.zIndex = "10";
  ui2.listWrap.style.pointerEvents = "auto";
  const listEditor2 = createBallEditorFluid({
    rootEl: panelEl, // step2 不用 rootEl 也行，隨便塞
    getTableId: () => activeTableId,
    getFluidCanvas: () => null, // step2 不用存球
    data: potData,              // ✅ 同一份
    ui: { ballListEl: ui2.ballListEl, emptyTextEl: ui2.emptyText },
  });
  listEditor2.renderBallList();

  // 建立 canvas 只一次
  if (!potCanvas) {
    potCanvas = document.createElement("canvas");
    potCanvas.width = UI.potCanvasSize;
    potCanvas.height = UI.potCanvasSize;
    potCanvas.style.position = "absolute";
    potCanvas.style.left = "50%";
    potCanvas.style.top = "50%";
    potCanvas.style.transform = "translate(-50%,-50%)";
    potCanvas.style.borderRadius = "999px";
    potCanvas.style.border = "8px solid rgba(255,92,255,0.65)";
    potCanvas.style.background = "rgba(255,255,255,1)";
    potCanvas.style.zIndex = "50";
    potCanvas.style.pointerEvents = "auto";
    potCanvas.style.touchAction = "none"; // 防止觸控裝置把拖曳當捲動
    potCtx = potCanvas.getContext("2d");

    bindStep2CanvasEvents();
  }

  panelEl.appendChild(potCanvas);
  if (!regionMap) rebuildRegions();
  redrawStep2Base();


  // 切割 / 完成
  const btnCut = makeBtn("切割", {
    filled: false,
    onClick: () => {
      cutMode = !cutMode;
      redrawStep2Base();
      console.log("[pot] cutMode =", cutMode);
    },
  });
  btnCut.style.position = "absolute";
  btnCut.style.right = "90px";
  btnCut.style.top = "210px";
  panelEl.appendChild(btnCut);

  const btnDone = makeBtn("完成", {
    filled: false,
    onClick: () => {
      step = 3;
      renderStep();
    },
  });
  btnDone.style.position = "absolute";
  btnDone.style.right = "90px";
  btnDone.style.top = "330px";
  panelEl.appendChild(btnDone);
}

  // Step3 UI (diffusion result) - placeholder
    function renderStep3() {
    stopDiffusion(); // 防重入（從 step2->3 或 3->3）

    const size = UI.fluidSize; // 先用 549x549，之後可獨立一個 UI.step3Size
    diffCanvas = document.createElement("canvas");
    diffCanvas.style.position = "absolute";
    diffCanvas.style.left = "50%";
    diffCanvas.style.top = "50%";
    diffCanvas.style.transform = "translate(-50%,-50%)";
    diffCanvas.style.borderRadius = "999px";
    diffCanvas.style.background = "#fff";
    panelEl.appendChild(diffCanvas);

    ensureDiffusionBuffers(size);

    // seed：把 Step2 placements 注入進 diffusion buffer
    for (const p of placements) {
      injectAt(p.x, p.y, p.color, 18);
    }

    startDiffusion(size);

    // buttons
    const btnBack = makeBtn("返回", {
      filled: false,
      onClick: () => {
        stopDiffusion();
        step = 2;
        renderStep();
      },
    });
    btnBack.style.position = "absolute";
    btnBack.style.left = "90px";
    btnBack.style.bottom = "70px";
    panelEl.appendChild(btnBack);

    const btnClose = makeBtn("完成", {
      filled: false,
      onClick: () => {
        stopDiffusion();
        requestClose();
      },
    });
    btnClose.style.position = "absolute";
    btnClose.style.right = "90px";
    btnClose.style.bottom = "70px";
    panelEl.appendChild(btnClose);
  }

  // ensure keydown listener removed when closed via code
  const _close = close;
  close = function () {
    unmountKey();
    _close();
  };

  function setFluidCanvas(externalCanvas) {
  // 你之後 webgl fluid 會自己建立 canvas
  // 這裡做的是：把它塞進 Step1 的位置，並同步給 createBallFromFluidSnapshot 用
  fluidCanvas = externalCanvas;
}

function getState() {
  return {
    isOpen: openFlag,
    tableId: activeTableId,
    step,
    ballsCount: balls.length,
    activeBallId,
  };
}
function getPlacements() {
  return placements;
}

return { open, close, isOpen, setFluidCanvas, getState, getPlacements};
}
