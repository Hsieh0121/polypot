import * as THREE from "three";
import { GLTFLoader, OrbitControls } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import "./style.css";
import { depth } from "three/tsl";


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
let idVerified = false;

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

// =========================
// ID CARD UI (MVP overlay)
// =========================

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
idCard.style.width = "600px";
idCard.style.height = "360px";
idCard.style.background = "white";
idCard.style.borderRadius = "28px";
idCard.style.boxShadow = "0 18px 60px rgba(0,0,0,0.20)";
idCard.style.display = "flex";
idCard.style.gap = "18px";
idCard.style.padding = "36px";
idCard.style.alignItems = "center";
idCard.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
idOverlay.appendChild(idCard);

const leftCol = document.createElement("div");
leftCol.style.height = "100%";
leftCol.style.display = "flex";
leftCol.style.flexDirection = "column";
leftCol.style.justifyContent = "center";
leftCol.style.alignItems = "stretch";
idCard.appendChild(leftCol);

// 左：照片框
const photoBox = document.createElement("div");
photoBox.style.width = "auto";
photoBox.style.aspectRatio = "3 / 4";
photoBox.style.height = "290px";
photoBox.style.alignSelf = "center";
photoBox.style.border = "2px solid #fd6fff";
photoBox.style.borderRadius = "18px";
photoBox.style.position = "relative";
photoBox.style.overflow = "hidden";
photoBox.style.background = "#f7f7f7";
leftCol.appendChild(photoBox);

// 照片 img（先空）
const photoImg = document.createElement("img");
photoImg.alt = "avatar";
photoImg.style.position = "absolute";
photoImg.style.inset = "0";
photoImg.style.width = "100%";
photoImg.style.height = "100%";
photoImg.style.objectFit = "cover";
photoImg.style.display = "none";
photoBox.appendChild(photoImg);

// 編輯按鈕
const editBtn = document.createElement("button");
editBtn.type = "button";
editBtn.textContent = "編輯";
editBtn.style.position = "absolute";
editBtn.style.left = "50%";
editBtn.style.bottom = "14px";
editBtn.style.transform = "translateX(-50%)";
editBtn.style.border = "0";
editBtn.style.cursor = "pointer";
editBtn.style.height = "46px";
editBtn.style.padding = "13px 26px 0 26px";
editBtn.style.borderRadius = "999px";
editBtn.style.background = "#fd6fff";
editBtn.style.color = "white";
editBtn.style.fontWeight = "800";
editBtn.style.boxShadow = "0 10px 26px rgba(0,0,0,0.16)";
photoBox.appendChild(editBtn);


editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
});



// 右：資訊區
const right = document.createElement("div");
right.style.display = "flex";
right.style.flexDirection = "column";
right.style.alignItems = "flex-end";
right.style.justifyItems = "end";
right.style.height = "290px";
right.style.gap = "8px";
right.style.textAlign = "right";
idCard.appendChild(right);

// 右上：IDENTIFICATION CARD
const idTitle = document.createElement("img");
idTitle.src = "/id.png";  
idTitle.alt = "IDENTIFICATION CARD";
idTitle.style.height = "auto";     
idTitle.style.width = "360px";
idTitle.style.objectFit = "contain";
// idTitle.style.justifySelf = "end"; 
right.appendChild(idTitle);

// const spacerTop = document.createElement("div");
// spacerTop.style.flex = "1";
// right.appendChild(spacerTop);

// 右中：留言
const msgWrap = document.createElement("div");
msgWrap.style.width = "325px";
msgWrap.style.height = "200px"
msgWrap.style.alignSelf = "flex-end";
msgWrap.style.justifySelf = "end";
msgWrap.style.border = "2px solid #fd6fff";
msgWrap.style.borderRadius = "18px";
msgWrap.style.padding = "14px";
msgWrap.style.display = "grid";
msgWrap.style.gridTemplateRows = "auto 1fr";
msgWrap.style.rowGap = "12px";
right.appendChild(msgWrap);

const msgHint = document.createElement("div");
msgHint.textContent = "輸入任意留言（可選）";
msgHint.style.fontSize = "14px";
msgHint.style.fontWeight = "800";
msgHint.style.color = "#fd6fff";
msgHint.style.textAlign = "right";
msgWrap.appendChild(msgHint);

const msgInput = document.createElement("textarea");
msgInput.style.rows = 3;
msgInput.placeholder = "";
msgInput.style.width = "100%";
msgInput.style.resize = "none";
msgInput.style.border = "0";
msgInput.style.outline = "none";
msgInput.style.fontSize = "14px";
msgInput.style.fontWeight = "700";
msgInput.style.textAlign = "right";
msgInput.style.color = "#fd6fff";
msgInput.style.background = "transparent";
msgWrap.appendChild(msgInput);

msgInput.addEventListener("input", () => {
    const profile = JSON.parse(localStorage.getItem("polypot_profile") || "null");
    if (!profile) return;
    profile.message = msgInput.value;
    localStorage.setItem("polypot_profile", JSON.stringify(profile));
});

const msgPrinted = document.createElement("div");
msgPrinted.style.position = "absolute";
msgPrinted.style.display = "none";
idOverlay.appendChild(msgPrinted);

// const spacerBottom = document.createElement("div");
// spacerBottom.style.flex = "0.7";
// right.appendChild(spacerBottom);

const bottomRow = document.createElement("div");
bottomRow.style.marginTop = "auto";
bottomRow.style.display = "flex";
bottomRow.style.flexDirection = "column";
bottomRow.style.alignItems = "flex-end";
bottomRow.style.gap = "0.8px";
bottomRow.style.justifyContent = "space-between";
right.appendChild(bottomRow);


const serialText = document.createElement("div");
serialText.style.fontSize = "16px";
serialText.style.fontWeight = "900";
serialText.style.textAlign = "right";
serialText.style.color = "#fd6fff";
bottomRow.appendChild(serialText);

const nameText = document.createElement("div");
nameText.style.fontSize = "44px";
nameText.style.fontWeight = "1000";
nameText.style.letterSpacing = "0.02em";
nameText.style.textAlign = "right";
nameText.style.color = "#1248ff";
bottomRow.appendChild(nameText);

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

const footer = document.createElement("div");
footer.style.position = "absolute";
footer.style.left = "50%";
footer.style.bottom = "-54px";
footer.style.transform = "translateX(-50%)";
footer.style.display = "flex";
footer.style.gap = "16px";
idCard.appendChild(footer);

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
    if (!controls?.isLocked) return;
    doorUiActive = true;
    uiActive = true;

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
    uiActive = false;
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

const LS_NEXT_ID = "polypot_nextId";
const LS_PROFILE = "polypot_profile";

function pad (num, len) {
    return String(num).padStart(len, "0");
}
function formatSerial(id) {
    return `P${pad(id, 6)}`;
}
function allocateSerialLocal() {
    const cur = parseInt (localStorage.getItem(LS_NEXT_ID) || "1", 10);
    const id = Number.isFinite(cur) && cur > 0 ? cur : 1;
    localStorage.setItem(LS_NEXT_ID, String(id + 1));
    return { id, serial: formatSerial(id) };
}
function saveProfileLocal(profile) {
    localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
}
function clearProfileLocal() {
    localStorage.removeItem("polypot_name");
    localStorage.removeItem(LS_PROFILE);
    localStorage.removeItem(LS_NEXT_ID);
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
function submitName() {
    const raw = nameInput.value ?? "";
    const name = raw.trim();
    if (!name) {
        nameInput.focus();
        return;
    }
     console.log("[name submit]", name);
    npcHideAll();

    const { id, serial } = allocateSerialLocal();
    const profile = {
        id,
        serial,
        name,
        message: "",
        avatarPhoto: null,
        createAt: Date.now()
    };
    saveProfileLocal(profile);
    localStorage.setItem("polypot_name", name);
    console.log("[profile created]", profile);

    nameBubble.style.display = "none";
    nameBubble.style.opacity = "0";
    nameBubble.style.pointerEvents = "none";
    pencilBtn.style.opacity = "0";
    pencilBtn.style.pointerEvents = "none";

    npcCheckId();

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
function showIdCard (profile) {
    idOverlay.style.display = "block";
    serialText.textContent = profile?.serial ?? "";
    nameText.textContent = profile?.name ?? "";

    msgInput.value = profile?.message ?? "";

    if (profile?.avatarPhoto) {
        photoImg.src = profile.avatarPhoto;
        photoImg.style.display = "block";
    } else {
        photoImg.style.display = "none";
    }
}
function hideIdCard(){
    idOverlay.style.display = "none";
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
    const profile = JSON.parse(localStorage.getItem(LS_PROFILE) || "null")
    console.log ("[show id card] profile =", profile);
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
    console.log("[name]", nameInput.value);
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

const keys = { w: false, a: false, s: false, d: false };

window.addEventListener("keydown", (e) => {
  console.log("[keydown]", e.code, "uiActive=", uiActive, "locked=", controls?.isLocked);

  if (e.code === "Escape") { npcHideAll(); return; }

  if (uiActive) return;

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
    
    if (!controls?.isLocked) return;
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

fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    photoImg.src = url;
    photoImg.style.display = "block";

    const img = new Image();
    img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        applyTextureToAvatar(tex);
        URL.revokeObjectURL(url);
    };
    img.src = url;
});

function captureTopFaceIDPhoto() {
  if (!avatar3?.root || !avatar3?.renderer || !avatar3?.scene) return null;

  const box = new THREE.Box3().setFromObject(avatar3.root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // 3:4（寬:高）
  const aspect = 3 / 4;
  const outH = 512;
  const outW = Math.round(outH * aspect);

  // 這裡是你「從上往下」看，取一個視野範圍
  const frustumH = Math.max(size.x, size.z) * 0.65;
  const frustumW = frustumH * aspect;

  const cam = new THREE.OrthographicCamera(
    -frustumW, frustumW,
    frustumH, -frustumH,
    0.01, 100
  );

  cam.position.set(center.x, box.max.y + 2.0, center.z);
  cam.up.set(0, 0, -1);            // 可選：讓 top-view 的方向更像「正的」
  cam.lookAt(center.x, center.y, center.z);
  cam.updateProjectionMatrix();

  const rt = new THREE.WebGLRenderTarget(outW, outH, {
    depthBuffer: true,
    stencilBuffer: false,
  });

  const prevRT = avatar3.renderer.getRenderTarget();
  const prevViewport = avatar3.renderer.getViewport(new THREE.Vector4());
  const prevScissor = avatar3.renderer.getScissor(new THREE.Vector4());
  const prevScissorTest = avatar3.renderer.getScissorTest();

  // 確保 offscreen render 不受你主畫面 viewport/scissor 影響
  avatar3.renderer.setRenderTarget(rt);
  avatar3.renderer.setViewport(0, 0, outW, outH);
  avatar3.renderer.setScissor(0, 0, outW, outH);
  avatar3.renderer.setScissorTest(false);

  avatar3.renderer.render(avatar3.scene, cam);

  const pixels = new Uint8Array(outW * outH * 4);
  avatar3.renderer.readRenderTargetPixels(rt, 0, 0, outW, outH, pixels);

  // 還原 renderer 狀態
  avatar3.renderer.setRenderTarget(prevRT);
  avatar3.renderer.setViewport(prevViewport);
  avatar3.renderer.setScissor(prevScissor);
  avatar3.renderer.setScissorTest(prevScissorTest);

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
      imgData.data[dst + 3] = pixels[src + 3];
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return cvs.toDataURL("image/png");
}

confirmBtn.addEventListener("click", () => {
    const dataUrl = captureTopFaceIDPhoto();
    if (!dataUrl) return;

    photoImg.src = dataUrl;
    photoImg.style.display = "block";

    const profile = JSON.parse(localStorage.getItem("polypot_profile") || "null");
    if (profile) {
        profile.avatarPhoto = dataUrl;
        localStorage.setItem("polypot_profile", JSON.stringify(profile));
    }
    closeAvatarEditor();
});
cancelBtn.addEventListener("click", () => closeAvatarEditor());
avatarDim.addEventListener("click", () => closeAvatarEditor());

let idCardState = "EDIT";

function setIdCardState (next) {
    idCardState = next;

    const isEdit = next === "EDIT";

    msgWrap.style.display = isEdit ? "grid" : "none";
    editBtn.style.display = isEdit ? "inline-flex" : "none";

    photoBox.style.border = isEdit ? "2px solid #fd6fff" : "0";
    photoBox.style.background = isEdit ? "#f7f7f7" : "transparent";

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
    avatarOverlay.style.display = "block";
    initAvatarPreview();

    const profile = JSON.parse(localStorage.getItem("polypot_profile") || "null");
    if (profile?.avatarPhoto){
        photoImg.src = profile.avatarPhoto;
        photoImg.style.display = "block";
    }
}
function closeAvatarEditor() {
    avatarOverlay.style.display = "none";
    fileInput.value = "";
}
editBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openAvatarEditor();
});

setIdCardState("EDIT");


let envRoot = null;
loader.load("/white_B.glb", (gltf) => {
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

    function getPlayerPos(out = new THREE.Vector3()) {
        return out.copy(controls.getObject().position);
    }
    const _p = new THREE.Vector3();

    updateDoorProximity();
    updateNpcProximity();
    renderer.render(scene, camera);
}
animate();