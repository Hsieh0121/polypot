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



const hud = document.createElement("div");
hud.style.position = "fixed";
hud.style.left = "50%";
hud.style.bottom = "10%";
hud.style.transform = "translateX(-50%)";
hud.style.padding = "10px 14px";
hud.style.background = "rgba(0, 0, 0, 0.55)";
hud.style.color = "white";
hud.style.borderRadius = "10px";
hud.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
hud.style.fontSize = "14px";
hud.textContent = "Press Enter to enter the hall";
document.body.appendChild(hud);


const keys = { w: false, a: false, s: false, d: false};
window.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
        window.location.href = "/hall.html";
    }
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





const controls = new PointerLockControls(camera, renderer.domElement);
window.addEventListener("click", () => {
    if (!controls.isLocked) controls.lock();
});
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



let envRoot = null;
const loader = new GLTFLoader();
loader.load("/public/white.glb", (gltf) => {
    envRoot = gltf.scene;
    scene.add(envRoot);
    envRoot.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(envRoot);
    
    box.getCenter(center);
    box.getSize(size);
    console.log("[white] model center:", center);
    console.log("[white] model size:", size);

    const obj = controls.getObject();
    obj.position.set(center.x, center.y, center.z); // 或 center.y + 1.6 視你想像的眼高
    camera.lookAt(center);

    const eyeHeight = 3.0; 
    obj.position.set(
    center.x,
    center.y - size.y / 2 + eyeHeight,
    center.z
    );



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

    

    renderer.render(scene, camera);
}
animate();