import { io } from "socket.io-client";
import * as THREE from "three";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";


const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const camera = new THREE.PerspectiveCamera(
  60, // 視角（越大越廣角）
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
};

const socket = io("http://localhost:3001", { transports: ["websocket"] });
const profile = JSON.parse(sessionStorage.getItem("polypot_profile") || "{}");
const remotePlayers = new Map();

function makeRemoteAvatar () {
  const geo = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
  const mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
};

function spawnRemote(player) {
  const avatar = makeRemoteAvatar();
  avatar.position.set(player.pos.x, player.pos.y, player.pos.z);
  avatar.rotation.y = player.rotY || 0;
  scene.add(avatar);
  remotePlayers.set(player.id, avatar);
};

socket.emit ("join", profile, ({ self, other }) => {
  other.forEach(spawnRemote);
  if (envRoot && self.seatId) {
    const anchor = envRoot.getObjectByName (self.seatId);
    if (anchor) {
      player.position.set(anchor.position.x, 1.6, anchor.position.z + 1.0);
    }
  }
});

socket.on("player:join", (p) => {
  spawnRemote(p);
});

socket.on("player:leave", ({ id }) => {
  despawnRemote(id);
});

socket.on("player: move", ({ id, pos, rotY }) => {
  const obj = remotePlayers.get(id);
  if (!obj) return;
  obj.position.set(pos.x, pos.y, pos.z);
  obj.rotation.y = rotY || 0;
});

let lastNetSend = 0;

function getYawFromCamera() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  return e.y;
}

const player = new THREE.Object3D();
scene.add(player);
player.add(camera);
camera.position.set(0, 5, 0);
const playerPos = player.position;

const now = performance.now();
if (now - lastNetSend > 50) {
  lastNetSend = now;
  socket.emit("player:move", {
    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
    rotY: getYawFromCamera(),
  });
}

socket.on("server:hello", (data) => {
  console.log("[socket] server:hello", data);
});
socket.on("server:pong", (data) => {
  console.log("[socket] server:pong", data);
});
socket.on("connect_error", (err) => {
  console.error("[socket] connect_error", err.message);
});


window.addEventListener("resize", resize);
resize();


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

const FSM = {
  FREE_ROAM: "FREE_ROAM",
  SEATED: "SEATED",
  UI_OPEN: "UI_OPEN",
};
let state = FSM.FREE_ROAM;

const seatsState = new Map();

const raycaster = new THREE.Raycaster();
let highlightedTable = null;
let savedEmissive = new Map();
let selectedTable = null;
let pendingSelect = false;
let hoveredEntry = null;
let selectedTableId = null;
let activeTableId = null;
let activeEntry = null;
let hoveredTableId = null;
let hoveredSeatId = null;
let hoveredSeatTableId = null;
let lastHoverSeatId = null;
let seatMakers = [];
let seatHitMeshes = [];
let seatVisualByKey = new Map();
let isSeated = false;
let seated = null;
let pendingActionE = false;

const localPlayerId = "local";
const seatAnchorByKey = new Map();
const hudEl = document.getElementById("hud");
const colliders = [];
const PLAYER_RADIUS = 0.65;
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
console.log("[controls]", controls);
console.log("[controls keys]", controls && Object.keys(controls));
camera.position.set(0, 4, 5);






const walkables = [];
let velY = 0;
let isGrounded = true;

const GRAVITY = 25;      // 重力強度，之後可調
const JUMP_VEL = 8;      // 起跳速度，之後可調
const GROUND_Y = 1.6;      // 先假設地板高度是 0，之後再改成實際地板
const EYE_HEIGHT = 1.6;         // 你目前用的站立高度
const GROUND_EPS = 0.05;        // 容差，避免抖動
const RAY_FAR = 10;            // 往下找地面的距離
const EYE_HEIGHT_SEATED = 3;
const EYE_HEIGHT_STAND = 4;

const ndc = new THREE.Vector2(0, 0);
window.addEventListener("mousemove", (e) => {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

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
    if (hoveredTableId && hoveredSeatId){
      snapToSeat(hoveredTableId, hoveredSeatId);
    } else {
      console.log("[E] no seat hovered");
    }
    pendingActionE = true;
  };
  
  if (e.code === "KeyR"){
    if (selectedTable){
      console.log("cancel selection:", selectedTableId);
      selectedTable = null;
      selectedTableId = null;
    }
    unseatSeat();
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
let worldBounds = null;    

const loader = new GLTFLoader();
loader.load(
  "/public/env.glb",
  (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    envRoot.traverse((obj) => {
  if (obj.name) console.log(obj.name);
  });

  console.log("gltf.scene:", gltf.scene);
  console.log("children:", gltf.scene.children.map(c => c.name));
  const tableLike = [];
  const seatLike = [];
  gltf.scene.traverse((o) => {
    const n = (o.name || "").toLowerCase();
    if (n.includes("table")) tableLike.push(o.name);
    if (n.includes("seat")) seatLike.push(o.name);
  });
  console.log("tableLike", tableLike);
  console.log("seatLike", seatLike);

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

    function shrinkBoxXZToCenter(box, scaleX = 0.42, scaleZ = 0.42, offsetXRatio = 0, offsetZRatio = 0) {
    const center = new THREE.Vector3();
    box.getCenter(center);

    const size = new THREE.Vector3();
    box.getSize(size);

    center.x += size.x * offsetXRatio;
    center.z += size.z * offsetZRatio;

    const hx = size.x * scaleX * 0.5;
    const hz = size.z * scaleZ * 0.5;

    box.min.x = center.x - hx;
    box.max.x = center.x + hx;
    box.min.z = center.z - hz;
    box.max.z = center.z + hz;

    const spawnLight = new THREE.PointLight(0xffffff, 90, 800);
    spawnLight.position.set(
    center.x,
    center.y + 8,
    center.z - 3,
    );
    scene.add(spawnLight);

    return box;
    }

    function scanTablesAndSeatsById(envRoot){
      envRoot.updateMatrixWorld(true);

      const tablesByNum = new Map();
      const seatsByNum = new Map();

      envRoot.traverse((o) => {
        const n = (o.name || "").toLowerCase();
        const mt = n.match(/^table(\d+)$/);
        if (mt) tablesByNum.set(Number(mt[1]), o);
        const ms = n.match(/^seat[_-]?(\d+)$/);
        if (ms) seatsByNum.set(Number(ms[1]), o);
      });
      const tables = [];
      for (const [num, tableObj] of tablesByNum.entries()) {
        const table = { id: `table${num}`, obj: tableObj, seats: []};
        const seatObj = seatsByNum.get(num);
        if (seatObj) {
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          const scl = new THREE.Vector3();
          seatObj.matrixWorld.decompose(pos, quat, scl);

          table.seats.push({
            id: `seat_${num}`,
            obj: seatObj,
            pos,
            quat,
          });
        }
        tables.push(table);
      }
      tables.sort((a, b) => {
        const na = Number(a.id.replace("table", ""));
        const nb = Number(b.id.replace("table", ""));
        return na - nb;
      });
      return tables;
    };

    envRoot.updateWorldMatrix(true, true);
    const tableInfos = scanTablesAndSeatsById(envRoot);
    console.log("tableInfos:", tableInfos.map(t => ({ id: t.id, seatCount: t.seats.length })));
    initSeatsStateFromTableInfos(tableInfos);
    console.log("[seatsState] init size =", seatsState.size);

    seatAnchorByKey.clear();
    for (const t of tableInfos){
      for (const s of t.seats){
        const key = `${t.id}_${s.id}`;
        seatAnchorByKey.set(key, {pos: s.pos.clone(), quat: s.quat.clone()});
      }
    }
    console.log("[seatAnchorByKey] size:", seatAnchorByKey.size);
    window.__tableInfos = tableInfos;

    const seatDebug = {
    group: null,
    enabled: true,
    };
    function clearSeatDebug (scene) {
    if (seatDebug.group) {
      scene.remove(seatDebug.group);
      seatDebug.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) o.material.dispose?.();
      });
      seatDebug.group = null;
    }
    }
    function debugSeats(scene, tableInfos) {
    if (!seatDebug.enabled) return;
    clearSeatDebug(scene);
    const g = new THREE.Group();
    g.name = "__seatDebugGroup";

    const geom = new THREE.SphereGeometry(0.25, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff , depthTest: false, depthWrite: false});
    const ball = new THREE.Mesh (geom, mat);
    ball.renderOrder = 999; 


    for (const t of tableInfos) {
      for (const s of t.seats) {
        console.log("[debug seat world pos]", t.id, s.id, s.pos.toArray());
        const m = new THREE.Mesh(geom, mat);
        m.name = `DBG_SEAT_${t.id}_${s.id}`;
        m.position.copy(s.pos);
        m.renderOrder = 999;
        m.frustumCulled = false;
        g.add(m);

        const axes = new THREE.AxesHelper(0.6);
        axes.name = `__seatAxes_${t.id}_${s.id}`;
        axes.position.copy(s.pos);
        axes.quaternion.copy(s.quat);
        axes.renderOrder = 999;
        axes.frustumCulled = false;
        g.add(axes);

        const hitGeom = new THREE.SphereGeometry(0.6, 12, 12);
        const hitMat = new THREE.MeshBasicMaterial({
          color: 0x00ff,
          wireframe: true,
          transparent: true,
          opacity: 0.25
        });
        const hit = new THREE.Mesh(hitGeom, hitMat);
        hit.name = `HIT_SEAT_${t.id}_${s.id}`;
        hit.position.copy(s.pos);
        hit.renderOrder = 998;
        hit.frustumCulled = false;
        g.add(hit);

        const key = `${t.id}_${s.id}`;
        seatVisualByKey.set(key, m);
      }
    }
    
    seatHitMeshes = g.children.filter(o => o.isMesh && o.name?.startsWith("HIT_SEAT_"));
    
    scene.add(g);
    seatDebug.group = g;

    console.log(
      "[debugSeats] markers in group:",
      g.children.filter(o => o.name?. startsWith("DBG_SEAT_")).length
    );

   
      seatMakers = g.children.filter(
        (o) => o.isMesh && o.name?.startsWith("HIT_SEAT_")
      );
      console.log("[debugSeats]seatMakers:", seatMakers.map(m => m.name));
    }

    
    console.log("[debugSeats] seats:", tableInfos.flatMap(t => t.seats).length);
    debugSeats(scene, tableInfos);
    console.log("envRoot world:", envRoot.position, envRoot.rotation, envRoot.scale);
    
    
    
    

    colliders.length = 0;
    scene.updateMatrixWorld(true);
    for (const t of tableInfos) {
    const b = new THREE.Box3().setFromObject(t.obj);
    const TABLE_OFFSET_X_RATIO = -0.26/* 你剛剛抓到的值 */;
    const TABLE_OFFSET_Z_RATIO = 0.12;  // 先用 -1% 試試

    shrinkBoxXZToCenter(b, 0.34, 0.34, TABLE_OFFSET_X_RATIO, TABLE_OFFSET_Z_RATIO);

    b.expandByScalar(0.05);
    colliders.push(b);
    }

    console.log("colliders:", colliders.length);
    
    walkables.length = 0;
    const stageObj = envRoot.getObjectByName("stage");
    const stairObj = envRoot.getObjectByName("stair");
    const floorObj = envRoot.getObjectByName("floor");
    if (stageObj) walkables.push(stageObj);
    if (stairObj) walkables.push(stairObj);
    if (floorObj) walkables.push(floorObj);
    console.log("walkables:", walkables.map(o => o.name));

    scene.updateMatrixWorld(true);

    if (floorObj) {
    worldBounds = new THREE.Box3().setFromObject(floorObj);
    console.log("worldBounds", worldBounds.min, worldBounds.max);
    } else {
    console.warn("floorObj not found");
    }
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
function resolveHorizontalCollisions(pos){
  for (const box of colliders){
    box.clampPoint(pos, _tmpClosest);
    const dx = pos.x - _tmpClosest.x;
    const dz = pos.z - _tmpClosest.z;
    const distSq = dx * dx + dz * dz;
    const r = PLAYER_RADIUS;
    if (distSq < r * r){
      const dist = Math.sqrt(distSq) || 1e-6;
      const push = (r - dist);
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
}


function clampToWorldBounds(pos, bounds, padding = 0.2) {
  pos.x = THREE.MathUtils.clamp(pos.x, bounds.min.x + padding, bounds.max.x - padding);
  pos.z = THREE.MathUtils.clamp(pos.z, bounds.min.z + padding, bounds.max.z - padding);
}
function snapToSeat (tableId, seatId) {
  const key = `${tableId}_${seatId}`;
  const anchor = seatAnchorByKey.get(key);
  if (!anchor) {
    console.warn("[snapToSeat] missing anchor:", key);
    return;
  }
  const obj = controls.getObject();
  const eyeHeight = 1.2;
  obj.position.set(anchor.pos.x, anchor.pos.y, eyeHeight, anchor.pos.z);
  const e = new THREE.Euler().setFromQuaternion(anchor.quat, "YXZ");
  obj.rotation.set(0, e.y, 0);
  camera.position.x = 0;
  console.log("[snapToSeat] snapped to", key, "pos=", obj.position.toArray());
  isSeated = true;
}
function findSeatInfo(tableId,seatId){
  if (!window.__tableInfos) return null;
  const t = window.__tableInfos.find(x => x.id === tableId);
  if (!t) return null;
  const s = t.seats.find(x => x.id === seatId);
  if (!s) return null;
  return {tableId, seatId, pos: s.pos, quat: s.quat};
}
function requestSit(tableId, seatId){
  if (state !== FSM.FREE_ROAM) return;
  const s = findSeatInfo(tableId, seatId);
  if(!s) {
    console.warn("seat not found:", tableId, seatId);
    return;
  }
  const d = player.position.distanceTo(s.pos);
  if (d > INTERACT_DISTANCE) {
    console.log("seat too far:", d);
    return;
  }
  sit(s);
}

function sit(s) {
  seated = s;
  state = FSM.SEATED;
  player.position.copy(s.pos);
  camera.position.y = EYE_HEIGHT_SEATED;
  if (s.quat) player.quaternion.copy(s.quat);
  console.log("[sit]", s.tableId, s.seatId);
}
function requestUnseat(){
  if (state === FSM.FREE_ROAM) return;
  unseat();
}
function unseat(){
  console.log("unseat");
  state = FSM.FREE_ROAM;
  seated = null;
  camera.position.y = EYE_HEIGHT_STAND;
}
function getSeatForTable(tableId) {
  if (!window.__tableInfos) return null;
  const t = window.__tableInfos.find(x => x.id === tableId);
  if (!t || !t.seats || t.seats.length === 0) return null;
  return t.seats[0];
}
function trySelectTableAndSit(){
  const hitTable = getLookAtTable();
  if (!hitTable) return false;

  const tableId = hitTable.name;
  const info = tableRegistry.get(tableId);
  if (!info) return false;

  const d = distanceToTable(info, player.position);
  if (d > INTERACT_DISTANCE) {
    console.log("table too far:", tableId, d);
    return true;
  }
  const seat = getFirstSeatForTable(tableId);
  if (!seat) {
    console.warn("no seat for table:", tableId);
    return true;
  }
  requestSitSeat(seat);
  sit({
    tableId,
    seatId: seat.id,
    pos: seat.pos,
    quat: seat.quat,
  });
  return true;
}
function handleActionE(){
  switch(state){
    case FSM.FREE_ROAM:
      trySelectTableAndSit();
      break;
    case FSM.SEATED:
      state = FSM.UI_OPEN;
      console.log("[FSM] enter UI_OPEN");
      break;
    case FSM.UI_OPEN:
      console.log("[FSM] confirm UI");
      break;
  }
}
function initSeatsStateFromTableInfos(tableInfos){
  seatsState.clear();
  for (const t of tableInfos){
    for (const s of t.seats){
      const id = s.id;
      const key = `${t.id}_${s.id}`;
      seatsState.set(key,{
        key,
        tableId: t.id,
        id,
        seatId: id,
        pos: s.pos.clone(),
        quat: s.quat?.clone?.() ?? new THREE.Quaternion(),
        occupiedBy: null,
      });
    }
  }
}
function seatKey(tableId, seatId) {
  return `${tableId}_${seatId}`;
}
function getSeatState(tableId, seatId){
  return seatsState.get(seatKey(tableId, seatId)) ?? null;
}
function getFirstSeatForTable(tableId) {
  for (const s of seatsState.values()){
    if (s.tableId === tableId) return s;
  }
  return null;
}
function canSitSeat(seat, myPlayerId = "local"){
  if (!seat) return false;
  if (seat.occupiedBy === null) return true;
  return seat.occupiedBy === myPlayerId;
}
function requestSitSeat(seat){
  if (state !== FSM.FREE_ROAM) return;
  if (canSitSeat(seat, localPlayerId)){
    console.log("[sit] seat occupied by", seat.occupiedBy);
    return;
  }
  sitSeat(seat);
}
function sitSeat(seat){
  const sid = seat.seatId ?? seat.id;
  seat.occupiedBy = localPlayerId;
  seated = { tableId: seat.tableId, seatId: sid };
  state = FSM.SEATED;

  player.position.copy(seat.pos);
  player.quaternion.copy(seat.quat);
  camera.position.y = EYE_HEIGHT_SEATED;

  console.log("[sit]", seat.tableId, sid);
}
function unseatSeat(){
  if (!seated) return;
  const seat = getSeatState(seated.tableId, seated.seatId);
  if (seat && seat.occupiedBy === localPlayerId){
    seat.occupiedBy = null;
  }
  seated = null;
  state = FSM.FREE_ROAM;
  camera.position.y = EYE_HEIGHT_STAND;

  console.log("[unseat]");
}





const moveDir = new THREE.Vector3();

function animate(){
  requestAnimationFrame(animate);
  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;

  const baseSpeed = 0.15;
  const speed = keys.boost ? baseSpeed * 2.5 : baseSpeed;
  
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  right.crossVectors(forward, WORLD_UP).normalize();

  

  const delta = new THREE.Vector3();
  if (keys.forward) delta.add(forward);
  if (keys.back) delta.sub(forward);
  if (keys.right) delta.add(right);
  if (keys.left) delta.sub(right);

  if (state === FSM.FREE_ROAM){
  if (delta.lengthSq() > 0){
    delta.normalize().multiplyScalar(speed);

    const nextPos = player.position.clone();
    nextPos.x += delta.x;
    resolveHorizontalCollisions(nextPos);
    nextPos.z += delta.z;
    resolveHorizontalCollisions(nextPos);

    if (worldBounds) {
      clampToWorldBounds (nextPos, worldBounds, PLAYER_RADIUS);
    }
    player.position.x = nextPos.x;
    player.position.z = nextPos.z;
  }
  }
  const clock = new THREE.Clock();
  const dt = clock.getDelta();
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

function updateSeatHover(){
  for (const mesh of seatVisualByKey.values()){
    mesh.scale.set(1, 1, 1);
  }
  if (!seatHitMeshes || seatHitMeshes.length === 0){
    hoveredSeatId = null;
    return;
  }
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(seatHitMeshes, false);
  
  if (hits.length === 0) {
    hoveredSeatId = null;
    return;
  }
  const hit = hits [0].object;
  const parts = hit.name.split("_");
  const tableId = parts[2];
  const seatId = parts.slice(3).join("_");

  hoveredSeatTableId = tableId;
  hoveredSeatId = seatId;

  const key = `${tableId}_${seatId}`;
  const visual = seatVisualByKey.get(key);
  if (visual) visual.scale.set(1.35, 1.35, 1.35);

  if (hoveredSeatId !== lastHoverSeatId) {
    console.log("[hoverSeat]", tableId, hoveredSeatId);
    lastHoverSeatId = hoveredSeatId;
  }
}
if (hudEl) hudEl.textContent = `hover: ${hoveredSeatId ?? "-"}`;

  updateSeatHover();

  for (const s of seatsState.values()){
    const key = `${s.tableId}_${s.seatId}`;
    const visual = seatVisualByKey.get(key);
    if (!visual) continue;
    if (s.occupiedBy){
      visual.scale.set(0.85, 0.85, 0.85);
    }
  }

  if(pendingActionE){
    pendingActionE = false;
    handleActionE();
    if (state === FSM.FREE_ROAM){
      const handled = trySelectTableAndSit();
      if (!handled) {
        console.log ("no table");
      }
    } else if (state === FSM.SEATED){
      state = FSM.UI_OPEN;
      console.log("[ui] open pot ui for", seated?.tableId);
    } else if (state === FSM.UI_OPEN){
      console.log("[ui] confirm");
    }
  }

  // controls.update();
  renderer.render(scene, camera);
};
}



animate()

