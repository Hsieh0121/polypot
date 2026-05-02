// ===== Intro Video Control =====
let introPlaying = true;

window.addEventListener("DOMContentLoaded", () => {
  const introWrap = document.getElementById("intro-video");
  const introVideo = document.getElementById("introVideoEl");
  const introSkipBtn = document.getElementById("introSkipBtn");

  if (!introWrap || !introVideo) {
    introPlaying = false;
    return;
  }

  function closeIntroVideo() {
    if (!introPlaying) return;

    introPlaying = false;
    introWrap.style.opacity = "0";
    introWrap.style.pointerEvents = "none";

    setTimeout(() => {
      introWrap.remove();
    }, 600);
  }

  introVideo.addEventListener("ended", closeIntroVideo);

  introSkipBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeIntroVideo();
  }, { passive: false });
});

import { io } from "socket.io-client";
import * as THREE from "three";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { createPotController } from "./pot/potControllers.js";
import { initMobileInput } from "./Input/mobileInput.js";
import { createTranslator, getLang } from "./i18n.js";
import { TEXT } from "./i18n-text.js";

const t = createTranslator(TEXT);
const lang = getLang();

if (lang === "en") {
  document.body.classList.add("lang-en");
}

if (typeof document !== "undefined") {
  const old = document.getElementById("__MOBILE_DEBUG__");
  if (old) old.remove();
}


const scene = new THREE.Scene();

// const ambientLight = new THREE.AmbientLight(0xffffff, 1);
// scene.add(ambientLight);

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
  camera.updateProjectionMatrix(true);

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
const socket = io(SOCKET_URL, { transports: ["websocket"] });
const SS_SERIAL = "polypot_serial";
const LS_HAS_PLAYED = "polypot_has_played";
const LS_LAST_SERIAL = "polypot_last_serial";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_SOCKET_URL ||
  "http://localhost:3001";

function mapSerialToRoom(serial, roomSize = 8) {
  const num = parseInt(String(serial || "").replace(/^P/i, ""), 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  const roomIndex = Math.floor((num - 1) / roomSize) + 1;
  return `room${roomIndex}`;
}

function getOwnerSerialFromRoomAndTable(roomId, tableId) {
  const roomNum = Number(String(roomId || "").replace(/^room/i, ""));
  const tableNum = Number(String(tableId || "").replace(/^table/i, ""));

  if (!Number.isFinite(roomNum) || !Number.isFinite(tableNum)) return "";

  const serialNumber = (roomNum - 1) * 8 + tableNum;
  return `P${String(serialNumber).padStart(6, "0")}`;
}

async function fetchProfileBySerial(serial) {
  if (!serial) return null;

  const res = await fetch(`${API_BASE}/profiles/${encodeURIComponent(serial)}`);
  const data = await res.json();

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "fetch profile failed");
  }

  return data.profile || null;
}

async function fetchTableComments(roomId, tableId, { recent = false } = {}) {
  if (!roomId || !tableId) return [];

  const url = new URL(
    `${API_BASE}/tables/${encodeURIComponent(roomId)}/${encodeURIComponent(tableId)}/comments`
  );

  if (recent) {
    url.searchParams.set("recent", "1");
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "fetch comments failed");
  }

  return Array.isArray(data.comments) ? data.comments : [];
}
async function submitTableComment(roomId, tableId, content) {
  if (!roomId || !tableId) {
    throw new Error("missing roomId or tableId");
  }

  const authorSerial = currentProfile?.serial;
  if (!authorSerial) {
    throw new Error("missing authorSerial");
  }

  const res = await fetch(
    `${API_BASE}/tables/${encodeURIComponent(roomId)}/${encodeURIComponent(tableId)}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorSerial,
        content,
      }),
    }
  );

  const data = await res.json();

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "submit comment failed");
  }

  return data.comment || null;
}

function loadHallIdentity() {
  const sessionSerial = sessionStorage.getItem(SS_SERIAL) || "";
  const lastSerial = localStorage.getItem(LS_LAST_SERIAL) || "";
  const serial = sessionSerial || lastSerial;

  if (!serial) return {};

  try {
    const raw = localStorage.getItem("polypot_profile");
    const localProfile = raw ? JSON.parse(raw) : null;

    if (localProfile?.serial === serial) {
      return localProfile;
    }
  } catch (err) {
    console.warn("[hall] local profile parse failed", err);
  }

  return { serial };
}

function saveHallIdentity(profile) {
  if (profile?.serial) {
    sessionStorage.setItem(SS_SERIAL, profile.serial);
    localStorage.setItem(LS_HAS_PLAYED, "1");
    localStorage.setItem(LS_LAST_SERIAL, profile.serial);
    localStorage.setItem("polypot_profile", JSON.stringify(profile));
  } else {
    sessionStorage.removeItem(SS_SERIAL);
    localStorage.removeItem("polypot_profile");
  }
}

let currentProfile = loadHallIdentity();
const remotePlayers = new Map(); // key = avatar:${serial}
let localPlayerId = null;
const DEBUG_AVATAR = false;

const pendingProfileHydration = new Set();

function requestRemoteProfileHydration(serial) {
  if (!serial) return;
  if (serial === currentProfile?.serial) return;
  if (pendingProfileHydration.has(serial)) return;

  pendingProfileHydration.add(serial);

  socket.emit("getProfile", { serial }, (res) => {
    pendingProfileHydration.delete(serial);

    if (!res?.ok || !res.profile) {
      console.warn("[remote profile hydration failed]", serial, res);
      return;
    }

    const found = findRemoteBySerial(serial);
    if (!found?.obj) {
      console.warn("[remote profile hydration] avatar disappeared before apply", serial);
      return;
    }

    applyProfileToAvatar(found.obj, res.profile);

    console.log("[remote profile hydrated]", serial, {
      hasAvatarPhoto: !!res.profile.avatarPhoto,
      hasTargetMesh: !!found.obj.userData?.targetMesh,
    });
  });
}

function getSerialFromPlayerLike(data) {
  return data?.profile?.serial ?? data?.serial ?? null;
}

function getRemoteKeyFromPlayerLike(data) {
  const serial = getSerialFromPlayerLike(data);
  return serial ? `avatar:${serial}` : null;
}

function findRemoteBySerial(serial) {
  if (!serial) return null;
  const key = `avatar:${serial}`;
  const obj = remotePlayers.get(key) ?? null;
  return obj ? { key, obj } : null;
}

function findRemoteByPlayerId(playerId) {
  if (!playerId) return null;

  for (const [key, obj] of remotePlayers.entries()) {
    if (obj?.userData?.playerId === playerId) {
      return { key, obj };
    }
  }
  return null;
}
function mapSerialToTable(serial, tableCount = 8) {
  const num = parseInt(String(serial || "").replace(/^P/i, ""), 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `table${((num - 1) % tableCount) + 1}`;
}
let hallSceneReady = false;
let pendingSnapshotPots = [];
let recentCommentsUiOpen = false;
let recentCommentsTableId = null;
let recentCommentsData = [];
let recentCommentsOwnerSerial = "";
let recentCommentsOwnerAvatarPhoto = "";
let exitDoorUiOpen = false;
let exitDoorMesh = null;
const exitDoorBox = new THREE.Box3();
const exitDoorCenter = new THREE.Vector3();
let exitDoorRadius = 2.4;
let exitDoorInRange = false;
const EXIT_DOOR_TRIGGER_PAD = 0.8;
let assignedTableId =
  currentProfile?.assignedTableId ??
  mapSerialToTable(currentProfile?.serial);

console.log("[hall] profile =", currentProfile);
console.log("[hall] assignedTableId =", assignedTableId);
let isOverlayOpening = false;
let net = {
  connected: false,
  ping: null,
  lastPong: 0,
};

const FSM = {
  FREE_ROAM: "FREE_ROAM",
  SEAT_SELECTING: "SEAT_SELECTING",
  SEATED: "SEATED",
  UI_OPEN: "UI_OPEN",
};
const ACTION = {
  SELECT: "SELECT",
  CANCEL: "CANCEL",
  CONFIRM: "CONFIRM",
  TOGGLE_UI: "TOGGLE_UI",
  JUMP: "JUMP",
};
const actionQueue = [];

function enqueueAction(type, payload = null) {
  actionQueue.push({
    type,
    payload,
    t: performance.now(),
  });
}

let state = FSM.FREE_ROAM;
const OVERLAY_SOURCE = {
  NONE: "NONE",
  POT: "POT",
  MY_COMMENT_BOARD: "MY_COMMENT_BOARD",
};
let overlaySource = OVERLAY_SOURCE.NONE;
const seatsState = new Map();
const groundRaycaster = new THREE.Raycaster();
const viewRaycaster = new THREE.Raycaster();
const seatRaycaster = new THREE.Raycaster();
seatRaycaster.near = 0;
seatRaycaster.far = Infinity;
seatRaycaster.layers.set(0);

let highlightedTable = null;
let savedEmissive = new Map();
let selectedTable = null;
let pendingSelect = false;
let hoveredEntry = null;
let selectedTableId = null;
let activeTableId = null;
let activeEntry = null;
let hoveredSeatKey = null;
let lastHoveredSeatKey = null;
let hoveredTableId = null;
let hoveredSeatId = null;
let hoveredSeatTableId = null;
let seatMakers = [];
let seatHitMeshes = [];
let seatVisualByKey = new Map();
let isSeated = false;
let seated = null;
let pendingActionE = false;

const decorativeChairGroupByTableId = new Map();
const seatAnchorByKey = new Map();
const hudEl = document.getElementById("hud");
const colliders = [];
const PLAYER_RADIUS = 0.65;
const INTERACT_DISTANCE = 3.0;
const _tmpClosest = new THREE.Vector3();

const walkables = [];
let velY = 0;
let isGrounded = true;

const GRAVITY = 25;      // 重力強度，之後可調
const JUMP_VEL = 8;      // 起跳速度，之後可調
const GROUND_Y = 1.6;      // 先假設地板高度是 0，之後再改成實際地板
const EYE_HEIGHT = 3.5;         // 你目前用的站立高度
const GROUND_EPS = 0.05;        // 容差，避免抖動
const RAY_FAR = 10;            // 往下找地面的距離
const EYE_HEIGHT_SEATED = 3;
const EYE_HEIGHT_STAND = 4;

const  potRayTargetsByTableId = new Map();
const tableLike = [];
const seatLike = [];
const tables = [];
const tableBoxes = new Map();
let envRoot = null;
let worldBounds = null;  
let hallScreenVideo = null;
let hallScreenTexture = null;
const tablePotStateMap = new Map();
let hallIntroStarted = false;
let hallAssignmentRevealed = false;
let hallPostPotShown = false;
let hallIntroTimers = [];
let assignedMarker = null;
let assignedMarkerBobBaseY = 0;
let assignedMarkerTarget = null;
let lastSentAvatarPos = null;
let lastSentRotY = null;
const hallLangStyle = document.createElement("style");
hallLangStyle.textContent = `
  body.lang-en button {
    font-size: 15px !important;
  }

  body.lang-en #hud {
    font-size: 12px !important;
  }
`;
document.head.appendChild(hallLangStyle);

function createEmptyTablePotState(tableId) {
  return {
    tableId,
    initialized: false,
    balls: [],
    ingredients: [],
    composePlacements: [],
    activeBallId: null,
    activeIngredientId: null,
    chairCount: 1,
    chairColor: "#e8f25a",
    potBodyColor: "#FD6FFF",
    potHandleColor: "#E8F25A",
    finalPotTextureUrl: null,
  };
}


socket.on("connect", async () => {
  net.connected = true;
  localPlayerId = socket.id;

  console.log("[net] connected");
  console.log("[local] localPlayerId =", localPlayerId);
  console.log("[connect] currentProfile =", currentProfile);
  console.log("[connect] current serial =", currentProfile?.serial);

  if (!currentProfile?.serial) {
    console.warn("[hall] missing profile.serial, redirect to entry");
    window.location.href = "/entry.html";
    return;
  }

  try {
    const serverProfile = await fetchProfileBySerial(currentProfile.serial);

    const hasFullProfile =
      serverProfile &&
      serverProfile.name &&
      serverProfile.name !== "anon" &&
      serverProfile.avatarPhoto &&
      serverProfile.idCardSnapshot;

    if (!hasFullProfile) {
      console.warn("[hall] incomplete server profile, redirect to white", serverProfile);
      window.location.href = `/white.html?serial=${encodeURIComponent(currentProfile.serial)}`;
      return;
    }

    currentProfile = serverProfile;
    saveHallIdentity(currentProfile);

    assignedTableId =
      currentProfile?.assignedTableId ??
      mapSerialToTable(currentProfile?.serial);
  } catch (err) {
    console.error("[hall] fetch profile before join failed", err);
    window.location.href = `/white.html?serial=${encodeURIComponent(currentProfile.serial)}`;
    return;
  }

  socket.emit("join", { serial: currentProfile.serial, profile: currentProfile }, ({ self, other, ok } = {}) => {
    if (self?.id) localPlayerId = self.id;

    if (ok === false) {
      console.warn("[hall] join failed, redirect to entry");
      window.location.href = "/entry.html";
      return;
    }

    if (self?.profile) {
      currentProfile = self.profile;
      saveHallIdentity(currentProfile);

      assignedTableId =
        currentProfile?.assignedTableId ??
        mapSerialToTable(currentProfile?.serial);

      console.log("[hall] profile refreshed from server]", currentProfile);
      console.log("[hall] assignedTableId refreshed]", assignedTableId);
    }

    console.log("[join ack]", { self, other });
    console.log("[join ack other count]", (other || []).length, other);

    for (const p of other || []) {
      const serial = p?.profile?.serial;
      if (!serial) continue;
      if (serial === currentProfile?.serial) continue;

      syncRemoteAvatar({
        ...p,
        serial,
        presenceType: "online",
      });
    }
  });
});

socket.on("disconnect", (reason) => {
  net.connected = false;
  console.log("[net] disconnected");
  console.log("[socket] disconnected", reason);
});




socket.on("snapshot", (snap) => {
  console.log("[socket] snapshot", snap);

  const players = Array.isArray(snap?.players) ? snap.players : [];
  const seats = Array.isArray(snap?.seats) ? snap.seats : [];
  const pots = Array.isArray(snap?.pots) ? snap.pots : [];
  const offlineAvatars = Array.isArray(snap?.offlineAvatars) ? snap.offlineAvatars : [];

  // --- players ---
  for (const p of players) {
    const serial = p?.profile?.serial;
    if (!serial) continue;
    if (serial === currentProfile?.serial) continue;

    syncRemoteAvatar({
      ...p,
      serial,
      presenceType: "online",
    });
  }
  // --- offline avatars ---
  for (const a of offlineAvatars) {
    if (!a?.serial) continue;
    if (a.serial === currentProfile?.serial) continue;

    const tableId =
      a.assignedTableId ||
      a.profile?.assignedTableId ||
      mapSerialToTable(a.serial);

    const fixedPose =
      hallSceneReady && tableId
        ? getOfflineAvatarPoseForTable(tableId, a.serial)
        : null;

    const finalPos = fixedPose?.pos || a.pos;
    const finalRotY = fixedPose?.rotY ?? a.rotY ?? 0;

    const existing = findRemoteBySerial(a.serial);
    if (existing?.obj?.userData?.presenceType === "online") {
      continue;
    }

    syncRemoteAvatar({
      ...a,
      pos: finalPos,
      rotY: finalRotY,
      presenceType: "offline",
    });
  }

  // --- seats ---
  for (const s of seats) {
    const localseat = seatsState.get(s.seatKey);
    if (localseat) {
      localseat.occupiedBy = s.occupiedBy ?? null;
    }
  }

  // --- pots ---
  if (!hallSceneReady) {
    for (const pot of pots) {
      bufferPendingPot(pot);
    }
    console.log("[snapshot] pots buffered until hallSceneReady", pendingSnapshotPots.length);
    return;
  }

  for (const pot of pots) {
    applyPotStateToTable(pot);
  }
  console.log("[snapshot players count]", players.length, players);
});
socket.on("seatUpdated", (s) => {
  console.log("[socket] seatUpdated raw =", s);
  const localseat = seatsState.get(s.seatKey);
  if (!localseat) return;
  console.log(
    "[seatUpdated check]",
    "seatKey =", s.seatKey,
    "incoming occupiedBy =", s.occupiedBy,
    "localPlayerId =", localPlayerId,
    "hasLocalSeat =", !!localseat
  );
  localseat.occupiedBy = s.occupiedBy ?? null;
  if (localseat.occupiedBy === localPlayerId &&
    (state === FSM.FREE_ROAM || state === FSM.SEAT_SELECTING)) {
    sitSeatLocalSnap(localseat);
  }
  if (
    seated &&
    s.seatKey === `${seated.tableId}_${seated.seatId}` &&
    localseat.occupiedBy === null
  ){
    const prevTableId = seated.tableId;

    seated = null;
    state = FSM.FREE_ROAM;
    console.log("[unseat local snap]");

    if (hallPostPotShown && prevTableId === assignedTableId) {
      hallPostPotShown = false;
      showPostPotAnnouncement();
      if (assignedTableId) showAssignedMarkerAtTable(assignedTableId);
    }
  }
});

socket.on ("ping", (ack) => {
  if (typeof ack === "function") ack();
});

setInterval(() => {
  if (!socket.connected) return;
  const t0 = performance.now();
  socket.emit("ping", () => {
    net.ping = Math.round(performance.now() - t0);
    net.lastPong = Date.now();
  });
}, 1000);

function makeRemoteAvatar(playerLike) {
  const serial = getSerialFromPlayerLike(playerLike);
  if (!serial) {
    console.warn("[makeRemoteAvatar] missing serial", playerLike);
    return null;
  }

  const group = new THREE.Group();
  group.userData.isRemoteAvatar = true;
  group.userData.playerId = playerLike.id ?? null;
  group.userData.serial = serial;
  group.userData.profile = playerLike.profile || {};
  group.userData.presenceType =
    playerLike.presenceType ?? (playerLike.id ? "online" : "offline");

  group.userData.targetMesh = null;
  group.userData.modelAnchor = null;
  group.userData.avatarRoot = null;
  group.userData.avatarTexture = null;
  group.userData.pendingProfile = playerLike.profile || null;
  group.userData.__avatarInitialized = false;

  group.visible = false;

  const hitbox = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.7, 2.4, 4, 8),
    new THREE.MeshBasicMaterial({
      color: 0x1248ff,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      visible: false,
    })
  );

  hitbox.name = `REMOTE_HIT_${serial}`;
  hitbox.userData.playerId = playerLike.id ?? null;
  hitbox.userData.serial = serial;
  hitbox.userData.isRemoteAvatarHit = true;
  hitbox.position.set(0, 1.6, 0);
  group.add(hitbox);

  // 改這裡
  const modelAnchor = new THREE.Group();
  group.add(modelAnchor);
  group.userData.modelAnchor = modelAnchor;

  const avatarLoader = new GLTFLoader();

  avatarLoader.load("/avatar.glb", (gltf) => {
    if (group.userData.__avatarInitialized) return;
    group.userData.__avatarInitialized = true;

    const root = gltf.scene;
    modelAnchor.add(root);

    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = 4.8 / maxAxis;
    root.scale.setScalar(scale);

    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);

    const center = new THREE.Vector3();
    box.getCenter(center);

    root.position.x -= center.x;
    root.position.z -= center.z;

    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;

    const MODEL_Y_OFFSET = 0;
    root.position.y += MODEL_Y_OFFSET;

    let targetMesh = null;
    root.traverse((o) => {
      if (o.isMesh && o.name === "userModel002") {
        targetMesh = o;
      }
    });

    group.userData.avatarRoot = root;
    group.userData.targetMesh = targetMesh;

    if (!targetMesh) {
      console.warn("[avatar] targetMesh missing", serial);
    } else {
      console.log("[targetMesh found]", serial, targetMesh.name);
    }

    const pendingProfile =
      group.userData.pendingProfile || group.userData.profile || null;

    if (pendingProfile) {
      applyProfileToAvatar(group, pendingProfile);
    }

    group.visible = true;

    const hasAvatarPhoto =
      !!group.userData.profile?.avatarPhoto ||
      !!group.userData.pendingProfile?.avatarPhoto;

    if (!hasAvatarPhoto) {
      requestRemoteProfileHydration(serial);
    }

    console.log("[remote avatar ready]", serial, {
      visible: group.visible,
      groupPos: group.position.toArray(),
      hitboxPos: hitbox.position.toArray(),
      rootLocalPos: root.position.toArray(),
      scale: root.scale.toArray(),
      presenceType: group.userData.presenceType,
      hasTargetMesh: !!targetMesh,
      hasAvatarPhoto,
    });
  });

  return group;
}
function applyProfileToAvatar(avatar, incomingProfile) {
  if (!avatar) return;

  const prevProfile = avatar.userData.profile || {};

  const nextProfile = {
    ...prevProfile,
    ...(incomingProfile || {}),
    serial:
      incomingProfile?.serial ??
      prevProfile?.serial ??
      avatar.userData.serial ??
      null,
    avatarPhoto:
      incomingProfile?.avatarPhoto ??
      prevProfile?.avatarPhoto ??
      null,
  };

  avatar.userData.profile = nextProfile;
  avatar.userData.serial = nextProfile.serial ?? avatar.userData.serial ?? null;
  avatar.userData.pendingProfile = nextProfile;

  const targetMesh = avatar.userData.targetMesh;
  if (!targetMesh) {
    console.log("[applyProfileToAvatar] targetMesh not ready yet", {
      serial: avatar.userData.serial,
      hasAvatarPhoto: !!nextProfile.avatarPhoto,
    });
    return;
  }

  const avatarPhoto = nextProfile.avatarPhoto ?? null;

  if (!avatarPhoto) {
    console.log("[applyProfileToAvatar] no avatarPhoto, keep existing texture", {
      serial: avatar.userData.serial,
    });
    return;
  }

  if (targetMesh.userData.__appliedAvatarPhoto === avatarPhoto) {
    return;
  }

  const img = new Image();
  img.onload = () => {
    const serialKey = `avatar:${avatar.userData.serial}`;
    if (!remotePlayers.has(serialKey)) {
      return;
    }

    if (avatar.userData.avatarTexture) {
      avatar.userData.avatarTexture.dispose?.();
      avatar.userData.avatarTexture = null;
    }

    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;

    const oldMat = targetMesh.material;
    if (oldMat?.map) oldMat.map.dispose?.();
    oldMat?.dispose?.();

    targetMesh.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
    });
    targetMesh.material.needsUpdate = true;

    targetMesh.userData.__appliedAvatarPhoto = avatarPhoto;
    avatar.userData.avatarTexture = tex;

    console.log("[remote avatar texture applied]", avatar.userData.serial);
  };

  img.onerror = (e) => {
    console.error("[avatar] texture FAILED", avatar.userData.serial, e);
  };

  img.src = avatarPhoto;
}

function syncRemoteAvatar(playerLike) {
  const serial = getSerialFromPlayerLike(playerLike);
  if (!serial) {
    console.warn("[syncRemoteAvatar] missing serial", playerLike);
    return null;
  }

  if (serial === currentProfile?.serial) return null;

  const key = `avatar:${serial}`;
  let avatar = remotePlayers.get(key);

  if (!avatar) {
    avatar = spawnRemote(playerLike);
  }
  if (!avatar) return null;

  avatar.userData.playerId = playerLike.id ?? avatar.userData.playerId ?? null;
  avatar.userData.serial = serial;
  avatar.userData.presenceType =
    playerLike.presenceType ?? (playerLike.id ? "online" : "offline");

  if (playerLike.pos) {
    avatar.position.set(playerLike.pos.x, playerLike.pos.y, playerLike.pos.z);
  }

  avatar.rotation.y = playerLike.rotY || 0;
  avatar.visible = true;

  const mergedProfile = {
    ...(avatar.userData.profile || {}),
    ...(playerLike.profile || {}),
    serial,
  };

  avatar.userData.profile = mergedProfile;
  avatar.userData.pendingProfile = mergedProfile;

  applyProfileToAvatar(avatar, mergedProfile);

  const hasAvatarPhoto = !!mergedProfile.avatarPhoto;
  if (!hasAvatarPhoto) {
    requestRemoteProfileHydration(serial);
  }

  if (DEBUG_AVATAR) {
    console.log("[syncRemoteAvatar final]", {
      serial,
      presenceType: avatar.userData.presenceType,
      pos: avatar.position.toArray(),
      rotY: avatar.rotation.y,
      visible: avatar.visible,
      hasProfile: !!avatar.userData.profile,
      hasAvatarPhoto,
      hasTargetMesh: !!avatar.userData.targetMesh,
    });
  }

  return avatar;
}

function spawnRemote(playerLike) {
  const key = getRemoteKeyFromPlayerLike(playerLike);
  if (!key) return null;

  const serial = getSerialFromPlayerLike(playerLike);
  if (!serial) return null;
  if (serial === currentProfile?.serial) return null;

  if (remotePlayers.has(key)) {
    return remotePlayers.get(key);
  }

  const avatar = makeRemoteAvatar(playerLike);
  if (!avatar) return null;

  avatar.rotation.y = playerLike.rotY || 0;

  if (playerLike.pos) {
    avatar.position.set(playerLike.pos.x, playerLike.pos.y, playerLike.pos.z);
  } else {
    avatar.position.set(0, -9999, 0);
  }

  avatar.userData.playerId = playerLike.id ?? null;
  avatar.userData.serial = serial;
  avatar.userData.profile = playerLike.profile || {};
  avatar.userData.presenceType =
    playerLike.presenceType ?? (playerLike.id ? "online" : "offline");

  scene.add(avatar);
  remotePlayers.set(key, avatar);

  applyProfileToAvatar(avatar, playerLike.profile || null);

  console.log("[remote scene add]", key, {
    inScene: scene.children.includes(avatar),
    pos: avatar.position.toArray(),
    presenceType: avatar.userData.presenceType,
  });

  console.log("[remote spawn]", key, {
    pos: playerLike.pos,
    rotY: playerLike.rotY,
    profile: playerLike.profile,
  });

  return avatar;
}
function despawnRemote(key) {
  const avatar = remotePlayers.get(key);
  if (!avatar) return;

  scene.remove(avatar);

  avatar.traverse?.((obj) => {
    if (!obj.isMesh) return;

    obj.geometry?.dispose?.();

    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => {
        if (m?.map) m.map.dispose?.();
        m?.dispose?.();
      });
    } else {
      if (obj.material?.map) obj.material.map.dispose?.();
      obj.material?.dispose?.();
    }
  });
  if (avatar.userData?.avatarTexture) {
    avatar.userData.avatarTexture.dispose?.();
    avatar.userData.avatarTexture = null;
  }

  remotePlayers.delete(key);
  console.log("[remote despawn]", key);
}


socket.on("player:join", (p) => {
  const serial = p?.profile?.serial;
  if (!serial) return;
  if (serial === currentProfile?.serial) return;

  syncRemoteAvatar({
    ...p,
    serial,
    presenceType: "online",
  });
});

socket.on("player:leave", ({ id }) => {
  const found = findRemoteByPlayerId(id);
  if (!found) return;

  const serial = found.obj?.userData?.serial;
  console.log("[player:leave] waiting for offline replacement", id, "serial=", serial);

  // 先不要 despawn
  // 由 avatar:offline 事件來接手轉成 offline avatar
});
socket.on("avatar:offline", (a) => {
  if (!a?.serial) return;
  if (a.serial === currentProfile?.serial) return;

  const tableId =
    a.assignedTableId ||
    a.profile?.assignedTableId ||
    mapSerialToTable(a.serial);

  const fixedPose =
    hallSceneReady && tableId
      ? getOfflineAvatarPoseForTable(tableId, a.serial)
      : null;

  const finalPos = fixedPose?.pos || a.pos;
  const finalRotY = fixedPose?.rotY ?? a.rotY ?? 0;

  syncRemoteAvatar({
    ...a,
    pos: finalPos,
    rotY: finalRotY,
    presenceType: "offline",
  });

  console.log("[avatar:offline] applied", a.serial, finalPos, finalRotY);
});

socket.on("player:move", ({ id, pos, rotY, profile }) => {
  if (!id || id === localPlayerId) return;

  const serial = profile?.serial ?? null;
  if (!serial) return;
  if (serial === currentProfile?.serial) return;

  const found = findRemoteBySerial(serial);

  if (!found?.obj) {
    const obj = syncRemoteAvatar({
      id,
      serial,
      pos,
      rotY,
      profile: profile || {},
      presenceType: "online",
    });

    if (!obj) return;

    if (Math.random() < 0.02) {
      console.log("[remote applied pos:first]", serial, {
        pos,
        visible: obj.visible,
        world: obj.position.toArray(),
      });
    }
    return;
  }

  const obj = found.obj;

  obj.userData.playerId = id;
  obj.userData.serial = serial;
  obj.userData.presenceType = "online";

  if (pos) {
    obj.position.set(pos.x, pos.y, pos.z);
  }
  obj.rotation.y = rotY || 0;
  obj.visible = true;

  // 只有在缺資料時才補 profile / hydration
  if (profile && Object.keys(profile).length > 0) {
    const prevPhoto = obj.userData.profile?.avatarPhoto ?? null;
    const nextPhoto = profile.avatarPhoto ?? prevPhoto ?? null;

    obj.userData.profile = {
      ...(obj.userData.profile || {}),
      ...profile,
      serial,
      avatarPhoto: nextPhoto,
    };
    obj.userData.pendingProfile = obj.userData.profile;

    if (!obj.userData.targetMesh || nextPhoto !== prevPhoto) {
      applyProfileToAvatar(obj, obj.userData.profile);
    }

    if (!nextPhoto) {
      requestRemoteProfileHydration(serial);
    }
  }

  if (Math.random() < 0.02) {
    console.log("[remote applied pos]", serial, {
      pos,
      visible: obj.visible,
      world: obj.position.toArray(),
    });
  }
});

function bufferPendingPot(pot) {
  if (!pot?.tableId) return;

  const idx = pendingSnapshotPots.findIndex((p) => p?.tableId === pot.tableId);

  if (idx >= 0) {
    pendingSnapshotPots[idx] = pot;
  } else {
    pendingSnapshotPots.push(pot);
  }

  console.log("[pot buffered]", pot.tableId, pendingSnapshotPots.length);
}

socket.on("pot:updated", (pot) => {
  console.log("[socket] pot:updated", pot);

  if (!hallSceneReady) {
    bufferPendingPot(pot);
    return;
  }

  applyPotStateToTable(pot);
});

let lastNetSend = 0;

function getYawFromCamera() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  return e.y;
}


const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);
const player = controls.object;
camera.position.set(0,EYE_HEIGHT , 0);
const playerPos = player.position;

const IS_MOBILE = window.matchMedia("(pointer: coarse)").matches;

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
  player.rotation.y = touchLook.yaw;
  camera.rotation.x = touchLook.pitch;
  camera.rotation.z = 0;
}

function isTouchLookBlocked() {
  return !IS_MOBILE || state === FSM.UI_OPEN || pot.isOpen?.();
}

syncTouchLookFromCamera();

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (IS_MOBILE) return;
  if (isTouchLookBlocked()) return;

  // 左半邊保留給搖桿，右半邊才控制視角
  if (e.clientX < window.innerWidth * 0.45) return;

  touchLook.active = true;
  touchLook.pointerId = e.pointerId;
  touchLook.lastX = e.clientX;
  touchLook.lastY = e.clientY;

  renderer.domElement.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}, { passive: false });

renderer.domElement.addEventListener("pointermove", (e) => {
  if (IS_MOBILE) return;
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
  if (IS_MOBILE) return;
  if (e.pointerId !== touchLook.pointerId) return;
  touchLook.active = false;
  touchLook.pointerId = null;
}

renderer.domElement.addEventListener("pointerup", endTouchLook);
renderer.domElement.addEventListener("pointercancel", endTouchLook);
renderer.domElement.addEventListener("lostpointercapture", () => {
  if (IS_MOBILE) return;
  touchLook.active = false;
  touchLook.pointerId = null;
});

const __lock = controls.lock.bind(controls);
controls.lock = () => {
  console.trace("[TRACE] controls.lock called");
  return __lock();
};



socket.on("server:hello", (data) => {
  console.log("[socket] server:hello", data);
});
socket.on("server:pong", (data) => {
  console.log("[socket] server:pong", data);
});
socket.on("connect_error", (err) => {
  console.error("[socket] connect_error", err.message);
});


window.addEventListener("resize", () => {
  resize();
  refreshExitDoorBox();
});
resize();

const app = document.querySelector("#app");
app.appendChild(renderer.domElement);

renderer.domElement.addEventListener("click", (e) => {
  if (IS_MOBILE) return;
  if (exitDoorUiOpen) return;
  if (state === FSM.UI_OPEN) return;
  if (pot.isOpen?.()) return;
  if (controls?.isLocked) return;

  safeLockPointer();
});

const hallUi = document.createElement("div");
hallUi.style.position = "fixed";
hallUi.style.inset = "0";
hallUi.style.pointerEvents = "none";
hallUi.style.zIndex = "10000";
document.body.appendChild(hallUi);

// =========================
// RECENT COMMENTS UI
// =========================

const recentCommentsLayer = document.createElement("div");
recentCommentsLayer.style.position = "fixed";
recentCommentsLayer.style.inset = "0";
recentCommentsLayer.style.display = "none";
recentCommentsLayer.style.pointerEvents = "none";
recentCommentsLayer.style.zIndex = "30010";
hallUi.appendChild(recentCommentsLayer);

const recentCommentsDim = document.createElement("div");
recentCommentsDim.style.position = "absolute";
recentCommentsDim.style.inset = "0";
recentCommentsDim.style.background = "rgba(0,0,0,0.08)";
recentCommentsDim.style.pointerEvents = "auto";
recentCommentsLayer.appendChild(recentCommentsDim);

const recentCommentsBubbleWrap = document.createElement("div");
recentCommentsBubbleWrap.style.position = "absolute";
recentCommentsBubbleWrap.style.inset = "0";
recentCommentsBubbleWrap.style.pointerEvents = "none";
recentCommentsLayer.appendChild(recentCommentsBubbleWrap);

const recentCommentsCenterWrap = document.createElement("div");
recentCommentsCenterWrap.style.position = "absolute";
recentCommentsCenterWrap.style.left = "50%";
recentCommentsCenterWrap.style.bottom = "68px";
recentCommentsCenterWrap.style.transform = "translateX(-50%)";
recentCommentsCenterWrap.style.display = "flex";
recentCommentsCenterWrap.style.flexDirection = "column";
recentCommentsCenterWrap.style.alignItems = "center";
recentCommentsCenterWrap.style.gap = "14px";
recentCommentsCenterWrap.style.pointerEvents = "auto";
recentCommentsLayer.appendChild(recentCommentsCenterWrap);

const recentCommentsOpenBtn = document.createElement("button");
recentCommentsOpenBtn.type = "button";
recentCommentsOpenBtn.textContent = t("hall_recent_open_pot");
Object.assign(recentCommentsOpenBtn.style, {
  minHeight: "74px",
  padding: "0 28px",
  border: "0",
  borderRadius: "999px",
  background: "#FD6FFF",
  color: "#FFFFFF",
  boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
  fontFamily: "zpix, sans-serif",
  fontSize: "20px",
  whiteSpace: "nowrap",
  cursor: "pointer",
  pointerEvents: "auto",
});

const recentCommentsSkipBtn = document.createElement("button");
recentCommentsSkipBtn.type = "button";
recentCommentsSkipBtn.textContent = t("hall_recent_view_comments");
Object.assign(recentCommentsSkipBtn.style, {
  minHeight: "52px",
  padding: "0 22px",
  border: "2px solid #FD6FFF",
  borderRadius: "999px",
  background: "#FFFFFF",
  color: "#FD6FFF",
  boxShadow: "0 8px 30px rgba(0,0,0,0.10)",
  fontFamily: "zpix, sans-serif",
  fontSize: "16px",
  whiteSpace: "nowrap",
  cursor: "pointer",
  pointerEvents: "auto",
});

recentCommentsCenterWrap.appendChild(recentCommentsOpenBtn);
recentCommentsCenterWrap.appendChild(recentCommentsSkipBtn);

// =========================
// EXIT DOOR UI
// =========================

const exitDoorLayer = document.createElement("div");
exitDoorLayer.style.position = "fixed";
exitDoorLayer.style.left = "50%";
exitDoorLayer.style.top = "38%";
exitDoorLayer.style.transform = "translate(-50%, -50%)";
exitDoorLayer.style.width = "560px";
exitDoorLayer.style.display = "none";
exitDoorLayer.style.pointerEvents = "none";
exitDoorLayer.style.zIndex = "30020";
hallUi.appendChild(exitDoorLayer);

const exitDoorBubble = document.createElement("div");
exitDoorBubble.style.background = "#FFFFFF";
exitDoorBubble.style.borderRadius = "999px";
exitDoorBubble.style.boxShadow = "0 12px 34px rgba(0,0,0,0.12)";
exitDoorBubble.style.height = "85px";
exitDoorBubble.style.padding = "0 36px";
exitDoorBubble.style.display = "flex";
exitDoorBubble.style.alignItems = "center";
exitDoorBubble.style.justifyContent = "center";
exitDoorBubble.style.fontFamily = "zpix, sans-serif";
exitDoorBubble.style.fontSize = "20px";
exitDoorBubble.style.color = "#FD6FFF";
exitDoorBubble.style.whiteSpace = "nowrap";
exitDoorLayer.appendChild(exitDoorBubble);

const exitDoorBtnRow = document.createElement("div");
exitDoorBtnRow.style.marginTop = "18px";
exitDoorBtnRow.style.display = "flex";
exitDoorBtnRow.style.justifyContent = "center";
exitDoorBtnRow.style.gap = "18px";
exitDoorBtnRow.style.pointerEvents = "auto";
exitDoorLayer.appendChild(exitDoorBtnRow);

function makeExitDoorBtn(label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.border = "0";
  btn.style.cursor = "pointer";
  btn.style.height = "65px";
  btn.style.padding = "0 26px";
  btn.style.borderRadius = "999px";
  btn.style.background = "#FD6FFF";
  btn.style.color = "#FFFFFF";
  btn.style.boxShadow = "0 8px 30px rgba(0,0,0,0.14)";
  btn.style.fontFamily = "zpix, sans-serif";
  btn.style.fontSize = "16px";
  btn.style.whiteSpace = "nowrap";
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.pointerEvents = "auto";
  btn.style.transform = "scale(1)";
  btn.style.transition = "transform 120ms ease";

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.style.transform = "scale(0.96)";
  });
  btn.addEventListener("pointerup", () => {
    btn.style.transform = "scale(1)";
  });
  btn.addEventListener("pointercancel", () => {
    btn.style.transform = "scale(1)";
  });
  btn.addEventListener("pointerleave", () => {
    btn.style.transform = "scale(1)";
  });

  return btn;
}

const btnKeepBrowsing = makeExitDoorBtn(t("hall_exit_keep_browsing"));
const btnLeaveHall = makeExitDoorBtn(t("hall_exit_leave"));
exitDoorBtnRow.appendChild(btnKeepBrowsing);
exitDoorBtnRow.appendChild(btnLeaveHall);

function showExitDoorPrompt() {
  if (exitDoorUiOpen) return;
  if (pot.isOpen?.()) return;

  exitDoorUiOpen = true;

  exitDoorLayer.style.display = "block";
  exitDoorLayer.style.pointerEvents = "auto";
  exitDoorBubble.textContent = t("hall_exit_question");

  clearMoveKeys();
  hideCenterAction();
  hideHUD();

  if (!IS_MOBILE && controls?.isLocked) {
    controls.unlock();
  }

  if (IS_MOBILE) {
    setMobileHudVisible(false);
  }
}

function hideExitDoorPrompt() {
  if (!exitDoorUiOpen) return;

  exitDoorUiOpen = false;
  exitDoorLayer.style.display = "none";
  exitDoorLayer.style.pointerEvents = "none";

  if (IS_MOBILE) {
    setMobileHudVisible(true);
  }
}

btnKeepBrowsing.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  hideExitDoorPrompt();
});

btnLeaveHall.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const serial = sessionStorage.getItem("polypot_serial") || "";
  window.location.href = `/print.html?serial=${encodeURIComponent(serial)}`;
});


recentCommentsDim.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  hideRecentCommentsPrompt();
});

recentCommentsSkipBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  hideRecentCommentsPrompt();
});

recentCommentsOpenBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const tableId = recentCommentsTableId || seated?.tableId;
  if (!tableId) {
    hideRecentCommentsPrompt();
    return;
  }

  hideRecentCommentsPrompt();

  try {
    await openPotOverlayForTable(tableId, {
      mobileDebug: false,
    });
  } catch (err) {
    console.error("[recent comments] open pot failed", err);
    state = FSM.SEATED;

    if (IS_MOBILE) {
      setMobileHudVisible(true);
    }
  }
});

// left announcement
const announcementWrap = document.createElement("div");
announcementWrap.style.position = "fixed";
announcementWrap.style.left = "75px";
announcementWrap.style.bottom = "48px";
announcementWrap.style.display = "none";
announcementWrap.style.alignItems = "center";
announcementWrap.style.gap = "17px";
hallUi.appendChild(announcementWrap);

const announcementBubble = document.createElement("div");
announcementBubble.style.width = "85px";
announcementBubble.style.height = "85px";
announcementBubble.style.borderRadius = "999px";
announcementBubble.style.background = "#FFFFFF";
announcementBubble.style.display = "flex";
announcementBubble.style.alignItems = "center";
announcementBubble.style.justifyContent = "center";
announcementBubble.style.boxShadow = "0 8px 30px rgba(0,0,0,0.14)";
announcementWrap.appendChild(announcementBubble);

const announcementIcon = document.createElement("img");
announcementIcon.src = "/announcement.png";
announcementIcon.alt = "announcement";
announcementIcon.style.width = "45px";
announcementIcon.style.height = "52px";
announcementIcon.style.objectFit = "contain";
announcementBubble.appendChild(announcementIcon);

const textBubble = document.createElement("div");
textBubble.style.minHeight = "85px";
textBubble.style.padding = "0 28px";
textBubble.style.borderRadius = "999px";
textBubble.style.background = "#FFFFFF";
textBubble.style.display = "flex";
textBubble.style.alignItems = "center";
textBubble.style.justifyContent = "center";
textBubble.style.boxShadow = "0 8px 30px rgba(0,0,0,0.14)";
textBubble.style.fontFamily = "zpix, sans-serif";
textBubble.style.fontSize = "20px";
textBubble.style.color = "#FD6FFF";
textBubble.style.whiteSpace = "nowrap";
announcementWrap.appendChild(textBubble);

// center CTA
const ctaWrap = document.createElement("div");
ctaWrap.style.position = "fixed";
ctaWrap.style.left = "50%";
ctaWrap.style.bottom = "68px";
ctaWrap.style.transform = "translateX(-50%)";
ctaWrap.style.display = "none";
ctaWrap.style.alignItems = "center";
ctaWrap.style.justifyContent = "center";
ctaWrap.style.pointerEvents = "auto";
ctaWrap.style.zIndex = "30001";
document.body.appendChild(ctaWrap);

const myCommentBoardBtn = document.createElement("button");
myCommentBoardBtn.type = "button";
Object.assign(myCommentBoardBtn.style, {
  position: "fixed",
  right: "42px",
  bottom: "8px",
  width: "148px",
  height: "148px",
  border: "0",
  background: "transparent",
  padding: "0",
  cursor: "pointer",
  zIndex: "30005",
  display: "none",
});

const myCommentBoardImg = document.createElement("img");
myCommentBoardImg.src = "/card.png";
Object.assign(myCommentBoardImg.style, {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
  pointerEvents: "none",
});

myCommentBoardBtn.appendChild(myCommentBoardImg);
document.body.appendChild(myCommentBoardBtn);

myCommentBoardBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  hideMyCommentBoardBtn();

  try {
    await openMyCommentBoard();
  } catch (err) {
    console.error("[myCommentBoardBtn] open failed", err);
    state = FSM.FREE_ROAM;

    if (IS_MOBILE) {
      setMobileHudVisible(true);
    }
  }
});

const ctaBtn = document.createElement("button");
ctaBtn.type = "button";
ctaBtn.style.pointerEvents = "auto";
ctaBtn.style.border = "0";
ctaBtn.style.cursor = "pointer";
ctaBtn.style.minHeight = "74px";
ctaBtn.style.padding = "0 28px";
ctaBtn.style.borderRadius = "999px";
ctaBtn.style.background = "#FD6FFF";
ctaBtn.style.color = "#FFFFFF";
ctaBtn.style.boxShadow = "0 8px 30px rgba(0,0,0,0.14)";
ctaBtn.style.fontFamily = "zpix, sans-serif";
ctaBtn.style.fontSize = "20px";
ctaBtn.style.whiteSpace = "nowrap";
ctaBtn.style.display = "inline-flex";
ctaBtn.style.alignItems = "center";
ctaBtn.style.justifyContent = "center";
ctaBtn.style.userSelect = "none";

const resetCtaBtn = () => {
  ctaBtn.style.transform = "scale(1)";
};
ctaBtn.addEventListener("pointerdown", async (e) => {
  if (exitDoorUiOpen) {
    hideExitDoorPrompt();
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  ctaBtn.style.transform = "scale(0.96)";

  if (state === FSM.SEATED && seated) {
    const tableId = seated.tableId;

    try {
      await openPotOverlayForTable(tableId, {
        mobileDebug: false,
      });
    } catch (err) {
      console.error("[CTA] open failed", err);
      state = FSM.SEATED;

      if (IS_MOBILE) {
        setMobileHudVisible(true);
      }
    }
    return;
  }

  enqueueAction(ACTION.SELECT);
});

ctaBtn.addEventListener("pointerup", resetCtaBtn);
ctaBtn.addEventListener("pointercancel", resetCtaBtn);
ctaBtn.addEventListener("pointerleave", resetCtaBtn);

ctaWrap.appendChild(ctaBtn);

function showAnnouncementBubble(text) {
  textBubble.textContent = text;
  announcementWrap.style.display = "flex";
}

function hideAnnouncementBubble() {
  announcementWrap.style.display = "none";
}

function showCenterAction(label) {
  ctaBtn.textContent = label;
  ctaWrap.style.display = "flex";
}

function hideCenterAction() {
  resetCtaBtn();
  ctaWrap.style.display = "none";
}
function showMyCommentBoardBtn() {
  myCommentBoardBtn.style.display = "block";
}

function hideMyCommentBoardBtn() {
  myCommentBoardBtn.style.display = "none";
}

function clearRecentCommentsBubbles() {
  recentCommentsBubbleWrap.innerHTML = "";
}

function createRecentCommentBubble(comment, x, y, { align = "left" } = {}) {
  const row = document.createElement("div");
  Object.assign(row.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    pointerEvents: "none",
    transform: align === "right" ? "translateX(-100%)" : "none",
  });

  const avatar = document.createElement("div");
  Object.assign(avatar.style, {
    width: "49px",
    height: "37px",
    flexShrink: "0",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: align === "right" ? "#FFFFFF" : "#22FF22",
    color: align === "right" ? "#1248FF" : "#000000",
    fontFamily: "zpix, sans-serif",
    fontSize: "16px",
    lineHeight: "1",
  });

  const isOwnerComment =
    !!comment?.authorSerial &&
    comment.authorSerial === recentCommentsOwnerSerial;

  const avatarSrc = isOwnerComment
    ? (
        comment?.authorAvatarPhoto ||
        recentCommentsOwnerAvatarPhoto ||
        comment?.avatarPhoto ||
        ""
      )
    : (
        comment?.authorAvatarPhoto ||
        comment?.avatarPhoto ||
        ""
      );

  if (avatarSrc) {
    const img = document.createElement("img");
    img.src = avatarSrc;
    Object.assign(img.style, {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center",
      display: "block",
    });
    avatar.appendChild(img);
  } else {
    avatar.textContent = "pfp";
  }

  const bubble = document.createElement("div");
  bubble.textContent = comment?.content || "";
  Object.assign(bubble.style, {
    maxWidth: "280px",
    minHeight: "44px",
    padding: "0 18px",
    borderRadius: "999px",
    background: "#EAEAEA",
    color: align === "right" ? "#1248FF" : "#FD6FFF",
    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
    display: "flex",
    alignItems: "center",
    fontFamily: "zpix, sans-serif",
    fontSize: "16px",
    lineHeight: "1.2",
    whiteSpace: "nowrap",
  });

  if (align === "right") {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
  }

  recentCommentsBubbleWrap.appendChild(row);
  return row;
}

function renderRecentCommentBubbles(comments) {
  clearRecentCommentsBubbles();

  const safeComments = Array.isArray(comments) ? comments.slice(0, 3) : [];
  if (!safeComments.length) return;

  const guestPositions = [
    { x: 180, y: 250 },
    { x: 320, y: 420 },
    { x: 220, y: 560 },
  ];

  const ownerPositions = [
    { x: window.innerWidth - 240, y: 180 },
    { x: window.innerWidth - 320, y: 500 },
    { x: window.innerWidth - 260, y: 340 },
  ];

  let guestIdx = 0;
  let ownerIdx = 0;

  safeComments.forEach((comment) => {
    const isOwner =
      !!comment?.authorSerial &&
      comment.authorSerial === recentCommentsOwnerSerial;

    const pos = isOwner
      ? ownerPositions[ownerIdx++ % ownerPositions.length]
      : guestPositions[guestIdx++ % guestPositions.length];

    createRecentCommentBubble(comment, pos.x, pos.y, {
      align: isOwner ? "right" : "left",
     
    });
  });
}
function hideRecentCommentsPrompt() {
  if (!recentCommentsUiOpen) return;

  recentCommentsUiOpen = false;
  recentCommentsTableId = null;
  recentCommentsData = [];
  recentCommentsOwnerSerial = "";
  recentCommentsOwnerAvatarPhoto = "";
  recentCommentsLayer.style.display = "none";
  recentCommentsLayer.style.pointerEvents = "none";
  clearRecentCommentsBubbles();

  if (IS_MOBILE) {
    setMobileHudVisible(true);
  }
}

async function showRecentCommentsPrompt(tableId) {
  if (!tableId) return;
  if (tableId === assignedTableId) return;
  if (pot.isOpen?.()) return;
  if (exitDoorUiOpen) return;

  recentCommentsUiOpen = true;
  recentCommentsTableId = tableId;
  recentCommentsData = [];
  recentCommentsOwnerSerial = "";
  recentCommentsOwnerAvatarPhoto = "";
  recentCommentsLayer.style.display = "block";
  recentCommentsLayer.style.pointerEvents = "auto";

  clearMoveKeys();
  hideCenterAction();
  hideHUD();

  if (!IS_MOBILE && controls?.isLocked) {
    controls.unlock();
  }

  if (IS_MOBILE) {
    setMobileHudVisible(false);
  }

  clearRecentCommentsBubbles();

  const roomId =
    currentProfile?.roomId || mapSerialToRoom(currentProfile?.serial);

  const ownerSerial = getOwnerSerialFromRoomAndTable(roomId, tableId);
  recentCommentsOwnerSerial = ownerSerial;

  let ownerProfile = null;
  try {
    ownerProfile = await fetchProfileBySerial(ownerSerial);
  } catch (err) {
    console.warn("[recent comments] owner profile fetch failed", {
      roomId,
      tableId,
      ownerSerial,
      err,
    });
  }

  let comments = [];
  try {
    comments = await fetchTableComments(roomId, tableId, { recent: true });
  } catch (err) {
    console.warn("[recent comments] fetch failed", { roomId, tableId, err });
  }

  recentCommentsData = comments;
  recentCommentsOwnerAvatarPhoto = ownerProfile?.avatarPhoto || "";

  renderRecentCommentBubbles(comments);
}

function clearHallIntroTimers() {
  for (const t of hallIntroTimers) clearTimeout(t);
  hallIntroTimers = [];
}

function showAnnouncementSequence(items = []) {
  clearHallIntroTimers();
  let acc = 0;

  items.forEach((item, idx) => {
    const timer = setTimeout(() => {
      showAnnouncementBubble(item.text);
    }, acc);
    hallIntroTimers.push(timer);
    acc += item.ms ?? 2000;

    if (idx === items.length - 1) {
      const endTimer = setTimeout(() => {
        hideAnnouncementBubble();
      }, acc);
      hallIntroTimers.push(endTimer);
    }
  });
}


const pot = createPotController({
  appEl: document.querySelector("#app"),

  onClose: ({ reason = "normal" } = {}) => {
    const source = overlaySource;
    overlaySource = OVERLAY_SOURCE.NONE;

    clearMoveKeys();

    if (IS_MOBILE) {
      setMobileHudVisible(true);
    }

    if (reason === "finalize") {
      return;
    }

    // 自己的留言板：關掉後直接回自由移動
    if (source === OVERLAY_SOURCE.MY_COMMENT_BOARD) {
      state = FSM.FREE_ROAM;
      hideCenterAction();
      hideHUD();
      return;
    }

    // 鍋子流程：維持你現在原本的設計，關掉就離座
    if (source === OVERLAY_SOURCE.POT) {
      unseatSeat();
      return;
    }

    // 保底
    state = seated ? FSM.SEATED : FSM.FREE_ROAM;
  },

  onRequestClose: () => {
    pot.close({ reason: "normal" });
  },
  onSubmitComment: async ({ tableId, content }) => {
    const roomId =
      currentProfile?.roomId || mapSerialToRoom(currentProfile?.serial);

    const saved = await submitTableComment(roomId, tableId, content);

    return {
      ...saved,
      isOwner: true,
      authorSerial: saved?.authorSerial || currentProfile?.serial || "",
      authorAvatarPhoto:
        saved?.authorAvatarPhoto || currentProfile?.avatarPhoto || "",
    };
  },
  onAutoSavePot: ({
    reason,
    tableId,
    tableState,
    finalPotTextureUrl,
    chairCount,
    chairColor,
    potBodyColor,
    potHandleColor,
  }) => {
    const potPayload = {
      tableId,
      tableState,
      finalPotTextureUrl,
      chairCount,
      chairColor,
      potBodyColor,
      potHandleColor,
    };

    console.log("[pot autosave]", reason, potPayload);

    applyPotStateToTable(potPayload);

    socket.emit("pot:save", potPayload, (res) => {
      console.log("[pot autosave ack]", reason, res);
    });
  },

  onFinalizePot: ({
    tableId,
    tableState,
    finalPotTextureUrl,
    placements,
    chairCount,
    chairColor,
    potBodyColor,
    potHandleColor,
  }) => {
    console.log("[pot finalized]", {
      tableId,
      tableState,
      finalPotTextureUrl,
      placements,
      chairCount,
      chairColor,
      potBodyColor,
      potHandleColor,
    });

    const potPayload = {
      tableId,
      tableState,
      finalPotTextureUrl,
      chairCount,
      chairColor,
      potBodyColor,
      potHandleColor,
    };

    console.log("[before pot:save] connected=", socket.connected, potPayload);

    // 先做本地更新
    applyPotStateToTable(potPayload);

    // 再同步到 server
    socket.emit("pot:save", potPayload, (res) => {
      console.log("[pot:save ack]", res);
    });

    console.log("[after pot:save emit]");

    pot.close({ reason: "finalize" });
    hallPostPotShown = true;

    if (IS_MOBILE) {
      setMobileHudVisible(true);
    }

    unseatSeat();
  },
});

async function openPotOverlayForTable(tableId, { mobileDebug = false } = {}) {
  if (isOverlayOpening) return;
  isOverlayOpening = true;
  const prevState = state;

  const tableState =
    tablePotStateMap.get(tableId) ?? createEmptyTablePotState(tableId);

  const isOwnerTable = tableId === assignedTableId;
  const roomId =
    currentProfile?.roomId || mapSerialToRoom(currentProfile?.serial);
  const ownerSerial = getOwnerSerialFromRoomAndTable(roomId, tableId);

  // 先鎖住 hall 狀態
  state = FSM.UI_OPEN;
  overlaySource = OVERLAY_SOURCE.POT;
  hideMyCommentBoardBtn();
  hideCenterAction();
  hideHUD();
  hideAnnouncementBubble();
  clearMoveKeys();

  if (!IS_MOBILE && controls?.isLocked) {
    controls.unlock();
  }

  if (IS_MOBILE) {
    setMobileHudVisible(false);
  }

  let tableOwnerProfile = null;
  let comments = [];

  try {
    tableOwnerProfile = await fetchProfileBySerial(ownerSerial);
  } catch (err) {
    console.warn("[openPotOverlayForTable] fetch owner profile failed", {
      roomId,
      tableId,
      ownerSerial,
      err,
    });
  }

  try {
    comments = await fetchTableComments(roomId, tableId);
  } catch (err) {
    console.warn("[openPotOverlayForTable] fetch comments failed", {
      roomId,
      tableId,
      err,
    });
  }

  try {
    pot.open({
      tableId,
      tableState,
      viewOnly: !isOwnerTable,
      ownerTableId: assignedTableId,
      mobileDebug,
      comments,
      tableOwnerProfile,
    });
    isOverlayOpening = false;
  } catch (err) {
    state = prevState;
    overlaySource = OVERLAY_SOURCE.NONE;
    isOverlayOpening = false;
    throw err;
  }
}
async function openMyCommentBoard() {
  if (isOverlayOpening) return;
  isOverlayOpening = true;
  const prevState = state;

  const tableId = assignedTableId;
  const roomId =
    currentProfile?.roomId || mapSerialToRoom(currentProfile?.serial);
  const ownerSerial =
    currentProfile?.serial || getOwnerSerialFromRoomAndTable(roomId, tableId);

  // 先鎖住 hall 狀態，避免等待 fetch 時 UI 又被 animate 改回去
  state = FSM.UI_OPEN;
  overlaySource = OVERLAY_SOURCE.MY_COMMENT_BOARD;
  hideMyCommentBoardBtn();
  hideCenterAction();
  hideHUD();
  hideAnnouncementBubble();
  clearMoveKeys();

  if (!IS_MOBILE && controls?.isLocked) {
    controls.unlock();
  }

  if (IS_MOBILE) {
    setMobileHudVisible(false);
  }

  let tableOwnerProfile = null;
  let comments = [];

  try {
    tableOwnerProfile = await fetchProfileBySerial(ownerSerial);
  } catch (err) {
    console.warn("[openMyCommentBoard] fetch owner profile failed", {
      roomId,
      tableId,
      ownerSerial,
      err,
    });
  }

  try {
    comments = await fetchTableComments(roomId, tableId);
  } catch (err) {
    console.warn("[openMyCommentBoard] fetch comments failed", {
      roomId,
      tableId,
      err,
    });
  }

  try {
    pot.openCommentBoard({
      tableId,
      comments,
      tableOwnerProfile,
    });
    isOverlayOpening = false;
  } catch (err) {
    state = prevState;
    overlaySource = OVERLAY_SOURCE.NONE;
    isOverlayOpening = false;
    throw err;
  }
}

function safeLockPointer() {
  if (IS_MOBILE) return;
  if (pot?.isOpen?.()) return;
  if (exitDoorUiOpen) return;
  if (state === FSM.UI_OPEN) return;
  if (controls?.isLocked) return;

  try {
    controls.lock();
  } catch (err) {
    console.warn("[pointerlock] lock failed", err);
  }
}



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

function showHUD(text) {
  if (state === FSM.SEATED) {
    hideHUD();
    return;
  }

  hudEl.textContent = text;
  hudEl.style.display = "block";
}
function hideHUD() {
  if (!hudEl) return;
  hudEl.style.display = "none";
}


const p = new THREE.Vector3();
camera.getWorldPosition(p);
console.log("[camera world pos]", p.toArray());



function distanceToTable(entry, playerPos){
  entry.bbox.clampPoint(playerPos, _tmpClosest);
  return _tmpClosest.distanceTo(playerPos);
};


const tableRegistry = new Map();

function getOfflineAvatarPoseForTable(tableId, serial) {
  const info = tableRegistry.get(tableId);
  if (!info) return null;

  const size = new THREE.Vector3();
  info.bbox.getSize(size);

  const center = info.center.clone();

  const serialNum = parseInt(String(serial || "").replace(/^P/i, ""), 10);
  const angleSeed = Number.isFinite(serialNum) ? serialNum : 1;
  const angle = ((angleSeed - 1) % 8) / 8 * Math.PI * 2;

  const radius = Math.max(size.x, size.z) * 0.55 + 0.8;

  const x = center.x + Math.cos(angle) * radius;
  const z = center.z + Math.sin(angle) * radius;

  // 優先抓同桌第一個 seat 的 y，沒有就用 bbox.min.y
  let y = info.bbox.min.y;
  for (const [key, anchor] of seatAnchorByKey.entries()) {
    if (key.startsWith(`${tableId}_`)) {
      y = anchor.pos.y;
      break;
    }
  }

  // 面向桌中心
  const rotY = Math.atan2(center.x - x, center.z - z);

  return {
    pos: { x, y, z },
    rotY,
  };
}


function findPotRef(tableRoot) {
  const cadidates = ["potbody_", "soupBase_", "soupTransparent_", "pothandle_", "potstand_", "stovebody_", "stovebutton_", "stovecap_", "fire_"];
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
function findChairTemplateInTable(tableRoot) {
  let found = null;

  tableRoot.traverse((o) => {
    if (found) return;
    if (!o.name) return;

    const name = o.name.toLowerCase();
    if (name.startsWith("chair_")) {
      found = o;
    }
  });

  return found;
}

function buildTableInfo(tableRoot){
  const bbox = new THREE.Box3().setFromObject(tableRoot);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  tableRegistry.forEach((entry) => {
    const box = new THREE.Box3().setFromObject(entry.root);
    entry.bbox = box;
  });

  const potMesh = findFirstMeshByNameIncludes(
    tableRoot,
    ["potbody", "soup", "pothandle", "potstand", "stovebody", "stovebutton", "stovecap", "fire"]
  ) || null;

  const seatPoints = [];
  const chairTemplate = findChairTemplateInTable(tableRoot);

  let potRoot = null;
  if (potMesh) {
    potRoot = potMesh.parent;
  }

  console.log("[buildTableInfo]", tableRoot.name, {
    chairTemplate: chairTemplate?.name ?? null,
  });

  return {
    id: tableRoot.name,
    root: tableRoot,
    bbox,
    center,
    seatPoints,
    potRef: potMesh,
    potRoot,
    chairTemplate,
  };
}

function applyPotTextureToRoot(
  potRoot,
  textureUrl,
  potBodyColor = "#FD6FFF",
  potHandleColor = "#E8F25A"
) {
  if (!potRoot || !textureUrl) {
    console.warn("[applyPotTextureToRoot] missing potRoot or textureUrl", {
      hasPotRoot: !!potRoot,
      textureUrl,
    });
    return;
  }

  let soupBaseMesh = null;
  let soupTransparentMesh = null;
  let potBodyMesh = null;
  let potHandleMesh = null;

  potRoot.traverse((obj) => {
    if (!obj.isMesh) return;

    if (obj.name?.startsWith("soupBase_")) soupBaseMesh = obj;
    if (obj.name?.startsWith("soupTransparent_")) soupTransparentMesh = obj;
    if (obj.name?.startsWith("potbody_")) potBodyMesh = obj;
    if (obj.name?.startsWith("pothandle_")) potHandleMesh = obj;
  });

  if (potBodyMesh) {
    const oldMat = potBodyMesh.material;
    potBodyMesh.material = new THREE.MeshStandardMaterial({
      color: potBodyColor,
      roughness: 0.35,
      metalness: 0.02,
      transparent: false,
      opacity: 1,
      side: THREE.FrontSide,
      depthWrite: true,
    });
    oldMat?.dispose?.();
  }

  if (potHandleMesh) {
    const oldMat = potHandleMesh.material;
    potHandleMesh.material = new THREE.MeshStandardMaterial({
      color: potHandleColor,
      roughness: 0.28,
      metalness: 0.18,
    });
    oldMat?.dispose?.();
  }

  const loader = new THREE.TextureLoader();
  const tex = loader.load(textureUrl);

  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.center.set(0.5, 0.5);
  tex.rotation = 0;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  tex.needsUpdate = true;

  // 不再使用 soupBase
  if (soupBaseMesh) {
    soupBaseMesh.visible = false;
  }

  // 直接把圖貼到 soupTransparent
  if (soupTransparentMesh) {
    const oldMat = soupTransparentMesh.material;
    if (oldMat?.map) oldMat.map.dispose?.();
    oldMat?.dispose?.();

    soupTransparentMesh.visible = true;
    soupTransparentMesh.renderOrder = 10;
    soupTransparentMesh.material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    soupTransparentMesh.material.needsUpdate = true;
  } else {
    console.warn("[applyPotTextureToRoot] soupTransparentMesh not found");
  }
}
function applyPotStateToTable(pot) {
  if (!pot?.tableId) return;

  if (pot.tableState) {
    tablePotStateMap.set(pot.tableId, pot.tableState);
  }

  const resolvedChairCount =
    pot.chairCount ?? pot.tableState?.chairCount ?? 1;

  const resolvedChairColor =
    pot.chairColor ?? pot.tableState?.chairColor ?? "#e8f25a";

  const resolvedPotBodyColor =
    pot.potBodyColor ?? pot.tableState?.potBodyColor ?? "#FD6FFF";

  const resolvedPotHandleColor =
    pot.potHandleColor ?? pot.tableState?.potHandleColor ?? "#E8F25A";

  const resolvedTexture =
    pot.finalPotTextureUrl ?? pot.tableState?.finalPotTextureUrl ?? null;

  applyChairCountToTable(
    pot.tableId,
    resolvedChairCount,
    resolvedChairColor
  );

  const info = tableRegistry.get(pot.tableId);
  const potRoot = info?.potRoot ?? null;

  if (potRoot && resolvedTexture) {
    applyPotTextureToRoot(
      potRoot,
      resolvedTexture,
      resolvedPotBodyColor,
      resolvedPotHandleColor
    );
  }

  console.log("[applyPotStateToTable]", pot.tableId, {
    hasTableState: !!pot.tableState,
    chairCount: resolvedChairCount,
    chairColor: resolvedChairColor,
    potBodyColor: resolvedPotBodyColor,
    potHandleColor: resolvedPotHandleColor,
    hasTexture: !!resolvedTexture,
  });
}
function applyHallScreenVideo(envRoot) {
  console.log("[hall screen] searching Plane010");

  envRoot.traverse((obj) => {
    const n = obj.name || "";
    if (
      n.includes("Plane") ||
      n.includes("plane") ||
      n.includes("010")
    ) {
      console.log("[hall screen candidate]", {
        name: obj.name,
        type: obj.type,
        isMesh: obj.isMesh,
        children: obj.children?.map(c => ({
          name: c.name,
          type: c.type,
          isMesh: c.isMesh,
        })),
      });
    }
  });
  const screen = envRoot.getObjectByName("Plane010");

  if (!screen || !screen.isMesh) {
    console.warn("[hall screen] Plane.010 not found or not mesh", screen);
    return;
  }

  hallScreenVideo = document.createElement("video");
  hallScreenVideo.src = "/animation.mp4";
  hallScreenVideo.loop = true;
  hallScreenVideo.muted = false;
  hallScreenVideo.playsInline = true;
  hallScreenVideo.autoplay = true;
  hallScreenVideo.preload = "auto";
  hallScreenVideo.crossOrigin = "anonymous";

  hallScreenTexture = new THREE.VideoTexture(hallScreenVideo);
  hallScreenTexture.colorSpace = THREE.SRGBColorSpace;
  hallScreenTexture.flipY = false;
  hallScreenTexture.wrapS = THREE.ClampToEdgeWrapping;
  hallScreenTexture.wrapT = THREE.ClampToEdgeWrapping;
  hallScreenTexture.minFilter = THREE.LinearFilter;
  hallScreenTexture.magFilter = THREE.LinearFilter;

  const oldMat = screen.material;
  screen.material = new THREE.MeshBasicMaterial({
    map: hallScreenTexture,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  oldMat?.dispose?.();

  hallScreenVideo.play().catch((err) => {
    console.warn("[hall screen] video autoplay blocked", err);
  });

  console.log("[hall screen] animation.mp4 applied to Plane.010");
}
function createAssignedMarker() {
  const group = new THREE.Group();
  group.visible = false;

  const geom = new THREE.ConeGeometry(0.35, 1.1, 4);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1248ff,
    toneMapped: false,
  });

  const cone = new THREE.Mesh(geom, mat);
  cone.rotation.x = Math.PI;
  group.add(cone);

  scene.add(group);
  return group;
}

function showAssignedMarkerAtTable(tableId) {
  if (!assignedMarker) assignedMarker = createAssignedMarker();

  const info = tableRegistry.get(tableId);
  if (!info) {
    console.warn("[hall] assigned table not found:", tableId);
    assignedMarker.visible = false;
    assignedMarkerTarget = null;
    return;
  }

  const target = info.center.clone();
  target.y = info.bbox.max.y + 2.3;

  assignedMarker.position.copy(target);
  assignedMarkerBobBaseY = target.y;
  assignedMarker.visible = true;
  assignedMarkerTarget = tableId;

  console.log("[hall] marker ->", tableId);
}

function hideAssignedMarker() {
  if (!assignedMarker) return;
  assignedMarker.visible = false;
  assignedMarkerTarget = null;
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


function startHallIntroIfNeeded() {
  if (hallIntroStarted) return;
  hallIntroStarted = true;

  showAnnouncementSequence([
    { text: t("hall_intro_open"), ms: 2200 },
    { text: t("hall_intro_assigning"), ms: 2600 },
    { text: t("hall_intro_explore"), ms: 2400 },
  ]);

  const revealTimer = setTimeout(() => {
    revealAssignedSeat();
  }, 60000);

  hallIntroTimers.push(revealTimer);
}

function revealAssignedSeat() {
  if (hallAssignmentRevealed) return;
  hallAssignmentRevealed = true;

  showAnnouncementBubble(t("hall_seat_ready"));

  const t1 = setTimeout(() => {
    showAnnouncementBubble(t("hall_follow_marker"));
  }, 1800);

  const t2 = setTimeout(() => {
    hideAnnouncementBubble();
  }, 4200);

  hallIntroTimers.push(t1, t2);

  if (assignedTableId) {
    showAssignedMarkerAtTable(assignedTableId);
  }
}

function showPostPotAnnouncement() {
  showAnnouncementBubble(t("hall_after_pot_1"));

  const t1 = setTimeout(() => {
    showAnnouncementBubble(t("hall_after_pot_2"));
  }, 1800);

  const t2 = setTimeout(() => {
    hideAnnouncementBubble();
  }, 4200);

  hallIntroTimers.push(t1, t2);
}








const ndc = new THREE.Vector2(0, 0);
window.addEventListener("mousemove", (e) => {
  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
});


const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  boost: false,
};

let mobileInput = null;

function setMobileHudVisible(visible) {
  const isVisible = !!visible;

  if (mobileInput?.setVisible) {
    mobileInput.setVisible(isVisible);
  }

  const selectors = [
    "#mobile-input-root",   // <- 這個一定要加
    "#mobile-input",
    "#mobile-controls",
    "#mobile-joystick",
    "#mobile-look",
    "#mobile-actions",
    ".mobile-input",
    ".mobile-controls",
    ".mobile-joystick",
    ".mobile-look",
    ".mobile-actions",
    ".joystick-zone",
    ".look-zone",
  ];

  document.querySelectorAll(selectors.join(",")).forEach((el) => {
    el.style.display = isVisible ? "" : "none";
    el.style.pointerEvents = isVisible ? "auto" : "none";
    el.style.opacity = isVisible ? "1" : "0";
  });

  if (!isVisible) {
    hideCenterAction();
    resetCtaBtn();
  }
}

if (window.matchMedia("(pointer: coarse)").matches) {
  mobileInput = initMobileInput({
    keys,
    enqueueAction,
    ACTION,
    getState: () => state,
    isUiOpen: () => (state === FSM.UI_OPEN) || pot.isOpen?.(),

    onLook: (dx, dy) => {
      if (!touchLook) return;
      if (isTouchLookBlocked()) return;

      touchLook.yaw -= dx;
      touchLook.pitch += dy;

      touchLook.pitch = THREE.MathUtils.clamp(
        touchLook.pitch,
        -touchLook.maxPitch,
        touchLook.maxPitch
      );

      applyTouchLook();
    }
  });
}

function clearMoveKeys() {
  keys.forward = false;
  keys.back = false;
  keys.left = false;
  keys.right = false;
  keys.boost = false;
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  if (exitDoorUiOpen) {
    if (e.code === "Escape" || e.code === "KeyR") {
      hideExitDoorPrompt();
    }
    return;
  }

  if (recentCommentsUiOpen) {
    if (e.code === "Escape" || e.code === "KeyR") {
      hideRecentCommentsPrompt();
    }
    return;
  }


  console.log ("keydown:", e.code, e.key);
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.forward = true;
  if (e.code === "ArrowDown" || e.code === "KeyS") keys.back = true;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.boost = true;
  if (e.code === "KeyE") {
  console.log("[input] enqueue SELECT, state=", state);
  enqueueAction(ACTION.SELECT);
  } 
  
  if (e.code === "KeyR"){
    enqueueAction(ACTION.CANCEL);
    return;
  }
  if (e.code === "Enter") {
  console.log("[input] enqueue CONFIRM, state=", state);
  enqueueAction(ACTION.CONFIRM);
  }
  if (e.code === "Space"){
    e.preventDefault();
    enqueueAction(ACTION.JUMP);
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




  

const loader = new GLTFLoader();
loader.load(
  "/env.glb",
  (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    applyHallScreenVideo(envRoot);
    envRoot.traverse((obj) => {
  if (obj.name) console.log(obj.name);
  });

  exitDoorMesh = null;

envRoot.traverse((obj) => {
  if (exitDoorMesh) return;
  if (!obj.name) return;

  const n = obj.name.toLowerCase();
  if (n.includes("doorarea") || n === "doorarea" || n.includes("door")) {
    exitDoorMesh = obj;
  }
});

console.log("[exitDoorMesh]", exitDoorMesh);

if (!exitDoorMesh) {
  console.warn("找不到 door 相關節點，請看 [door candidate] log");
} else {
  refreshExitDoorBox();

  const s = new THREE.Vector3();
  exitDoorBox.getSize(s);
  // console.log("[exitDoorBox size]", s.toArray());
}

  if (!exitDoorMesh) {
    console.warn("找不到 doorArea.001，請確認 env.glb 內名稱完全一致");
  } else {
    refreshExitDoorBox();

    const s = new THREE.Vector3();
    exitDoorBox.getSize(s);
    console.log("[exitDoorBox size]", s.toArray());
  }

  console.log("gltf.scene:", gltf.scene);
  console.log("children:", gltf.scene.children.map(c => c.name));
  
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

    player.position.set(center.x, EYE_HEIGHT, center.z);

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
    tablePotStateMap.clear();
    for (const [tableId] of tableRegistry.entries()) {
      tablePotStateMap.set(tableId, createEmptyTablePotState(tableId));
    }
    console.log("[tablePotStateMap] init:", Array.from(tablePotStateMap.keys()));
    decorativeChairGroupByTableId.clear();
    for (const [tableId, info] of tableRegistry.entries()) {
      const g = new THREE.Group();
      g.name = `decorativeChairs_${tableId}`;
      info.root.add(g);
      decorativeChairGroupByTableId.set(tableId, g);
    }
    for (const [tableId] of tableRegistry.entries()) {
      applyChairCountToTable(tableId, 1);
    }
    console.log("[decorativeChairGroupByTableId]", Array.from(decorativeChairGroupByTableId.keys()));
    console.log("tableRegistry ready:", Array.from(tableRegistry.keys()));
    tables.forEach(makeMaterialsUnique);
    console.log("made table materials unique");
    console.log("envBox:", envBox.min, envBox.max);

    potRayTargetsByTableId.clear();
    for (const [tableId, info] of tableRegistry.entries()){
      const root = info.potRoot;
      if (!root) {
        console.warn("[pot] missing potRoot for", tableId);
        potRayTargetsByTableId.set(tableId,[]);
        continue;
      }
      const meshes = [];
      root.traverse((o) => {
        if (o.isMesh) meshes.push(o);
      });
      potRayTargetsByTableId.set(tableId, meshes);
      console.log("[pot targets]", tableId, meshes.map(m => m.name));
    }
    console.log("[pot] targets ready", Array.from(potRayTargetsByTableId.entries()).map(([k, v]) => [k, v.length]));

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

    // const spawnLight = new THREE.PointLight(0xffffff, 50, 100);
    // spawnLight.position.set(
    // center.x,
    // center.y + 8,
    // center.z - 3,
    // );
    // scene.add(spawnLight);

    // 1. 基礎環境光：讓陰影處不至於全黑
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // 3. 局部點光源：放在場景的前後兩端，模擬圖三的佈局
    const light1 = new THREE.PointLight(0xffffff, 0.5); 
    light1.position.set(center.x, 8, center.z - 10);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xffffff, 0.5);
    light2.position.set(center.x, 8, center.z + 5);
    scene.add(light2);

    // 4. 渲染器設定（非常重要）
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    return box;
    }

    function scanTablesAndSeatsById(envRoot){
      const tables = [];

      for (let i = 1; i <= 8; i++){
        const tableObj = envRoot.getObjectByName(`table${i}`);
        if (!tableObj) continue;

        tableObj.updateWorldMatrix(true, true);

        const table = { id: `table${i}`, obj: tableObj, seats: [] };

        tableObj.traverse((o) => {
          const n = (o.name || "").toLowerCase();
          if (n.startsWith("seat")) {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scl = new THREE.Vector3();
            o.matrixWorld.decompose(pos, quat, scl);

            table.seats.push({
              id: o.name,   // seat_1 / seat_A / whatever
              obj: o,
              pos,
              quat,
            });
          }
        });

        tables.push(table);
      }

      return tables;
    }

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
      enabled: false,
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

  
    const HIT_Y_OFFSET = 1.2;


    for (const t of tableInfos) {
      for (const s of t.seats) {
        console.log("[debug seat world pos]", t.id, s.id, s.pos.toArray());
      

        
        const hitGeom = new THREE.SphereGeometry(0.6, 12, 12);
        const hitMat = new THREE.MeshBasicMaterial({
          visible: false,
          color: 0x00ff,
          wireframe: true,
          transparent: true,
          opacity: 0.25
        });
        const hit = new THREE.Mesh(hitGeom, hitMat);
        hit.name = `HIT_SEAT_${t.id}_${s.id}`;
        
        hit.position.set(s.pos.x, s.pos.y + HIT_Y_OFFSET, s.pos.z);
        hit.renderOrder = 998;
        hit.frustumCulled = false;
        g.add(hit);

        const key = `${t.id}_${s.id}`;
        seatVisualByKey.set(key, hit);
      }
    }
    
    seatHitMeshes = g.children.filter(o => o.isMesh && o.name?.startsWith("HIT_SEAT_"));

    // --- force seat hit meshes raycastable ---
    for (const m of seatHitMeshes) {
      m.layers.set(0);
      m.visible = false;
    }
    camera.layers.enable(0);
    viewRaycaster.layers.set(0);
    
    
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
    const center = new THREE.Vector3();
    worldBounds.getCenter(center);
    player.position.set(center.x, EYE_HEIGHT, center.z);
    } else {
    console.warn("floorObj not found");
    }
    startHallIntroIfNeeded();

    if (hallAssignmentRevealed && assignedTableId) {
      showAssignedMarkerAtTable(assignedTableId);
    }
    console.log("[after env load] remote count =", remotePlayers.size);

    remotePlayers.forEach((obj, id) => {
      console.log("[remote still in scene?]", id, scene.children.includes(obj), obj.position.toArray());
    });
    hallSceneReady = true;

    if (pendingSnapshotPots.length > 0) {
      console.log("[hallSceneReady] flush buffered pots", pendingSnapshotPots.length);
      for (const pot of pendingSnapshotPots) {
        applyPotStateToTable(pot);
      }
      pendingSnapshotPots = [];
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
  player.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  viewRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  viewRaycaster.far = INTERACT_DISTANCE;
  const hits = viewRaycaster.intersectObjects(tables, true);
  if (hits.length === 0) return null;
  let obj = hits[0].object;
  while (obj && !tables.includes(obj)) obj = obj.parent;
  return obj || null;
}
function isLookingAtAssignedTable() {
  if (!assignedTableId) return false;
  const hitTable = getLookAtTable();
  if (!hitTable) return false;
  if (hitTable.name !== assignedTableId) return false;

  const info = tableRegistry.get(assignedTableId);
  if (!info) return false;

  const dist = distanceToTable(info, player.position);
  return dist <= INTERACT_DISTANCE;
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
  origin.y += 2.0;
  const dir = new THREE.Vector3(0, -1, 0);
  groundRaycaster.set(origin, dir);
  groundRaycaster.far = RAY_FAR + 2;
  const hits = groundRaycaster.intersectObjects(walkables, true);
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
  const obj = player;
  const eyeHeight = 1.2;
  obj.position.set(anchor.pos.x, eyeHeight, anchor.pos.z);
  const e = new THREE.Euler().setFromQuaternion(anchor.quat, "YXZ");
  obj.rotation.set(0, e.y, 0);
  camera.position.x = 0;
  console.log("[snapToSeat] snapped to", key, "pos=", obj.position.toArray());
  isSeated = true;
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
  console.log("[debug] seat typeof", Array.isArray(seat) ? "array" : typeof seat, seat);

  requestSitSeat(seat);
  return true;
}


function dispatchAction(action) {
  if (introPlaying) return;

  const { type } = action;

  // ---- Global CANCEL（任何 state 都先吃）----
  if (type === ACTION.CANCEL) {
    if (state === FSM.UI_OPEN) {
      pot.close();
      state = FSM.SEATED;
      console.log("[FSM] UI_OPEN -> SEATED");
      return;
    }

    if (state === FSM.SEATED) {
      unseatSeat();
      return;
    }

    if (state === FSM.SEAT_SELECTING) {
      console.log("[FSM] SEAT_SELECTING -> FREE_ROAM");
      selectedTableId = null;
      state = FSM.FREE_ROAM;
      return;
    }

    if (state === FSM.FREE_ROAM) {
      if (selectedTableId) {
        console.log("[FSM] cancel table selection", selectedTableId);
        selectedTableId = null;
      }
      return;
    }

    return;
  }
      if (type === ACTION.JUMP) {
    if (state === FSM.FREE_ROAM && isGrounded) {
      velY = JUMP_VEL;
      isGrounded = false;
      console.log("[jump]");
    }
    return;
  }

  // ---- State-specific handling ----
  switch (state) {

    case FSM.FREE_ROAM: {
      if (type === ACTION.SELECT) {
        const hitTable = getLookAtTable();
        if (!hitTable) {
          console.log("[SELECT] no table");
          return;
        }

        const tableId = hitTable.name;
        const seat = getFirstSeatForTable(tableId);
        if (!seat) {
          console.warn("[SELECT] no seat for", tableId);
          return;
        }

        

      selectedTableId = tableId;
      state = FSM.SEAT_SELECTING;
      console.log("[FSM] FREE_ROAM -> SEAT_SELECTING (auto)", tableId);

      requestSitSeat(seat); // ← 直接送
        return;
      }

      
      return;
    }


    case FSM.SEAT_SELECTING: {
      console.log("[FSM] in SEAT_SELECTING, got action=", type, "selectedTableId=", selectedTableId);

      return;
    }


    case FSM.SEATED: {
      if (type === ACTION.SELECT) {
        const potHit = getLookAtPotHitForActiveTable();
        if (!potHit) {
          return;
        }

        activeTableId = seated.tableId;

        openPotOverlayForTable(activeTableId, {
          mobileDebug: false,
        }).then(() => {
          const tableState =
            tablePotStateMap.get(activeTableId) ??
            createEmptyTablePotState(activeTableId);

          const isOwnerTable = activeTableId === assignedTableId;

          console.log(
            "[FSM] SEATED -> UI_OPEN table=",
            activeTableId,
            "initialized=",
            tableState?.initialized,
            "hit=",
            potHit.object?.name,
            "isOwnerTable=",
            isOwnerTable
          );
        }).catch((err) => {
          console.error("[FSM] open failed", err);
          state = FSM.SEATED;

          if (IS_MOBILE) {
            setMobileHudVisible(true);
          }
        });

        return;
      }
      return;
    }

    case FSM.UI_OPEN: {
      if (type === ACTION.CONFIRM) {
        console.log("[UI] confirm");
        return;
      }
      return;
    }

    default:
      console.warn("[dispatchAction] unknown state:", state);
      return;
  }
}
function updateHUD() {
  if (state === FSM.FREE_ROAM) {
    if (hoveredTableId) showHUD(`Look: ${hoveredTableId}  (E to select)`);
    hideHUD();
    return;
  }

  if (state === FSM.SEAT_SELECTING) {
    showHUD(`Selected: ${selectedTableId ?? "-"}  (E/Enter to sit, R/Esc cancel)`);
    hideHUD();
    return;
  }

  if (state === FSM.SEATED) {
    hideHUD();
    return;
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
  for (const s of seatsState.values()) {
    if (s.tableId === tableId) return s; 
  }
  return null;
}
function clearDecorativeChairs(tableId) {
  const group = decorativeChairGroupByTableId.get(tableId);
  if (!group) return;

  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);

    child.traverse?.((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m?.dispose?.());
        } else {
          obj.material?.dispose?.();
        }
      }
    });
  }
}
function applyDecorativeChairMaterial(root, color = 0xe8f25a) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;

    obj.castShadow = false;
    obj.receiveShadow = false;

    obj.material = new THREE.MeshBasicMaterial({
      color,
      transparent: false,
      toneMapped: false,
    });
  });
}
function getChairLayout(count, baseRadius = 2.2) {
  const out = [];

  if (count <= 1) return out;

  // 第 1 張保留原始 chair，不進 layout
  const extraCount = count - 1;

  // 先定一個基礎槽位數
  let baseSlots;
  if (count <= 8) baseSlots = 8;
  else if (count <= 12) baseSlots = 12;
  else if (count <= 16) baseSlots = 16;
  else baseSlots = 24;

  // 每多一圈的相位偏移（弧度）
  // 數字越大，擠壓感越強
  const offsetStep = Math.PI / 36; // 5 度

  for (let i = 0; i < extraCount; i++) {
    const slot = i % baseSlots;
    const lap = Math.floor(i / baseSlots);

    const baseAngle = (slot / baseSlots) * Math.PI * 2;

    // 關鍵：不是完全重疊，而是每一輪都稍微偏移
    const angle = baseAngle + lap * offsetStep;

    out.push({
      angle,
      radius: baseRadius,
      slot,
      lap,
    });
  }

  return out;
}

function applyChairCountToTable(tableId, chairCount, chairColor = 0xe8f25a) {
  const info = tableRegistry.get(tableId);
  const group = decorativeChairGroupByTableId.get(tableId);

  console.log("[applyChairCount] raw info", {
    tableId,
    requested: chairCount,
    hasInfo: !!info,
    chairTemplate: info?.chairTemplate?.name ?? null,
    hasGroup: !!group,
  });

  if (!info || !info.chairTemplate || !group) {
    console.warn("[applyChairCount] missing template/group", tableId, info, group);
    return;
  }

  clearDecorativeChairs(tableId);

  const template = info.chairTemplate;
  const count = Math.max(1, Number(chairCount) || 1);

  // 保留原始 chair 在原位，這樣坐下去不會下方空掉
  template.visible = true;
  applyDecorativeChairMaterial(template, chairColor);

  // 原始 chair 的 local position / rotation 當作基準
  const baseY = template.position.y;

  const layout = getChairLayout(count, 2.9);

  for (let i = 0; i < layout.length; i++) {
    const item = layout[i];
    const chair = template.clone(true);
    applyDecorativeChairMaterial(chair, chairColor);

    const x = Math.cos(item.angle) * item.radius;
    const z = Math.sin(item.angle) * item.radius;

    chair.position.set(x, baseY, z);
    chair.lookAt(0, baseY, 0);
    chair.rotateY(Math.PI);

    chair.visible = true;
    group.add(chair);
  }

  console.log("[applyChairCount] applied", tableId, count, "extra clones =", layout.length);
}
function canSitSeat(seat, myPlayerId = "local"){
  if (!seat) return false;
  if (seat.occupiedBy === null) return true;
  return seat.occupiedBy === myPlayerId;
}
function requestSitSeat(seatLike){
  console.log("[requestSitSeat] called, state=", state, "seatLike=", seatLike);
  
  const allow = (
    state === FSM.FREE_ROAM ||
    state === FSM.SEAT_SELECTING
  );
  if (!allow) return;

  const key = 
  seatLike?.key ??
  (seatLike?.tableId && (seatLike?.seatId ?? seatLike?.id)
  ? `${seatLike.tableId}_${seatLike.seatId ?? seatLike.id}`
  : null);

  if (!key) {
    console.warn("[sit] missing seatKey", seatLike);
    return;
  }
  const Seat = seatsState.get(key);
  if (!Seat) {
    console.warn("[sit] seat not in seatsState", key);
    return;
  }
  if (!canSitSeat(Seat, localPlayerId)) {
  console.log("[sit] denied locally occupied by =", Seat.occupiedBy);
  return;
  }

  socket.emit("requestSitSeat", {seatKey: Seat.key});
  console.log("[sit] requested", Seat.key);
}
function sitSeatLocalSnap(seat){
  const sid = seat.seatId ?? seat.id;

  seated = { tableId: seat.tableId, seatId: sid };
  state = FSM.SEATED;
  activeTableId = seat.tableId;

  player.position.copy(seat.pos);
  player.quaternion.copy(seat.quat);

  player.position.y = seat.pos.y + EYE_HEIGHT_SEATED;
  syncTouchLookFromCamera();
  velY = 0;
  isGrounded = true;

  if (seat.tableId === assignedTableId) {
    hideAssignedMarker();
  } else {
    showRecentCommentsPrompt(seat.tableId).catch((err) => {
      console.error("[sitSeatLocalSnap] showRecentCommentsPrompt failed", err);
    });
  }

  console.log("[sit local snap FIXED]", seat.tableId, sid, player.position.toArray());
}
function unseatSeat(){
  if (!seated) return;
  const key = `${seated.tableId}_${seated.seatId}`;
  socket.emit("requestUnseat", {seatKey: key});
  console.log("[unseat] requested", key);
}

function getLookAtPotHitForActiveTable(){
  if (!seated?.tableId) return null;
  const tableId = seated.tableId;
  const targets = potRayTargetsByTableId.get(tableId);
  if (!targets || targets.length === 0) return null;

  viewRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  viewRaycaster.far = INTERACT_DISTANCE;

  const hits = viewRaycaster.intersectObjects(targets, true);
  if(hits.length === 0) return null;

  return hits[0];
}




function updateSeatHover() {
  // reset visuals
  for (const mesh of seatVisualByKey.values()) mesh.scale.set(1, 1, 1);

  hoveredSeatKey = null;
  hoveredSeatTableId = null;
  hoveredSeatId = null;

  if (!seatHitMeshes || seatHitMeshes.length === 0) return;

  player.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  seatRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const hits = seatRaycaster.intersectObjects(seatHitMeshes, false);
  if (hits.length === 0) return;

  const hitObj = hits[0].object;
  const name = hitObj.name || "";
  const parts = name.split("_"); // HIT_SEAT_table1_seat_1

  if (parts.length < 5) return;
  if (parts[0] !== "HIT" || parts[1] !== "SEAT") return;

  const tableId = parts[2];
  const seatId = `${parts[3]}_${parts[4]}`;
  const key = `${tableId}_${seatId}`;

  hoveredSeatTableId = tableId;
  hoveredSeatId = seatId;
  hoveredSeatKey = key;

  const visual = seatVisualByKey.get(key);
  if (visual) visual.scale.set(1.35, 1.35, 1.35);

  if (hoveredSeatKey !== lastHoveredSeatKey) {
    console.log("[hoverSeat]", hoveredSeatKey);
    lastHoveredSeatKey = hoveredSeatKey;
  }
}

function getAvatarWorldPos() {
  if (state === FSM.SEATED && seated) {
    const key = `${seated.tableId}_${seated.seatId}`;
    const anchor = seatAnchorByKey.get(key);

    if (anchor) {
      return {
        x: anchor.pos.x,
        y: anchor.pos.y,
        z: anchor.pos.z,
      };
    }
  }

  return {
    x: player.position.x,
    y: player.position.y - EYE_HEIGHT,
    z: player.position.z,
  };
}

function refreshExitDoorBox() {
  if (!exitDoorMesh) return;

  exitDoorMesh.updateWorldMatrix(true, true);
  exitDoorBox.setFromObject(exitDoorMesh);
  exitDoorBox.expandByScalar(EXIT_DOOR_TRIGGER_PAD);
  exitDoorBox.getCenter(exitDoorCenter);

  const size = new THREE.Vector3();
  exitDoorBox.getSize(size);

  // 用門的寬/深抓一個合理半徑
  exitDoorRadius = 0.9;

  // console.log("[refreshExitDoorBox]", {
  //   min: exitDoorBox.min.toArray(),
  //   max: exitDoorBox.max.toArray(),
  //   center: exitDoorCenter.toArray(),
  //   size: size.toArray(),
  //   radius: exitDoorRadius,
  // });
}

function updateExitDoorProximity() {
  if (!exitDoorMesh) return;
  if (pot.isOpen?.()) return;

  const playerPos = player.position;

  // 只比 XZ，忽略 Y
  const dx = playerPos.x - exitDoorCenter.x;
  const dz = playerPos.z - exitDoorCenter.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);

  const inRange = distXZ <= exitDoorRadius;


  if (inRange && !exitDoorInRange) {
    exitDoorInRange = true;
    console.log("[exitDoor] ENTER");
    showExitDoorPrompt();
  }

  if (!inRange && exitDoorInRange) {
    exitDoorInRange = false;
    console.log("[exitDoor] LEAVE");
    hideExitDoorPrompt();
  }
}



const clock = new THREE.Clock();
const moveDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  updateExitDoorProximity();

  if (exitDoorUiOpen) {
    hideMyCommentBoardBtn();
    renderer.render(scene, camera);
    return;
  }

  if (recentCommentsUiOpen) {
    hideMyCommentBoardBtn();
    renderer.render(scene, camera);
    return;
  }

  if (isOverlayOpening || state === FSM.UI_OPEN || pot.isOpen?.()) {
    hideMyCommentBoardBtn();
    renderer.render(scene, camera);
    return;
  }

  const uiOpen = (state === FSM.UI_OPEN) || pot.isOpen?.();

  if (uiOpen) {
    while (actionQueue.length > 0) {
      const action = actionQueue.shift();
      dispatchAction(action);
    }

    updateHUD();
    renderer.render(scene, camera);
    return;
  }

  const baseSpeed = 0.15;
  const speed = keys.boost ? baseSpeed * 2.5 : baseSpeed;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  right.crossVectors(forward, WORLD_UP).normalize();

  if (state === FSM.SEATED) {
    getLookAtPotHitForActiveTable();
  }

  const delta = new THREE.Vector3();
  if (keys.forward) delta.add(forward);
  if (keys.back) delta.sub(forward);
  if (keys.right) delta.add(right);
  if (keys.left) delta.sub(right);

  if (state === FSM.FREE_ROAM) {
    if (delta.lengthSq() > 0) {
      delta.normalize().multiplyScalar(speed);

      const nextPos = player.position.clone();
      nextPos.x += delta.x;
      resolveHorizontalCollisions(nextPos);
      nextPos.z += delta.z;
      resolveHorizontalCollisions(nextPos);

      if (worldBounds) {
        clampToWorldBounds(nextPos, worldBounds, PLAYER_RADIUS);
      }

      player.position.x = nextPos.x;
      player.position.z = nextPos.z;
    }
  }

  const dtRaw = clock.getDelta();
  const dt = Math.min(dtRaw, 0.05);

  if (state === FSM.FREE_ROAM) {
    velY -= GRAVITY * dt;
    player.position.y += velY * dt;

    const groundY = getGroundYUnderPlayer(player.position);
    if (groundY !== null) {
      const targetPlayerY = groundY + EYE_HEIGHT;
      const falling = velY <= 0;

      if (falling && player.position.y <= targetPlayerY + GROUND_EPS) {
        player.position.y = targetPlayerY;
        velY = 0;
        isGrounded = true;
      } else {
        isGrounded = false;
      }
    } else {
      isGrounded = false;
    }
  }

  // --- table hover / select ---
  if (tables.length > 0) {
    if (!selectedTable) {
      const hitTable = getLookAtTable();
      if (hitTable !== highlightedTable) {
        if (highlightedTable) restoreEmissive(highlightedTable);
        highlightedTable = hitTable;
        if (highlightedTable) {
          applyDim(highlightedTable, 0x33333);
          console.log("looking at:", highlightedTable.name);
        }
      }

      const hoverId = hitTable ? hitTable.name : null;
      const hoveredEnt = hoverId ? (tableRegistry.get(hoverId) || null) : null;

      hoveredTableId = hoverId;
      hoveredEntry = hoveredEnt;

      if (pendingSelect) {
        pendingSelect = false;
      }

      if (hoveredEntry) {
        const d = distanceToTable(hoveredEntry, playerPos);
        if (d <= INTERACT_DISTANCE) showHUD(`${hoverId} - Press E`);
        else showHUD(`${hoveredTableId}`);
      } else {
        hideHUD();
      }

      if (pendingSelect) {
        pendingSelect = false;
        if (highlightedTable) {
          selectedTable = highlightedTable;
          applyDim(selectedTable, 0xFFFF);
          console.log("selected:", selectedTable.name);
        }
      }
    }

    let candidateTableId = selectedTableId || hoveredTableId;
    if (candidateTableId) {
      const info = tableRegistry.get(candidateTableId);
      if (info) {
        const dist = distanceToTable(info, player.position);
        const canInteract = dist <= INTERACT_DISTANCE;
        if (!selectedTable) {
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
  }

  let nextPotId = activeTableId ?? null;
  let lastActivePotId = null;
  if (nextPotId !== lastActivePotId) {
    lastActivePotId = nextPotId;

    const potRoot = nextPotId
      ? tableRegistry.get(nextPotId)?.potRef
      : null;

    if (activePotRoot) setPotHighlight(activePotRoot, false);
    activePotRoot = potRoot;
    if (activePotRoot) setPotHighlight(activePotRoot, true);

    console.log("active pot:", nextPotId ?? "none");
  }

  if (!window.__seatDebugOnce) {
    window.__seatDebugOnce = true;
    console.log("[seatDebug] seatHitMeshes len =", seatHitMeshes?.length);
    console.log("[seatDebug] seatVisualByKey size =", seatVisualByKey?.size);
    console.log("[seatDebug] seatAnchorByKey size =", seatAnchorByKey?.size);
  }
  if (!window.__seatNameOnce && seatHitMeshes?.length) {
    window.__seatNameOnce = true;
    console.log("[seatDebug] sample hitMesh name =", seatHitMeshes[0].name);
  }

  updateSeatHover();

  if (hudEl) {
    const netText = net.connected ? `NET OK ${net.ping ?? "-"}ms` : `NET DOWN`;
    hudEl.textContent =
      `state=${state} table=${hoveredTableId ?? "-"} seat=${hoveredSeatKey ?? "-"} | ${netText}`;
  }

  if (state === FSM.FREE_ROAM || state === FSM.SEAT_SELECTING) {
    if (hoveredSeatKey) {
      showHUD(`Seat ${hoveredSeatKey} - Press E`);
    } else {
      hideHUD();
    }
  }

  for (const s of seatsState.values()) {
    const key = `${s.tableId}_${s.seatId}`;
    const visual = seatVisualByKey.get(key);
    if (!visual) continue;
    if (s.occupiedBy) {
      visual.scale.set(0.85, 0.85, 0.85);
    }
  }

  const now = performance.now();

  if (socket.connected && now - lastNetSend > 100) {
    const nextPos = getAvatarWorldPos();
    const nextRotY = getYawFromCamera();

    const movedEnough =
      !lastSentAvatarPos ||
      Math.abs(nextPos.x - lastSentAvatarPos.x) > 0.01 ||
      Math.abs(nextPos.y - lastSentAvatarPos.y) > 0.01 ||
      Math.abs(nextPos.z - lastSentAvatarPos.z) > 0.01;

    const rotatedEnough =
      lastSentRotY == null ||
      Math.abs(nextRotY - lastSentRotY) > 0.01;

    if (movedEnough || rotatedEnough) {
      lastNetSend = now;
      lastSentAvatarPos = { ...nextPos };
      lastSentRotY = nextRotY;

      if (Math.random() < 0.02) {
        console.log("[SEND pos]", nextPos);
      }

      socket.emit("player:move", {
        pos: nextPos,
        rotY: nextRotY,
      });
    }
  }

  while (actionQueue.length > 0) {
    const action = actionQueue.shift();
    console.log("[action] dispatch", action.type, "state=", state, "selectedTableId=", selectedTableId);
    dispatchAction(action);
  }

  if (state !== window.__lastState) {
    console.log("[FSM] state change:", window.__lastState, "->", state);
    window.__lastState = state;
  }

  let shouldPotGlow = false;
  if (state === FSM.SEATED) {
    shouldPotGlow = !!getLookAtPotHitForActiveTable();
  }

  const potRoot = seated?.tableId ? (tableRegistry.get(seated.tableId)?.potRef ?? null) : null;
  if (potRoot !== activePotRoot) {
    if (activePotRoot) setPotHighlight(activePotRoot, false);
    activePotRoot = potRoot;
  }
  if (activePotRoot) setPotHighlight(activePotRoot, shouldPotGlow);


  if (recentCommentsUiOpen) {
    hideCenterAction();
    updateHUD();
    renderer.render(scene, camera);
    return;
  }
    const shouldShowMyBoardBtn =
    !exitDoorUiOpen &&
    !recentCommentsUiOpen &&
    state !== FSM.UI_OPEN &&
    !pot.isOpen?.() &&
    !!assignedTableId;

  if (shouldShowMyBoardBtn) {
    showMyCommentBoardBtn();
  } else {
    hideMyCommentBoardBtn();
  }
  // CTA
  let shouldShowCTA = false;
  let nextCTALabel = "";

  if (state === FSM.FREE_ROAM) {
    const hitTable = getLookAtTable();
    if (hitTable) {
      const tableId = hitTable.name;
      const info = tableRegistry.get(tableId);

      if (info) {
        const dist = distanceToTable(info, player.position);
        if (dist <= INTERACT_DISTANCE) {
          shouldShowCTA = true;
          nextCTALabel = t("hall_cta_sit");
        }
      }
    }
  }

  if (state === FSM.SEATED) {
    const potHit = getLookAtPotHitForActiveTable();
    if (potHit) {
      const isOwnerTable = seated?.tableId === assignedTableId;
      shouldShowCTA = true;
      nextCTALabel = isOwnerTable
      ? t("hall_cta_make_pot")
      : t("hall_cta_view_pot");
    }
  }

  if (shouldShowCTA) {
    showCenterAction(nextCTALabel);
  } else {
    hideCenterAction();
  }

  if (assignedMarker?.visible) {
    const t = performance.now() * 0.002;
    assignedMarker.position.y = assignedMarkerBobBaseY + Math.sin(t) * 0.18;
    assignedMarker.rotation.y += 0.01;
  }

  updateHUD();
  renderer.render(scene, camera);
}





animate()

