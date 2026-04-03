// /src/input/mobileInput.js

export function initMobileInput({
  keys,
  enqueueAction,
  ACTION,
  getState,
  isUiOpen = () => false,
  mount = document.body,
}) {
  if (!keys) throw new Error("[mobileInput] keys is required");
  if (!enqueueAction) throw new Error("[mobileInput] enqueueAction is required");
  if (!ACTION) throw new Error("[mobileInput] ACTION is required");

  const root = document.createElement("div");
  root.id = "mobile-input-root";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "20000",
    pointerEvents: "none",
    touchAction: "none",
  });

  // ---------- left joystick ----------
  const stickWrap = document.createElement("div");
  Object.assign(stickWrap.style, {
    position: "absolute",
    left: "24px",
    bottom: "24px",
    width: "150px",
    height: "150px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.12)",
    border: "2px solid rgba(255,255,255,0.22)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
    pointerEvents: "auto",
    touchAction: "none",
  });
  root.appendChild(stickWrap);

  const stickKnob = document.createElement("div");
  Object.assign(stickKnob.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "64px",
    height: "64px",
    borderRadius: "999px",
    transform: "translate(-50%, -50%)",
    background: "rgba(255,255,255,0.82)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    pointerEvents: "none",
  });
  stickWrap.appendChild(stickKnob);

  // ---------- right buttons ----------
  const rightWrap = document.createElement("div");
  Object.assign(rightWrap.style, {
    position: "absolute",
    right: "24px",
    bottom: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "12px",
    pointerEvents: "none",
  });
  root.appendChild(rightWrap);

  const rowBottom = document.createElement("div");
  Object.assign(rowBottom.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    pointerEvents: "none",
  });
  rightWrap.appendChild(rowBottom);

  const rowTop = document.createElement("div");
  Object.assign(rowTop.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    pointerEvents: "none",
  });
  rightWrap.appendChild(rowTop);

  function makeBtn(label, {
    width = 84,
    height = 84,
    bg = "#ffffff",
    color = "#1248FF",
    fontSize = 22,
    fontWeight = "700",
  } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    Object.assign(btn.style, {
      width: `${width}px`,
      height: `${height}px`,
      border: "0",
      borderRadius: "999px",
      background: bg,
      color,
      fontSize: `${fontSize}px`,
      fontWeight,
      boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
      pointerEvents: "auto",
      touchAction: "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none",
      cursor: "pointer",
    });

    btn.addEventListener("pointerdown", () => {
      btn.style.transform = "scale(0.96)";
    });
    const reset = () => {
      btn.style.transform = "scale(1)";
    };
    btn.addEventListener("pointerup", reset);
    btn.addEventListener("pointercancel", reset);
    btn.addEventListener("pointerleave", reset);

    return btn;
  }

  const interactBtn = makeBtn("互動", {
    width: 94,
    height: 94,
    bg: "#FD6FFF",
    color: "#ffffff",
    fontSize: 20,
  });

  const cancelBtn = makeBtn("返回", {
    width: 78,
    height: 78,
    bg: "#ffffff",
    color: "#1248FF",
    fontSize: 18,
  });

  const confirmBtn = makeBtn("確認", {
    width: 78,
    height: 78,
    bg: "#ffffff",
    color: "#1248FF",
    fontSize: 18,
  });

  rowBottom.appendChild(cancelBtn);
  rowBottom.appendChild(interactBtn);
  rowTop.appendChild(confirmBtn);

  // ---------- helpers ----------
  function resetMoveKeys() {
    keys.forward = false;
    keys.back = false;
    keys.left = false;
    keys.right = false;
    if ("boost" in keys) keys.boost = false;
  }

  function isActuallyMobile() {
    return window.matchMedia("(pointer: coarse)").matches;
  }

  function shouldShow() {
    return isActuallyMobile();
  }

  function updateVisibility() {
    root.style.display = shouldShow() ? "block" : "none";

    const uiOpen = !!isUiOpen();
    confirmBtn.style.display = uiOpen ? "inline-flex" : "none";
  }

  // ---------- joystick logic ----------
  let stickPointerId = null;
  let stickActive = false;
  const stickState = {
    centerX: 0,
    centerY: 0,
    radius: 54,
    x: 0,
    y: 0,
  };

  function refreshStickGeometry() {
    const rect = stickWrap.getBoundingClientRect();
    stickState.centerX = rect.left + rect.width / 2;
    stickState.centerY = rect.top + rect.height / 2;
  }

  function applyStickVisual(nx, ny) {
    const px = nx * stickState.radius;
    const py = ny * stickState.radius;
    stickKnob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
  }

  function applyStickToKeys(nx, ny) {
    const DEAD = 0.22;

    keys.left = nx < -DEAD;
    keys.right = nx > DEAD;
    keys.forward = ny < -DEAD;
    keys.back = ny > DEAD;
  }

  function updateStickFromPointer(clientX, clientY) {
    const dx = clientX - stickState.centerX;
    const dy = clientY - stickState.centerY;

    const dist = Math.hypot(dx, dy) || 1;
    const max = stickState.radius;
    const clamped = Math.min(dist, max);

    const nx = (dx / dist) * (clamped / max);
    const ny = (dy / dist) * (clamped / max);

    stickState.x = nx;
    stickState.y = ny;

    applyStickVisual(nx, ny);
    applyStickToKeys(nx, ny);
  }

  function resetStick() {
    stickPointerId = null;
    stickActive = false;
    stickState.x = 0;
    stickState.y = 0;
    applyStickVisual(0, 0);
    resetMoveKeys();
  }

  stickWrap.addEventListener("pointerdown", (e) => {
    if (!shouldShow()) return;
    if (stickPointerId !== null) return;

    refreshStickGeometry();
    stickPointerId = e.pointerId;
    stickActive = true;
    stickWrap.setPointerCapture?.(e.pointerId);
    updateStickFromPointer(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  });

  stickWrap.addEventListener("pointermove", (e) => {
    if (!stickActive) return;
    if (e.pointerId !== stickPointerId) return;
    updateStickFromPointer(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  });

  function endStick(e) {
    if (e.pointerId !== stickPointerId) return;
    resetStick();
    e.preventDefault();
    e.stopPropagation();
  }

  stickWrap.addEventListener("pointerup", endStick);
  stickWrap.addEventListener("pointercancel", endStick);
  stickWrap.addEventListener("lostpointercapture", () => {
    resetStick();
  });

  // ---------- buttons ----------
  function safeEnqueue(type) {
    enqueueAction(type);
    updateVisibility();
  }

  interactBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    safeEnqueue(ACTION.SELECT);
  });

  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    safeEnqueue(ACTION.CANCEL);
  });

  confirmBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    safeEnqueue(ACTION.CONFIRM);
  });

  // optional: double tap joystick area to jump
  stickWrap.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    safeEnqueue(ACTION.JUMP);
  });

  // ---------- prevent accidental page gestures ----------
  root.addEventListener("touchmove", (e) => {
    if (shouldShow()) e.preventDefault();
  }, { passive: false });

  root.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // ---------- lifecycle ----------
  function onResize() {
    refreshStickGeometry();
    updateVisibility();
  }

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  mount.appendChild(root);
  refreshStickGeometry();
  updateVisibility();

  const api = {
    root,
    update: updateVisibility,
    destroy() {
      resetStick();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      root.remove();
    },
  };

  return api;
}