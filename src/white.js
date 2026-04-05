import * as THREE from "three";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import "./style.css";
import { depth } from "three/tsl";
import { io } from "socket.io-client";
import { initMobileInput } from "./Input/mobileInput.js";

// 全域字體改成 zpix
const zpixStyle = document.createElement("style");
zpixStyle.textContent = `
  * {
    font-family: "zpix", system-ui, -apple-system, Segoe UI, Roboto, sans-serif !important;
  }
`;
document.head.appendChild(zpixStyle);


const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 3); 
scene.add(hemiLight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// renderer.outputColorSpace = THREE.SRGBColorSpace; // 確保顏色解析正確
// renderer.toneMapping = THREE.ACESFilmicToneMapping; // 模擬底片色調
// renderer.toneMappingExposure = 1.8; // 調整這個值來控制整體的「乾淨度」
document.querySelector("#app").appendChild(renderer.domElement);



window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const controls = new PointerLockControls(camera, renderer.domElement);
let uiActive = false; 

const IS_MOBILE = window.matchMedia("(pointer: coarse)").matches;
function shiftUpOnMobile(el, px = 40) {
  if (!el) return;
  if (!IS_MOBILE) return;
  el.style.transform = `translateY(-${px}px)`;
  el.style.transformOrigin = "center bottom";
}

function isSmallMobile() {
  return IS_MOBILE && Math.min(window.innerWidth, window.innerHeight) <= 500;
}

function fitCenteredPanel(el, baseW, baseH) {
  if (!el) return;

  if (!isSmallMobile()) {
    return;
  }

  const pad = 24;
  const availW = window.innerWidth - pad * 2;
  const availH = window.innerHeight - pad * 2;

  const scale = Math.min(1, availW / baseW, availH / baseH);

  el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  el.style.transformOrigin = "center center";
}

function fitTopRightPanel(el, scale = 1) {
  if (!el) return;
  if (!isSmallMobile()) return;

  el.style.transform = `scale(${scale})`;
  el.style.transformOrigin = "top right";
}

function fitAnnouncement(scale = 1) {
  if (!isSmallMobile()) return;
  announceWrap.style.transform = `scale(${scale})`;
  announceWrap.style.transformOrigin = "left bottom";
}

const touchLook = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  yaw: 0,
  pitch: 0,
  sensitivity: 0.0032,
  maxPitch: Math.PI / 2 - 0.12,
};

function syncTouchLookFromCamera() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  touchLook.yaw = e.y;
  touchLook.pitch = e.x;
}

function applyTouchLook() {
  controls.getObject().rotation.y = touchLook.yaw;
  camera.rotation.x = touchLook.pitch;
  camera.rotation.z = 0;
}

function isTouchLookBlocked() {
  return !IS_MOBILE || uiActive;
}

syncTouchLookFromCamera();

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (isTouchLookBlocked()) return;

  if (e.clientX < window.innerWidth * 0.45) return;

  touchLook.active = true;
  touchLook.pointerId = e.pointerId;
  touchLook.lastX = e.clientX;
  touchLook.lastY = e.clientY;

  renderer.domElement.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}, { passive: false });

renderer.domElement.addEventListener("pointermove", (e) => {
  if (!touchLook.active) return;
  if (e.pointerId !== touchLook.pointerId) return;

  const dx = e.clientX - touchLook.lastX;
  const dy = e.clientY - touchLook.lastY;

  touchLook.lastX = e.clientX;
  touchLook.lastY = e.clientY;

  touchLook.yaw -= dx * touchLook.sensitivity;
  touchLook.pitch -= dy * touchLook.sensitivity;
  touchLook.pitch = THREE.MathUtils.clamp(
    touchLook.pitch,
    -touchLook.maxPitch,
    touchLook.maxPitch
  );

  applyTouchLook();
  e.preventDefault();
}, { passive: false });

function endTouchLook(e) {
  if (e.pointerId !== touchLook.pointerId) return;
  touchLook.active = false;
  touchLook.pointerId = null;
}

renderer.domElement.addEventListener("pointerup", endTouchLook);
renderer.domElement.addEventListener("pointercancel", endTouchLook);
renderer.domElement.addEventListener("lostpointercapture", () => {
  touchLook.active = false;
  touchLook.pointerId = null;
});

renderer.domElement.addEventListener("click", (e) => {
  if (IS_MOBILE) return;
  if (e.target.closest && e.target.closest("#ui-root")) return;
  if (uiActive) return;
  if (!controls.isLocked) controls.lock();
  if (!IS_MOBILE && !controls.isLocked) controls.lock();
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
let idVerified = false;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const socket = io(SOCKET_URL, { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("[white socket] connected", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("[white socket] disconnected", reason);
});

socket.on("connect_error", (err) => {
  console.error("[white socket] connect_error", err.message);
});

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
shiftUpOnMobile(ui, 40);

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
bubble.style.fontSize = "20px";
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
shiftUpOnMobile(uiRoot, 40);

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

if (isSmallMobile()) {
  fitTopRightPanel(npcLayer, 0.82);
}

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


let bubbleToken = 0;

function bubbleShow(text) {
    npcBubble.textContent = text;
    npcBubble.style.opacity = "1";
    npcBubble.style.transform = "translateY(0)";
}
function bubbleHide() {
    npcBubble.style.opacity = "0";
    npcBubble.style.transform = "translateY(6px)";
}
function bubbleFor (text, duration = 3000) {
    const my = ++bubbleToken;
    bubbleShow(text);

    return new Promise((resolve) => {
        setTimeout(() => {
            if (my !== bubbleToken) return resolve();
            bubbleHide();
            setTimeout(() => {
                resolve();
            }, 220);
        }, duration);
    });
}


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
nameBubble.style.justifyContent = "flex-start";
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
nameOk.style.width = "60px";
nameOk.style.height = "55px";
nameOk.style.padding = "0 18px";
nameOk.style.display = "inline-flex";
nameOk.style.alignItems = "center";
nameOk.style.justifyContent = "center";
nameOk.style.flexShrink = "0";
nameOk.style.lineHeight = "40px";
nameOk.style.whiteSpace = "nowrap";
nameOk.style.fontSize = "16px";
nameOk.style.position = "absolute";
nameOk.style.right = "-6px"; 
nameOk.style.top = "0";
nameOk.style.transform = "none";
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

// =========================
// ID CARD UI (NEW layout + signature)
// =========================

// (optional) ensure Pixelify Sans available
const idFontStyle = document.createElement("style");
idFontStyle.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap');
`;
document.head.appendChild(idFontStyle);

const idOverlay = document.createElement("div");
idOverlay.style.position = "fixed";
idOverlay.style.inset = "0";
idOverlay.style.zIndex = "10000";
idOverlay.style.display = "none";
idOverlay.style.pointerEvents = "auto";
uiRoot.appendChild(idOverlay);

const idDim = document.createElement("div");
idDim.style.position = "absolute";
idDim.style.inset = "0";
idDim.style.background = "rgba(0,0,0,0.25)";
idOverlay.appendChild(idDim);

const idCard = document.createElement("div");
idCard.style.position = "relative";
idCard.style.left = "50%";
idCard.style.top = "50%";
idCard.style.transform = "translate(-50%,-50%)";
idCard.style.width = "700px";
idCard.style.height = "455px";
idCard.style.background = "white";
idCard.style.borderRadius = "28px";
idCard.style.boxShadow = "0 18px 60px rgba(0,0,0,0.20)";
idCard.style.fontFamily = `"Pixelify Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
idOverlay.appendChild(idCard);
fitCenteredPanel(idCard, 700, 455);

// --- constants: relative to idCard (your numbers converted) ---
const POS = {
  contentLeft: 51,
  contentTop: 54,

  photoLeft: 51,
  photoTop: 54,
  photoW: 167.25,
  photoH: 223,

  titleLeft: 259,
  titleTop: 54,
  titleW: 390,
  titleH: 25,

  nameLabelLeft: 259,
  nameTop: 114,
  nameValueLeft: 344,

  infoLabelLeft: 259,
  infoTop: 163,
  infoBoxLeft: 344,
  infoBoxTop: 163,
  infoBoxW: 264,
  infoBoxH: 114,

  sigLabelLeft: 51,
  sigLabelTop: 302,
  sigBoxLeft: 51,
  sigBoxTop: 330,
  sigBoxW: 369,
  sigBoxH: 71,

  barcodeLeft: 479,
  barcodeTop: 318,
  barcodeW: 182,
  barcodeH: 90,

  idCodeLeft: 497,
  idCodeTop: 385,
  serialLeft: 586,
  serialTop: 385,
};

// --- photo box ---
const photoBox = document.createElement("div");
photoBox.style.position = "absolute";
photoBox.style.left = `${POS.photoLeft}px`;
photoBox.style.top = `${POS.photoTop}px`;
photoBox.style.width = `${POS.photoW}px`;
photoBox.style.height = `${POS.photoH}px`;
photoBox.style.background = "#F6F6F6";
photoBox.style.overflow = "hidden";
photoBox.style.borderRadius = "0px";
idCard.appendChild(photoBox);


const photoImg = document.createElement("img");
photoImg.alt = "avatar";
photoImg.style.position = "absolute";
photoImg.style.inset = "0";
photoImg.style.width = "100%";
photoImg.style.height = "100%";
photoImg.style.objectFit = "cover";
photoImg.style.objectPosition = "center";
photoImg.style.setProperty("height", "100%", "important");
photoImg.style.setProperty("width", "100%", "important");
photoImg.style.display = "none";
photoBox.appendChild(photoImg);
console.log("photoBox", photoBox.getBoundingClientRect());
console.log("photoImg", photoImg.getBoundingClientRect());

const editBtn = document.createElement("button");
editBtn.type = "button";
editBtn.textContent = "Edit";
editBtn.style.position = "absolute";
// your measured relative in photoBox: left 49, top 173
editBtn.style.left = "50%";
editBtn.style.bottom = "18px";
editBtn.style.top = "";
editBtn.style.transform = "translateX(-50%)";
editBtn.style.width = "70px";
editBtn.style.height = "33px";
editBtn.style.border = "0";
editBtn.style.cursor = "pointer";
editBtn.style.borderRadius = "999px";
editBtn.style.background = "#FD6FFF";
editBtn.style.color = "#FFFFFF";
editBtn.style.fontFamily = `"Pixelify Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
editBtn.style.fontWeight = "600";
editBtn.style.fontSize = "16px";
editBtn.style.display = "flex";
editBtn.style.alignItems = "center";
editBtn.style.justifyContent = "center";
editBtn.style.padding = "0";
editBtn.style.lineHeight = "normal";
editBtn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.16)";
photoBox.appendChild(editBtn);

editBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openAvatarEditor();
});

// --- title image ---
const idTitle = document.createElement("img");
idTitle.src = "/title.png";
idTitle.alt = "IDENTIFICATION CARD";
idTitle.style.position = "absolute";
idTitle.style.left = `${POS.titleLeft}px`;
idTitle.style.top = `${POS.titleTop}px`;
idTitle.style.width = `${POS.titleW}px`;
idTitle.style.height = `${POS.titleH}px`;
idTitle.style.objectFit = "contain";
idCard.appendChild(idTitle);

// --- Name row ---
const nameLabel = document.createElement("div");
nameLabel.textContent = "Name";
nameLabel.style.position = "absolute";
nameLabel.style.left = `${POS.nameLabelLeft}px`;
nameLabel.style.top = `${POS.nameTop}px`;
nameLabel.style.fontWeight = "600";
nameLabel.style.fontSize = "20px";
nameLabel.style.color = "#1248FF";
idCard.appendChild(nameLabel);

const nameValue = document.createElement("div");
nameValue.style.position = "absolute";
nameValue.style.left = `${POS.nameValueLeft}px`;
nameValue.style.top = `${POS.nameTop}px`;
nameValue.style.fontWeight = "600";
nameValue.style.fontSize = "20px";
nameValue.style.color = "#1248FF";
idCard.appendChild(nameValue);

// --- Info label + box ---
const infoLabel = document.createElement("div");
infoLabel.textContent = "Info";
infoLabel.style.position = "absolute";
infoLabel.style.left = `${POS.infoLabelLeft}px`;
infoLabel.style.top = `${POS.infoTop}px`;
infoLabel.style.fontWeight = "600";
infoLabel.style.fontSize = "20px";
infoLabel.style.color = "#1248FF";
idCard.appendChild(infoLabel);

const infoBox = document.createElement("textarea");
infoBox.placeholder = "（輸入任意留言）";
infoBox.style.position = "absolute";
infoBox.style.left = `${POS.infoBoxLeft}px`;
infoBox.style.top = `${POS.infoBoxTop}px`;
infoBox.style.width = `${POS.infoBoxW}px`;
infoBox.style.height = `${POS.infoBoxH}px`;
infoBox.style.background = "#F6F6F6";
infoBox.style.border = "0";
infoBox.style.outline = "none";
infoBox.style.resize = "none";
infoBox.style.padding = "0";
infoBox.style.boxSizing = "border-box";
infoBox.style.fontFamily = `"Pixelify Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
infoBox.style.fontWeight = "600";
infoBox.style.fontSize = "16px";
infoBox.style.color = "#1248FF";
infoBox.style.lineHeight = "1.25";
idCard.appendChild(infoBox);

// keep your placeholder color already set globally, but this one is grey in mock:
infoBox.addEventListener("focus", () => {
  // nothing; just to avoid accidental pointer lock behavior
});

// Persist info to profile.message (keep your existing schema)
infoBox.addEventListener("input", () => {
  const profile = loadProfileLocal();
  if (!profile) return;
  profile.message = infoBox.value;
  saveProfileLocal(profile);
});

// --- Signature label + clear X ---
const signatureLabel = document.createElement("div");
signatureLabel.textContent = "Signature";
signatureLabel.style.position = "absolute";
signatureLabel.style.left = `${POS.sigLabelLeft}px`;
signatureLabel.style.top = `${POS.sigLabelTop}px`;
signatureLabel.style.fontWeight = "600";
signatureLabel.style.fontSize = "20px";
signatureLabel.style.color = "#FD6FFF";
idCard.appendChild(signatureLabel);

const sigClearBtn = document.createElement("button");
sigClearBtn.type = "button";
sigClearBtn.textContent = "×";
sigClearBtn.title = "Clear signature";
sigClearBtn.style.position = "absolute";
sigClearBtn.style.left = `${POS.sigBoxLeft + POS.sigBoxW - 18}px`;
sigClearBtn.style.top = `${POS.sigLabelTop + 2}px`;
sigClearBtn.style.width = "18px";
sigClearBtn.style.height = "18px";
sigClearBtn.style.border = "0";
sigClearBtn.style.padding = "0";
sigClearBtn.style.cursor = "pointer";
sigClearBtn.style.background = "transparent";
sigClearBtn.style.color = "#FD6FFF";
sigClearBtn.style.fontFamily = `"Pixelify Sans", system-ui`;
sigClearBtn.style.fontSize = "18px";
sigClearBtn.style.lineHeight = "18px";
sigClearBtn.style.userSelect = "none";
sigClearBtn.style.opacity = "0.9";
sigClearBtn.addEventListener("pointerenter", () => (sigClearBtn.style.opacity = "1"));
sigClearBtn.addEventListener("pointerleave", () => (sigClearBtn.style.opacity = "0.9"));
idCard.appendChild(sigClearBtn);

// --- Signature canvas box ---
const signatureCanvas = document.createElement("canvas");
signatureCanvas.width = Math.round(POS.sigBoxW * 2);   // retina
signatureCanvas.height = Math.round(POS.sigBoxH * 2);
signatureCanvas.style.position = "absolute";
signatureCanvas.style.left = `${POS.sigBoxLeft}px`;
signatureCanvas.style.top = `${POS.sigBoxTop}px`;
signatureCanvas.style.width = `${POS.sigBoxW}px`;
signatureCanvas.style.height = `${POS.sigBoxH}px`;
signatureCanvas.style.background = "#FFFFFF";
signatureCanvas.style.display = "block";
signatureCanvas.style.touchAction = "none";
idCard.appendChild(signatureCanvas);

const sigCtx = signatureCanvas.getContext("2d");
sigCtx.scale(2, 2);

function sigClearCanvas() {
  sigCtx.clearRect(0, 0, POS.sigBoxW, POS.sigBoxH);
}

function sigSaveToProfile() {
  const profile = loadProfileLocal();
  if (!profile) return;

  // empty check (cheap): read a few pixels
  const imgData = sigCtx.getImageData(0, 0, POS.sigBoxW, POS.sigBoxH).data;
  let hasInk = false;
  for (let i = 0; i < imgData.length; i += 16) {
    if (imgData[i + 3] > 0) { hasInk = true; break; }
  }

  profile.signature = hasInk ? signatureCanvas.toDataURL("image/png") : null;
  saveProfileLocal(profile);
}

function sigLoadFromProfile(profile) {
  sigClearCanvas();
  if (!profile?.signature) return;

  const img = new Image();
  img.onload = () => {
    sigClearCanvas();
    sigCtx.drawImage(img, 0, 0, POS.sigBoxW, POS.sigBoxH);
  };
  img.src = profile.signature;
}

// draw behavior: "覆蓋"（pointerdown 先清空）
let sigDrawing = false;
let sigLast = { x: 0, y: 0 };

function sigGetLocalPoint(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  return { x, y };
}

function sigBegin(e) {
  if (idCardState !== "EDIT") return;
  e.preventDefault();
  e.stopPropagation();

  // 覆蓋：每次開始畫都先清空
  sigClearCanvas();

  sigDrawing = true;
  const p = sigGetLocalPoint(e);
  sigLast = p;

  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  sigCtx.strokeStyle = "#1248FF";
  sigCtx.lineWidth = 3;

  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
}

function sigMove(e) {
  if (!sigDrawing) return;
  e.preventDefault();
  e.stopPropagation();

  const p = sigGetLocalPoint(e);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  sigLast = p;
}

function sigEnd(e) {
  if (!sigDrawing) return;
  e.preventDefault();
  e.stopPropagation();

  sigDrawing = false;
  sigCtx.closePath();
  sigSaveToProfile();
}

signatureCanvas.addEventListener("pointerdown", sigBegin);
signatureCanvas.addEventListener("pointermove", sigMove);
window.addEventListener("pointerup", sigEnd);
signatureCanvas.addEventListener("pointercancel", sigEnd);

sigClearBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (idCardState !== "EDIT") return;
  const profile = loadProfileLocal();
  if (profile) {
    profile.signature = null;
    saveProfileLocal(profile);
  }
});

// --- Barcode + id code ---
const barcodeImg = document.createElement("img");
barcodeImg.src = "/barcode.png";
barcodeImg.alt = "barcode";
barcodeImg.style.position = "absolute";
barcodeImg.style.left = `${POS.barcodeLeft}px`;
barcodeImg.style.top = `${POS.barcodeTop}px`;
barcodeImg.style.width = `${POS.barcodeW}px`;
barcodeImg.style.height = `${POS.barcodeH}px`;
barcodeImg.style.objectFit = "fill";
barcodeImg.style.imageRendering = "pixelated";
idCard.appendChild(barcodeImg);

const idCodeLabel = document.createElement("div");
idCodeLabel.textContent = "ID code";
idCodeLabel.style.position = "absolute";
idCodeLabel.style.left = `${POS.idCodeLeft}px`;
idCodeLabel.style.top = `${POS.idCodeTop}px`;
idCodeLabel.style.fontWeight = "600";
idCodeLabel.style.fontSize = "16px";
idCodeLabel.style.color = "#FD6FFF";
idCard.appendChild(idCodeLabel);

const serialText = document.createElement("div");
serialText.style.position = "absolute";
serialText.style.left = `${POS.serialLeft}px`;
serialText.style.top = `${POS.serialTop}px`;
serialText.style.fontWeight = "600";
serialText.style.fontSize = "16px";
serialText.style.color = "#FD6FFF";
idCard.appendChild(serialText);

// footer buttons (keep your existing behavior)
const footer = document.createElement("div");
footer.style.position = "absolute";
footer.style.left = "50%";
footer.style.bottom = "-78px";
footer.style.transform = "translateX(-50%)";
footer.style.display = "flex";
footer.style.gap = "16px";
idCard.appendChild(footer);

// --- helpers used by your existing flow ---
function showIdCard(profile) {
  uiActive = true;
  if (IS_MOBILE) setMobileHudVisible(false);

  idOverlay.style.display = "block";

  nameValue.textContent = profile?.name ?? "";
  serialText.textContent = profile?.serial ?? "";
  infoBox.value = profile?.message ?? "";

  if (profile?.avatarPhoto) {
    photoImg.src = profile.avatarPhoto;
    photoImg.style.display = "block";
  } else {
    photoImg.style.display = "none";
  }

  sigLoadFromProfile(profile);
  setIdCardState("EDIT");
}

function hideIdCard() {
  idOverlay.style.display = "none";

  const stillHasUi =
    avatarOverlay.style.display !== "none" ||
    npcState !== NPC_STATE.HIDDEN ||
    doorUiActive;

  uiActive = stillHasUi;

  if (IS_MOBILE) {
    setMobileHudVisible(!stillHasUi);
  }
}
// =========================
// AVATAR EDITOR OVERLAY
// =========================

const avatarOverlay = document.createElement("div");
avatarOverlay.style.position = "fixed";
avatarOverlay.style.inset = "0"
avatarOverlay.style.zIndex = "10001";
avatarOverlay.style.display = "none";
avatarOverlay.style.pointerEvents = "auto";
uiRoot.appendChild(avatarOverlay);

const avatarDim = document.createElement("div");
avatarDim.style.position = "absolute";
avatarDim.style.inset = "0";
avatarDim.style.background = "rgba(0,0,0,0.25)";
avatarOverlay.appendChild(avatarDim);

const avatarPanel = document.createElement("div");
avatarPanel.style.position = "absolute";
avatarPanel.style.left = "50%";
avatarPanel.style.top = "50%";
avatarPanel.style.transform = "translate(-50%, -50%)";
avatarPanel.style.width = "860px";
avatarPanel.style.height = "420px";
avatarPanel.style.background = "white";
avatarPanel.style.borderRadius = "28px";
avatarPanel.style.boxShadow = "0 18px 60px rgba(0,0,0,0.20)";
avatarPanel.style.display = "grid";
avatarPanel.style.gridTemplateColumns = "1fr 300px";
avatarPanel.style.gap = "22px";
avatarPanel.style.padding = "28px";
avatarPanel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
avatarOverlay.appendChild(avatarPanel);
fitAnnouncement(0.82);

const previewWrap = document.createElement("div");
previewWrap.style.position = "relative";
previewWrap.style.borderRadius = "22px";
previewWrap.style.overflow = "hidden";
previewWrap.style.background = "#f3f3f3";
avatarPanel.appendChild(previewWrap);

const side = document.createElement("div");
side.style.display = "flex";
side.style.flexDirection = "column";
side.style.alignItems = "stretch";
side.style.justifyContent = "center";
side.style.gap = "14px";
avatarPanel.appendChild(side);

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.style.display = "none";
avatarOverlay.appendChild(fileInput);

const uploadBtn = document.createElement("button");
uploadBtn.type = "button";
uploadBtn.textContent = "上傳圖片";
uploadBtn.style.border = "0";
uploadBtn.style.cursor = "pointer";
uploadBtn.style.height = "52px";
uploadBtn.style.borderRadius = "999px";
uploadBtn.style.background = "#fd6fff";
uploadBtn.style.color = "white";
uploadBtn.style.fontWeight = "900";
uploadBtn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.16)";
side.appendChild(uploadBtn);

const confirmBtn = document.createElement("button");
confirmBtn.type = "button";
confirmBtn.textContent = "確認套用";
confirmBtn.style.border = "2px solid #1248ff";
confirmBtn.style.cursor = "pointer";
confirmBtn.style.height = "52px";
confirmBtn.style.borderRadius = "999px";
confirmBtn.style.background = "white";
confirmBtn.style.color = "#1248ff";
confirmBtn.style.fontWeight = "900";
side.appendChild(confirmBtn);

const cancelBtn = document.createElement("button");
cancelBtn.type = "button";
cancelBtn.textContent = "取消";
cancelBtn.style.border = "0";
cancelBtn.style.cursor = "pointer";
cancelBtn.style.height = "44px";
cancelBtn.style.borderRadius = "999px";
cancelBtn.style.background = "rgba(0,0,0,0.06)";
cancelBtn.style.color = "#333";
cancelBtn.style.fontWeight = "800";
side.appendChild(cancelBtn);


// =========================
// DOOR UI
// =========================

let doorUiActive = false;

const doorLayer = document.createElement("div");
doorLayer.style.position = "absolute";
doorLayer.style.left = "50%";
doorLayer.style.top = "38%";
doorLayer.style.transform = "translate(-50%, -50%)";
doorLayer.style.width = "520px";
doorLayer.style.pointerEvents = "none";
uiRoot.appendChild(doorLayer);

if (isSmallMobile()) {
  doorLayer.style.transform = "translate(-50%, -50%) scale(0.82)";
  doorLayer.style.transformOrigin = "center center";
}

const doorBubble = document.createElement("div");
doorBubble.style.background = "white";
doorBubble.style.borderRadius = "999px";
doorBubble.style.boxShadow = "0 12px 34px rgba(0,0,0,0.12)";
doorBubble.style.padding = "16px 22px";
doorBubble.style.minHeight = "56px";
doorBubble.style.display = "flex";
doorBubble.style.alignItems = "center";
doorBubble.style.justifyContent = "center";
doorBubble.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
doorBubble.style.fontSize = "17px";
doorBubble.style.fontWeight = "600";
doorBubble.style.color = "#fd6fff";
doorBubble.style.opacity = "0";
doorBubble.style.transform = "translateY(6px)";
doorBubble.style.transition = "opacity 180ms ease, transform 180ms ease";
doorLayer.appendChild(doorBubble);

const doorBtns = document.createElement("div");
doorBtns.style.marginTop = "10px";
doorBtns.style.display = "flex";
doorBtns.style.gap = "10px";
doorBtns.style.justifyContent = "center";
doorBtns.style.opacity = "0";
doorBtns.style.transform = "translateY(6px)";
doorBtns.style.transition = "opacity 180ms ease, transform 180ms ease";
doorBtns.style.pointerEvents = "none";
doorLayer.appendChild(doorBtns);

const btnWander = makePillButton("再逛一下");
const btnEnterHall = makePillButton("進入會場");
doorBtns.appendChild(btnWander);
doorBtns.appendChild(btnEnterHall);

function doorEnterPrompt() {
  if (!IS_MOBILE && !controls?.isLocked) return;
  doorUiActive = true;
  uiActive = true;
  if (IS_MOBILE) setMobileHudVisible(false);

  doorLayer.style.pointerEvents = "auto";

  doorBubble.textContent = "是否進入宴席會場？";
  doorBubble.style.opacity = "1";
  doorBubble.style.transform = "translateY(0)";

  doorBtns.style.opacity = "1";
  doorBtns.style.transform = "translateY(0)";
  doorBtns.style.pointerEvents = "auto";
}
function doorHidePrompt() {
  doorUiActive = false;

  const stillHasUi =
    idOverlay.style.display !== "none" ||
    avatarOverlay.style.display !== "none" ||
    npcState !== NPC_STATE.HIDDEN;

  uiActive = stillHasUi;
  if (IS_MOBILE) setMobileHudVisible(!stillHasUi);

  doorBubble.style.opacity = "0";
  doorBubble.style.transform = "translateY(6px)";

  doorLayer.style.pointerEvents = "none";

  doorBtns.style.opacity = "0";
  doorBtns.style.transform = "translateY(6px)";
  doorBtns.style.pointerEvents = "none";
}

let doorTipToken = 0;
function doorTipOnce(text, ms = 1500) {
    const my = ++doorTipToken;

    doorBubble.textContent = text;
    doorBubble.style.opacity = "1";
    doorBubble.style.transform = "translateY(0)";

    doorBtns.style.opacity = "0";
    doorBtns.style.transform = "translateY(6px)";
    doorBtns.style.pointerEvents = "none";

    setTimeout(() => {
        if (my !== doorTipToken) return;

        doorBubble.style.opacity = "0";
        doorBubble.style.transform = "translateY(6px)";

        setTimeout(() => {
            if (my !== doorTipToken) return;
            doorHidePrompt();
        },220);
    }, ms);
}

// =========================
// Profile / Serial helpers (localStorage MVP)
// =========================

const LS_PROFILE = "polypot_profile";

function saveProfileLocal(profile) {
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
}

function loadProfileLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_PROFILE) || "null");
  } catch {
    return null;
  }
}

function clearProfileLocal() {
  localStorage.removeItem("polypot_name");
  localStorage.removeItem(LS_PROFILE);
}
function registerProfileOnServer(profileInput) {
  return new Promise((resolve, reject) => {
    console.log("[registerProfileOnServer] start", {
      connected: socket.connected,
      profileInput,
    });

    if (!socket.connected) {
      return reject(new Error("socket not connected"));
    }

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("registerProfile ack timeout"));
    }, 5000);

    socket.emit("registerProfile", profileInput, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      console.log("[registerProfileOnServer] ack", res);

      if (!res?.ok || !res?.profile) {
        return reject(new Error("registerProfile failed"));
      }

      resolve(res.profile);
    });
  });
}


const NPC_STATE = {
    HIDDEN: "HIDDEN",
    Q1: "Q1",
    NOT_GUEST: "NOT_GUEST",
    ASK_NAME: "ASK_NAME",
    PENCIL_READY: "PENCIL_READY",
    NAME_INPUT: "NAME_INPUT",
    CHECK_ID: "CHECK_ID",
    SHOW_ID_CARD: "SHOW_ID_CARD"
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
  if (IS_MOBILE) setMobileHudVisible(true);
  nameOk.style.display = "none";

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
  if (IS_MOBILE) setMobileHudVisible(false);
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
function npcAskName() {
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
function npcCheckId() {
    npcState = NPC_STATE.CHECK_ID;
    npcShowBubble("好的，那這邊需要查看一下您的證件");
    btnNo.textContent = "用力拒絕";
    btnYes.textContent = "拿出證件";

    optionRow.style.opacity = "1";
    optionRow.style.transform = "translateY(0)";
    optionRow.style.pointerEvents = "auto";

    nameRow.style.pointerEvents = "none";
    pencilBtn.style.pointerEvents = "none";
}
async function submitName() {
    console.log("[submitName] fired");
  const raw = nameInput.value ?? "";
  const name = raw.trim();

  if (!name) {
    nameInput.focus();
    return;
  }

  console.log("[name submit]", name);

  try {
    const existing = loadProfileLocal();

    const registeredProfile = await registerProfileOnServer({
      serial: existing?.serial ?? null,   
      name,
      message: existing?.message ?? "",
      avatarPhoto: existing?.avatarPhoto ?? null,
      signature: existing?.signature ?? null,
    });

    saveProfileLocal(registeredProfile);
    localStorage.setItem("polypot_name", registeredProfile.name);

    console.log("[profile created on server]", registeredProfile);

    npcHideAll();

    nameBubble.style.display = "none";
    nameBubble.style.opacity = "0";
    nameBubble.style.pointerEvents = "none";
    pencilBtn.style.opacity = "0";
    pencilBtn.style.pointerEvents = "none";

    npcCheckId();
    } catch (err) {
    console.error("[submitName] register failed", err);
    npcShowBubble(`身份登記失敗：${err.message}`);
    }
}

function npcOpenNameInput() {
  npcState = NPC_STATE.NAME_INPUT;
  nameOk.style.display = "inline-flex";
  nameBubble.style.display = "flex";

  requestAnimationFrame(() => {
    pencilBtn.style.transform = `translateX(${PENCIL_SHIFT_OPEN}px)`; // 往左滑
    nameBubble.style.opacity = "1";
    nameBubble.style.pointerEvents = "auto";
    nameBubble.style.transform = "translateX(0)";
  });

  setTimeout(() => nameInput.focus(), 0);
}


btnNo.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  console.log("[btnNo] state=", npcState);
  if (npcState === NPC_STATE.Q1) npcKickOut();
  if (npcState === NPC_STATE.CHECK_ID) {
    clearProfileLocal();
    npcKickOut();
  }
});

btnYes.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  console.log("[btnYes] state=", npcState);
  if (npcState === NPC_STATE.Q1) npcAskName();
  if (npcState === NPC_STATE.CHECK_ID) {
    npcState = NPC_STATE.SHOW_ID_CARD;
    const profile = loadProfileLocal();
    console.log("[show id card] profile =", profile);
    npcShowBubble("為您確認證件中......");
    optionRow.style.opacity = "0";
    optionRow.style.pointerEvents = "none";
    showIdCard(profile);
}
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
  submitName();
});
kickedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearProfileLocal();
    window.location.reload();
});

btnEnterHall.addEventListener("click", () => {
    window.location.href = "/hall.html";
});
btnWander.addEventListener("click", () => {
    doorTipOnce("可隨時進入宴席會場", 1500);
});

const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

let mobileInput = null;
function setMobileHudVisible(visible) {
  const isVisible = !!visible;

  if (mobileInput?.setVisible) {
    mobileInput.setVisible(isVisible);
  }

  // fallback：就算 API 沒吃到，也直接抓 root
  const root = document.getElementById("mobile-input-root");
  if (root) {
    root.style.display = isVisible ? "block" : "none";
    root.style.pointerEvents = isVisible ? "auto" : "none";
    root.style.opacity = isVisible ? "1" : "0";
  }
}

const ACTION = {
  SELECT: "SELECT",
  CANCEL: "CANCEL",
  CONFIRM: "CONFIRM",
  JUMP: "JUMP",
};

function enqueueAction(type) {
  console.log("[white mobile action]", type);

  // white 目前沒有正式 FSM，先只做測試用
  if (type === ACTION.CANCEL) {
    npcHideAll?.();
    doorHidePrompt?.();
    hideIdCard?.();
    closeAvatarEditor?.();
  }
}


if (window.matchMedia("(pointer: coarse)").matches) {
  mobileInput = initMobileInput({
    keys,
    enqueueAction,
    ACTION,
    getState: () => "WHITE",
    isUiOpen: () =>
      uiActive ||
      idOverlay.style.display !== "none" ||
      avatarOverlay.style.display !== "none",

    onLook: (nx, ny) => {
      if (!touchLook) return;

      const dt = clock.getDelta(); // 你 main.js 已經有 clock

      const SPEED = 2.2; // 可調（1.5~3）

      touchLook.yaw -= nx * SPEED * dt;
      touchLook.pitch -= ny * SPEED * dt;

      touchLook.pitch = THREE.MathUtils.clamp(
        touchLook.pitch,
        -touchLook.maxPitch,
        touchLook.maxPitch
      );

      applyTouchLook();
    }
  });
}

window.addEventListener("keydown", (e) => {
  console.log("[keydown]", e.code, "uiActive=", uiActive, "locked=", controls?.isLocked);

  if (e.code === "Escape") { npcHideAll(); return; }

  if (uiActive) return;

  if (e.code === "KeyW") keys.forward = true;
  if (e.code === "KeyA") keys.left = true;
  if (e.code === "KeyS") keys.back = true;
  if (e.code === "KeyD") keys.right = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.forward = false;
  if (e.code === "KeyA") keys.left = false;
  if (e.code === "KeyS") keys.back = false;
  if (e.code === "KeyD") keys.right = false;
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

let doorMesh = null;
let doorBox = new THREE.Box3();
let doorInRange = false;
const DOOR_TRIGGER_PAD = 0.35;
let sceneReadyAt = performance.now();
const DOOR_ACTIVE_DELAY = 800;

function refreshDoorBox() {
    if (!doorMesh) return;
    doorBox.setFromObject(doorMesh);
    doorBox.expandByScalar(DOOR_TRIGGER_PAD);
}
function updateDoorProximity() {
    
    if (!IS_MOBILE && !controls?.isLocked) return;
    if (!idVerified) return;
    if (performance.now() - sceneReadyAt < DOOR_ACTIVE_DELAY) return;
    if (!doorMesh) return;
    if (uiActive) return;

    const playerPos = controls.getObject().position;
    const dist = doorBox.distanceToPoint(playerPos);
    const inRange = dist <= 1e-6;

    if (inRange && !doorInRange){
        doorInRange = true;
        doorEnterPrompt();
    }
    if (!inRange && doorInRange) {
        doorInRange = false;
        doorHidePrompt();
    }
}

let avatar3 = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    root: null,
    targetMesh: null,
    lastTexture: null,
};
const loader = new GLTFLoader();

function initAvatarPreview() {
    if (avatar3.renderer) return;

    const w = previewWrap.clientWidth;
    const h = previewWrap.clientHeight;

    avatar3.scene = new THREE.Scene();
    avatar3.scene.background = new THREE.Color(0xf3f3f3);

    avatar3.camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 100);
    avatar3.camera.position.set(1.6, 1.4, 2.4);

    avatar3.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true});
    avatar3.renderer.setSize(w, h);
    avatar3.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewWrap.appendChild(avatar3.renderer.domElement);

    avatar3.scene.add(new THREE.AmbientLight(0xffffff, 5));
    const dir = new THREE.DirectionalLight(0xffffff, 5);
    dir.position.set(2, 4, 3);
    avatar3.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 5);
    dir2.position.set(-2, -2, -2);
    avatar3.scene.add(dir2);


    avatar3.controls = new OrbitControls(avatar3.camera, avatar3.renderer.domElement);
    avatar3.controls.enableDamping = true;
    avatar3.controls.enablePan = false;
    avatar3.controls.minDistance = 1.2;
    avatar3.controls.maxDistance = 4.5;

    loader.load(
        "/avatar.glb",
        (gltf) => {
            avatar3.root = gltf.scene;
            avatar3.scene.add(avatar3.root);

            const box = new THREE.Box3().setFromObject(avatar3.root);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            avatar3.root.position.sub(center);

            const maxAxis = Math.max(size.x, size.y, size.z);
            const scale = 1.4 / maxAxis;
            avatar3.root.scale.setScalar(scale);

            const box2 = new THREE.Box3().setFromObject(avatar3.root);
            const center2 = new THREE.Vector3();
            box2.getCenter(center2);
            avatar3.controls.target.copy(center2);

            avatar3.targetMesh = null;
            avatar3.root.traverse((obj) => {
                if (!obj.isMesh) return;
                if (obj.name === "userModel002") avatar3.targetMesh = obj;
            });
        },
        undefined,
        (err) => console.error("[avatar] load /avatar.glb failed, err")
    );

    window.addEventListener("resize", () => {
        if (!avatar3.renderer) return;
        const nw = previewWrap.clientWidth;
        const nh = previewWrap.clientHeight;
        avatar3.camera.aspect = nw / nh;
        avatar3.camera.updateProjectionMatrix();
        avatar3.renderer.setSize(nw, nh);
    });

    function tick() {
        requestAnimationFrame(tick);
        if (!avatar3.renderer) return;
        avatar3.controls?.update();
        avatar3.renderer.setClearColor(0xf3f3f3, 1); // 或你要的背景色
        avatar3.renderer.clear(true, true, true);
        avatar3.renderer.render(avatar3.scene, avatar3.camera);
    }
    tick();

}
function applyTextureToAvatar(texture){
    if (!avatar3.root) return;

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    avatar3.lastTexture = texture;

    const applyToMesh = (mesh) => {
        let mat = mesh.material;
        if (Array.isArray(mat)) mat = mat[0];
        if(!mat) return;

        const cloned = mat.clone();
        cloned.map = texture;
        cloned.needsUpdate = true;
        mesh.material = cloned;
    };
    if (avatar3.targetMesh) {
        applyToMesh(avatar3.targetMesh);
    } else {
        avatar3.root.traverse((obj) => {
            if (obj.isMesh) applyToMesh(obj);
        });
    }
}
uploadBtn.addEventListener("click", () => fileInput.click());

let pendingAvatarPhoto = null;

fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {

        // 1️⃣ 3D 預覽還是可以保留
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        applyTextureToAvatar(tex);

        // 2️⃣ 直接產生 ID card 用的大頭貼
        pendingAvatarPhoto = cropTo34Pixelated(img, 512);

        // 先在 ID 上預覽
        photoImg.src = pendingAvatarPhoto;
        photoImg.style.display = "block";

        URL.revokeObjectURL(url);
    };
    img.src = url;
});

function cropTo34Pixelated(img, outH = 512) {
  const targetAspect = 3 / 4;

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return null;

  const srcAspect = iw / ih;

  let sw, sh;
  if (srcAspect > targetAspect) {
    sh = ih;
    sw = Math.round(ih * targetAspect);
  } else {
    sw = iw;
    sh = Math.round(iw / targetAspect);
  }

  // 隨機裁切位置（偏上）
  const maxX = iw - sw;
  const maxY = ih - sh;

  const sx = Math.round(maxX * Math.random());
  const sy = Math.round(maxY * Math.random() * 0.4);

  // ===== 關鍵：先做「小畫素版本」 =====
  const lowH = 128;                      // ← 故意低畫素
  const lowW = Math.round(lowH * targetAspect);

  const temp = document.createElement("canvas");
  temp.width = lowW;
  temp.height = lowH;
  const tctx = temp.getContext("2d");
  tctx.imageSmoothingEnabled = false;    // 不要平滑
  tctx.drawImage(img, sx, sy, sw, sh, 0, 0, lowW, lowH);

  // ===== 再放大到 512 =====
  const final = document.createElement("canvas");
  final.width = 384;
  final.height = 512;
  const fctx = final.getContext("2d");
  fctx.imageSmoothingEnabled = false;    // 放大時也不要平滑
  fctx.drawImage(temp, 0, 0, 384, 512);

  return final.toDataURL("image/png");
}

function captureIDPhotoFromAvatarPreview() {
  if (!avatar3?.renderer || !avatar3?.scene || !avatar3?.camera) return null;

  // 3:4（寬:高）
  const aspect = 3 / 4;
  const outH = 512;
  const outW = Math.round(outH * aspect);

  // ---- 暫存相機與 renderer 狀態 ----
  const cam = avatar3.camera;

  const prevAspect = cam.aspect;
  const prevRT = avatar3.renderer.getRenderTarget();
  const prevViewport = avatar3.renderer.getViewport(new THREE.Vector4());
  const prevScissor = avatar3.renderer.getScissor(new THREE.Vector4());
  const prevScissorTest = avatar3.renderer.getScissorTest();

  const prevClear = new THREE.Color();
  avatar3.renderer.getClearColor(prevClear);
  const prevClearAlpha = avatar3.renderer.getClearAlpha();

  // ---- 讓相機輸出符合 3:4 ----
  cam.aspect = aspect;
  cam.updateProjectionMatrix();

  const rt = new THREE.WebGLRenderTarget(outW, outH, {
    depthBuffer: true,
    stencilBuffer: false,
  });

  // ---- offscreen render ----
  avatar3.renderer.setRenderTarget(rt);
  avatar3.renderer.setViewport(0, 0, outW, outH);
  avatar3.renderer.setScissor(0, 0, outW, outH);
  avatar3.renderer.setScissorTest(false);

  // 你想要的底色（跟 preview 一致）
  avatar3.renderer.setClearColor(0xf3f3f3, 1);
  avatar3.renderer.clear(true, true, true);

  avatar3.renderer.render(avatar3.scene, cam);

  const pixels = new Uint8Array(outW * outH * 4);
  avatar3.renderer.readRenderTargetPixels(rt, 0, 0, outW, outH, pixels);

  // ---- 還原 ----
  avatar3.renderer.setClearColor(prevClear, prevClearAlpha);
  avatar3.renderer.setClearAlpha(prevClearAlpha);

  avatar3.renderer.setRenderTarget(prevRT);
  avatar3.renderer.setViewport(prevViewport);
  avatar3.renderer.setScissor(prevScissor);
  avatar3.renderer.setScissorTest(prevScissorTest);

  cam.aspect = prevAspect;
  cam.updateProjectionMatrix();

  rt.dispose();

  // pixels (bottom-up) -> canvas (top-down)
  const cvs = document.createElement("canvas");
  cvs.width = outW;
  cvs.height = outH;
  const ctx = cvs.getContext("2d");
  const imgData = ctx.createImageData(outW, outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = ((outH - 1 - y) * outW + x) * 4;
      const dst = (y * outW + x) * 4;
      imgData.data[dst + 0] = pixels[src + 0];
      imgData.data[dst + 1] = pixels[src + 1];
      imgData.data[dst + 2] = pixels[src + 2];
      imgData.data[dst + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return cvs.toDataURL("image/png");
}
confirmBtn.addEventListener("click", () => {
    if (!pendingAvatarPhoto) return;

    photoImg.src = pendingAvatarPhoto;

    const profile = loadProfileLocal();
    if (profile) {
    profile.avatarPhoto = pendingAvatarPhoto;
    saveProfileLocal(profile);
    }
    closeAvatarEditor();
});
cancelBtn.addEventListener("click", () => closeAvatarEditor());
avatarDim.addEventListener("click", () => closeAvatarEditor());

let idCardState = "EDIT";

function setIdCardState(next) {
  idCardState = next;

  const isEdit = next === "EDIT";

  // photo box appearance
  photoBox.style.background = isEdit ? "#F6F6F6" : "transparent";

  // edit button
  editBtn.style.display = isEdit ? "inline-flex" : "none";

  // infoBox behavior
  infoBox.readOnly = !isEdit;
  infoBox.style.background = isEdit ? "#F6F6F6" : "transparent";
  infoBox.style.pointerEvents = isEdit ? "auto" : "none";

  // signature behavior
  signatureCanvas.style.pointerEvents = isEdit ? "auto" : "none";
  sigClearBtn.style.display = isEdit ? "block" : "none";

  // your footer buttons (must exist below this function in your code)
  doneEditBtn.style.display = isEdit ? "inline-flex" : "none";
  continueEditBtn.style.display = isEdit ? "none" : "inline-flex";
  submitBtn.style.display = isEdit ? "none" : "inline-flex";
}

function makePill(text, variant){
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.height = "44px";
    b.style.padding = "12.5px 26px 0 26px";
    b.style.borderRadius = "999px";
    b.style.cursor = "pointer";
    b.style.fontWeight = "800";

    if (variant === "pink") {
        b.style.border = "0";
        b.style.background = "#fd6fff";
        b.style.color = "white";
    } else if (variant === "outlineBlue"){
        b.style.border = "2px solid #1248ff";
        b.style.background = "white";
        b.style.color = "#1248ff";
    } else {
        b.style.border = "0";
        b.style.background = "#eee";
        b.style.color = "#333";
    }
    return b;
}

const doneEditBtn = makePill("編輯完成","pink");
const continueEditBtn = makePill("繼續編輯", "gray");
const submitBtn = makePill("確認提交", "outlineBlue");

footer.appendChild(doneEditBtn);
footer.appendChild(continueEditBtn);
footer.appendChild(submitBtn);

doneEditBtn.addEventListener("click", () => {
    setIdCardState("PREVIEW");
});
continueEditBtn.addEventListener("click", () => {
    setIdCardState("EDIT");
});
submitBtn.addEventListener("click", async () => {
  idVerified = true;
  idOverlay.style.display = "none";

  uiActive = false;
  npcState = NPC_STATE.HIDDEN;
  optionRow.style.pointerEvents = "none";
  optionRow.style.opacity = "0";
  optionRow.style.transform = "translateY(6px)";

  if (!controls.isLocked) controls.lock();

  await bubbleFor("已為您確認身份", 1500);
  await bubbleFor("您可以從旁邊的大門進入會場", 1500);

  bubbleHide();
});


function openAvatarEditor () {
  uiActive = true;
  if (IS_MOBILE) setMobileHudVisible(false);

  avatarOverlay.style.display = "block";
  initAvatarPreview();

  const profile = loadProfileLocal();
  if (profile?.avatarPhoto){
    photoImg.src = profile.avatarPhoto;
    photoImg.style.display = "block";
  }
}
function closeAvatarEditor() {
  avatarOverlay.style.display = "none";
  fileInput.value = "";

  const stillHasUi =
    idOverlay.style.display !== "none" ||
    npcState !== NPC_STATE.HIDDEN ||
    doorUiActive;

  uiActive = stillHasUi;

  if (IS_MOBILE) {
    setMobileHudVisible(!stillHasUi);
  }
}
editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openAvatarEditor();
});

setIdCardState("EDIT");


let envRoot = null;
loader.load("/white.glb", (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    envRoot.updateWorldMatrix(true, true);

    npcMesh = envRoot.getObjectByName("npc_1");
    console.log("[npcMesh]", npcMesh);
    if (!npcMesh) {
        console.warn("找不到 npc_1，請確認 Blender 匯出名稱完全一致");
    }
    
    doorMesh = envRoot.getObjectByName("doorArea");
    console.log("[doorMesh]", doorMesh);

    if (!doorMesh) {
    console.warn("找不到 doorArea，請確認 Blender 匯出名稱完全一致");
    } else {
    refreshDoorBox();

    const s = new THREE.Vector3();
    doorBox.getSize(s);
    console.log("[doorBox size]", s.toArray());
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
    syncTouchLookFromCamera();


    // const spawnLight = new THREE.PointLight(0xffffff, 80, 100);
    // spawnLight.position.set(
    // center.x,
    // center.y + 3,
    // center.z
    // );
    // scene.add(spawnLight);

    // 既然你的場景是長形的，建議前後各放一盞，強度降低
    const light1 = new THREE.PointLight(0xffffff, 50); // 強度大幅調低
    light1.position.set(center.x, 8, center.z - 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xffffff, 50);
    light2.position.set(center.x, 8, center.z + 5);
    scene.add(light2);

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


    if (controls.isLocked || IS_MOBILE) {
        if (keys.forward) controls.moveForward(velocity);
        if (keys.back) controls.moveForward(-velocity);
        if (keys.left) controls.moveRight(-velocity);
        if (keys.right) controls.moveRight(velocity);
    }

    const obj = controls.getObject();
    const bounds = window.__whiteBounds;
    if (bounds) {
        obj.position.x = THREE.MathUtils.clamp(obj.position.x, bounds.min.x, bounds.max.x);
        obj.position.z = THREE.MathUtils.clamp(obj.position.z, bounds.min.z, bounds.max.z);
    }

    function getPlayerPos(out = new THREE.Vector3()) {
        return out.copy(controls.getObject().position);
    }
    const _p = new THREE.Vector3();

    updateDoorProximity();
    updateNpcProximity();
    renderer.render(scene, camera);
}
animate();