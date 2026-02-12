import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import "./style.css";


const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const ambient = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambient);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.querySelector("#app").appendChild(renderer.domElement);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const controls = new PointerLockControls(camera, renderer.domElement);
let uiActive = false; 
renderer.domElement.addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest("#ui-root")) return;
  if (uiActive) return;
  if (!controls.isLocked) controls.lock();
});

document.addEventListener("pointerlockchange", () => {
  const lockedEl = document.pointerLockElement;
  console.log("[pl] change:", lockedEl, "isRenderer=", lockedEl === renderer.domElement);
  console.log("[pl] controls.isLocked =", controls.isLocked);
});

document.addEventListener("pointerlockerror", (e) => {
  console.log("[pl] error", e);
});

const style = document.createElement("style");
style.textContent = `
  #ui-root input::placeholder {
    color: rgba(255,255,255,0.9);
  }
`;
document.head.appendChild(style);




controls.getObject = () => {
  return controls.object ?? camera;
};
scene.add (controls.getObject());

const center = new THREE.Vector3();
const size = new THREE.Vector3();

const eyeY = 0.002;
controls.getObject().position.set(
    center.x,
    center.y + eyeY,
    center.z
);

const player = new THREE.Object3D();


// =========================
// System announcement UI
// =========================
const ui = document.createElement("div");
ui.id = "white-ui";
ui.style.position = "fixed";
ui.style.inset = "0";
ui.style.zIndex = "9999";
ui.style.pointerEvents = "none";
document.body.appendChild(ui);

const announceWrap = document.createElement("div");
announceWrap.style.position = "absolute";
announceWrap.style.left = "48px";
announceWrap.style.bottom = "64px";
announceWrap.style.display = "flex";
announceWrap.style.alignItems = "center";
announceWrap.style.gap = "18px";
ui.appendChild(announceWrap);

const hornWrap = document.createElement("div");
hornWrap.style.width = "75px";
hornWrap.style.height = "75px";
hornWrap.style.borderRadius = "999px";
hornWrap.style.background = "white";
hornWrap.style.boxShadow = "0 8px 30px rgba(0,0,0,0.12)";
hornWrap.style.display = "flex";
hornWrap.style.alignItems = "center";
hornWrap.style.justifyContent = "center";
announceWrap.appendChild(hornWrap);

const horn = document.createElement("img");
horn.src = "./announcement.png";
horn.alt = "system";
horn.style.width = "45px";   
horn.style.height = "45px";
horn.style.objectFit = "contain";
horn.style.transform = "translateY(1px) translateX(-1px)";
hornWrap.appendChild(horn);


const bubble = document.createElement("div");
bubble.style.minWidth = "130px";
bubble.style.height = "75px";
bubble.style.padding = "0 22px";
bubble.style.display = "flex";
bubble.style.alignItems = "center";
bubble.style.justifyContent = "center";
bubble.style.borderRadius = "999px";
bubble.style.background = "white";
bubble.style.boxShadow = "0 8px 30px rgba(0,0,0,0.12)";
bubble.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
bubble.style.fontSize = "16px";
bubble.style.fontWeight = "600";
bubble.style.color = "#fd6fff";
bubble.style.whiteSpace = "nowrap";
bubble.style.overflow = "hidden";
bubble.style.textOverflow = "ellipsis";
announceWrap.appendChild(bubble);

const announcements = [
    { text: "宴席尚未開放", ms: 3500 },
    { text: "場域已開放", ms: 3500 },
    { text: "請自由探索", ms: 3500 },
];

let announceIndex = 0;
let announceTimer = null;

function hideAnnouncement(){
    announceWrap.style.transition = "opacity 320ms ease";
    announceWrap.style.opacity = "0";
    setTimeout(() => {
        announceWrap.remove();
    }, 340);
}

function showAnnouncement(i){
    const item = announcements[i];
    bubble.textContent = item.text;

    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
    if(announceIndex < announcements.length - 1){
            announceIndex += 1;
            showAnnouncement(announceIndex);
        } else {
            hideAnnouncement();
        }
    }, item.ms);
}
showAnnouncement(0);

// =========================
// NPC DIALOG UI 1
// =========================
const old = document.getElementById("ui-root");
if (old) old.remove();

const uiRoot = document.createElement("div");
uiRoot.id = "ui-root";
uiRoot.style.position = "fixed";
uiRoot.style.inset = "0";
uiRoot.style.zIndex = "9999";
uiRoot.style.pointerEvents = "none";
document.body.appendChild(uiRoot);

// document.addEventListener(
//   "pointerdown",
//   (e) => {
//     if (e.target.closest("#ui-root")) {
//       e.preventDefault();
//       e.stopPropagation();
//     }
//   },
//   true // capture: 先攔再說
// );

// document.addEventListener(
//   "click",
//   (e) => {
//     if (e.target.closest("#ui-root")) {
//       e.preventDefault();
//       e.stopPropagation();
//     }
//   },
//   true
// );


function makePillButton(label){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.pointerEvents = "auto";
    btn.style.border = "0";
    btn.style.cursor = "pointer";
    btn.style.height = "55px";  
    btn.style.width = "75px";  
    btn.style.padding = "10px 16px";
    btn.style.borderRadius = "999px";
    btn.style.background = "#fd6fff";
    btn.style.color = "white";
    btn.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    btn.style.fontSize = "16px";
    btn.style.fontWeight = "700";
    btn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.18)";
    btn.style.userSelect = "transform 120ms ease";
    btn.addEventListener("pointerdown", () => (btn.style.transform = "scale(0.96)"));
    btn.addEventListener("pointerup", () => (btn.style.transform = "scale(1)"));
    btn.addEventListener("pointerleave", () => (btn.style.transform = "scale(1)"));
    return btn;
}

const npcLayer = document.createElement("div");
npcLayer.style.position = "absolute";
npcLayer.style.right = "64px";
npcLayer.style.top = "28%";
npcLayer.style.width = "420px";
npcLayer.style.pointerEvents = "auto";
uiRoot.appendChild(npcLayer);

const npcBubble = document.createElement("div");
npcBubble.style.background = "white";
npcBubble.style.borderRadius = "999px";
npcBubble.style.boxShadow = "0 12px 34px rgba(0,0,0,0.12)";
npcBubble.style.padding = "16px 22px";
npcBubble.style.minHeight = "56px";
npcBubble.style.display = "flex";
npcBubble.style.alignItems = "center";
npcBubble.style.justifyContent = "center";
npcBubble.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
npcBubble.style.fontSize = "17px";
npcBubble.style.fontWeight = "600";
npcBubble.style.color = "#fd6fff";
npcBubble.style.opacity = "0";
npcBubble.style.transform = "translateY(6px)";
npcBubble.style.transition = "opacity 180ms ease, transform 180ms ease";
npcLayer.appendChild(npcBubble);


const optionRow = document.createElement("div");
optionRow.style.marginTop = "10px";
optionRow.style.display = "flex";
optionRow.style.gap = "10px";
optionRow.style.justifyContent = "flex-end";
optionRow.style.opacity = "0";
optionRow.style.transform = "translateY(6px)";
optionRow.style.transition = "opacity 180ms ease, transform 180ms ease";
optionRow.style.pointerEvents = "none";
npcLayer.appendChild(optionRow);

const btnNo = makePillButton("不是");
const btnYes = makePillButton("是");
optionRow.appendChild(btnNo);
optionRow.appendChild(btnYes);

const nameRow = document.createElement("div");
nameRow.style.marginTop = "-41px";      // 你要拉開與白泡泡距離就調這裡
nameRow.style.display = "flex";
nameRow.style.width = "100%";        
nameRow.style.justifyContent = "flex-end"; // ✅ 先整排靠右
nameRow.style.alignItems = "center";
nameRow.style.gap = "12px";
nameRow.style.pointerEvents = "none";
npcLayer.appendChild(nameRow);




const pencilBtn = document.createElement("button");
const PENCIL_SHIFT_CLOSED = 0;     // 初始：在右邊靠近白泡泡（用 margin-left:auto 做到）
const PENCIL_SHIFT_OPEN = -8;    // 點了：往左滑多少（你再微調）
pencilBtn.style.right = PENCIL_SHIFT_CLOSED;
pencilBtn.type = "button";
pencilBtn.style.pointerEvents = "auto";
pencilBtn.style.border = "0";
pencilBtn.style.cursor = "pointer";
pencilBtn.style.width = "55px";
pencilBtn.style.height = "55px";
pencilBtn.style.borderRadius = "999px";
pencilBtn.style.background = "white";
pencilBtn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.12)";
pencilBtn.style.display = "grid";
pencilBtn.style.placeItems = "center";
pencilBtn.style.userSelect = "none";
pencilBtn.style.opacity = "0";
pencilBtn.style.marginLeft = "auto";        
pencilBtn.style.transform = "translateX(0)";   
pencilBtn.style.transition = "opacity 180ms ease, transform 260ms ease";
pencilBtn.style.overflow = "hidden";
pencilBtn.innerHTML = "";
const pencilImg = document.createElement("img");
pencilImg.src = "/pencil.png";      
pencilImg.alt = "pencil";
pencilImg.style.width = "70px";
pencilImg.style.height = "70px";
pencilImg.style.objectFit = "contain";
pencilImg.style.transform = "translateX(-23px) translateY(2px) rotate(45deg)";
pencilImg.style.transformOrigin = "center";
pencilBtn.appendChild(pencilImg);
nameRow.appendChild(pencilBtn);

const nameBubble = document.createElement("div");
nameBubble.style.height = "55px";
nameBubble.style.width = "240px";
nameBubble.style.background = "#fd6fff";
nameBubble.style.borderRadius = "999px";
nameBubble.style.boxShadow = "0 12px 30px rgba(0,0,0,0.16)";
nameBubble.style.padding = "0 22px";     
nameBubble.style.display = "none";
nameBubble.style.alignItems = "center";
nameBubble.style.justifyContent = "center";
nameBubble.style.gap = "10px";
nameBubble.style.transformOrigin = "right center";
nameBubble.style.opacity = "0";
nameBubble.style.pointerEvents = "none";
nameBubble.style.transform = "translateX(30px)"; 
nameBubble.style.transition = "opacity 180ms ease, transform 260ms ease";
nameRow.appendChild(nameBubble);

const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.placeholder = "輸入名稱";
nameInput.style.width = "100%";
nameInput.style.border = "0";
nameInput.style.outline = "none";
nameInput.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
nameInput.style.fontSize = "13px";
nameInput.style.fontWeight = "700";
nameInput.style.color = "white";
nameInput.style.caretColor = "white";
nameInput.style.background = "transparent";
nameInput.style.pointerEvents = "auto";
nameBubble.appendChild(nameInput);

const nameOk = makePillButton("確定");
nameOk.style.padding = "8px 14px";
nameOk.style.display = "none";
nameBubble.appendChild(nameOk);

const kicked = document.createElement("div");
kicked.style.position = "fixed";
kicked.style.inset = "0";
kicked.style.background = "rgba(0,0,0,0.92)";
kicked.style.display = "grid";
kicked.style.placeItems = "center";
kicked.style.opacity = "0";
kicked.style.pointerEvents = "none";
kicked.style.transition = "opacity 220ms ease";
uiRoot.appendChild(kicked);

const kickedInner = document.createElement("div");
kickedInner.style.display = "flex";
kickedInner.style.flexDirection = "column";
kickedInner.style.alignItems = "center";
kickedInner.style.gap = "18px";
kicked.appendChild(kickedInner);

const kickedText = document.createElement("div");
kickedText.textContent = "您已被趕出等待區";
kickedText.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
kickedText.style.fontSize = "22px";
kickedText.style.fontWeight = "800";
kickedText.style.color = "#fd6fff";
kickedInner.appendChild(kickedText);

const kickedBtn = document.createElement("button");
kickedBtn.type = "button";
kickedBtn.style.pointerEvents = "auto";
kickedBtn.style.border = "0";
kickedBtn.style.cursor = "pointer";
kickedBtn.style.width = "54px";
kickedBtn.style.height = "54px";
kickedBtn.style.borderRadius = "999px";
kickedBtn.style.background = "white";
kickedBtn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.25)";
kickedBtn.style.display = "grid";
kickedBtn.style.placeItems = "center";

const reloadImg = document.createElement("img");
reloadImg.src = "/restart.png";      
reloadImg.alt = "reload";
reloadImg.style.width = "35px";
reloadImg.style.height = "35px";
reloadImg.style.objectFit = "contain";
reloadImg.style.transform = "translateY(-0.9px) translateX(1.5px)";
kickedBtn.appendChild(reloadImg);

kickedInner.appendChild(kickedBtn);


const NPC_STATE = {
    HIDDEN: "HIDDEN",
    Q1: "Q1",
    NOT_GUEST: "NOT_GUEST",
    ASK_NAME: "ASK_NAME",
    PENCIL_READY: "PENCIL_READY",
    NAME_INPUT: "NAME_INPUT",
};

let npcState = NPC_STATE.HIDDEN;
let askNameTimer = null;

function clearNpcTimers(){
    if (askNameTimer){
        clearTimeout(askNameTimer);
        askNameTimer = null;
    }
}
function npcShowBubble(text){
    npcBubble.textContent = text;
    npcBubble.style.opacity = "1";
    npcBubble.style.transform = "translateY(0)";
}
function npcHideAll(){
  uiActive = false;

  clearNpcTimers();
  npcState = NPC_STATE.HIDDEN;

  npcBubble.style.opacity = "0";
  npcBubble.style.transform = "translateY(6px)";

  optionRow.style.opacity = "0";
  optionRow.style.transform = "translateY(6px)";
  optionRow.style.pointerEvents = "none";

  pencilBtn.style.opacity = "0";
  pencilBtn.style.transform = `translateX(${PENCIL_SHIFT_CLOSED}px)`; 

  nameBubble.style.display = "none";
  nameBubble.style.opacity = "0";
  nameBubble.style.pointerEvents = "none";
  nameBubble.style.transform = "translateX(30px)";

  kicked.style.opacity = "0";
  kicked.style.pointerEvents = "none";
}

function npcEnterQ1() {
console.log("[npcEnterQ1] begin", { locked: controls.isLocked });
  uiActive = true;
  if (controls.isLocked) controls.unlock();
  console.log("[npcEnterQ1] after unlock", { locked: controls.isLocked });

  npcState = NPC_STATE.Q1;
  npcShowBubble("您好，請問是預約的賓客嗎？");

  optionRow.style.pointerEvents = "auto";
  optionRow.style.opacity = "1";
  optionRow.style.transform = "translateY(0)";
  optionRow.style.pointerEvents = "auto";

  nameRow.style.pointerEvents = "none";
  pencilBtn.style.pointerEvents = "none";
  pencilBtn.style.opacity = "0";
  nameBubble.style.display = "none";
}
function npcKickOut() {
  npcState = NPC_STATE.NOT_GUEST;

  npcShowBubble("ಠ_ಠ");
  optionRow.style.opacity = "0";
  optionRow.style.pointerEvents = "none";

  // 0.8 秒後黑屏
  setTimeout(() => {
    kicked.style.opacity = "1";
    kicked.style.pointerEvents = "auto";
  }, 800);
}
function npcAskName(){
    console.log("[npcEnterQ1] begin", { locked: controls.isLocked });
    npcState = NPC_STATE.ASK_NAME;
    npcShowBubble("您登記的姓名是？");

    optionRow.style.opacity = "0";
    optionRow.style.pointerEvents = "none";
    nameRow.style.pointerEvents = "auto"; 

    clearNpcTimers();
    askNameTimer = setTimeout(() => {
    npcState = NPC_STATE.PENCIL_READY;

    nameRow.style.pointerEvents = "auto";
    pencilBtn.style.pointerEvents = "auto";

    pencilBtn.style.opacity = "1";
    pencilBtn.style.transform = `translateX(${PENCIL_SHIFT_CLOSED}px)`;
    }, 300);




}
function npcOpenNameInput() {
  npcState = NPC_STATE.NAME_INPUT;

  nameBubble.style.display = "flex";

  requestAnimationFrame(() => {
    pencilBtn.style.transform = `translateX(${PENCIL_SHIFT_OPEN}px)`; // 往左滑
    nameBubble.style.opacity = "1";
    nameBubble.style.pointerEvents = "auto";
    nameBubble.style.transform = "translateX(0)";
  });

  setTimeout(() => nameInput.focus(), 0);
}
function submitName(){
    const raw = nameInput.value ?? "";
    const name = raw.trim();
    if(!name){
        nameInput.focus();
        return;
    }
    console.log("[name submit]", name);
    localStorage.setItem("polypot_name", name);
    npcHideAll;
}



btnNo.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  console.log("[btnNo] state=", npcState);
  if (npcState === NPC_STATE.Q1) npcKickOut();
});

btnYes.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  console.log("[btnYes] state=", npcState);
  if (npcState === NPC_STATE.Q1) npcAskName();
});

pencilBtn.addEventListener("pointerdown", (e) => {
  console.count("pencil click handler fired");
  console.log("[click] pencilBtn state=", npcState);
  e.preventDefault();
  e.stopPropagation();
  if (npcState === NPC_STATE.PENCIL_READY) npcOpenNameInput();
});
nameInput.addEventListener("keydown", (e) => {
  if (e.code === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    submitName();
  }
});
// 這一步先做到這裡：nameOk 先不做後續（之後要存到 server 或 local storage）
nameOk.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[name]", nameInput.value);
});
kickedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.reload();
});


const keys = { w: false, a: false, s: false, d: false };

window.addEventListener("keydown", (e) => {
  console.log("[keydown]", e.code, "uiActive=", uiActive, "locked=", controls?.isLocked);

  if (e.code === "Escape") { npcHideAll(); return; }

  if (uiActive) return;

  if (e.code === "Enter") { window.location.href = "/hall.html"; return; }
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
});








let npcMesh = null;
let npcInRange = false;
const NPC_TRIGGER_DIST = 4;

function updateNpcProximity(){
    if (!npcMesh) return;
    const playerPos = controls.getObject().position;
    const npcPos = new THREE.Vector3();
    npcMesh.getWorldPosition(npcPos);
    const d = playerPos.distanceTo(npcPos);
    const InRange = d <= NPC_TRIGGER_DIST;
    if (InRange && !npcInRange) {
        npcInRange = true;
        npcEnterQ1();
    }
    if (!InRange && npcInRange) {
        npcInRange = false;
        npcHideAll();
    }
}

let envRoot = null;
const loader = new GLTFLoader();
loader.load("/white_B.glb", (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    envRoot.updateWorldMatrix(true, true);

    npcMesh = envRoot.getObjectByName("npc_1");
    console.log("[npcMesh]", npcMesh);
    if (!npcMesh) {
        console.warn("找不到 npc_1，請確認 Blender 匯出名稱完全一致");
    }

    const box = new THREE.Box3().setFromObject(envRoot);
    
    box.getCenter(center);
    box.getSize(size);
    console.log("[white] model center:", center);
    console.log("[white] model size:", size);

    const obj = controls.getObject();

    const eyeHeight = 3.0; 
    obj.position.set(
    center.x,
    center.y - size.y / 2 + eyeHeight,
    center.z
    );
    const target = new THREE.Vector3(center.x, obj.position.y, center.z + 10);
    obj.lookAt(target);


    const spawnLight = new THREE.PointLight(0xffffff, 180, 800);
    spawnLight.position.set(
    center.x,
    center.y + 3,
    center.z
    );
    scene.add(spawnLight);

    const bounds = box.clone();
    const padding = 0.6;
    bounds.min.x += padding;
    bounds.max.x -= padding;
    bounds.min.z += padding;
    bounds.max.z -= padding;
    window.__whiteBounds = bounds;
    const p = controls.getObject().position;
    p.x = THREE.MathUtils.clamp(p.x, bounds.min.x, bounds.max.x);
    p.z = THREE.MathUtils.clamp(p.z, bounds.min.z, bounds.max.z);
    
    scene.add(envRoot);
});



console.log("cam", camera.position.toArray());
console.log("obj", controls.getObject().position.toArray());


const clock = new THREE.Clock();
const moveSpeed = 5.0;

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const velocity = moveSpeed * dt;

    if (controls.isLocked) {
        if (keys.w) controls.moveForward(velocity);
        if (keys.s) controls.moveForward(-velocity);
        if (keys.a) controls.moveRight(-velocity);
        if (keys.d) controls.moveRight(velocity);
    }

    const obj = controls.getObject();
    const bounds = window.__whiteBounds;
    if (bounds) {
        obj.position.x = THREE.MathUtils.clamp(obj.position.x, bounds.min.x, bounds.max.x);
        obj.position.z = THREE.MathUtils.clamp(obj.position.z, bounds.min.z, bounds.max.z);
    }

    
    updateNpcProximity();
    renderer.render(scene, camera);
}
animate();