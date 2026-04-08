// /src/input/mobileInput.js

export function initMobileInput({
  keys,
  enqueueAction,
  ACTION,
  getState,
  isUiOpen = () => false,
  onLook = null,
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

  const IS_MOBILE_QUERY = "(pointer: coarse)";
  let forceVisible = true;

  function isActuallyMobile() {
    return window.matchMedia(IS_MOBILE_QUERY).matches;
  }

  function shouldShow() {
    return isActuallyMobile() && forceVisible;
  }

  // =========================
  // shared stick builder
  // =========================
  function makeStick({
    side = "left",
    size = 104,
    knobSize = 44,
    bottom = 22,
    sideOffset = 22,
  }) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute",
      width: `${size}px`,
      height: `${size}px`,
      bottom: `${bottom}px`,
      borderRadius: "999px",
      background: "rgba(255,255,255,0.10)",
      border: "2px solid rgba(255,255,255,0.18)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
      pointerEvents: "auto",
      touchAction: "none",
      [side]: `${sideOffset}px`,
    });

    const knob = document.createElement("div");
    Object.assign(knob.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: `${knobSize}px`,
      height: `${knobSize}px`,
      borderRadius: "999px",
      transform: "translate(-50%, -50%)",
      background: "rgba(255,255,255,0.82)",
      boxShadow: "0 6px 16px rgba(0,0,0,0.14)",
      pointerEvents: "none",
    });

    wrap.appendChild(knob);
    root.appendChild(wrap);

    const state = {
      pointerId: null,
      active: false,
      centerX: 0,
      centerY: 0,
      radius: Math.round((size - knobSize) * 0.5),
      x: 0,
      y: 0,
    };

    function refreshGeometry() {
      const rect = wrap.getBoundingClientRect();
      state.centerX = rect.left + rect.width / 2;
      state.centerY = rect.top + rect.height / 2;
    }

    function applyVisual(nx, ny) {
      const px = nx * state.radius;
      const py = ny * state.radius;
      knob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    }

    function updateFromPointer(clientX, clientY) {
      const dx = clientX - state.centerX;
      const dy = clientY - state.centerY;

      const dist = Math.hypot(dx, dy) || 1;
      const max = state.radius;
      const clamped = Math.min(dist, max);

      const nx = (dx / dist) * (clamped / max);
      const ny = (dy / dist) * (clamped / max);

      state.x = nx;
      state.y = ny;

      applyVisual(nx, ny);
      return { nx, ny };
    }

    function reset() {
      state.pointerId = null;
      state.active = false;
      state.x = 0;
      state.y = 0;
      applyVisual(0, 0);
    }

    wrap.addEventListener("pointerdown", (e) => {
      if (!shouldShow()) return;
      if (state.pointerId !== null) return;

      refreshGeometry();
      state.pointerId = e.pointerId;
      state.active = true;
      wrap.setPointerCapture?.(e.pointerId);
      updateFromPointer(e.clientX, e.clientY);

      e.preventDefault();
      e.stopPropagation();
    });

    wrap.addEventListener("pointermove", (e) => {
      if (!state.active) return;
      if (e.pointerId !== state.pointerId) return;

      updateFromPointer(e.clientX, e.clientY);

      e.preventDefault();
      e.stopPropagation();
    });

    function end(e) {
      if (e.pointerId !== state.pointerId) return;
      reset();

      e.preventDefault();
      e.stopPropagation();
    }

    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
    wrap.addEventListener("lostpointercapture", () => {
      reset();
    });

    return {
      wrap,
      knob,
      state,
      refreshGeometry,
      updateFromPointer,
      reset,
    };
  }

  // =========================
  // left move stick
  // =========================
  const moveStick = makeStick({
    side: "left",
    size: 104,
    knobSize: 44,
    bottom: 22,
    sideOffset: 22,
  });

  function resetMoveKeys() {
    keys.forward = false;
    keys.back = false;
    keys.left = false;
    keys.right = false;
    if ("boost" in keys) keys.boost = false;
  }

  function applyMoveToKeys(nx, ny) {
    const DEAD = 0.22;

    keys.left = nx < -DEAD;
    keys.right = nx > DEAD;
    keys.forward = ny < -DEAD;
    keys.back = ny > DEAD;
  }

  moveStick.wrap.addEventListener("pointerdown", (e) => {
    const { nx, ny } = moveStick.updateFromPointer(e.clientX, e.clientY);
    applyMoveToKeys(nx, ny);
  });

  moveStick.wrap.addEventListener("pointermove", (e) => {
    if (e.pointerId !== moveStick.state.pointerId) return;
    const { nx, ny } = moveStick.updateFromPointer(e.clientX, e.clientY);
    applyMoveToKeys(nx, ny);
  });

  function resetMoveStickAndKeys() {
    moveStick.reset();
    resetMoveKeys();
  }

  moveStick.wrap.addEventListener("pointerup", (e) => {
    if (e.pointerId !== moveStick.state.pointerId) return;
    resetMoveStickAndKeys();
  });

  moveStick.wrap.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== moveStick.state.pointerId) return;
    resetMoveStickAndKeys();
  });

  moveStick.wrap.addEventListener("lostpointercapture", () => {
    resetMoveStickAndKeys();
  });

  moveStick.wrap.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enqueueAction(ACTION.JUMP);
  });

  // =========================
  // right look stick
  // =========================
  const lookStick = makeStick({
    side: "right",
    size: 104,
    knobSize: 44,
    bottom: 22,
    sideOffset: 22,
  });
  let lookAxisLock = null; // "x" | "y" | null

  function emitLook(nx, ny) {
    if (typeof onLook !== "function") return;

    const DEAD = 0.14;
    const AXIS_LOCK_THRESHOLD = 0.18;

    let x = Math.abs(nx) < DEAD ? 0 : nx;
    let y = Math.abs(ny) < DEAD ? 0 : ny;

    if (x === 0 && y === 0) return;

    // 還沒鎖軸時，先決定這次拖曳要走水平還是垂直
    if (!lookAxisLock) {
      if (Math.abs(x) < AXIS_LOCK_THRESHOLD && Math.abs(y) < AXIS_LOCK_THRESHOLD) {
        return;
      }

      lookAxisLock = Math.abs(x) > Math.abs(y) ? "x" : "y";
    }

    if (lookAxisLock === "x") {
      y = 0;
    } else if (lookAxisLock === "y") {
      x = 0;
    }

    onLook(x, y);
  }

  lookStick.wrap.addEventListener("pointerdown", (e) => {
    const { nx, ny } = lookStick.updateFromPointer(e.clientX, e.clientY);
    emitLook(nx, ny);
  });

  lookStick.wrap.addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookStick.state.pointerId) return;
    const { nx, ny } = lookStick.updateFromPointer(e.clientX, e.clientY);
    emitLook(nx, ny);
  });

  function resetLookStick() {
    lookStick.reset();
    lookAxisLock = null;
  }

  lookStick.wrap.addEventListener("pointerup", (e) => {
    if (e.pointerId !== lookStick.state.pointerId) return;
    resetLookStick();
  });

  lookStick.wrap.addEventListener("pointercancel", (e) => {
    if (e.pointerId !== lookStick.state.pointerId) return;
    resetLookStick();
  });

  lookStick.wrap.addEventListener("lostpointercapture", () => {
    resetLookStick();
  });

  // =========================
  // contextual buttons
  // =========================
  function makeBtn(label, {
    width = 56,
    height = 56,
    bg = "#ffffff",
    color = "#1248FF",
    fontSize = 15,
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
      boxShadow: "0 10px 22px rgba(0,0,0,0.14)",
      pointerEvents: "auto",
      touchAction: "manipulation",
      userSelect: "none",
      WebkitUserSelect: "none",
      cursor: "pointer",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
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
    width: 66,
    height: 66,
    bg: "#FD6FFF",
    color: "#ffffff",
    fontSize: 17,
  });

  const cancelBtn = makeBtn("返回", {
    width: 54,
    height: 54,
    bg: "#ffffff",
    color: "#1248FF",
    fontSize: 15,
  });

  const confirmBtn = makeBtn("確認", {
    width: 54,
    height: 54,
    bg: "#ffffff",
    color: "#1248FF",
    fontSize: 15,
  });

  Object.assign(interactBtn.style, {
    position: "absolute",
    left: "50%",
    bottom: "34px",
    transform: "translateX(-50%)",
  });

  Object.assign(cancelBtn.style, {
    position: "absolute",
    left: "50%",
    bottom: "34px",
    transform: "translateX(calc(-50% - 78px))",
  });

  Object.assign(confirmBtn.style, {
    position: "absolute",
    left: "50%",
    bottom: "34px",
    transform: "translateX(calc(-50% + 78px))",
  });

  root.appendChild(interactBtn);
  root.appendChild(cancelBtn);
  root.appendChild(confirmBtn);
  interactBtn.style.display = "none";

  function safeEnqueue(type) {
    enqueueAction(type);
    updateVisibility();
  }

  interactBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[mobileInput] interactBtn disabled");
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

  // =========================
  // visibility / lifecycle
  // =========================
  function updateVisibility() {
    const visible = shouldShow();
    const uiOpen = !!isUiOpen();

    root.style.display = visible ? "block" : "none";
    root.style.pointerEvents = visible ? "auto" : "none";
    root.style.opacity = visible ? "1" : "0";

    // 預設不常駐
    interactBtn.style.display = "none";
    cancelBtn.style.display = "none";
    confirmBtn.style.display = "none";

    // 只有 mobile input 本身可見時，才考慮顯示按鈕
    if (!visible) return;

    // 如果你之後想保留 UI 開著時的返回/確認，也可以留
    // 但你現在想要 pot UI 完整不被擋到，所以建議直接不要顯示
    if (uiOpen) {
      // 先全部隱藏，避免和 pot UI 打架
      cancelBtn.style.display = "none";
      confirmBtn.style.display = "none";
    }
  }
  function setVisible(visible) {
    forceVisible = !!visible;

    if (!forceVisible) {
      resetMoveStickAndKeys();
      resetLookStick();
    }

    updateVisibility();
  }

  function onResize() {
    moveStick.refreshGeometry();
    lookStick.refreshGeometry();
    updateVisibility();
  }

  root.addEventListener(
    "touchmove",
    (e) => {
      if (shouldShow()) e.preventDefault();
    },
    { passive: false }
  );

  root.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  mount.appendChild(root);
  onResize();

  return {
    root,
    update: updateVisibility,
    setVisible,

    setInteractVisible() {
      interactBtn.style.display = "none";
    },

    destroy() {
      resetMoveStickAndKeys();
      resetLookStick();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      root.remove();
    },
  };
}