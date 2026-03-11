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
  // 0=intro, 1=soup blocks, 2=ingredients, 3=compose pot, 4=3d preview, 5=chairs
  let step = 0;

  // soup blocks (old balls)
  const balls = [];
  let activeBallId = null;

  // ingredient pngs
  const ingredients = [];
  let activeIngredientId = null;

  // shared data store
  const potData = createPotData();

  // step1 fluid
  let fluidMountEl = null;
  let fluidCtrl = null;
  let fluidColor = "#ff5cff";
  let ballEditor = null;

  // step2 ingredient drawing
  let ingredientCanvas = null;
  let ingredientCtx = null;
  let ingredientBrushColor = "#ff5cff";
  let ingredientBrushSize = 22;
  let ingredientDrawing = false;
  let ingredientLastPoint = null;
  let ingredientPreviewImgUrl = null;

  // step3 composition
  let potCanvas = null;
  let potCtx = null;
  let composeMode = "soup"; // soup | ingredient | cut | delete
  let cutDrawing = false;
  let cutPath = [];
  let cutLines = [];
  let step3Bound = false;

  // 3d preview placeholders (mount points only for now)
  let step4PreviewEl = null;
  let chairPreviewEl = null;

  // exported / final texture cache
  let finalPotTextureUrl = null;

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
      soupListTitle: { x: 83, y: 95 },
      ingList: { x: 971, y: 68, w: 272, h: 518 },
      ingListTitle: { x: 992, y: 95 },
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
      preview: { x: 504, y: 140, w: 300, h: 345 },
      nextBtn: { x: 1158, y: 551, w: 199, h: 63 },
      nextIcon: { x: 1180, y: 562, w: 42, h: 42 },
      nextText: { x: 1225, y: 570 },
      prevBtn: { x: 164, y: 551, w: 199, h: 63 },
      prevIcon: { x: 302, y: 562, w: 42, h: 42 },
      prevText: { x: 186, y: 570 },
    },

    step5: {
      chairPreview: { x: 145, y: 95, w: 440, h: 360 },
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

  function requestClose() {
    if (typeof onRequestClose === "function") onRequestClose();
    else close();
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    activeTableId = null;
    step = 0;
    activeBallId = null;
    activeIngredientId = null;

    unmountFluidEditor();

    if (overlayEl?.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    panelEl = null;

    potCanvas = null;
    potCtx = null;
    ingredientCanvas = null;
    ingredientCtx = null;
    step4PreviewEl = null;
    chairPreviewEl = null;

    window.removeEventListener("keydown", onKeyDownWhileOpen, true);
    if (typeof onClose === "function") onClose();
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
    dim.addEventListener("click", requestClose);
    overlayEl.appendChild(dim);

    panelEl = document.createElement("div");
    Object.assign(panelEl.style, {
      position: "relative",
      width: `${UI.overlayW}px`,
      height: `${UI.overlayH}px`,
      background: "#ffffff",
      borderRadius: "24px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
      overflow: "hidden",
    });
    overlayEl.appendChild(panelEl);

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
  }

  function renderStep() {
    if (!panelEl) return;
    if (step !== 1) unmountFluidEditor();
    clearPanel();

    if (step === 0) return renderStep0();
    if (step === 1) return renderStep1();
    if (step === 2) return renderStep2();
    if (step === 3) return renderStep3();
    if (step === 4) return renderStep4();
    if (step === 5) return renderStep5();
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

  function addLabelChip(text, { x, y, w = 90, h = 33, bg = "#EAEAEA", color = "#000" }) {
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
      zIndex: "3",
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
    });
    chip.appendChild(t);
    return chip;
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
    if (!fluidMountEl || fluidCtrl) return;
    fluidCtrl = createFluidPavel({
      mountEl: fluidMountEl,
      width: UI.step1.fluid.w,
      height: UI.step1.fluid.h,
      color: fluidColor,
    });
  }

  function unmountFluidEditor() {
    if (fluidCtrl?.destroy) fluidCtrl.destroy();
    fluidCtrl = null;
    if (fluidMountEl) fluidMountEl.innerHTML = "";
    fluidMountEl = null;
  }

  function renderHorizontalSoupList(rect) {
    addText("湯塊區", { x: rect.x, y: rect.y, size: 20, z: 3 });

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
        border: ball.id === activeBallId ? "3px solid #1248FF" : "2px solid #FD6FFF",
        background: "#fff",
        padding: "0",
        cursor: "pointer",
      });
      item.addEventListener("click", () => {
        activeBallId = ball.id;
        composeMode = "soup";
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
    addText("製作湯塊", { x: s.title.x, y: s.title.y, size: 25, z: 3 });

    // center fluid mount
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
      background: "#fff",
    });
    panelEl.appendChild(fluidMountEl);
    mountFluidEditor();

    // controls shown as image buttons; functionality intentionally minimal for now
    addImageButton(ASSETS.colorPicker, s.colorBtn, {
      onClick: () => console.log("[step1] color picker ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.material, s.materialBtn, {
      onClick: () => console.log("[step1] material picker ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.brushSize, s.brushBtn, {
      onClick: () => console.log("[step1] brush size ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.eraser, s.eraserBtn, {
      onClick: () => console.log("[step1] eraser ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.finger, s.fingerBtn, {
      onClick: () => console.log("[step1] finger ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });

    const nameInput = addRoundedInput({ x: s.nameInput.x, y: s.nameInput.y, w: s.nameInput.w, h: s.nameInput.h, placeholder: "" });
    addText("命名湯塊", { x: 700, y: 301, size: 20, z: 4 });

    addCapsuleButton({ x: s.confirmBtn.x, y: s.confirmBtn.y, w: s.confirmBtn.w, h: s.confirmBtn.h, bg: "#EAEAEA", border: "2px solid #EAEAEA", onClick: () => {
      const nm = nameInput.value.trim() || `湯塊 ${balls.length + 1}`;
      const ball = ballEditor?.storeSnapshot?.(nm);
      if (!ball) return;
      activeBallId = ball.id;
      nameInput.value = "";
      renderStep();
    }});
    addImg(ASSETS.confirm, { ...s.confirmIcon, z: 4 });

    addCapsuleButton({ x: s.deleteBtn.x, y: s.deleteBtn.y, w: s.deleteBtn.w, h: s.deleteBtn.h, bg: "#EAEAEA", border: "2px solid #EAEAEA", onClick: () => {
      if (!balls.length) return;
      const idx = activeBallId ? balls.findIndex((b) => b.id === activeBallId) : 0;
      const removeAt = idx >= 0 ? idx : 0;
      const [removed] = balls.splice(removeAt, 1);
      if (removed?.id === activeBallId) activeBallId = balls[0]?.id ?? null;
      renderStep();
    }});
    addImg(ASSETS.delete, { ...s.deleteIcon, z: 4 });

    // keep using existing data flow
    const hiddenBallList = document.createElement("div");
    const hiddenEmpty = document.createElement("div");
    hiddenBallList.style.display = "none";
    hiddenEmpty.style.display = "none";
    panelEl.appendChild(hiddenBallList);
    panelEl.appendChild(hiddenEmpty);

    ballEditor = createBallEditorFluid({
      getTableId: () => activeTableId,
      getFluidCanvas: () => fluidCtrl?.canvas,
      data: potData,
      ui: { ballListEl: hiddenBallList, emptyTextEl: hiddenEmpty },
    });

    // sync balls[] with potData render source if needed, but still draw our own list from balls array
    renderHorizontalSoupList(s.listFrame);

    addActionButton({
      rect: s.nextBtn,
      label: "製作配料",
      iconSrc: ASSETS.rightArrow,
      iconRect: s.nextIcon,
      textOffsetX: 14,
      onClick: () => {
        step = 2;
        renderStep();
      },
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
    ingredientCtx.strokeStyle = ingredientBrushColor;
    ingredientCtx.lineWidth = ingredientBrushSize;
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

  function inflateIngredientPreview() {
    if (!ingredientCanvas) return null;
    const src = ingredientCanvas;
    const off = document.createElement("canvas");
    off.width = 312;
    off.height = 151;
    const ctx = off.getContext("2d");
    ctx.clearRect(0, 0, off.width, off.height);
    ctx.save();
    ctx.filter = "blur(1.2px)";
    ctx.drawImage(src, 0, 0, off.width, off.height);
    ctx.restore();
    ingredientPreviewImgUrl = off.toDataURL("image/png");
    return ingredientPreviewImgUrl;
  }

  function storeIngredient(name = "") {
    const previewUrl = ingredientPreviewImgUrl || inflateIngredientPreview();
    if (!previewUrl) return null;
    const item = {
      id: uuid(),
      name: name || `配料 ${ingredients.length + 1}`,
      previewUrl,
      createdAt: Date.now(),
    };
    ingredients.unshift(item);
    activeIngredientId = item.id;
    return item;
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

    if (ingredients.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "尚無配料";
      Object.assign(empty.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#666",
      });
      wrap.appendChild(empty);
      return wrap;
    }

    ingredients.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      Object.assign(btn.style, {
        width: "103px",
        height: "50px",
        minWidth: "103px",
        borderRadius: "12px",
        border: item.id === activeIngredientId ? "3px solid #1248FF" : "2px solid #FD6FFF",
        background: "#fff",
        padding: "0",
        cursor: "pointer",
        overflow: "hidden",
      });
      btn.addEventListener("click", () => {
        activeIngredientId = item.id;
        composeMode = "ingredient";
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

    addImageButton(ASSETS.colorPicker, s.colorBtn, {
      onClick: () => console.log("[step2] color picker ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.brushSize2, s.brushBtn, {
      onClick: () => console.log("[step2] brush size ui only"),
      border: "0",
      bg: "transparent",
      radius: 0,
    });
    addImageButton(ASSETS.eraser2, s.eraserBtn, {
      onClick: () => clearIngredientCanvas(),
      border: "0",
      bg: "transparent",
      radius: 0,
    });

    addImageButton(ASSETS.inflate, s.inflateBtn, {
      onClick: () => {
        inflateIngredientPreview();
        renderStep();
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

  if (ingredientPreviewImgUrl) {
    fitImgPreview(ingredientPreviewImgUrl, s.resultPreview, {
      objectFit: "contain",
      borderRadius: 18,
      z: 3,
    });
  }

  const nameWrap = document.createElement("div");
Object.assign(nameWrap.style, {
  position: "absolute",
  left: "964px",
  top: "260px",
  width: "326px",   // 191 + 60 + 60 + 間距
  height: "60px",
  zIndex: "3",
});
panelEl.appendChild(nameWrap);

// input frame
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

  // real input
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

// label text
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

// confirm button
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
  const item = storeIngredient(nm);
  if (!item) return;
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

// delete button
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
  if (!ingredients.length) return;
  const idx = activeIngredientId ? ingredients.findIndex((it) => it.id === activeIngredientId) : 0;
  const removeAt = idx >= 0 ? idx : 0;
  const [removed] = ingredients.splice(removeAt, 1);
  if (removed?.id === activeIngredientId) activeIngredientId = ingredients[0]?.id ?? null;
  renderStep();
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
    const img = new Image();
    img.src = ball.previewUrl;
    img.onload = () => redrawComposeCanvas();
    if (!img.complete) return;
    const r = 26;
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
    const img = new Image();
    img.src = item.previewUrl;
    img.onload = () => redrawComposeCanvas();
    if (!img.complete) return;
    ctx.drawImage(img, placement.x - 36, placement.y - 18, 72, 36);
  }

  const composePlacements = [];

  function redrawComposeCanvas() {
    if (!potCtx || !potCanvas) return;
    const s = potCanvas.width;

    potCtx.clearRect(0, 0, s, s);

    drawCircleMask(potCtx, s, () => {
      potCtx.fillStyle = "rgba(255,92,255,0.10)";
      potCtx.fillRect(0, 0, s, s);

      for (const p of composePlacements) {
        if (p.type === "soup") drawSoupPlacement(potCtx, p);
        if (p.type === "ingredient") drawIngredientPlacement(potCtx, p);
      }
    });

    // pot rim
    potCtx.beginPath();
    potCtx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    potCtx.strokeStyle = "transparent";
    potCtx.lineWidth = 0;
    potCtx.stroke();

    // cut lines are ALWAYS top-most
    potCtx.save();
    potCtx.beginPath();
    potCtx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    potCtx.clip();
    potCtx.strokeStyle = "rgba(0,0,0,0.95)";
    potCtx.lineWidth = 4;
    potCtx.lineCap = "round";
    potCtx.lineJoin = "round";
    for (const line of cutLines) strokePath(potCtx, line, true);
    if (cutPath.length >= 2) strokePath(potCtx, cutPath, true);
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

    if (composeMode === "soup") {
      if (!activeBallId) return;
      composePlacements.push({ type: "soup", itemId: activeBallId, x, y, createdAt: Date.now() });
      redrawComposeCanvas();
      return;
    }

    if (composeMode === "ingredient") {
      if (!activeIngredientId) return;
      composePlacements.push({ type: "ingredient", itemId: activeIngredientId, x, y, createdAt: Date.now() });
      redrawComposeCanvas();
      return;
    }

    if (composeMode === "delete") {
      if (!composePlacements.length) return;
      let bestIdx = -1;
      let bestD = Infinity;
      for (let i = 0; i < composePlacements.length; i++) {
        const p = composePlacements[i];
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestD < 40) {
        composePlacements.splice(bestIdx, 1);
        redrawComposeCanvas();
      }
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
    if (cutPath.length >= 2) cutLines.push([...cutPath]);
    cutPath = [];
    redrawComposeCanvas();
  }

  function renderVerticalList({ title, frame, items, activeId, getPreviewUrl, onSelect }) {
    addFrameBox({ x: frame.x, y: frame.y, w: frame.w, h: frame.h, bg: "#fff", border: "2px solid #FD6FFF", radius: 0, z: 1 });
    addText(title, { x: title === "湯塊區" ? UI.step3.soupListTitle.x : UI.step3.ingListTitle.x, y: title === "湯塊區" ? UI.step3.soupListTitle.y : UI.step3.ingListTitle.y, size: 20, color: "#1248FF", z: 3 });

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
        marginleft: "12px",
        marginTop: "12px",
      });
      wrap.appendChild(empty);
      return wrap;
    }

    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      Object.assign(btn.style, {
        width: "100%",
        height: "78px",
        borderRadius: "14px",
        border: item.id === activeId ? "3px solid #1248FF" : "2px solid #FD6FFF",
        background: "#fff",
        cursor: "pointer",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
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
      wrap.appendChild(btn);
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
      onSelect: (id) => {
        activeBallId = id;
        composeMode = "soup";
        renderStep();
      },
    });

    renderVerticalList({
      title: "配料區",
      frame: s.ingList,
      items: ingredients,
      activeId: activeIngredientId,
      getPreviewUrl: (item) => item.previewUrl,
      onSelect: (id) => {
        activeIngredientId = id;
        composeMode = "ingredient";
        renderStep();
      },
    });

    // controls
    addCapsuleButton({ x: s.controls.continueMake.x, y: s.controls.continueMake.y, w: 60, h: 60, bg: "#FFFFFF", border: "2px solid #FD6FFF", onClick: () => { step = 2; renderStep(); } });
    addImg(ASSETS.leftArrow, { x: s.controls.continueMake.x + 9, y: s.controls.continueMake.y + 9, w: 42, h: 42, z: 4 });
    addLabelChip("繼續製作", { x: s.controls.continueMake.x - 20, y: 551, w: 100, h: 33, color: "#1248FF" });

    addCapsuleButton({ x: s.controls.cut.x, y: s.controls.cut.y, w: 60, h: 60, bg: composeMode === "cut" ? "#FD6FFF" : "#EAEAEA", border: "0", onClick: () => { composeMode = "cut"; renderStep(); } });
    addImg(ASSETS.cut, { x: s.controls.cut.x + 4, y: s.controls.cut.y + 4, w: 52, h: 52, z: 4, rotate: 30 });
    addLabelChip("切割", { x: s.controls.cut.x - 1, y: 551, w: 62, h: 33, color: "#1248FF" });

    addCapsuleButton({ x: s.controls.restart.x, y: s.controls.restart.y, w: 60, h: 60, bg: "#EAEAEA", border: "0", onClick: () => {
      if (composePlacements.length) composePlacements.pop();
      else if (cutLines.length) cutLines.pop();
      redrawComposeCanvas();
    } });
    addImg(ASSETS.restart, { x: s.controls.restart.x + 9, y: s.controls.restart.y + 10, w: 45, h: 40, z: 4 });
    addLabelChip("上一步", { x: s.controls.restart.x - 10, y: 551, w: 82, h: 33, color: "#1248FF" });

    addCapsuleButton({ x: s.controls.delete.x, y: s.controls.delete.y, w: 60, h: 60, bg: composeMode === "delete" ? "#FD6FFF" : "#EAEAEA", border: "0", onClick: () => { composeMode = "delete"; renderStep(); } });
    addImg(ASSETS.delete, { x: s.controls.delete.x + 14, y: s.controls.delete.y + 10, w: 32, h: 40, z: 4 });
    addLabelChip("刪除", { x: s.controls.delete.x - 10, y: 551, w: 82, h: 33, color: "#1248FF" });

    addCapsuleButton({ x: s.controls.finish.x, y: s.controls.finish.y, w: 60, h: 60, bg: "#FFFFFF", border: "2px solid #FD6FFF",  onClick: () => {
      finalPotTextureUrl = exportFinalPotTexture();
      step = 4;
      renderStep();
    } });
    addImg(ASSETS.rightArrow, { x: s.controls.finish.x + 9, y: s.controls.finish.y + 9, w: 42, h: 42, z: 4 });
    addLabelChip("完成火鍋!", { x: s.controls.finish.x - 18, y: 551, w: 100, h: 33, color: "#1248FF" });
  }

  function exportFinalPotTexture() {
    if (!potCanvas) return null;
    return potCanvas.toDataURL("image/png");
  }

  // ---------- step4 3d preview ----------
  function renderStep4() {
    const s = UI.step4;
    const prevRect = { x: 35, y: 551, w: 199, h: 63 };
    const prevIconRect = { x: 173, y: 562, w: 42, h: 42 };
    const nextRect = { x: 1074, y: 551, w: 199, h: 63 };
    const nextIconRect = { x: 1095, y: 562, w: 42, h: 42 };
    

    addFrameBox({ x: s.soupList.x, y: s.soupList.y, w: s.soupList.w, h: s.soupList.h, bg: "#EAEAEA", border: "0", radius: 0, z: 1 });
    addFrameBox({ x: s.ingList.x, y: s.ingList.y, w: s.ingList.w, h: s.ingList.h, bg: "#EAEAEA", border: "0", radius: 0, z: 1 });

    renderPreviewListInBox({ box: s.soupList, items: balls, activeId: activeBallId, getPreviewUrl: (x) => x.previewUrl });
    renderPreviewListInBox({ box: s.ingList, items: ingredients, activeId: activeIngredientId, getPreviewUrl: (x) => x.previewUrl });

    step4PreviewEl = document.createElement("div");
    Object.assign(step4PreviewEl.style, {
      position: "absolute",
      left: `${s.preview.x}px`,
      top: `${s.preview.y}px`,
      width: `${s.preview.w}px`,
      height: `${s.preview.h}px`,
      zIndex: "2",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "18px",
      border: "2px dashed rgba(0,0,0,0.15)",
      overflow: "hidden",
      background: "#fff",
    });
    panelEl.appendChild(step4PreviewEl);

    const title = document.createElement("div");
    title.textContent = "pott.glb preview mount";
    Object.assign(title.style, {
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color: "#666",
      marginBottom: "12px",
    });
    step4PreviewEl.appendChild(title);

    if (finalPotTextureUrl) {
      const previewImg = document.createElement("img");
      previewImg.src = finalPotTextureUrl;
      Object.assign(previewImg.style, {
        width: "220px",
        height: "220px",
        objectFit: "contain",
      });
      step4PreviewEl.appendChild(previewImg);
    }

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

    if (!items.length) {
      const empty = document.createElement("div");
      empty.textContent = "尚無內容";
      Object.assign(empty.style, {
        fontFamily: '"zpix", ui-sans-serif, system-ui',
        fontSize: "18px",
        color: "#666",
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

  // ---------- step5 chair ----------
  function renderStep5() {
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
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "2px dashed rgba(0,0,0,0.15)",
      background: "#fff",
      borderRadius: "18px",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "22px",
      color: "#666",
    });
    chairPreviewEl.textContent = "addChair.glb preview mount";
    panelEl.appendChild(chairPreviewEl);

    addText("您希望和多少人分享您的火鍋呢?", {
      x: s.title.x,
      y: s.title.y,
      size: 25,
      color: "#FD6FFF",
      z: 3,
    });

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
        requestClose();
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