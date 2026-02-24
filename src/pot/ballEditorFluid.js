export function createBallEditorFluid({
  rootEl,         // 目前未使用，先保留
  getTableId,
  getFluidCanvas, // () => HTMLCanvasElement
  data,           // potData（務必是同一個單例，不要每次 createPotData()）
  ui,             // { ballListEl, emptyTextEl }
}) {
  const THUMB = 52; // 你要 56 就改這裡

  function styleBallRow(el) {
    el.style.width = "100%";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "12px";
    el.style.padding = "8px";
    el.style.borderRadius = "12px";
    el.style.background = "transparent";
    el.style.border = "0";
    el.style.cursor = "pointer";
    el.style.textAlign = "left";
    el.style.appearance = "none";
    el.style.webkitAppearance = "none";
  }

  function styleBallRowActive(el) {
    el.style.background = "rgba(255,92,255,0.12)";
  }

  function styleBallThumb(img) {
    img.style.width = `${THUMB}px`;
    img.style.height = `${THUMB}px`;
    img.style.borderRadius = "999px";
    img.style.objectFit = "cover";
    img.style.border = "2px solid rgba(255,92,255,0.35)";
    img.style.flex = "0 0 auto";
    img.style.display = "block";
  }

  function styleBallLabel(el) {
    el.style.fontSize = "18px";
    el.style.color = "#ff5cff";
    el.style.fontFamily = "ui-sans-serif, system-ui";
    el.style.lineHeight = "1.2";
  }

  function renderBallList() {
    const tableId = getTableId?.();
    if (!tableId) return;

    const st = data.getState(tableId);

    ui.ballListEl.innerHTML = "";

    if (!st.balls.length) {
      ui.emptyTextEl.style.display = "block";
      return;
    }
    ui.emptyTextEl.style.display = "none";

    for (const ball of st.balls) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pot-ball-row";
      row.dataset.ballId = ball.id;
      styleBallRow(row);

      const thumb = document.createElement("img");
      thumb.className = "pot-ball-thumb";
      styleBallThumb(thumb);
      thumb.src = ball.previewDataURL;

      const label = document.createElement("div");
      label.className = "pot-ball-label";
      styleBallLabel(label);
      label.textContent = ball.name || ball.id;

      row.appendChild(thumb);
      row.appendChild(label);

      row.addEventListener("click", () => {
        data.setActiveBall(tableId, ball.id);
        renderBallList();
      });

      if (st.activeBallId === ball.id) {
        row.classList.add("is-active");
        styleBallRowActive(row);
      }

      ui.ballListEl.appendChild(row);
    }
  }

  function storeSnapshot(name = "") {
    const tableId = getTableId?.();
    if (!tableId) return null;

    const canvas = getFluidCanvas?.();
    if (!canvas) {
      console.warn("[pot] missing fluid canvas");
      return null;
    }

    // ✅ 圓形縮圖請統一交給 data.createBallFromCanvas 內部處理
    // previewSize 建議 >= THUMB*2（例如 96）縮放比較不糊
    const ball = data.createBallFromCanvas(tableId, canvas, { name, previewSize: 96 });

    renderBallList();
    return ball;
  }

  return {
    renderBallList,
    storeSnapshot,
  };
}