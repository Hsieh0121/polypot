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

  function isActuallyMobile() {
    return window.matchMedia(IS_MOBILE_QUERY).matches;
  }

  function shouldShow() {
    return isActuallyMobile();
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

  function emitLook(nx, ny) {
    if (typeof onLook !== "function") return;

    const DEAD = 0.10;
    const x = Math.abs(nx) < DEAD ? 0 : nx;
    const y = Math.abs(ny) < DEAD ? 0 : ny;

    if (x === 0 && y === 0) return;
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

  // =========================
  // visibility / lifecycle
  // =========================
  function updateVisibility() {
    root.style.display = shouldShow() ? "block" : "none";

    const uiOpen = !!isUiOpen();

    // 預設不常駐
    interactBtn.style.display = "none";
    cancelBtn.style.display = "none";
    confirmBtn.style.display = "none";

    // 只有 UI 開啟時才顯示返回 / 確認
    if (uiOpen) {
      cancelBtn.style.display = "inline-flex";
      confirmBtn.style.display = "inline-flex";
    }
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

    // 之後 hall 若要情境式顯示互動鍵，可以直接 call 這個
    setInteractVisible(visible) {
      interactBtn.style.display = visible && shouldShow() ? "inline-flex" : "none";
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