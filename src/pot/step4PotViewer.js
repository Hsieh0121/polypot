/**
 * step4PotViewer.js
 *
 * Step4 的 3D 鍋子預覽模組。
 * 用法：
 *
 *   import { createStep4PotViewer } from "./step4PotViewer.js";
 *
 *   const viewer = createStep4PotViewer({
 *     mountEl: step4PreviewEl,       // DOM 容器
 *     glbUrl: "/pott.glb",           // GLB 路徑
 *     textureUrl: finalPotTextureUrl, // potCanvas.toDataURL() 輸出
 *   });
 *
 *   // 之後要銷毀（例如離開 step4 時）：
 *   viewer.destroy();
 *
 * ----------
 * 依賴：Three.js r128（CDN 版或本地 node_modules 皆可）
 *   import * as THREE from "three";
 *   import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
 *   import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
 *
 * 如果你的專案是用 CDN importmap，改 import 路徑即可。
 * ----------
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl       - 掛載目標容器（任意尺寸都可以）
 * @param {string}      opts.glbUrl        - pott.glb 的 URL
 * @param {string|null} opts.textureUrl    - finalPotTextureUrl（dataURL 或 blob URL）
 *                                           傳 null 代表還沒有 texture，只渲染模型
 * @param {string}      [opts.bgColor]     - 場景背景色，預設透明
 * @param {boolean}     [opts.autoRotate]  - 是否預設自動旋轉，預設 false
 */
export function createStep4PotViewer({
  mountEl,
  glbUrl,
  textureUrl = null,
  bgColor = null,
  autoRotate = false,
} = {}) {
  if (!mountEl) throw new Error("[step4PotViewer] mountEl is required");
  if (!glbUrl)  throw new Error("[step4PotViewer] glbUrl is required");

  // ─── 尺寸 ───────────────────────────────────────────────
  const getSize = () => ({
    w: mountEl.clientWidth  || 300,
    h: mountEl.clientHeight || 300,
  });

  // ─── Renderer ───────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: bgColor === null,          // 無背景色時開 alpha
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  {
    const { w, h } = getSize();
    renderer.setSize(w, h);
  }

  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;";
  mountEl.appendChild(renderer.domElement);

  // ─── Scene ──────────────────────────────────────────────
  const scene = new THREE.Scene();
  if (bgColor) scene.background = new THREE.Color(bgColor);

  // 環境光 + 方向光（讓材質看起來有立體感）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xffd0ff, 0.4);
  fillLight.position.set(-4, 2, -3);
  scene.add(fillLight);

  // ─── Camera ─────────────────────────────────────────────
  const { w: initW, h: initH } = getSize();
  const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.01, 100);
  camera.position.set(0, 1.2, 3.0);

  // ─── OrbitControls ──────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance  = 1.0;
  controls.maxDistance  = 8.0;
  controls.maxPolarAngle = Math.PI * 0.85;   // 不讓鏡頭轉到正下方
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.2;
  controls.target.set(0, 0.2, 0);
  controls.update();

  // ─── 材質 helpers ───────────────────────────────────────

  /** 把 finalPotTextureUrl 轉成 THREE.Texture，並正確設定 encoding */
  function buildSoupBaseTexture(url) {
    const tex = new THREE.TextureLoader().load(url);
    tex.encoding  = THREE.sRGBEncoding;
    tex.flipY     = false;               // GLB UV 通常是 flipY=false
    tex.wrapS     = THREE.ClampToEdgeWrapping;
    tex.wrapT     = THREE.ClampToEdgeWrapping;
    return tex;
  }

  /** soup_transparent：半透明玻璃感材質 */
  function buildTransparentMaterial() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.92,       // 透射率（需要 renderer.physicallyCorrectLights 或 r151+）
      roughness: 0.05,
      metalness: 0.0,
      ior: 1.36,                 // 水的折射率
      thickness: 0.3,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return mat;
  }

  // ─── 模型 state ─────────────────────────────────────────
  let modelRoot = null;
  let soupBaseMesh = null;
  let soupTransparentMesh = null;
  let loadingEl = null;

  // 顯示 loading 文字
  function showLoading() {
    loadingEl = document.createElement("div");
    loadingEl.textContent = "載入中…";
    Object.assign(loadingEl.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "20px",
      color: "#FD6FFF",
      pointerEvents: "none",
      zIndex: "10",
    });
    mountEl.style.position = "relative";
    mountEl.appendChild(loadingEl);
  }

  function hideLoading() {
    loadingEl?.remove();
    loadingEl = null;
  }

  // ─── 載入 GLB ───────────────────────────────────────────
  showLoading();

  const loader = new GLTFLoader();
  loader.load(
    glbUrl,
    (gltf) => {
      hideLoading();
      modelRoot = gltf.scene;
      scene.add(modelRoot);

      // 自動置中 + 縮放到合適大小
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size   = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = 2.0 / maxDim;
      modelRoot.scale.setScalar(scale);
      modelRoot.position.sub(center.multiplyScalar(scale));

      // 跑完縮放後重新算 center 讓 controls.target 對準
      const box2 = new THREE.Box3().setFromObject(modelRoot);
      const c2   = new THREE.Vector3();
      box2.getCenter(c2);
      controls.target.copy(c2);
      controls.update();

      // 遍歷找 mesh，分配材質
      modelRoot.traverse((node) => {
        if (!node.isMesh) return;
        const name = node.name.toLowerCase();

        if (name.includes("soup_base") || name.includes("soupbase")) {
          soupBaseMesh = node;
          applySoupBaseTexture(node, textureUrl);
        } else if (name.includes("soup_transparent") || name.includes("souptransparent")) {
          soupTransparentMesh = node;
          node.material = buildTransparentMaterial();
          node.renderOrder = 1;          // 透明物件後畫
        }
        // potbody / pothandle 維持 GLB 原始材質，不做任何覆蓋
      });
    },
    undefined,
    (err) => {
      hideLoading();
      console.error("[step4PotViewer] GLB load error:", err);
      showError("無法載入鍋子模型");
    }
  );

  function showError(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: '"zpix", ui-sans-serif, system-ui',
      fontSize: "18px",
      color: "#ff4466",
    });
    mountEl.style.position = "relative";
    mountEl.appendChild(el);
  }

  /**
   * 把 textureUrl 貼到 soup_base mesh。
   * textureUrl 可以是 null（就不覆蓋），也可以隨時用 viewer.updateTexture() 更新。
   */
  function applySoupBaseTexture(mesh, url) {
    if (!url) return;
    const tex = buildSoupBaseTexture(url);

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        m.map = tex;
        m.needsUpdate = true;
      });
    } else {
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    }
  }

  // ─── Render loop ────────────────────────────────────────
  let animId = null;
  let destroyed = false;

  function animate() {
    if (destroyed) return;
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ─── Resize ─────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return;
    const { w, h } = getSize();
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(mountEl);

  // ─── 公開 API ───────────────────────────────────────────

  /**
   * 動態更換 soup_base 貼圖（例如使用者回到 step3 修改後再回來）
   * @param {string} url - 新的 dataURL 或 blob URL
   */
  function updateTexture(url) {
    textureUrl = url;
    if (soupBaseMesh) applySoupBaseTexture(soupBaseMesh, url);
  }

  /**
   * 切換自動旋轉
   * @param {boolean} on
   */
  function setAutoRotate(on) {
    controls.autoRotate = on;
  }

  /**
   * 銷毀 viewer，釋放 GPU 資源
   * 在 renderStep() 的 clearPanel() 或 step 離開時呼叫
   */
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    cancelAnimationFrame(animId);
    resizeObserver.disconnect();
    controls.dispose();

    // 釋放場景內所有 geometry / material / texture
    scene.traverse((node) => {
      if (node.isMesh) {
        node.geometry?.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => {
          m?.map?.dispose();
          m?.dispose();
        });
      }
    });

    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    updateTexture,
    setAutoRotate,
    destroy,
    /** 直接拿 renderer / scene / camera，給進階用途 */
    renderer,
    scene,
    camera,
    controls,
  };
}