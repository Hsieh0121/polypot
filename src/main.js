import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { emissive } from "three/tsl";


const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 50, 30, 2);
pointLight.position.set(0, 3, 0);
scene.add(pointLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const camera = new THREE.PerspectiveCamera(
  75, // 視角（越大越廣角）
  window.innerWidth / window.innerHeight, // 長寬比
  0.1, // 最近可看到的距離
  1000 // 最遠可看到的距離
);
const renderer = new THREE.WebGLRenderer();
function resize(){
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener("resize", resize);
resize();


const player = new THREE.Object3D();
scene.add(player);
player.add(camera);
camera.position.set(0, 4, 0);


const app = document.querySelector("#app");
app.appendChild(renderer.domElement);

const hub = document.createElement("div");
hub.style.position = "fixed";
hub.style.left = "50%";
hub.style.bottom = "10%";
hub.style.transform = "translateX(-50%)";
hub.style.padding = "10px 14px";
hub.style.background = "rgba(0,0,0,0.55)";
hub.style.color = "white";
hub.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
hub.style.fontSize = "14px";
hub.style.borderRadius = "10px";
hub.style.pointerEvents = "none";
hub.style.display = "none";
hub.style.zIndex = "9999";
document.body.appendChild(hub);

function showHUD(text){
  hub.textContent = text;
  hub.style.display = "block";
}
function hideHUD(){
  hub.style.display = "none";
}

const raycaster = new THREE.Raycaster();
let highlightedTable = null;
let savedEmissive = new Map();
let selectedTable = null;
let pendingSelect = false;
let hoveredTableId = null;
let hoveredEntry = null;
let selectedTableId = null;
let activeTableId = null;
let activeEntry = null;



const INTERACT_DISTANCE = 3.0;
const _tmpClosest = new THREE.Vector3();
function distanceToTable(entry, playerPos){
  entry.bbox.clampPoint(playerPos, _tmpClosest);
  return _tmpClosest.distanceTo(playerPos);
};


const tableRegistry = new Map();
function buildTableInfo(tableRoot){
  const bbox = new THREE.Box3().setFromObject(tableRoot);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  tableRegistry.forEach((entry) => {
    const box = new THREE.Box3().setFromObject(entry.root);
    entry.bbox = box;
  });

  const potRef = findFirstMeshByNameIncludes(tableRoot, ["potbody", "soup", "pothandle", "potstand", "stovebody", "stovebutton", "stovecap", "fire"]) || null;
  const seatPoints = [];

  return {
    id: tableRoot.name,
    root: tableRoot,
    bbox,
    center,
    seatPoints,
    potRef,
  };
}

function findPotRef(tableRoot) {
  const cadidates = ["potbody_", "soup_", "pothandle_", "potstand_", "stovebody_", "stovebutton_", "stovecap_", "fire_"];
  let found = null;
  tableRoot.traverse((o) => {
    if (!o.name) return;
    const name = o.name.toLowerCase();
    for (const key of cadidates) {
      if (name.startsWith(key)){
        found = o;
        break;
      }
    }
  });
  return found;
}

tableRegistry.forEach((entry) => {
  entry.potRef = findPotRef(entry.root);
  console.log(entry.id, "potRef =", entry.potRef?.name ?? "NOT FOUND");
})

const savedPotEmissive = new Map();
let activePotRoot = null;

function setPotHighlight(potRef, on){
  if (!potRef) return;

  potRef.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (!mat) return;
    if (!mat.emissive) return;
    if (on) {
      if (!savedPotEmissive.has(o.uuid)){
        savedPotEmissive.set(o.uuid, mat.emissive.clone());
      }
      mat.emissive.set(0x999999);
    } else {
      const prev = savedPotEmissive.get(o.uuid);
      if (prev) mat.emissive.copy(prev);
    }
  });
  if (!on) {
    savedPotEmissive.clear();
  }
}

function findFirstMeshByNameIncludes(root, keywords = []){
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    if (!obj.isMesh) return;
    const n = (obj.name || "").toLowerCase();
    if (keywords.some((k) => n.includes(k.toLowerCase()))) found = obj;
  });
  return found;
}

function trySelectHoverTable(){
  if (selectedTable) return;
  if (!hoveredTableId) return;
  const info = tableRegistry.get (hoveredTableId);
  if (!info) return;
  const dist = distanceToTable(info, player.position);
  if (dist > INTERACT_DISTANCE) return;
  selectedTable = hoveredTableId;
  console.log("selected:", selectedTableId);
}


const controls = new PointerLockControls(camera, renderer.domElement);
// controls.enablePan = false;
// controls.minDistance = 1;
// controls.maxDistance = 20;

camera.position.set(0, 4, 5);
// controls.target.set(0, 1.2, 0);
// controls.update();

const walkables = [];
let velY = 0;
let isGrounded = true;

const GRAVITY = 25;      // 重力強度，之後可調
const JUMP_VEL = 8;      // 起跳速度，之後可調
const GROUND_Y = 1.6;      // 先假設地板高度是 0，之後再改成實際地板
const EYE_HEIGHT = 1.6;         // 你目前用的站立高度
const GROUND_EPS = 0.05;        // 容差，避免抖動
const RAY_FAR = 10;             // 往下找地面的距離


window.addEventListener("click", async () =>{
  try{
  if (!controls.isLocked) controls.lock();
  } catch (err){}
});

const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  boost: false,
};

window.addEventListener("keydown", (e) => {
  console.log ("keydown:", e.code, e.key);
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.forward = true;
  if (e.code === "ArrowDown" || e.code === "KeyS") keys.back = true;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.boost = true;
  if (e.code === "KeyE") {
    e.preventDefault();
    trySelectHoverTable();
    return;
  };
  
  if (e.code === "KeyR"){
    if (selectedTable){
      console.log("cancel selection:", selectedTableId);
      selectedTable = null;
      selectedTableId = null;
    }
    return;
  }
  if (e.code === "Space"){
    e.preventDefault();
    if (isGrounded){
      velY = JUMP_VEL;
      isGrounded = false;
      console.log("[jump] start", {velY, y: player.position.y});
    }
    return;
  }
})
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.forward = false;
  if (e.code === "ArrowDown" || e.code === "KeyS") keys.back = false;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.boost = false;
})




const tables = [];
const tableBoxes = new Map();
let envRoot = null;


const loader = new GLTFLoader();
loader.load(
  "/newenv.glb",
  (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    envRoot.traverse((obj) => {
  if (obj.name) console.log(obj.name);
});

    // scene.remove(cube);
    console.log("=== GLB nodes ===");
    envRoot.traverse((obj) => {
      if (obj.name) console.log(obj.name);
    });

    envRoot.updateWorldMatrix(true, true);
    const envBox = new THREE.Box3().setFromObject(envRoot);
    window.__envBox = envBox;

    const center = new THREE.Vector3();
    envBox.getCenter(center);

    player.position.set(center.x, 1.8, center.z);
    camera.position.set(0, 2, 0);

    tables.length = 0;
    tableBoxes.clear();

    for (let i = 1; i <= 8; i++){
      const t = envRoot.getObjectByName(`table${i}`);
      if (!t){
        console.warn(`找不到 table${i}，請確認glb內節點命名`);
        continue;
      }
      tables.push(t);
      t.updateMatrixWorld(true, true);
      const box = new THREE.Box3().setFromObject(t);
      tableBoxes.set(t, box);
    }
    console.log("tables found:", tables.map(t => t.name));
    tableRegistry.clear();
    tables.forEach((t) => {
      tableRegistry.set(t.name, buildTableInfo(t));
    });
    console.log("tableRegistry ready:", Array.from(tableRegistry.keys()));
    tables.forEach(makeMaterialsUnique);
    console.log("made table materials unique");
    console.log("envBox:", envBox.min, envBox.max);

    walkables.length = 0;
    const stageObj = envRoot.getObjectByName("stage");
    const stairObj = envRoot.getObjectByName("stair");
    const floorObj = envRoot.getObjectByName("floor");
    if (stageObj) walkables.push(stageObj);
    if (stairObj) walkables.push(stairObj);
    if (floorObj) walkables.push(floorObj);
    console.log("walkables:", walkables.map(o => o.name));
  },
  undefined,
  (error) => console.error(error),
  
);



// const geometry = new THREE.BoxGeometry();
// const material = new THREE.MeshBasicMaterial({color: 0x00ff});
// const cube = new THREE.Mesh(geometry, material);
// scene.add(cube);

// camera.position.z = 5;

function getLookAtTable(){
  if (!tables || tables.length === 0) return null;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(tables, true);
  if (hits.length === 0) return null;
  let obj = hits[0].object;
  while (obj && !tables.includes(obj)) obj = obj.parent;
  return obj || null;
}

function applyDim(tableRoot, dimHex = 0x33333) {
  if (!tableRoot) return;
  tableRoot.traverse((child) => {
    if (!child.isMesh) return;
    const mat = child.material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    mats.forEach((m) => {
      if (!m || !m.emissive) return;
      const key = `${child.uuid}:${m.uuid}`;
      if (!savedEmissive.has(key)){
        savedEmissive.set(key, m.emissive.clone());
      }
      m.emissive.set(dimHex);
    });
  });
}
function restoreEmissive(tableRoot){
  if(!tableRoot)return;
  tableRoot.traverse((child) => {
    if (!child.isMesh) return;
    const mat = child.material;
    if(!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    mats.forEach((m) => {
      if (!m || !m.emissive) return;
      const key = `${child.uuid}:${m.uuid}`;
      const saved = savedEmissive.get(key);
      if (saved){
        m.emissive.copy(saved);
        savedEmissive.delete(key);
      }
    });
  });
}
function makeMaterialsUnique(root){
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.material) return;
    if (child.userData.__uniqueMaterialDone) return;
    if (Array. isArray(child.material)){
      child.material = child.material.map((m) => (m ? m.clone() : m));
    } else {
      child.material = child.material.clone();
    }
    child.userData.__uniqueMaterialDone = true;
  })
}
function getGroundYUnderPlayer(playerPos){
  if (walkables.length === 0) return null;
  const origin = playerPos.clone();
  const dir = new THREE.Vector3(0, -1, 0);
  raycaster.set(origin, dir);
  raycaster.far = RAY_FAR;
  const hits = raycaster.intersectObjects(walkables, true);
  for (const h of hits){
    if (h.face && h.face.normal && h.face.normal.y > 0.5){
      return h.point.y;
    }
  }
  return null;
}


const moveDir = new THREE.Vector3();

function animate(){
  requestAnimationFrame(animate);
  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;

  const baseSpeed = 0.1;
  const speed = keys.boost ? baseSpeed * 2.5 : baseSpeed;
  
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, camera.up).normalize();

  const delta = new THREE.Vector3();
  if (keys.forward) delta.add(forward);
  if (keys.back) delta.sub(forward);
  if (keys.right) delta.add(right);
  if (keys.left) delta.sub(right);

  if (delta.lengthSq() > 0){
    delta.normalize().multiplyScalar(speed);
    player.position.add(delta);
    const box = window.__envBox;
if (box) {
  const margin = 0.2;

  player.position.x = THREE.MathUtils.clamp(
    player.position.x,
    box.min.x + margin,
    box.max.x - margin
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z,
    box.min.z + margin,
    box.max.z - margin
  );
    }
  }
  const dt = 1/60;
  velY -= GRAVITY * dt;
  player.position.y += velY * dt;

  const groundY = getGroundYUnderPlayer(player.position);
  if (groundY !== null) {
    const targetPlayerY = groundY + EYE_HEIGHT;
    const falling = velY <= 0;

    if (falling && player.position.y <= targetPlayerY + GROUND_EPS){
      player.position.y = targetPlayerY
      velY = 0;
      isGrounded = true;
    } else {
      isGrounded = false;
    };
  } else {
    isGrounded = false;
  }

  const playerPos = camera.position;

  // --- 桌子 hover / select ---
if (tables.length > 0) {
  if (!selectedTable){
    const hitTable = getLookAtTable();
    if (hitTable !== highlightedTable ) {
      if (highlightedTable) restoreEmissive(highlightedTable);
      highlightedTable = hitTable;
      if (highlightedTable){
        applyDim(highlightedTable, 0x33333);
        console.log("looking at:", highlightedTable.name);
      }
    } 

    const hoverId = hitTable ? hitTable.name : null;
    const hoveredEnt = hoverId ? (tableRegistry.get(hoverId) || null) : null;

    hoveredTableId = hoverId;
    hoveredEntry = hoveredEnt;

    if(pendingSelect){
      pendingSelect = false;
    }

    if (hoveredEntry) {
      const d = distanceToTable(hoveredEntry, playerPos);
      if (d <= INTERACT_DISTANCE) showHUD (`${hoverId} - Press E`);
      else showHUD (`${hoveredTableId}`);
    } else {
      hideHUD();
    }

    if (pendingSelect){
      pendingSelect = false;
      if (highlightedTable){
        selectedTable = highlightedTable;
        applyDim(selectedTable, 0xFFFF);
        console.log ("selected:", selectedTable.name);
      }
    }
  } 



let candidateTableId = selectedTableId || hoveredTableId;
if (candidateTableId){
  const info = tableRegistry.get(candidateTableId);
  if(info){
    const dist = distanceToTable(info, player.position);
    const canInteract = dist <= INTERACT_DISTANCE;
    if (!selectedTable){
      if (canInteract) showHUD(`Press E to select ${candidateTableId}`);
      else showHUD(`${candidateTableId} (too far)`);
    } else {
      showHUD(`selected: ${selectedTable} (R to cancel)`);
    }
  } else {
    hideHUD();
  } 
} else {
  hideHUD();
}

let nextPotRoot = null;
if (activeTableId) {
  nextPotRoot = tableRegistry.get(activeTableId)?.potRef ?? null;
}
if (nextPotRoot !== activePotRoot) {
  if (activePotRoot) setPotHighlight (activePotRoot, false);
  activePotRoot = nextPotRoot;
  if (activePotRoot) setPotHighlight (activePotRoot, true);
  console.log("active pot:", activePotRoot?.name ?? "none");
}

  controls.update();
  renderer.render(scene, camera);
};
}

animate()