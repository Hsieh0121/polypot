// src/pot/potData.js

function uuid() {
  // 不依賴外部 lib 的簡易 uuid
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

export function createPotData() {
  // per-table storage
  const tables = new Map(); // tableId -> { balls: [], placements: [] }

  function ensureTable(tableId) {
    if (!tables.has(tableId)) {
      tables.set(tableId, {
        balls: [],        // ball[]
        placements: [],   // Step2 preview placements
        activeBallId: null,
      });
    }
    return tables.get(tableId);
  }

  function getState(tableId) {
    return ensureTable(tableId);
  }

  function addBall(tableId, ball) {
    const t = ensureTable(tableId);
    t.balls.push(ball);
    if (!t.activeBallId) t.activeBallId = ball.id;
    return ball;
  }

  function createBallFromCanvas(tableId, canvas, { name = "", previewSize = 96 } = {}) {
    const id = uuid();
    const createdAt = Date.now();

    // ✅ 改這行：存「圓形縮圖」而不是整張方形
    const dataURL = canvasToCircleDataURL(canvas, previewSize);

    const ball = {
        id,
        name: name || `ball_${tShort(createdAt)}`,
        previewDataURL: dataURL,
        createdAt,
    };

    addBall(tableId, ball);
    return ball;
  }
  function canvasToCircleDataURL(srcCanvas, outSize = 96) {
    const out = document.createElement("canvas");
    out.width = outSize;
    out.height = outSize;

    const ctx = out.getContext("2d");
    const r = outSize / 2;

    // 圓形 clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip();

    // cover：把 srcCanvas 等比縮放塞滿 out
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const scale = Math.max(outSize / sw, outSize / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (outSize - dw) / 2;
    const dy = (outSize - dh) / 2;

    ctx.drawImage(srcCanvas, dx, dy, dw, dh);
    ctx.restore();

    return out.toDataURL("image/png");
  }

  function setActiveBall(tableId, ballId) {
    const t = ensureTable(tableId);
    t.activeBallId = ballId;
  }

  function getActiveBall(tableId) {
    const t = ensureTable(tableId);
    return t.balls.find(b => b.id === t.activeBallId) ?? null;
  }

  function addPlacement(tableId, placement) {
    // placement: { ballId, x, y } in canvas pixel space
    const t = ensureTable(tableId);
    t.placements.push(placement);
  }

  function tShort(ms) {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}${mm}${ss}`;
  }

  return {
    getState,
    createBallFromCanvas,
    setActiveBall,
    getActiveBall,
    addPlacement,
  };
}