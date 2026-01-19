import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";


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



const controls = new PointerLockControls(camera, renderer.domElement);
// controls.enablePan = false;
// controls.minDistance = 1;
// controls.maxDistance = 20;

camera.position.set(0, 4, 5);
// controls.target.set(0, 1.2, 0);
// controls.update();

window.addEventListener("click", () =>{
  controls.lock();
})

const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  boost: false,
};

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.forward = true;
  if (e.code === "ArrowDown" || e.code === "KeyS") keys.back = true;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.boost = true;
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
  "/newenv.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    scene.remove(cube);
    model.updateWorldMatrix(true, true);
    const envBox = new THREE.Box3().setFromObject(model);
    window.__envBox = envBox;
    const center = new THREE.Vector3();
    envBox.getCenter(center);
    player.position.set(center.x, 1.8, center.z);
    camera.position.set(0, 2, 0);
    console.log("envBox:", envBox.min, envBox.max);
  },
  undefined,
  (error) => {
    console.error(error);
  }
);

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({color: 0x00ff});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// camera.position.z = 5;

const moveDir = new THREE.Vector3();

function animate(){
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

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

  controls.update();
  renderer.render(scene, camera);
};

animate()