import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createPotData } from "./potData.js";
import { createBallEditorFluid } from "./ballEditorFluid.js";
import { createFluidPavel } from "./fluid/createFluidPavel.js";
import {
  inflateIngredientPreview,
  clearIngredientDrawing,
  revokePreviewUrl,
} from "./ingredientInflate.js";

export function createPotController({ appEl, onClose, onRequestClose, onFinalizePot } = {}) {
  if (!appEl) throw new Error("[pot] createPotController: appEl is required");

  // ---------- state ----------
  let openFlag = false;
  let overlayEl = null;
  let panelEl = null;
  let openedAt = 0;
  let scaleWrapEl = null;

  let activeTableId = null;
  let step = 0;

  const balls = [];
  let activeBallId = null;

  const ingredients = [];
  let activeIngredientId = null;

  const potData = createPotData();

  let fluidMountEl = null;
  let fluidCtrl = null;
  let fluidColor = "#fd6fff";
  let ballEditor = null;

  let ingredientCanvas = null;
  let ingredientCtx = null;
  let ingredientBrushColor = "#fd6fff";
  let ingredientBrushSize = 22;
  let ingredientDrawing = false;
  let ingredientLastPoint = null;
  let ingredientPreviewImgUrl = null;
  let ingredientToolMode = "draw";

  let potCanvas = null;
  let potCtx = null;
  let composeMode = null;
  let cutDrawing = false;
  let cutPath = [];
  let cutLines = [];
  // ★ NEW: per-line color tracking
  let cutLineColors = [];
  let cutColor = "#000000";
  let step3Bound = false;

  // ★ per-item "next placement" scale — only affects the NEXT placement, not existing ones
  const ballNextScale = new Map();       // itemId -> scale for next drop
  const ingredientNextScale = new Map(); // itemId -> scale for next drop

  let step4PreviewEl = null;
  let chairPreviewEl = null;
  let step4Renderer = null;
  let step4Scene = null;
  let step4Camera = null;
  let step4Controls = null;
  let step4Model = null;
  let step4AnimFrame = 0;
  let step4Texture = null;

  let step5Renderer = null;
  let step5Scene = null;
  let step5Camera = null;
  let step5Controls = null;
  let step5Model = null;
  let step5AnimFrame = 0;
  let chairCount = 1;
  let chairColor = "#e8f25a";
  let finalPotTextureUrl = null;
  let currentTableState = null;
  let viewOnly = false;
  let ownerTableId = null;

  // ---------- ui spec ----------
  const UI = {
    overlayW: 1308,
    overlayH: 643,

    step0: {
      pot: { x: 430, y: 157, w: 448, h: 329 },
      bubble: { x: 148, y: -21, w: 361, h: 361 },
      nextBtn: { x: 1074, y: 551, w: 199, h: 63 },
      nextIcon: { x: 1095, y: 562, w: 42, h: 42 },
      nextText: { x: 1174, y: 570 },
    },

    step1: {
      worktop: { x: 0, y: 0, w: 1308, h: 643 },
      title: { x: 590, y: 53 },
      fluid: { x: 497, y: 53, w: 315, h: 315 },
      nameInput: { x: 683, y: 280, w: 191, h: 60 },
      confirmBtn: { x: 814, y: 280, w: 60, h: 60 },
      confirmIcon: { x: 817, y: 283, w: 54, h: 54 },
      deleteBtn: { x: 890, y: 280, w: 60, h: 60 },
      deleteIcon: { x: 905, y: 292, w: 30, h: 37 },
      listFrame: { x: 321, y: 387, w: 665, h: 87 },
      listTitle: { x: 321, y: 387 },
      listItemStart: { x: 321, y: 424 },
      leftToolsFrame: { x: 84, y: 53, w: 220, h: 405 },
      colorBtn: { x: 107, y: 53, w: 174, h: 174 },
      materialBtn: { x: 84, y: 238, w: 220, h: 220 },
      brushBtn: { x: 1037, y: 53, w: 176, h: 177 },
      eraserBtn: { x: 986, y: 145, w: 164, h: 164 },
      fingerBtn: { x: 1011, y: 300, w: 181, h: 181 },

      colorLabel:    { x: 108, y: 149, w: 180, h: 33 },
      materialLabel: { x: 106, y: 403, w: 180, h: 33 },
      brushLabel:    { x: 1050, y: 34,  w: 220, h: 33 },
      eraserLabel:   { x: 1070, y: 233, w: 150, h: 33 },
      fingerLabel:   { x: 1014, y: 442, w: 180, h: 33 },
      confirmLabel:  { x: 805, y: 240,  w: 70,  h: 33 },
      deleteLabel:   { x: 883, y: 240,  w: 70,  h: 33 },

      nextBtn: { x: 1074, y: 551, w: 199, h: 63 },
      nextIcon: { x: 1095, y: 562, w: 42, h: 42 },
      nextText: { x: 1174, y: 570 },
    },

    step2: {
      worktop: { x: 0, y: 0, w: 1308, h: 643 },
      title: { x: 715, y: 53 },
      drawCanvas: { x: 349, y: 110, w: 475, h: 230, radius: 999 },
      drawTitle: { x: 369, y: 132 },
      inflateBtn: { x: 819, y: 144, w: 126, h: 126 },
      inflateLabel: { x: 851, y: 267, w: 62, h: 33 },
      resultFrame: { x: 940, y: 110, w: 312, h: 230, radius: 999 },
      resultPreview: { x: 940, y: 110, w: 312, h: 151 },
      nameInput: { x: 683, y: 280, w: 191, h: 60 },
      confirmBtn: { x: 814, y: 280, w: 60, h: 60 },
      confirmIcon: { x: 817, y: 283, w: 54, h: 54 },
      deleteBtn: { x: 890, y: 280, w: 60, h: 60 },
      deleteIcon: { x: 905, y: 292, w: 30, h: 37 },
      listFrame: { x: 321, y: 387, w: 910, h: 87 },
      listTitle: { x: 321, y: 387 },
      listItemStart: { x: 321, y: 424 },
      colorBtn: { x: 107, y: 53, w: 174, h: 174 },
      brushBtn: { x: 106, y: 212, w: 144, h: 144 },
      eraserBtn: { x: 120, y: 328, w: 168, h: 168 },

      colorLabel:   { x: 100, y: 155, w: 220, h: 33 },
      brushLabel:   { x: 110, y: 318, w: 220, h: 33 },
      eraserLabel:  { x: 168, y: 442, w: 110, h: 33 },
      confirmLabel: { x: 1087, y: 220, w: 70,  h: 33 },
      deleteLabel:  { x: 1165, y: 220, w: 70,  h: 33 },

      nextBtn: { x: 1124, y: 551, w: 149, h: 63 },
      nextIcon: { x: 1148, y: 562, w: 42, h: 42 },
      nextText: { x: 1199, y: 570 },
      prevBtn: { x: 35, y: 551, w: 199, h: 63 },
      prevIcon: { x: 173, y: 562, w: 42, h: 42 },
      prevText: { x: 57, y: 570 },
    },

    step3: {
      potFrame: { x: 414, y: 0, w: 480, h: 480 },
      potCanvas: { x: 499, y: 85, w: 310, h: 310 },
      soupList: { x: 62, y: 68, w: 272, h: 518 },
      soupListTitle: { x: 83, y: 86 },
      ingList: { x: 971, y: 68, w: 272, h: 518 },
      ingListTitle: { x: 992, y: 86 },
      controlsY: 475,
      labelsY: 586,
      controls: {
        continueMake: { x: 378, y: 475, w: 60, h: 60 },
        cut: { x: 505, y: 475, w: 60, h: 60 },
        restart: { x: 623, y: 475, w: 60, h: 60 },
        delete: { x: 741, y: 475, w: 60, h: 60 },
        finish: { x: 867, y: 475, w: 60, h: 60 },
      },
    },

    step4: {
      soupList: { x: 150, y: 140, w: 250, h: 345 },
      ingList: { x: 908, y: 140, w: 250, h: 345 },
      preview: { x: 454, y: 140, w: 400, h: 345 },
      nextBtn: { x: 1158, y: 551, w: 199, h: 63 },
      nextIcon: { x: 1180, y: 562, w: 42, h: 42 },
      nextText: { x: 1225, y: 570 },
      prevBtn: { x: 164, y: 551, w: 199, h: 63 },
      prevIcon: { x: 302, y: 562, w: 42, h: 42 },
      prevText: { x: 186, y: 570 },
    },

    step5: {
      chairPreview: { x: 145, y: 95, w: 440, h: 430 },
      title: { x: 708, y: 165 },
      nextBtn: { x: 1158, y: 551, w: 199, h: 63 },
      nextIcon: { x: 1180, y: 562, w: 42, h: 42 },
      nextText: { x: 1225, y: 570 },
      prevBtn: { x: 164, y: 551, w: 199, h: 63 },
      prevIcon: { x: 302, y: 562, w: 42, h: 42 },
      prevText: { x: 186, y: 570 },
    },
  };

  const ASSETS = {
    step0Pot: "/poticon.png",
    emptyBubble: "/empty.png",
    step1Worktop: "/step1worktop.png",
    step2Worktop: "/step2worktop.png",
    step3Pot: "/step3pot.png",

    rightArrow: "/rightArrowBtn.png",
    leftArrow: "/leftArrowBtn.png",
    confirm: "/confirm.png",
    delete: "/delete.png",
    cut: "/cut.png",
    restart: "/restart.png",

    colorPicker: "/colorPicker.png",
    material: "/material.png",
    brushSize: "/brushSize.png",
    brushSize2: "/brushSize2.png",
    eraser: "/eraser.png",
    eraser2: "/eraser2.png",
    finger: "/finger.png",
    inflate: "/inflate.png",
    toClose: "/toClose.png",
  };

  function isOpen() {
    return openFlag;
  }

  function open({
    tableId,
    tableState,
    viewOnly: nextViewOnly = false,
    ownerTableId: nextOwnerTableId = null,
    mobileDebug = false,
  } = {}) {
    if (openFlag) return;
    openFlag = true;
    openedAt = performance.now();
    activeTableId = tableId ?? null;
    viewOnly = !!nextViewOnly;
    ownerTableId = nextOwnerTableId ?? null;

    loadStateFromTableState(tableState);

    if (mobileDebug) {
      step = 0;
    } else if (viewOnly) {
      step = 4;
    } else {
      step = currentTableState?.initialized ? 4 : 0;
    }

    mount();
    renderStep();
  }

  function requestClose() {
    if (typeof onRequestClose === "function") onRequestClose();
    else close({ reason: "normal" });
  }

  function close({ reason = "normal" } = {}) {
    if (!openFlag) return;
    openFlag = false;
    activeTableId = null;
    step = 0;
    activeBallId = null;
    activeIngredientId = null;

    unmountFluidEditor();
    unmountStep4Preview();
    unmountStep5Preview();

    if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    panelEl = null;
    scaleWrapEl = null;

    window.removeEventListener("resize", applyPanelScale);

    potCanvas = null;
    potCtx = null;
    ingredientCanvas = null;
    ingredientCtx = null;
    step4PreviewEl = null;
    chairPreviewEl = null;
    currentTableState = null;
    composeMode = null;

    ingredientPreviewImgUrl = null;
    ingredientToolMode = "draw";
    ingredientDrawing = false;
    ingredientLastPoint = null;

    cutDrawing = false;
    cutPath = [];
    cutLines = [];
    cutLineColors = [];
    cutColor = "#000000";

    ballNextScale.clear();
    ingredientNextScale.clear();

    window.removeEventListener("keydown", onKeyDownWhileOpen, true);

    if (typeof onClose === "function") {
      onClose({ reason });
    }
  }

  function applyPanelScale() {
    if (!scaleWrapEl || !panelEl) return;

    const DESIGN_W = UI.overlayW;   // 1308
    const DESIGN_H = UI.overlayH;   // 643
    const PADDING_X = 24;
    const PADDING_Y = 24;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const scale = Math.min(
      (vw - PADDING_X * 2) / DESIGN_W,
      (vh - PADDING_Y * 2) / DESIGN_H,
      1
    );

    scaleWrapEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function mount() {
    overlayEl = document.createElement("div");
    overlayEl.id = "pot-overlay";
    Object.assign(overlayEl.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "auto",
      zIndex: "9999",
    });

    const dim = document.createElement("div");
    Object.assign(dim.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(0,0,0,0.12)",
    });

    dim.addEventListener("click", (e) => {
      const elapsed = performance.now() - openedAt;
      console.log("[pot dim click]", { elapsed });

      // 避免 mobile 同一次 tap 打開後立刻被 dim 吃掉
      if (elapsed < 350) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      requestClose();
    });

    overlayEl.appendChild(dim);

    scaleWrapEl = document.createElement("div");
    Object.assign(scaleWrapEl.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%) scale(1)",
      transformOrigin: "center center",
      width: `${UI.overlayW}px`,
      height: `${UI.overlayH}px`,
      pointerEvents: "none",
    });

    overlayEl.appendChild(scaleWrapEl);

    panelEl = document.createElement("div");
    Object.assign(panelEl.style, {
      position: "relative",
      width: `${UI.overlayW}px`,
      height: `${UI.overlayH}px`,
      background: "#ffffff",
      borderRadius: "24px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
      overflow: "hidden",
      pointerEvents: "auto",
    });

    panelEl.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    scaleWrapEl.appendChild(panelEl);
    applyPanelScale();
    window.addEventListener("resize", applyPanelScale);

    const cs = getComputedStyle(appEl);
    if (cs.position === "static") appEl.style.position = "relative";
    appEl.appendChild(overlayEl);

    window.addEventListener("keydown", onKeyDownWhileOpen, true);
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
  // reset canvas references so they get recreated fresh each time
  ingredientCanvas = null;
  ingredientCtx = null;
  // reset step3 bind flag so events get re-attached when re-entering step3
  step3Bound = false;

  // 清掉之前殘留在 overlayEl 的 cut color input
  overlayEl?.querySelectorAll(".cut-color-input").forEach((el) => el.remove());
}

  function renderStep() {
    if (!panelEl) return;
    if (step !== 1) unmountFluidEditor();
    if (step !== 4) unmountStep4Preview();
    if (step !== 5) unmountStep5Preview();
    clearPanel();

    if (step === 0) return renderStep0();
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3();
    if (step === 4) return renderStep4();
    if (step === 5) return renderStep5();
  }


  // ---------- inflate ----------
  async function handleInflateIngredient(previewImgEl) {
    if (!ingredientCanvas) return;

    if (ingredientPreviewImgUrl && !ingredients.some(it => it.previewUrl === ingredientPreviewImgUrl)) {
      revokePreviewUrl(ingredientPreviewImgUrl);
    }
    ingredientPreviewImgUrl = null;

    const result = await inflateIngredientPreview(ingredientCanvas, {
      width: 320,
      height: 180,
      padding: 20,
      baseColor: ingredientBrushColor,
    });

    if (result.isEmpty || !result.url) {
      previewImgEl.removeAttribute("src");
      previewImgEl.style.display = "none";
      return;
    }

    ingredientPreviewImgUrl = result.url;
    previewImgEl.src = ingredientPreviewImgUrl;
    previewImgEl.style.display = "block";
  }

  function handleClearIngredientDrawing(previewImgEl) {
    clearIngredientDrawing(ingredientCanvas, ingredientCtx);

    if (ingredientPreviewImgUrl && !ingredients.some(it => it.previewUrl === ingredientPreviewImgUrl)) {
      revokePreviewUrl(ingredientPreviewImgUrl);
    }
    ingredientPreviewImgUrl = null;

    previewImgEl.removeAttribute("src");
    previewImgEl.style.display = "none";
  }

  function storeIngredient(name) {
    if (!ingredientPreviewImgUrl) return;

    const item = {
      id: crypto.randomUUID(),
      name: name?.trim() || "Unnamed",
      previewUrl: ingredientPreviewImgUrl,
      createdAt: Date.now(),
    };

    ingredients.unshift(item);
    activeIngredientId = item.id;

    renderHorizontalIngredientList(UI.step2.listFrame);
  }

  // ---------- generic ui helpers ----------
  function addImg(src, { x, y, w, h, rotate = 0, z = 1, opacity = 1, pointerEvents = "none" } = {}) {
    const img = document.createElement("img");
    img.src = src;
    Object.assign(img.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      zIndex: String(z),
      opacity: String(opacity),
      pointerEvents,
      transform: rotate ? `rotate(${rotate}deg)` : "none",
      transformOrigin: "center center",
      userSelect: "none",
      WebkitUserDrag: "none",
    });
    panelEl.appendChild(img);
    return img;
  }

  function addText(text, { x, y, size = 20, color = "#FD6FFF", z = 2, center = false } = {}) {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: `${size}px`,
      lineHeight: "1",
      color,
      zIndex: String(z),
      whiteSpace: "nowrap",
      transform: center ? "translateX(-50%)" : "none",
      pointerEvents: "none",
    });
    panelEl.appendChild(el);
    return el;
  }

  function addCapsuleButton({ x, y, w, h, bg = "#ffffff", border = "2px solid #FD6FFF", radius = 999, onClick, z = 3 }) {
    const btn = document.createElement("button");
    btn.type = "button";
    Object.assign(btn.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      borderRadius: `${radius}px`,
      border,
      background: bg,
      cursor: "pointer",
      zIndex: String(z),
      padding: "0",
    });
    btn.addEventListener("click", onClick);
    panelEl.appendChild(btn);
    return btn;
  }

  function addImageButton(src, rect, { onClick, rotate = 0, bg = "transparent", border = "0", radius = 999, z = 3 } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    Object.assign(btn.style, {
      position: "absolute",
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
      background: bg,
      border,
      borderRadius: `${radius}px`,
      padding: "0",
      cursor: "pointer",
      zIndex: String(z),
    });
    if (onClick) btn.addEventListener("click", onClick);

    const img = document.createElement("img");
    img.src = src;
    Object.assign(img.style, {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      transform: rotate ? `rotate(${rotate}deg)` : "none",
      transformOrigin: "center center",
      pointerEvents: "none",
    });
    btn.appendChild(img);
    panelEl.appendChild(btn);
    return btn;
  }

  function addActionButton({ rect, label, iconSrc, iconRect, onClick, textOffsetX = 0 }) {
    const btn = addCapsuleButton({
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      bg: "#fff",
      border: "2px solid #FD6FFF",
      onClick
    });

    addImg(iconSrc, {
      x: iconRect.x,
      y: iconRect.y,
      w: iconRect.w,
      h: iconRect.h,
      z: 4
    });

    addText(label, {
      x: rect.x + rect.w / 2 + textOffsetX,
      y: rect.y + 19,
      size: 25,
      color: "#FD6FFF",
      center: true,
      z: 4
    });

    return btn;
  }

  function addLabelChip(text, { x, y, w = 90, h = 33, bg = "#EAEAEA", color = "#1248FF", z = 10 }) {
    const chip = document.createElement("div");
    Object.assign(chip.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      background: bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: String(z),
      pointerEvents: "none",
    });
    panelEl.appendChild(chip);

    const t = document.createElement("div");
    t.textContent = text;
    Object.assign(t.style, {
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color,
      lineHeight: "1",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    });
    chip.appendChild(t);
    return chip;
  }

  function attachHoverLabel(targetEl, text, rect) {
    if (!targetEl || !rect) return null;

    const chip = addLabelChip(text, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      bg: "#EAEAEA",
      color: "#1248FF",
      z: 12,
    });

    chip.style.display = "none";

    targetEl.addEventListener("mouseenter", () => {
      chip.style.display = "flex";
    });

    targetEl.addEventListener("mouseleave", () => {
      chip.style.display = "none";
    });

    return chip;
  }
  function createColorPopover({
    panelEl,
    anchorRect,
    initialColor = "#fd6fff",
    onChange,
    presetColors = ["#FD6FFF", "#1248FF", "#E8F25A", "#FFFFFF", "#000000", "#FF8A65", "#7ED957", "#B388FF"],
  }) {
    let open = false;

    const pop = document.createElement("div");
    Object.assign(pop.style, {
      position: "absolute",
      left: `${anchorRect.x + anchorRect.w + 12}px`,
      top: `${anchorRect.y + 12}px`,
      width: "210px",
      background: "#1a1a1a",
      borderRadius: "18px",
      padding: "12px",
      display: "none",
      flexDirection: "column",
      gap: "12px",
      zIndex: "100",
      boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
      boxSizing: "border-box",
    });
    panelEl.appendChild(pop);

    const presetWrap = document.createElement("div");
    Object.assign(presetWrap.style, {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "10px",
    });
    pop.appendChild(presetWrap);

    const nativeLabel = document.createElement("div");
    nativeLabel.textContent = "自訂顏色";
    Object.assign(nativeLabel.style, {
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "16px",
      color: "#fff",
      lineHeight: "1",
    });
    pop.appendChild(nativeLabel);

    const nativeInputWrap = document.createElement("div");
    Object.assign(nativeInputWrap.style, {
      width: "100%",
      height: "44px",
      borderRadius: "999px",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "#2a2a2a",
    });
    pop.appendChild(nativeInputWrap);

    const nativeInput = document.createElement("input");
    nativeInput.type = "color";
    nativeInput.value = initialColor;
    Object.assign(nativeInput.style, {
      width: "100%",
      height: "100%",
      border: "0",
      padding: "0",
      background: "transparent",
      cursor: "pointer",
    });
    nativeInputWrap.appendChild(nativeInput);

    const swatchButtons = [];

    function applyColor(nextColor) {
      nativeInput.value = nextColor;
      swatchButtons.forEach((btn) => {
        const active = btn.dataset.color?.toLowerCase() === nextColor.toLowerCase();
        btn.style.outline = active ? "3px solid #FD6FFF" : "2px solid transparent";
      });
      onChange?.(nextColor);
    }

    presetColors.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.color = color;
      Object.assign(btn.style, {
        width: "38px",
        height: "38px",
        borderRadius: "999px",
        border: "0",
        outline: "2px solid transparent",
        background: color,
        cursor: "pointer",
        padding: "0",
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyColor(color);
      });
      presetWrap.appendChild(btn);
      swatchButtons.push(btn);
    });

    nativeInput.addEventListener("input", (e) => {
      applyColor(e.target.value);
    });

    pop.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    function close() {
      if (!open) return;
      open = false;
      pop.style.display = "none";
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    }

    function openPopover() {
      if (open) return;
      open = true;
      pop.style.display = "flex";
      setTimeout(() => {
        document.addEventListener("pointerdown", onDocPointerDown, true);
      }, 0);
    }

    function toggle() {
      if (open) close();
      else openPopover();
    }

    function onDocPointerDown(e) {
      if (pop.contains(e.target)) return;
      close();
    }

    applyColor(initialColor);

    return {
      el: pop,
      toggle,
      open: openPopover,
      close,
      setValue: applyColor,
      isOpen: () => open,
    };
  }

  function createAttachedColorPopover({
    panelEl,
    anchorEl,
    initialColor = "#000000",
    onChange,
    presetColors = ["#000000", "#FD6FFF", "#1248FF", "#E8F25A", "#FFFFFF", "#FF8A65", "#7ED957", "#B388FF"],
    offsetX = 12,
    offsetY = 0,
  }) {
    let open = false;

    const pop = document.createElement("div");
    Object.assign(pop.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "210px",
      background: "#1a1a1a",
      borderRadius: "18px",
      padding: "12px",
      display: "none",
      flexDirection: "column",
      gap: "12px",
      zIndex: "120",
      boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
      boxSizing: "border-box",
    });
    panelEl.appendChild(pop);

    const presetWrap = document.createElement("div");
    Object.assign(presetWrap.style, {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "10px",
    });
    pop.appendChild(presetWrap);

    const nativeLabel = document.createElement("div");
    nativeLabel.textContent = "切割線顏色";
    Object.assign(nativeLabel.style, {
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "16px",
      color: "#fff",
      lineHeight: "1",
    });
    pop.appendChild(nativeLabel);

    const nativeInputWrap = document.createElement("div");
    Object.assign(nativeInputWrap.style, {
      width: "100%",
      height: "44px",
      borderRadius: "999px",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "#2a2a2a",
    });
    pop.appendChild(nativeInputWrap);

    const nativeInput = document.createElement("input");
    nativeInput.type = "color";
    nativeInput.value = initialColor;
    Object.assign(nativeInput.style, {
      width: "100%",
      height: "100%",
      border: "0",
      padding: "0",
      background: "transparent",
      cursor: "pointer",
    });
    nativeInputWrap.appendChild(nativeInput);

    const swatchButtons = [];

    function applyColor(nextColor) {
      nativeInput.value = nextColor;
      swatchButtons.forEach((btn) => {
        const active = btn.dataset.color?.toLowerCase() === nextColor.toLowerCase();
        btn.style.outline = active ? "3px solid #FD6FFF" : "2px solid transparent";
      });
      onChange?.(nextColor);
    }

    presetColors.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.color = color;
      Object.assign(btn.style, {
        width: "38px",
        height: "38px",
        borderRadius: "999px",
        border: "0",
        outline: "2px solid transparent",
        background: color,
        cursor: "pointer",
        padding: "0",
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyColor(color);
      });
      presetWrap.appendChild(btn);
      swatchButtons.push(btn);
    });

    nativeInput.addEventListener("input", (e) => {
      applyColor(e.target.value);
    });

    pop.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    function positionPopover() {
      if (!anchorEl) return;
      const left = anchorEl.offsetLeft + anchorEl.offsetWidth + offsetX;
      const top = anchorEl.offsetTop + offsetY;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    }

    function close() {
      if (!open) return;
      open = false;
      pop.style.display = "none";
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    }

    function openPopover() {
      if (open) return;
      positionPopover();
      open = true;
      pop.style.display = "flex";
      setTimeout(() => {
        document.addEventListener("pointerdown", onDocPointerDown, true);
      }, 0);
    }

    function toggle() {
      if (open) close();
      else openPopover();
    }

    function onDocPointerDown(e) {
      if (pop.contains(e.target)) return;
      if (anchorEl?.contains?.(e.target)) return;
      close();
    }

    applyColor(initialColor);

    return {
      el: pop,
      toggle,
      open: openPopover,
      close,
      setValue: applyColor,
      isOpen: () => open,
      reposition: positionPopover,
    };
  }

  function addRoundedInput({ x, y, w, h, placeholder = "", value = "" }) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    Object.assign(input.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      borderRadius: "999px",
      border: "2px solid #EAEAEA",
      background: "#fff",
      padding: "0 16px",
      boxSizing: "border-box",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "18px",
      zIndex: "3",
    });
    panelEl.appendChild(input);
    return input;
  }

  function addFrameBox({ x, y, w, h, bg = "transparent", border = "2px solid #FD6FFF", radius = 0, z = 2 }) {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      background: bg,
      border,
      borderRadius: `${radius}px`,
      boxSizing: "border-box",
      zIndex: String(z),
    });
    panelEl.appendChild(el);
    return el;
  }

  function fitImgPreview(url, rect, { objectFit = "contain", borderRadius = 0, z = 4 } = {}) {
    const img = document.createElement("img");
    img.src = url;
    Object.assign(img.style, {
      position: "absolute",
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
      objectFit,
      borderRadius: `${borderRadius}px`,
      zIndex: String(z),
      pointerEvents: "none",
    });
    panelEl.appendChild(img);
    return img;
  }
    function createEmptyTableState(tableId = null) {
    return {
      tableId,
      initialized: false,
      balls: [],
      ingredients: [],
      composePlacements: [],
      activeBallId: null,
      activeIngredientId: null,
      chairCount: 1,
      chairColor: "#e8f25a",
      finalPotTextureUrl: null,
    };
  }
  function loadStateFromTableState(src) {
    const state = src ?? createEmptyTableState(activeTableId);

    currentTableState = state;

    balls.length = 0;
    ingredients.length = 0;
    composePlacements.length = 0;

    balls.push(...(state.balls || []).map((x) => ({ ...x })));
    ingredients.push(...(state.ingredients || []).map((x) => ({ ...x })));
    composePlacements.push(...(state.composePlacements || []).map((x) => ({ ...x })));

    activeBallId = state.activeBallId ?? null;
    activeIngredientId = state.activeIngredientId ?? null;

    chairCount = state.chairCount ?? 1;
    chairColor = state.chairColor ?? "#e8f25a";
    finalPotTextureUrl = state.finalPotTextureUrl ?? null;

    // reset transient ui/editor state
    composeMode = null;

    ingredientPreviewImgUrl = null;
    ingredientToolMode = "draw";
    ingredientDrawing = false;
    ingredientLastPoint = null;

    cutDrawing = false;
    cutPath = [];
    cutLines = [];
    cutLineColors = [];
    cutColor = "#000000";

    ballNextScale.clear();
    ingredientNextScale.clear();
  }
    function buildOutputTableState() {
    return {
      tableId: activeTableId,
      initialized: true,
      balls: balls.map((x) => ({ ...x })),
      ingredients: ingredients.map((x) => ({ ...x })),
      composePlacements: composePlacements.map((x) => ({ ...x })),
      activeBallId,
      activeIngredientId,
      chairCount,
      chairColor,
      finalPotTextureUrl,
    };
  }
  function addTopRightCloseButton({ x, y, w = 50, h = 50, onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  Object.assign(btn.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    border: "0",
    background: "transparent",
    padding: "0",
    cursor: "pointer",
    zIndex: "20",
  });

  if (onClick) btn.addEventListener("click", onClick);

  const img = document.createElement("img");
  img.src = ASSETS.toClose;
  Object.assign(img.style, {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    transition: "transform 180ms ease",
    transformOrigin: "center center",
  });

  btn.addEventListener("mouseenter", () => {
    img.style.transform = "rotate(90deg)";
  });

  btn.addEventListener("mouseleave", () => {
    img.style.transform = "rotate(0deg)";
  });

  btn.appendChild(img);
  panelEl.appendChild(btn);
  return btn;
}

  // ---------- step0 ----------
  function renderStep0() {
    const s = UI.step0;

    const potImg = addImg(ASSETS.step0Pot, { ...s.pot, z: 2, pointerEvents: "auto" });
    const bubble = addImg(ASSETS.emptyBubble, { ...s.bubble, z: 3, opacity: 0 });
    const bubbleText = addText("來製作你的火鍋吧！", {
      x: 194,
      y: 126,
      size: 30,
      color: "#FD6FFF",
      z: 4,
    });
    bubbleText.style.opacity = "0";

    potImg.addEventListener("mouseenter", () => {
      bubble.style.opacity = "1";
      bubbleText.style.opacity = "1";
    });
    potImg.addEventListener("mouseleave", () => {
      bubble.style.opacity = "0";
      bubbleText.style.opacity = "0";
    });

    addActionButton({
      rect: s.nextBtn,
      label: "開始製作",
      iconSrc: ASSETS.rightArrow,
      iconRect: s.nextIcon,
      textOffsetX: 14,
      onClick: () => {
        step = 1;
        renderStep();
      },
    });
  }

  // ---------- step1 soup blocks ----------
  function mountFluidEditor() {
    if (!fluidMountEl) return;
    fluidCtrl = createFluidPavel({
      mountEl: fluidMountEl,
      width: UI.step1.fluid.w,
      height: UI.step1.fluid.h,
      color: fluidColor,
    });
  }

  function unmountFluidEditor() {
    try { fluidCtrl?.destroy?.(); } catch(e) {}
    fluidCtrl = null;
    if (fluidMountEl) fluidMountEl.innerHTML = "";
    fluidMountEl = null;
  }

  function renderHorizontalSoupList(rect) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      left: `${rect.x}px`,
      top: `${rect.y + 37}px`,
      width: `${rect.w}px`,
      height: `${rect.h - 37}px`,
      display: "flex",
      alignItems: "center",
      gap: "17px",
      overflowX: "auto",
      overflowY: "hidden",
      zIndex: "3",
    });
    panelEl.appendChild(wrap);

    if (balls.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "尚無湯塊";
      Object.assign(empty.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#666",
      });
      wrap.appendChild(empty);
      return wrap;
    }

    balls.forEach((ball) => {
      const item = document.createElement("button");
      item.type = "button";
      Object.assign(item.style, {
        width: "50px",
        height: "50px",
        minWidth: "50px",
        borderRadius: "999px",
        border: "transparent",
        background: "transparent",
        padding: "0",
        cursor: "pointer",
      });
      item.addEventListener("click", () => {
        if (activeBallId === ball.id) {
          activeBallId = null;
          composeMode = null;
        } else {
          activeBallId = ball.id;
          activeIngredientId = null;
          composeMode = "soup";
        }
        renderStep();
      });

      const img = document.createElement("img");
      img.src = ball.previewUrl;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "999px",
        pointerEvents: "none",
      });
      item.appendChild(img);
      wrap.appendChild(item);
    });

    return wrap;
  }

    function renderStep1() {
    const s = UI.step1;
    addImg(ASSETS.step1Worktop, { ...s.worktop, z: 1 });
    addText("湯塊區", { x: s.listFrame.x, y: s.listFrame.y, size: 20, z: 3 });
    addText("製作湯塊", { x: s.title.x, y: s.title.y, size: 25, z: 3 });

    fluidMountEl = document.createElement("div");
    Object.assign(fluidMountEl.style, {
      position: "absolute",
      left: `${s.fluid.x}px`,
      top: `${s.fluid.y}px`,
      width: `${s.fluid.w}px`,
      height: `${s.fluid.h}px`,
      overflow: "hidden",
      borderRadius: "12px",
      zIndex: "2",
      background: "transparent",
    });
    panelEl.appendChild(fluidMountEl);
    mountFluidEditor();

        const fluidColorPopover = createColorPopover({
      panelEl,
      anchorRect: s.colorBtn,
      initialColor: fluidColor,
      onChange: (nextColor) => {
        fluidColor = nextColor;
        fluidCtrl?.setColor(fluidColor);
      },
      presetColors: [
        "#FD6FFF",
        "#1248FF",
        "#E8F25A",
        "#FFFFFF",
        "#000000",
        "#FF8A65",
        "#7ED957",
        "#B388FF",
      ],
    });

    const colorBtn = addImageButton(ASSETS.colorPicker, s.colorBtn, {
      onClick: (e) => {
        e.stopPropagation();
        fluidColorPopover.toggle();
      },
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    attachHoverLabel(colorBtn, "湯頭：選擇顏色", s.colorLabel);

    let matPopupOpen = false;

    const matPopup = document.createElement("div");
    Object.assign(matPopup.style, {
      position: "absolute",
      left: `${s.materialBtn.x}px`,
      top: `${s.materialBtn.y + s.materialBtn.h + 8}px`,
      background: "#1a1a1a",
      borderRadius: "16px",
      padding: "10px 8px",
      display: "none",
      flexDirection: "column",
      gap: "6px",
      zIndex: "10010",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      minWidth: "120px",
      maxHeight: "400px",
      overflowY: "auto",
    });
    panelEl.appendChild(matPopup);

    const mats = [
      { key: "ink",    label: "Ink" },
      { key: "latex",  label: "液態乳膠" },
      { key: "wax",    label: "融蠟" },
      { key: "chrome", label: "流體金屬" },
      { key: "pearl",  label: "珍珠母貝" },
      { key: "clay",   label: "黏土" },
    ];
    let activeMat = "ink";

    mats.forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.dataset.matKey = key;
      Object.assign(btn.style, {
        background: key === activeMat ? "#FD6FFF" : "transparent",
        color: key === activeMat ? "#fff" : "#ccc",
        border: "none",
        borderRadius: "999px",
        padding: "6px 14px",
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "16px",
        cursor: "pointer",
        textAlign: "left",
        outline: "none",
      });
      btn.addEventListener("click", () => {
        activeMat = key;
        fluidCtrl?.setActiveMaterial(key);
        fluidCtrl?.setColor(fluidColor);
        matPopup.querySelectorAll("button").forEach((b) => {
          const isActive = b.dataset.matKey === key;
          b.style.background = isActive ? "#FD6FFF" : "transparent";
          b.style.color = isActive ? "#fff" : "#ccc";
        });
      });
      matPopup.appendChild(btn);
    });

    const closeMatPopup = (e) => {
      if (matPopupOpen && !matPopup.contains(e.target)) {
        matPopup.style.display = "none";
        matPopupOpen = false;
        document.removeEventListener("pointerdown", closeMatPopup);
      }
    };

    const materialBtn = addImageButton(ASSETS.material, s.materialBtn, {
      onClick: () => {
        matPopupOpen = !matPopupOpen;
        if (matPopupOpen) {
          matPopup.style.left = `${s.materialBtn.x + s.materialBtn.w + 12}px`;
          matPopup.style.top  = `${s.materialBtn.y + 12}px`;
        }
        matPopup.style.display = matPopupOpen ? "flex" : "none";
        if (matPopupOpen) setTimeout(() => document.addEventListener("pointerdown", closeMatPopup), 0);
      },
      border: "0", bg: "transparent", radius: 0,
    });
    attachHoverLabel(materialBtn, "口感：選擇質地", s.materialLabel);
    matPopup.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });

    let fluidBrushRadius = 20;

    const brushPopup = document.createElement("div");
    Object.assign(brushPopup.style, {
      position: "absolute",
      left: `${s.brushBtn.x - 20}px`,
      top: `${s.brushBtn.y + s.brushBtn.h + 8}px`,
      width: "220px",
      background: "#1a1a1a",
      borderRadius: "999px",
      padding: "10px 16px",
      display: "none",
      alignItems: "center",
      gap: "10px",
      zIndex: "10",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    });
    const sliderEl = document.createElement("input");
    sliderEl.type = "range";
    sliderEl.min = "0.1";
    sliderEl.max = "80";
    sliderEl.step = "0.1";
    sliderEl.value = String(fluidBrushRadius);
    Object.assign(sliderEl.style, { flex: "1", accentColor: "#FD6FFF", cursor: "pointer" });
    const brushValLabel = document.createElement("div");
    brushValLabel.textContent = String(fluidBrushRadius);
    Object.assign(brushValLabel.style, {
      color: "#fff",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "14px",
      minWidth: "24px",
      textAlign: "right",
    });
    sliderEl.addEventListener("input", (e) => {
      fluidBrushRadius = Number(e.target.value);
      brushValLabel.textContent = fluidBrushRadius;
      fluidCtrl?.setSplatRadius(fluidBrushRadius);
    });
    brushPopup.appendChild(sliderEl);
    brushPopup.appendChild(brushValLabel);
    panelEl.appendChild(brushPopup);

    let brushPopupOpen = false;
    const closeBrushPopup = (e) => {
      if (brushPopupOpen && !brushPopup.contains(e.target)) {
        brushPopup.style.display = "none";
        brushPopupOpen = false;
        document.removeEventListener("pointerdown", closeBrushPopup);
      }
    };

    const brushBtn = addImageButton(ASSETS.brushSize, s.brushBtn, {
      onClick: () => {
        brushPopupOpen = !brushPopupOpen;
        brushPopup.style.display = brushPopupOpen ? "flex" : "none";
        if (brushPopupOpen) setTimeout(() => document.addEventListener("pointerdown", closeBrushPopup), 0);
      },
      border: "0", bg: "transparent", radius: 0,
    });
    attachHoverLabel(brushBtn, "湯勺：調整筆刷大小", s.brushLabel);

    let fluidEraserOn = false;
    let fluidFingerOn = false;

    const eraserBtn = addImageButton(ASSETS.eraser, s.eraserBtn, {
      onClick: () => {
        fluidEraserOn = !fluidEraserOn;
        eraserBtn.style.outline = fluidEraserOn ? "3px solid #FD6FFF" : "none";
        if (fluidEraserOn) {
          fluidFingerOn = false;
          fingerBtn.style.outline = "none";
          fluidCtrl?.setFingerMode(false);
          fluidCtrl?.setColor("#ffffff");
        } else {
          fluidCtrl?.setColor(fluidColor);
        }
      },
      border: "0", bg: "transparent", radius: 0,
    });
    attachHoverLabel(eraserBtn, "衛生紙：擦除", s.eraserLabel);

    const fingerBtn = addImageButton(ASSETS.finger, s.fingerBtn, {
      onClick: () => {
        fluidFingerOn = !fluidFingerOn;
        fingerBtn.style.outline = fluidFingerOn ? "3px solid #FD6FFF" : "none";
        fluidCtrl?.setFingerMode(fluidFingerOn);
        if (fluidFingerOn) {
          fluidEraserOn = false;
          eraserBtn.style.outline = "none";
          fluidCtrl?.setColor(fluidColor);
        }
      },
      border: "0", bg: "transparent", radius: 0,
    });
    attachHoverLabel(fingerBtn, "湯壺：攪拌暈染", s.fingerLabel);

    const nameWrap = document.createElement("div");
    Object.assign(nameWrap.style, {
      position: "absolute",
      left: `${s.nameInput.x}px`,
      top: `${s.nameInput.y}px`,
      width: `${s.nameInput.w}px`,
      height: `${s.nameInput.h}px`,
      zIndex: "3",
    });
    panelEl.appendChild(nameWrap);

    const nameFrame = document.createElement("div");
    Object.assign(nameFrame.style, {
      position: "absolute",
      inset: "0",
      borderRadius: "999px",
      border: "2px solid #EAEAEA",
      background: "#fff",
      boxSizing: "border-box",
    });
    nameWrap.appendChild(nameFrame);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    Object.assign(nameInput.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      padding: "0 16px",
      boxSizing: "border-box",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "18px",
      color: "#FD6FFF",
    });
    nameFrame.appendChild(nameInput);

    const nameLabel = document.createElement("div");
    nameLabel.textContent = "命名湯塊";
    Object.assign(nameLabel.style, {
      position: "absolute",
      left: "18px",
      top: "18px",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color: "#EAEAEA",
      lineHeight: "1",
      pointerEvents: "none",
    });
    nameFrame.appendChild(nameLabel);

    const updateNameLabel = () => {
      nameLabel.style.display = nameInput.value.length > 0 ? "none" : "block";
    };
    nameInput.addEventListener("input", updateNameLabel);
    updateNameLabel();

    const confirmBtn = addCapsuleButton({
      x: s.confirmBtn.x, y: s.confirmBtn.y, w: s.confirmBtn.w, h: s.confirmBtn.h,
      bg: "#EAEAEA", border: "2px solid #EAEAEA",
      onClick: () => {
        const nm = nameInput.value.trim() || `湯塊 ${balls.length + 1}`;
        const ball = ballEditor?.storeSnapshot?.(nm);
        if (!ball) return;
        balls.unshift({ id: ball.id, name: ball.name, previewUrl: ball.previewDataURL });
        activeBallId = ball.id;
        nameInput.value = "";
        updateNameLabel();
        const old = panelEl.querySelector(".soup-list-wrap");
        if (old) old.remove();
        const newWrap = renderHorizontalSoupList(s.listFrame);
        newWrap.classList.add("soup-list-wrap");
      }
    });
    addImg(ASSETS.confirm, { ...s.confirmIcon, z: 4 });
    attachHoverLabel(confirmBtn, "儲存", s.confirmLabel);

    const deleteBtn = addCapsuleButton({
      x: s.deleteBtn.x, y: s.deleteBtn.y, w: s.deleteBtn.w, h: s.deleteBtn.h,
      bg: "#EAEAEA", border: "2px solid #EAEAEA",
      onClick: () => { fluidCtrl?.clearCanvas(); }
    });
    addImg(ASSETS.delete, { ...s.deleteIcon, z: 4 });
    attachHoverLabel(deleteBtn, "清空", s.deleteLabel);

    const hiddenBallList = document.createElement("div");
    const hiddenEmpty = document.createElement("div");
    hiddenBallList.style.display = "none";
    hiddenEmpty.style.display = "none";
    panelEl.appendChild(hiddenBallList);
    panelEl.appendChild(hiddenEmpty);

    ballEditor = createBallEditorFluid({
      getTableId: () => activeTableId,
      getFluidCtrl: () => fluidCtrl,
      data: potData,
      ui: { ballListEl: hiddenBallList, emptyTextEl: hiddenEmpty },
    });

    const soupWrap = renderHorizontalSoupList(s.listFrame);
    soupWrap.classList.add("soup-list-wrap");

    addActionButton({
      rect: s.nextBtn,
      label: "製作配料",
      iconSrc: ASSETS.rightArrow,
      iconRect: s.nextIcon,
      textOffsetX: 14,
      onClick: () => { step = 2; renderStep(); },
    });
  }

  // ---------- step2 ingredients ----------
  function uuid() {
    return crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function startIngredientPath(e) {
    if (!ingredientCanvas || !ingredientCtx) return;
    ingredientDrawing = true;
    const p = ingredientCanvasXY(e);
    ingredientLastPoint = p;
    ingredientCtx.beginPath();
    ingredientCtx.moveTo(p.x, p.y);
  }

  function moveIngredientPath(e) {
    if (!ingredientDrawing || !ingredientCanvas || !ingredientCtx) return;
    const p = ingredientCanvasXY(e);
    ingredientCtx.lineCap = "round";
    ingredientCtx.lineJoin = "round";

    if (ingredientToolMode === "erase") {
      ingredientCtx.globalCompositeOperation = "destination-out";
      ingredientCtx.strokeStyle = "rgba(0,0,0,1)";
      ingredientCtx.lineWidth = ingredientBrushSize * 2;
    } else {
      ingredientCtx.globalCompositeOperation = "source-over";
      ingredientCtx.strokeStyle = ingredientBrushColor;
      ingredientCtx.lineWidth = ingredientBrushSize;
    }

    ingredientCtx.lineTo(p.x, p.y);
    ingredientCtx.stroke();
    ingredientLastPoint = p;
  }

  function endIngredientPath() {
    ingredientDrawing = false;
    ingredientLastPoint = null;
  }

  function ingredientCanvasXY(e) {
    const rect = ingredientCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (ingredientCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (ingredientCanvas.height / rect.height);
    return { x, y };
  }

  function bindIngredientCanvasEvents() {
    if (!ingredientCanvas) return;
    ingredientCanvas.onpointerdown = startIngredientPath;
    ingredientCanvas.onpointermove = moveIngredientPath;
    ingredientCanvas.onpointerup = endIngredientPath;
    ingredientCanvas.onpointerleave = endIngredientPath;
    ingredientCanvas.onpointercancel = endIngredientPath;
  }

  function clearIngredientCanvas() {
    if (!ingredientCtx || !ingredientCanvas) return;
    ingredientCtx.clearRect(0, 0, ingredientCanvas.width, ingredientCanvas.height);
  }

  function renderHorizontalIngredientList(rect) {
    addText("配料區", { x: rect.x, y: rect.y, size: 20, color: "#1248FF", z: 3 });

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      left: `${rect.x}px`,
      top: `${rect.y + 37}px`,
      width: `${rect.w}px`,
      height: `${rect.h - 37}px`,
      display: "flex",
      alignItems: "center",
      gap: "17px",
      overflowX: "auto",
      overflowY: "hidden",
      zIndex: "3",
    });
    panelEl.appendChild(wrap);

    ingredients.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      Object.assign(btn.style, {
        width: "103px",
        height: "50px",
        minWidth: "103px",
        borderRadius: "12px",
        border: "transparent",
        background: "transparent",
        padding: "0",
        cursor: "pointer",
        overflow: "hidden",
      });
      btn.addEventListener("click", () => {
        if (activeIngredientId === item.id) {
          activeIngredientId = null;
          composeMode = null;
        } else {
          activeIngredientId = item.id;
          activeBallId = null;
          composeMode = "ingredient";
        }
        renderStep();
      });
      const img = document.createElement("img");
      img.src = item.previewUrl;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        pointerEvents: "none",
      });
      btn.appendChild(img);
      wrap.appendChild(btn);
    });

    return wrap;
  }

    function renderStep2() {
    const s = UI.step2;
    addImg(ASSETS.step2Worktop, { ...s.worktop, z: 1 });
    addText("製作配料", { x: s.title.x, y: s.title.y, size: 25, color: "#FD6FFF", z: 3 });
    addText("畫出配料", { x: s.drawTitle.x, y: s.drawTitle.y, size: 20, color: "#FD6FFF", z: 3 });

    ingredientCanvas = document.createElement("canvas");
    ingredientCanvas.width = s.drawCanvas.w;
    ingredientCanvas.height = s.drawCanvas.h;
    ingredientCtx = ingredientCanvas.getContext("2d");
    Object.assign(ingredientCanvas.style, {
      position: "absolute",
      left: `${s.drawCanvas.x}px`,
      top: `${s.drawCanvas.y}px`,
      width: `${s.drawCanvas.w}px`,
      height: `${s.drawCanvas.h}px`,
      borderRadius: "28px",
      background: "transparent",
      border: "2px solid #FD6FFF",
      boxSizing: "border-box",
      zIndex: "2",
      touchAction: "none",
    });
    panelEl.appendChild(ingredientCanvas);
    bindIngredientCanvasEvents();

        const ingredientColorPopover = createColorPopover({
      panelEl,
      anchorRect: s.colorBtn,
      initialColor: ingredientBrushColor,
      onChange: (nextColor) => {
        ingredientBrushColor = nextColor;
      },
      presetColors: [
        "#FD6FFF",
        "#1248FF",
        "#E8F25A",
        "#FFFFFF",
        "#000000",
        "#FF8A65",
        "#7ED957",
        "#B388FF",
      ],
    });

    const colorBtn = addImageButton(ASSETS.colorPicker, s.colorBtn, {
      onClick: (e) => {
        e.stopPropagation();
        ingredientColorPopover.toggle();
      },
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    attachHoverLabel(colorBtn, "食用色素：選擇顏色", s.colorLabel);

    const brushPopup = document.createElement("div");
    Object.assign(brushPopup.style, {
      position: "absolute",
      left: `${s.brushBtn.x - 24}px`,
      top: `${s.brushBtn.y + s.brushBtn.h + 8}px`,
      width: "220px",
      background: "#1a1a1a",
      borderRadius: "999px",
      padding: "10px 16px",
      display: "none",
      alignItems: "center",
      gap: "10px",
      zIndex: "10",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    });

    const brushSlider = document.createElement("input");
    brushSlider.type = "range";
    brushSlider.min = "1";
    brushSlider.max = "60";
    brushSlider.step = "1";
    brushSlider.value = String(ingredientBrushSize);
    Object.assign(brushSlider.style, {
      flex: "1",
      accentColor: "#FD6FFF",
      cursor: "pointer",
    });

    const brushValLabel = document.createElement("div");
    brushValLabel.textContent = `${ingredientBrushSize}`;
    Object.assign(brushValLabel.style, {
      color: "#fff",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "14px",
      minWidth: "32px",
      textAlign: "right",
    });

    brushSlider.addEventListener("input", (e) => {
      ingredientBrushSize = Number(e.target.value);
      brushValLabel.textContent = `${ingredientBrushSize}`;
    });

    brushPopup.appendChild(brushSlider);
    brushPopup.appendChild(brushValLabel);
    panelEl.appendChild(brushPopup);

    let brushPopupOpen = false;
    const closeBrushPopup = (e) => {
      if (brushPopupOpen && !brushPopup.contains(e.target)) {
        brushPopup.style.display = "none";
        brushPopupOpen = false;
        document.removeEventListener("pointerdown", closeBrushPopup);
      }
    };

    const brushBtn = addImageButton(ASSETS.brushSize2, s.brushBtn, {
      onClick: () => {
        brushPopupOpen = !brushPopupOpen;
        brushPopup.style.display = brushPopupOpen ? "flex" : "none";
        if (brushPopupOpen) {
          setTimeout(() => document.addEventListener("pointerdown", closeBrushPopup), 0);
        }
      },
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    attachHoverLabel(brushBtn, "漏斗：調整筆刷大小", s.brushLabel);

    const eraserBtn = addImageButton(ASSETS.eraser2, s.eraserBtn, {
      onClick: () => {
        ingredientToolMode = ingredientToolMode === "erase" ? "draw" : "erase";
      },
      border: "0", bg: "transparent", radius: 0,
    });
    attachHoverLabel(eraserBtn, "刀子：擦除", s.eraserLabel);

    const oldPreview = panelEl.querySelector(".ingredient-preview-img");
    if (oldPreview) oldPreview.remove();

    const previewImgEl = document.createElement("img");
    Object.assign(previewImgEl.style, {
      position: "absolute",
      left: `${s.resultPreview.x}px`,
      top: `${s.resultPreview.y}px`,
      width: `${s.resultPreview.w}px`,
      height: `${s.resultPreview.h}px`,
      objectFit: "contain",
      borderRadius: "18px",
      zIndex: "3",
      pointerEvents: "none",
      display: ingredientPreviewImgUrl ? "block" : "none",
    });
    if (ingredientPreviewImgUrl) previewImgEl.src = ingredientPreviewImgUrl;
    panelEl.appendChild(previewImgEl);

    const inflateBtn = addImageButton(ASSETS.inflate, s.inflateBtn, {
      onClick: () => {
        handleInflateIngredient(previewImgEl);
      },
      border: "0",
      bg: "transparent",
      radius: 0,
    });

    addLabelChip("充氣", {
      x: s.inflateLabel.x,
      y: s.inflateLabel.y,
      w: s.inflateLabel.w,
      h: s.inflateLabel.h,
      color: "#1248FF",
      z: 12,
    });

    addFrameBox({
      x: s.resultFrame.x,
      y: s.resultFrame.y,
      w: s.resultFrame.w,
      h: s.resultFrame.h,
      bg: "transparent",
      border: "2px solid #FD6FFF",
      radius: 28,
      z: 1,
    });

    const nameWrap = document.createElement("div");
    Object.assign(nameWrap.style, {
      position: "absolute",
      left: "964px",
      top: "260px",
      width: "326px",
      height: "60px",
      zIndex: "3",
    });
    panelEl.appendChild(nameWrap);

    const inputFrame = document.createElement("div");
    Object.assign(inputFrame.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "191px",
      height: "60px",
      borderRadius: "999px",
      border: "2px solid #EAEAEA",
      background: "#FFFFFF",
      boxSizing: "border-box",
    });
    nameWrap.appendChild(inputFrame);

    const previewNameInput = document.createElement("input");
    previewNameInput.type = "text";
    previewNameInput.placeholder = "";
    Object.assign(previewNameInput.style, {
      position: "absolute",
      left: "0px",
      top: "0px",
      width: "100%",
      height: "100%",
      border: "0",
      outline: "none",
      background: "transparent",
      padding: "0 16px",
      boxSizing: "border-box",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "18px",
      color: "#FD6FFF",
    });
    inputFrame.appendChild(previewNameInput);

    const inputLabel = document.createElement("div");
    inputLabel.textContent = "命名配料";
    Object.assign(inputLabel.style, {
      position: "absolute",
      left: "18px",
      top: "18px",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color: "#EAEAEA",
      lineHeight: "1",
      pointerEvents: "none",
    });
    inputFrame.appendChild(inputLabel);
    const updateLabel = () => {
      inputLabel.style.display = previewNameInput.value.length > 0 ? "none" : "block";
    };
    previewNameInput.addEventListener("input", updateLabel);
    updateLabel();

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    Object.assign(confirmBtn.style, {
      position: "absolute",
      left: "129px",
      top: "0px",
      width: "60px",
      height: "60px",
      borderRadius: "999px",
      border: "2px solid #EAEAEA",
      background: "#EAEAEA",
      cursor: "pointer",
      padding: "0",
    });
    confirmBtn.addEventListener("click", () => {
      const nm = previewNameInput.value.trim() || `配料 ${ingredients.length + 1}`;
      storeIngredient(nm);
      ingredientPreviewImgUrl = null;
      clearIngredientDrawing(ingredientCanvas, ingredientCtx);
      previewNameInput.value = "";
      renderStep();
    });
    nameWrap.appendChild(confirmBtn);

    const confirmIcon = document.createElement("img");
    confirmIcon.src = ASSETS.confirm;
    Object.assign(confirmIcon.style, {
      position: "absolute",
      left: "3px",
      top: "3px",
      width: "54px",
      height: "54px",
      pointerEvents: "none",
    });
    confirmBtn.appendChild(confirmIcon);
    attachHoverLabel(confirmBtn, "儲存", s.confirmLabel);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    Object.assign(deleteBtn.style, {
      position: "absolute",
      left: "204px",
      top: "0px",
      width: "60px",
      height: "60px",
      borderRadius: "999px",
      border: "2px solid #EAEAEA",
      background: "#EAEAEA",
      cursor: "pointer",
      padding: "0",
    });
    deleteBtn.addEventListener("click", () => {
      handleClearIngredientDrawing(previewImgEl);
    });
    nameWrap.appendChild(deleteBtn);

    const deleteIcon = document.createElement("img");
    deleteIcon.src = ASSETS.delete;
    Object.assign(deleteIcon.style, {
      position: "absolute",
      left: "15px",
      top: "12px",
      width: "30px",
      height: "37px",
      pointerEvents: "none",
    });
    deleteBtn.appendChild(deleteIcon);
    attachHoverLabel(deleteBtn, "清空", s.deleteLabel);

    renderHorizontalIngredientList(s.listFrame);

    addActionButton({
      rect: s.prevBtn,
      label: "製作湯塊",
      iconSrc: ASSETS.leftArrow,
      iconRect: s.prevIcon,
      textOffsetX: -16,
      onClick: () => {
        step = 1;
        renderStep();
      },
    });

    addActionButton({
      rect: s.nextBtn,
      label: "下鍋",
      iconSrc: ASSETS.rightArrow,
      iconRect: s.nextIcon,
      textOffsetX: 12,
      onClick: () => {
        ensureStep3Canvas();
        step = 3;
        renderStep();
      },
    });
  }

  // ---------- step3 compose pot ----------

  // image cache: avoid recreating Image() on every redraw
  const imageCache = new Map();

  function getCachedImage(src) {
    if (!src) return null;

    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      img.onload = () => {
        redrawComposeCanvas();
      };
      imageCache.set(src, img);
    }
    return img;
  }

  function ensureStep3Canvas() {
    if (potCanvas) return;
    potCanvas = document.createElement("canvas");
    potCanvas.width = UI.step3.potCanvas.w;
    potCanvas.height = UI.step3.potCanvas.h;
    potCtx = potCanvas.getContext("2d");
    redrawComposeCanvas();
  }

  function bindStep3CanvasEvents() {
    if (!potCanvas || step3Bound) return;
    potCanvas.addEventListener("click", onComposeClick);
    potCanvas.addEventListener("pointerdown", onCutPointerDown);
    potCanvas.addEventListener("pointermove", onCutPointerMove);
    potCanvas.addEventListener("pointerup", onCutPointerUp);
    potCanvas.addEventListener("pointerleave", onCutPointerUp);
    potCanvas.addEventListener("pointercancel", onCutPointerUp);
    step3Bound = true;
  }

  function composeCanvasXY(e) {
    const rect = potCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (potCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (potCanvas.height / rect.height);
    return { x, y };
  }

  function isInsideComposeCircle(x, y) {
    const s = UI.step3.potCanvas.w;
    const cx = s / 2;
    const cy = s / 2;
    const r = s / 2 - 6;
    return Math.hypot(x - cx, y - cy) <= r;
  }

  function drawCircleMask(ctx, size, drawFn) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  function drawSoupPlacement(ctx, placement) {
    const ball = balls.find((b) => b.id === placement.itemId);
    if (!ball) return;

    const img = getCachedImage(ball.previewUrl);
    if (!img || !img.complete) return;

    const scale = placement.scale ?? 1.0;
    const r = Math.round(26 * scale);

    ctx.save();
    ctx.beginPath();
    ctx.arc(placement.x, placement.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, placement.x - r, placement.y - r, r * 2, r * 2);
    ctx.restore();
  }

  function drawIngredientPlacement(ctx, placement) {
    const item = ingredients.find((it) => it.id === placement.itemId);
    if (!item) return;

    const img = getCachedImage(item.previewUrl);
    if (!img || !img.complete) return;

    const scale = placement.scale ?? 1.0;
    const w = Math.round(72 * scale);
    const h = Math.round(36 * scale);
    ctx.drawImage(img, placement.x - w / 2, placement.y - h / 2, w, h);
  }

  const composePlacements = [];

  function redrawComposeCanvas() {
    if (!potCtx || !potCanvas) return;
    const s = potCanvas.width;

    potCtx.clearRect(0, 0, s, s);

    drawCircleMask(potCtx, s, () => {
      potCtx.fillStyle = "#FFFFFF";
      potCtx.fillRect(0, 0, s, s);

      for (const p of composePlacements) {
        if (p.type === "soup") drawSoupPlacement(potCtx, p);
        if (p.type === "ingredient") drawIngredientPlacement(potCtx, p);
      }
    });

    potCtx.beginPath();
    potCtx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    potCtx.strokeStyle = "transparent";
    potCtx.lineWidth = 0;
    potCtx.stroke();

    potCtx.save();
    potCtx.beginPath();
    potCtx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    potCtx.clip();
    potCtx.lineWidth = 4;
    potCtx.lineCap = "round";
    potCtx.lineJoin = "round";

    cutLines.forEach((line, idx) => {
      potCtx.strokeStyle = cutLineColors[idx] ?? "#000000";
      strokePath(potCtx, line, true);
    });

    if (cutPath.length >= 2) {
      potCtx.strokeStyle = cutColor;
      strokePath(potCtx, cutPath, true);
    }

    potCtx.restore();
  }

  function strokePath(ctx, pts, smooth = true) {
    if (!pts || pts.length < 2) return;
    const p = smooth ? smoothChaikin(pts, 2) : pts;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.stroke();
  }

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

  function onComposeClick(e) {
    if (!potCanvas) return;
    const { x, y } = composeCanvasXY(e);
    if (!isInsideComposeCircle(x, y)) return;

    if (composeMode === "cut") return;
    if (!composeMode) return;

    if (composeMode === "soup") {
      if (!activeBallId) return;
      const scale = ballNextScale.get(activeBallId) ?? 1.0;
      composePlacements.push({
        type: "soup",
        itemId: activeBallId,
        x,
        y,
        scale,
        createdAt: Date.now(),
      });
      redrawComposeCanvas();
      return;
    }

    if (composeMode === "ingredient") {
      if (!activeIngredientId) return;
      const scale = ingredientNextScale.get(activeIngredientId) ?? 1.0;
      composePlacements.push({
        type: "ingredient",
        itemId: activeIngredientId,
        x,
        y,
        scale,
        createdAt: Date.now(),
      });
      redrawComposeCanvas();
      return;
    }
  }

  function onCutPointerDown(e) {
    if (composeMode !== "cut") return;
    const p = composeCanvasXY(e);
    if (!isInsideComposeCircle(p.x, p.y)) return;
    cutDrawing = true;
    cutPath = [p];
    potCanvas.setPointerCapture?.(e.pointerId);
    redrawComposeCanvas();
  }

  function onCutPointerMove(e) {
    if (composeMode !== "cut" || !cutDrawing) return;
    const p = composeCanvasXY(e);
    const last = cutPath[cutPath.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
    cutPath.push(p);
    redrawComposeCanvas();
  }

  function onCutPointerUp() {
    if (composeMode !== "cut" || !cutDrawing) return;
    cutDrawing = false;
    if (cutPath.length >= 2) {
      cutLines.push([...cutPath]);
      cutLineColors.push(cutColor);
    }
    cutPath = [];
    redrawComposeCanvas();
  }

function renderVerticalList({
  title,
  frame,
  items,
  activeId,
  getPreviewUrl,
  onSelect,
  sizeMap,
  sliderMin = 0.4,
  sliderMax = 3.0,
  sliderStep = 0.1,
}) {
    addFrameBox({
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      bg: "#fff",
      border: "2px solid #FD6FFF",
      radius: 0,
      z: 1,
    });

    const titleX = title === "湯塊區" ? UI.step3.soupListTitle.x : UI.step3.ingListTitle.x;
    const titleY = title === "湯塊區" ? UI.step3.soupListTitle.y : UI.step3.ingListTitle.y;
    addText(title, { x: titleX, y: titleY, size: 20, color: "#1248FF", z: 3 });

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      left: `${frame.x + 18}px`,
      top: `${frame.y + 44}px`,
      width: `${frame.w - 36}px`,
      height: `${frame.h - 58}px`,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      zIndex: "3",
    });
    panelEl.appendChild(wrap);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.textContent = "尚無內容";
      Object.assign(empty.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#666",
        marginTop: "12px",
      });
      wrap.appendChild(empty);
      return wrap;
    }

    items.forEach((item) => {
      const isActive = item.id === activeId;

      const itemWrap = document.createElement("div");
      Object.assign(itemWrap.style, {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      });
      wrap.appendChild(itemWrap);

      const btn = document.createElement("button");
      btn.type = "button";
      Object.assign(btn.style, {
        width: "100%",
        height: "78px",
        borderRadius: "14px",
        border: isActive ? "2px solid #FD6FFF" : "2px solid transparent",
        background: "#fff",
        cursor: "pointer",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        boxSizing: "border-box",
      });
      btn.addEventListener("click", () => onSelect(item.id));

      const img = document.createElement("img");
      img.src = getPreviewUrl(item);
      Object.assign(img.style, {
        width: "62px",
        height: "62px",
        objectFit: "cover",
        borderRadius: item.name?.includes("配料") ? "8px" : "999px",
        pointerEvents: "none",
      });
      btn.appendChild(img);

      const label = document.createElement("div");
      label.textContent = item.name || "未命名";
      Object.assign(label.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#000",
      });
      btn.appendChild(label);
      itemWrap.appendChild(btn);

      if (isActive && sizeMap) {
        const currentScale = sizeMap.get(item.id) ?? 1.0;

        const sliderRow = document.createElement("div");
        Object.assign(sliderRow.style, {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "2px 8px",
        });

        const sizeLabel = document.createElement("div");
        sizeLabel.textContent = "大小";
        Object.assign(sizeLabel.style, {
          fontFamily: '"zpix", ui-sans-serif, system-ui',
          fontSize: "14px",
          color: "#FD6FFF",
          whiteSpace: "nowrap",
        });

        const sizeSlider = document.createElement("input");
        sizeSlider.type = "range";
        sizeSlider.min = String(sliderMin);
        sizeSlider.max = String(sliderMax);
        sizeSlider.step = String(sliderStep);
        sizeSlider.value = String(currentScale);
        sizeSlider.value = String(currentScale);
        Object.assign(sizeSlider.style, {
          flex: "1",
          accentColor: "#FD6FFF",
          cursor: "pointer",
        });

        const sizeVal = document.createElement("div");
        sizeVal.textContent = `${Math.round(currentScale * 100)}%`;
        Object.assign(sizeVal.style, {
          fontFamily: '"zpix", ui-sans-serif, system-ui',
          fontSize: "13px",
          color: "#666",
          minWidth: "38px",
          textAlign: "right",
        });

        sizeSlider.addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          sizeMap.set(item.id, v);
          sizeVal.textContent = `${Math.round(v * 100)}%`;
        });

        sliderRow.appendChild(sizeLabel);
        sliderRow.appendChild(sizeSlider);
        sliderRow.appendChild(sizeVal);
        itemWrap.appendChild(sliderRow);
      }
    });

    return wrap;
  }

  function renderStep3() {
    const s = UI.step3;
    ensureStep3Canvas();

    addImg(ASSETS.step3Pot, { ...s.potFrame, z: 1 });
    Object.assign(potCanvas.style, {
      position: "absolute",
      left: `${s.potCanvas.x}px`,
      top: `${s.potCanvas.y}px`,
      width: `${s.potCanvas.w}px`,
      height: `${s.potCanvas.h}px`,
      zIndex: "2",
      background: "transparent",
      touchAction: "none",
    });
    panelEl.appendChild(potCanvas);
    bindStep3CanvasEvents();
    redrawComposeCanvas();

    renderVerticalList({
      title: "湯塊區",
      frame: s.soupList,
      items: balls,
      activeId: activeBallId,
      getPreviewUrl: (item) => item.previewUrl,
      sizeMap: ballNextScale,
      sliderMin: 0.4,
      sliderMax: 6.0,
      sliderStep: 0.1,
      onSelect: (id) => {
        if (activeBallId === id) {
          activeBallId = null;
          composeMode = null;
        } else {
          activeBallId = id;
          activeIngredientId = null;
          composeMode = "soup";
        }
        renderStep();
      },
    });

    renderVerticalList({
      title: "配料區",
      frame: s.ingList,
      items: ingredients,
      activeId: activeIngredientId,
      getPreviewUrl: (item) => item.previewUrl,
      sizeMap: ingredientNextScale,
      onSelect: (id) => {
        if (activeIngredientId === id) {
          activeIngredientId = null;
          composeMode = null;
        } else {
          activeIngredientId = id;
          activeBallId = null;
          composeMode = "ingredient";
        }
        renderStep();
      },
    });

    addCapsuleButton({
      x: s.controls.continueMake.x,
      y: s.controls.continueMake.y,
      w: 60,
      h: 60,
      bg: "#FFFFFF",
      border: "2px solid #FD6FFF",
      onClick: () => {
        step = 2;
        renderStep();
      },
    });
    addImg(ASSETS.leftArrow, {
      x: s.controls.continueMake.x + 9,
      y: s.controls.continueMake.y + 9,
      w: 42,
      h: 42,
      z: 4,
    });
    addLabelChip("繼續製作", {
      x: s.controls.continueMake.x - 20,
      y: 551,
      w: 100,
      h: 33,
      color: "#1248FF",
    });

    const cutBtn = addCapsuleButton({
      x: s.controls.cut.x,
      y: s.controls.cut.y,
      w: 60,
      h: 60,
      bg: composeMode === "cut" ? "#FD6FFF" : "#EAEAEA",
      border: "0",
      onClick: (e) => {
        e.stopPropagation();
        activeBallId = null;
        activeIngredientId = null;
        composeMode = "cut";
        renderStep();
      },
    });

    const cutColorPopover = createAttachedColorPopover({
      panelEl,
      anchorEl: cutBtn,
      initialColor: cutColor,
      offsetX: 12,
      offsetY: -18,
      onChange: (nextColor) => {
        cutColor = nextColor;
        redrawComposeCanvas();
      },
      presetColors: [
        "#000000",
        "#FD6FFF",
        "#1248FF",
        "#E8F25A",
        "#FFFFFF",
        "#FF8A65",
        "#7ED957",
        "#B388FF",
      ],
    });

    if (composeMode === "cut") {
      setTimeout(() => {
        cutColorPopover.open();
      }, 0);
    }

    addImg(ASSETS.cut, {
      x: s.controls.cut.x + 4,
      y: s.controls.cut.y + 4,
      w: 52,
      h: 52,
      z: 4,
      rotate: 30,
    });

    addLabelChip("切割", {
      x: s.controls.cut.x - 1,
      y: 551,
      w: 62,
      h: 33,
      color: "#1248FF",
    });

    addCapsuleButton({
      x: s.controls.restart.x,
      y: s.controls.restart.y,
      w: 60,
      h: 60,
      bg: "#EAEAEA",
      border: "0",
      onClick: () => {
        if (composePlacements.length) composePlacements.pop();
        else if (cutLines.length) {
          cutLines.pop();
          cutLineColors.pop();
        }
        redrawComposeCanvas();
      },
    });
    addImg(ASSETS.restart, {
      x: s.controls.restart.x + 9,
      y: s.controls.restart.y + 10,
      w: 45,
      h: 40,
      z: 4,
    });
    addLabelChip("上一步", {
      x: s.controls.restart.x - 10,
      y: 551,
      w: 82,
      h: 33,
      color: "#1248FF",
    });

    addCapsuleButton({
      x: s.controls.delete.x,
      y: s.controls.delete.y,
      w: 60,
      h: 60,
      bg: "#EAEAEA",
      border: "0",
      onClick: () => {
        composePlacements.length = 0;
        cutLines.length = 0;
        cutLineColors.length = 0;
        cutPath = [];
        redrawComposeCanvas();
      },
    });
    addImg(ASSETS.delete, {
      x: s.controls.delete.x + 14,
      y: s.controls.delete.y + 10,
      w: 32,
      h: 40,
      z: 4,
    });
    addLabelChip("刪除", {
      x: s.controls.delete.x - 10,
      y: 551,
      w: 82,
      h: 33,
      color: "#1248FF",
    });

    addCapsuleButton({
      x: s.controls.finish.x,
      y: s.controls.finish.y,
      w: 60,
      h: 60,
      bg: "#FFFFFF",
      border: "2px solid #FD6FFF",
      onClick: () => {
        finalPotTextureUrl = exportFinalPotTexture();
        step = 4;
        renderStep();
      },
    });
    addImg(ASSETS.rightArrow, {
      x: s.controls.finish.x + 9,
      y: s.controls.finish.y + 9,
      w: 42,
      h: 42,
      z: 4,
    });
    addLabelChip("完成火鍋!", {
      x: s.controls.finish.x - 18,
      y: 551,
      w: 100,
      h: 33,
      color: "#1248FF",
    });
  }

  function exportFinalPotTexture() {
    if (!potCanvas) return null;

    const out = document.createElement("canvas");
    const outSize = 512;
    out.width = outSize;
    out.height = outSize;

    const ctx = out.getContext("2d");
    ctx.clearRect(0, 0, outSize, outSize);

    // 直接鋪滿整張 texture，不要縮小置中
    ctx.drawImage(potCanvas, 0, 0, outSize, outSize);

    return out.toDataURL("image/png");
  }

  // ---------- step4 3d preview ----------
  function unmountStep4Preview() {
      if (step4AnimFrame) {
        cancelAnimationFrame(step4AnimFrame);
        step4AnimFrame = 0;
      }

      if (step4Controls) {
        step4Controls.dispose();
        step4Controls = null;
      }

      if (step4Scene) {
        step4Scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose?.();

            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m?.dispose?.());
            } else {
              obj.material?.dispose?.();
            }
          }
        });
      }

      if (step4Texture) {
        step4Texture.dispose();
        step4Texture = null;
      }

      if (step4Renderer) {
        step4Renderer.dispose();
        step4Renderer.forceContextLoss?.();
        if (step4Renderer.domElement?.parentNode) {
          step4Renderer.domElement.parentNode.removeChild(step4Renderer.domElement);
        }
      }

      step4Renderer = null;
      step4Scene = null;
      step4Camera = null;
      step4Controls = null;
      step4Model = null;
    }

    function applyStep4PotMaterials(root) {
      if (!root) return;

      let soupBaseMesh = null;
      let soupTransparentMesh = null;
      let potBodyMesh = null;
      let potHandleMesh = null;

      root.traverse((obj) => {
        if (!obj.isMesh) return;

        console.log("[step4 mesh]", obj.name, {
          hasUV: !!obj.geometry?.attributes?.uv,
          material: obj.material,
        });
      if (obj.name === "soupBase_1") soupBaseMesh = obj;
      if (obj.name === "soupTransparent_1") soupTransparentMesh = obj;
      if (obj.name === "potbody_1") potBodyMesh = obj;
      if (obj.name === "pothandle_1") potHandleMesh = obj;
      });

      // 鍋身
      potBodyMesh.material = new THREE.MeshStandardMaterial({
        color: 0xff7cf6,
        roughness: 0.35,
        metalness: 0.02,
        transparent: false,
        opacity: 1,
        side: THREE.FrontSide,
        depthWrite: true,
      });

      // 把手
      if (potHandleMesh) {
        potHandleMesh.material = new THREE.MeshStandardMaterial({
          color: 0xf0df2a,
          roughness: 0.28,
          metalness: 0.18,
        });
      }

      if (soupBaseMesh) {
        if (!finalPotTextureUrl) {
          console.warn("[step4] finalPotTextureUrl is empty");
        } else {
          const loader = new THREE.TextureLoader();

          if (step4Texture) {
            step4Texture.dispose();
            step4Texture = null;
          }

          step4Texture = loader.load(
            finalPotTextureUrl,
            () => {
              console.log("[step4] soup texture loaded");
              step4Renderer?.render(step4Scene, step4Camera);
            },
            undefined,
            (err) => {
              console.error("[step4] failed to load finalPotTextureUrl", err);
            }
          );

          step4Texture.colorSpace = THREE.SRGBColorSpace;
          step4Texture.flipY = false;
          step4Texture.wrapS = THREE.ClampToEdgeWrapping;
          step4Texture.wrapT = THREE.ClampToEdgeWrapping;
          step4Texture.center.set(0.5, 0.5);
          step4Texture.rotation = 0;
          step4Texture.repeat.set(1, 1);
          step4Texture.offset.set(0, 0);
          step4Texture.needsUpdate = true;

          soupBaseMesh.visible = true;
          soupBaseMesh.renderOrder = 10;
          soupBaseMesh.material = new THREE.MeshBasicMaterial({
            map: step4Texture,
            transparent: true,
            side: THREE.DoubleSide,
            toneMapped: false,
          });
          soupBaseMesh.material.needsUpdate = true;
        }
      } else {
        console.warn("[step4] soupBaseMesh not found");
      }


      // 上層透明膜：先不要用 transmission，先用最穩定、最直觀的透明材質
      if (soupTransparentMesh) {
        soupTransparentMesh.material = new THREE.MeshStandardMaterial({
          color: 0xffd6ff,
          transparent: true,
          opacity: 0.28,
          roughness: 0.08,
          metalness: 0.0,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        soupTransparentMesh.material.needsUpdate = true;
        soupTransparentMesh.renderOrder = 2;
      }

      console.log("[step4] material target", {
        potBodyMesh: !!potBodyMesh,
        potHandleMesh: !!potHandleMesh,
        soupBaseMesh: !!soupBaseMesh,
        soupTransparentMesh: !!soupTransparentMesh,
        finalPotTextureUrl,
      });
    }

    function frameObjectToCamera(camera, object, controls) {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxSize = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxSize / 2 / Math.tan(fov / 2));
      cameraZ *= 1;

      camera.position.set(center.x, center.y + maxSize * 0.2, center.z + cameraZ);
      camera.near = Math.max(0.01, cameraZ / 100);
      camera.far = cameraZ * 100;
      camera.updateProjectionMatrix();

      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
    }

    function mountStep4Preview() {
      if (!step4PreviewEl) return;

      unmountStep4Preview();

      const w = step4PreviewEl.clientWidth || UI.step4.preview.w;
      const h = step4PreviewEl.clientHeight || UI.step4.preview.h;

      step4Scene = new THREE.Scene();
      step4Scene.background = new THREE.Color(0xffffff);

      step4Camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      step4Camera.position.set(0, 0.8, 2.5);

      step4Renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      step4Renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      step4Renderer.setSize(w, h);
      step4Renderer.outputColorSpace = THREE.SRGBColorSpace;
      step4PreviewEl.appendChild(step4Renderer.domElement);

      step4Controls = new OrbitControls(step4Camera, step4Renderer.domElement);
      step4Controls.enableDamping = true;
      step4Controls.enablePan = false;
      step4Controls.minDistance = 1.2;
      step4Controls.maxDistance = 6;
      step4Controls.target.set(0, 0.3, 0);

      const ambient = new THREE.AmbientLight(0xffffff, 2.2);
      step4Scene.add(ambient);

      const dir1 = new THREE.DirectionalLight(0xffffff, 1.8);
      dir1.position.set(2, 3, 4);
      step4Scene.add(dir1);

      const dir2 = new THREE.DirectionalLight(0xffffff, 1.2);
      dir2.position.set(-2, 2, -3);
      step4Scene.add(dir2);

      const loader = new GLTFLoader();
      loader.load(
        "/pott.glb",
        (gltf) => {
          console.log("[step4] gltf loaded", gltf);

          step4Model = gltf.scene;
          step4Scene.add(step4Model);

          step4Model.traverse((obj) => {
            console.log("[step4 node]", {
              name: obj.name,
              type: obj.type,
              isMesh: obj.isMesh,
            });
          });

          applyStep4PotMaterials(step4Model);
          frameObjectToCamera(step4Camera, step4Model, step4Controls);

          step4Renderer?.render(step4Scene, step4Camera);
        },
        undefined,
        (err) => {
          console.error("[step4] failed to load /pott.glb", err);

          const fallback = document.createElement("div");
          fallback.textContent = "pott.glb 載入失敗";
          Object.assign(fallback.style, {
            position: "absolute",
            inset: "0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: '"zpix", ui-sans-serif, system-ui',
            fontSize: "18px",
            color: "#666",
            background: "rgba(255,255,255,0.9)",
          });
          step4PreviewEl.appendChild(fallback);
        }
      );

      const tick = () => {
        step4AnimFrame = requestAnimationFrame(tick);
        step4Controls?.update();
        step4Renderer?.render(step4Scene, step4Camera);
      };
      tick();
    }

  function renderStep4() {
    const s = UI.step4;
    const prevRect = { x: 35, y: 551, w: 199, h: 63 };
    const prevIconRect = { x: 173, y: 562, w: 42, h: 42 };
    const nextRect = { x: 1074, y: 551, w: 199, h: 63 };
    const nextIconRect = { x: 1095, y: 562, w: 42, h: 42 };

    addFrameBox({
      x: s.soupList.x,
      y: s.soupList.y,
      w: s.soupList.w,
      h: s.soupList.h,
      bg: "#FFFFFF",
      border: "0",
      radius: 0,
      z: 1
    });

    addFrameBox({
      x: s.ingList.x,
      y: s.ingList.y,
      w: s.ingList.w,
      h: s.ingList.h,
      bg: "#FFFFFF",
      border: "0",
      radius: 0,
      z: 1
    });

    renderPreviewListInBox({
      box: s.soupList,
      items: balls,
      activeId: activeBallId,
      getPreviewUrl: (x) => x.previewUrl
    });

    renderPreviewListInBox({
      box: s.ingList,
      items: ingredients,
      activeId: activeIngredientId,
      getPreviewUrl: (x) => x.previewUrl
    });

    step4PreviewEl = document.createElement("div");
    Object.assign(step4PreviewEl.style, {
      position: "absolute",
      left: `${s.preview.x}px`,
      top: `${s.preview.y}px`,
      width: `${s.preview.w}px`,
      height: `${s.preview.h}px`,
      zIndex: "2",
      borderRadius: "18px",
      overflow: "hidden",
      background: "#fff",
    });
    panelEl.appendChild(step4PreviewEl);

    mountStep4Preview();

  if (!viewOnly) {
    addActionButton({
      rect: prevRect,
      label: "繼續製作",
      iconSrc: ASSETS.leftArrow,
      iconRect: prevIconRect,
      textOffsetX: -16,
      onClick: () => {
        step = 3;
        renderStep();
      },
    });

    addActionButton({
      rect: nextRect,
      label: "安排座位",
      iconSrc: ASSETS.rightArrow,
      iconRect: nextIconRect,
      textOffsetX: 12,
      onClick: () => {
        step = 5;
        renderStep();
      },
    });
  }
  if (viewOnly) {
  addTopRightCloseButton({
    x: UI.overlayW - 90,
    y: 24,
    w: 50,
    h: 50,
    onClick: () => requestClose(),
  });
}
  }

  function renderPreviewListInBox({ box, items, activeId, getPreviewUrl }) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      left: `${box.x + 10}px`,
      top: `${box.y + 10}px`,
      width: `${box.w - 20}px`,
      height: `${box.h - 20}px`,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      zIndex: "2",
      justifyContent: items.length ? "center" : "flex-start",
      alignItems: "stretch",
    });
    panelEl.appendChild(wrap);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.textContent = "尚無內容";
      Object.assign(empty.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#666",
        marginTop: "8px",
      });
      wrap.appendChild(empty);
      return wrap;
    }

    items.forEach((item) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: item.id === activeId ? "rgba(18,72,255,0.10)" : "rgba(255,255,255,0.7)",
        borderRadius: "12px",
        padding: "8px",
        width: "100%",
        boxSizing: "border-box",
      });

      const img = document.createElement("img");
      img.src = getPreviewUrl(item);
      Object.assign(img.style, {
        width: "48px",
        height: "48px",
        objectFit: "cover",
        borderRadius: "8px",
      });

      const label = document.createElement("div");
      label.textContent = item.name || "未命名";
      Object.assign(label.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#FD6FFF",
      });

      row.appendChild(img);
      row.appendChild(label);
      wrap.appendChild(row);
    });

    return wrap;
  }

  function updateStep5ChairPreviewColor() {
    if (!step5Model) return;

    step5Model.traverse((obj) => {
      if (!obj.isMesh) return;

      obj.material = new THREE.MeshStandardMaterial({
        color: chairColor,
        roughness: 0.2,
        metalness: 0.05,
      });
    });
  }

  function unmountStep5Preview() {
    if (step5AnimFrame) {
      cancelAnimationFrame(step5AnimFrame);
      step5AnimFrame = 0;
    }

    if (step5Controls) {
      step5Controls.dispose();
      step5Controls = null;
    }

    if (step5Scene) {
      step5Scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
          else obj.material?.dispose?.();
        }
      });
    }

    if (step5Renderer) {
      step5Renderer.dispose();
      step5Renderer.forceContextLoss?.();
      if (step5Renderer.domElement?.parentNode) {
        step5Renderer.domElement.parentNode.removeChild(step5Renderer.domElement);
      }
    }

    step5Renderer = null;
    step5Scene = null;
    step5Camera = null;
    step5Controls = null;
    step5Model = null;
  }

  function mountStep5Preview() {
  if (!chairPreviewEl) return;

  unmountStep5Preview();

  const w = chairPreviewEl.clientWidth || UI.step5.chairPreview.w;
  const h = chairPreviewEl.clientHeight || UI.step5.chairPreview.h;

  step5Scene = new THREE.Scene();
  step5Scene.background = new THREE.Color(0xffffff);

  step5Camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  step5Camera.position.set(0, 1.2, 4);

  step5Renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  step5Renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  step5Renderer.setSize(w, h);
  step5Renderer.outputColorSpace = THREE.SRGBColorSpace;
  chairPreviewEl.appendChild(step5Renderer.domElement);

  step5Controls = new OrbitControls(step5Camera, step5Renderer.domElement);
  step5Controls.enableDamping = true;
  step5Controls.enablePan = false;
  step5Controls.minDistance = 1.2;
  step5Controls.maxDistance = 5;

  const ambient = new THREE.AmbientLight(0xffffff, 2.0);
  step5Scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(2, 3, 4);
  step5Scene.add(dir);

  const loader = new GLTFLoader();
  loader.load(
    "/addChair.glb",
    (gltf) => {
      step5Model = gltf.scene;
      step5Scene.add(step5Model);

      const box = new THREE.Box3().setFromObject(step5Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      step5Model.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = step5Camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));

      cameraZ *= 1.4;
      frameObjectToCamera(step5Camera, step5Model, step5Controls);

      step5Camera.position.multiplyScalar(1.7);
      step5Camera.updateProjectionMatrix();
      step5Camera.lookAt(0, 0, 0);

      step5Controls.target.set(0, 0, 0);
      step5Controls.update();

    updateStep5ChairPreviewColor();

      
    },
    undefined,
    (err) => {
      console.error("[step5] failed to load /addChair.glb", err);
    }
  );

  const tick = () => {
    step5AnimFrame = requestAnimationFrame(tick);
    step5Controls?.update();
    step5Renderer?.render(step5Scene, step5Camera);
  };
  tick();
}
  function renderStep5() {
        if (viewOnly) {
      step = 4;
      renderStep();
      return;
    }
    const s = UI.step5;
    const prevRect = { x: 35, y: 551, w: 199, h: 63 };
    const prevIconRect = { x: 173, y: 562, w: 42, h: 42 };
    const nextRect = { x: 1074, y: 551, w: 199, h: 63 };
    const nextIconRect = { x: 1095, y: 562, w: 42, h: 42 };


    chairPreviewEl = document.createElement("div");
    Object.assign(chairPreviewEl.style, {
      position: "absolute",
      left: `${s.chairPreview.x}px`,
      top: `${s.chairPreview.y}px`,
      width: `${s.chairPreview.w}px`,
      height: `${s.chairPreview.h}px`,
      zIndex: "2",
      border: "0",
      background: "#fff",
      borderRadius: "18px",
      overflow: "hidden",
    });
    panelEl.appendChild(chairPreviewEl);

    mountStep5Preview();

    addText("您希望和多少人分享您的火鍋呢?", {
      x: s.title.x,
      y: s.title.y,
      size: 25,
      color: "#FD6FFF",
      z: 3,
    });

    const selectWrap = document.createElement("div");
    Object.assign(selectWrap.style, {
      position: "absolute",
      left: "860px",
      top: "250px",
      width: "180px",
      height: "54px",
      zIndex: "3",
    });
    panelEl.appendChild(selectWrap);

    const colorWrap = document.createElement("div");
    Object.assign(colorWrap.style, {
      position: "absolute",
      left: "860px",
      top: "330px",
      width: "180px",
      height: "54px",
      zIndex: "3",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    });
    panelEl.appendChild(colorWrap);

    const colorLabel = document.createElement("div");
    colorLabel.textContent = "椅子顏色";
    Object.assign(colorLabel.style, {
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color: "#FD6FFF",
      whiteSpace: "nowrap",
    });
    colorWrap.appendChild(colorLabel);

    const colorBtn = document.createElement("button");
    colorBtn.type = "button";
    Object.assign(colorBtn.style, {
      width: "54px",
      height: "54px",
      borderRadius: "999px",
      border: "transparent",
      background: chairColor,
      cursor: "pointer",
      padding: "0",
      flexShrink: "0",
    });
    colorWrap.appendChild(colorBtn);

        const chairColorPopover = createColorPopover({
      panelEl,
      anchorRect: { x: 914, y: 330, w: 54, h: 54 },
      initialColor: chairColor,
      onChange: (nextColor) => {
        chairColor = nextColor;
        colorBtn.style.background = chairColor;
        updateStep5ChairPreviewColor();
      },
      presetColors: [
        "#E8F25A",
        "#FD6FFF",
        "#1248FF",
        "#FFFFFF",
        "#000000",
        "#FF8A65",
        "#7ED957",
        "#B388FF",
      ],
    });

    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chairColorPopover.toggle();
    });

    const selectEl = document.createElement("select");
    Object.assign(selectEl.style, {
      width: "100%",
      height: "100%",
      border: "2px solid #FD6FFF",
      borderRadius: "0px",
      background: "#fff",
      color: "#FD6FFF",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "24px",
      padding: "0 14px",
      outline: "none",
      appearance: "none",
      WebkitAppearance: "none",
      cursor: "pointer",
    });

    for (let i = 1; i <= 100; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === chairCount) opt.selected = true;
      selectEl.appendChild(opt);
    }

    selectEl.addEventListener("change", (e) => {
      chairCount = Number(e.target.value);
    });

    selectWrap.appendChild(selectEl);

    const arrow = document.createElement("div");
    arrow.textContent = "▼";
    Object.assign(arrow.style, {
      position: "absolute",
      right: "16px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#FD6FFF",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "28px",
      pointerEvents: "none",
    });
    selectWrap.appendChild(arrow);

    addActionButton({
      rect: prevRect,
      label: "回到火鍋",
      iconSrc: ASSETS.leftArrow,
      iconRect: prevIconRect,
      textOffsetX: -16,
      onClick: () => {
        step = 4;
        renderStep();
      },
    });

    addActionButton({
      rect: nextRect,
      label: "繼續宴會",
      iconSrc: ASSETS.rightArrow,
      iconRect: nextIconRect,
      textOffsetX: 12,
      onClick: () => {
      console.log("[step5 click] finalize", {
        tableId: activeTableId,
        chairCount,
        finalPotTextureUrl,
        placements: [...composePlacements],
        hasOnFinalizePot: typeof onFinalizePot === "function",
      });


      const outputTableState = buildOutputTableState();

      if (typeof onFinalizePot === "function") {
        onFinalizePot({
          tableId: activeTableId,
          tableState: outputTableState,
          finalPotTextureUrl,
          placements: [...composePlacements],
          chairCount,
          chairColor,
        });
      } else {
        requestClose();
      }
      },
    });
  }

  function getState() {
    return {
      isOpen: openFlag,
      tableId: activeTableId,
      step,
      ballsCount: balls.length,
      ingredientsCount: ingredients.length,
      activeBallId,
      activeIngredientId,
      composeMode,
      finalPotTextureUrl,
      chairCount,
      chairColor,
      initialized: currentTableState?.initialized ?? false,
      viewOnly,
      ownerTableId,
    };
  }

  function getPlacements() {
    return composePlacements;
  }

  return {
    open,
    close,
    isOpen,
    getState,
    getPlacements,
  };
}