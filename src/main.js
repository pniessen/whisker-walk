import * as THREE from 'three';

const canvas = document.getElementById('game');

export function createRenderer() {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
}

const renderer = createRenderer();
if (!renderer) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('overlay').innerHTML =
    '<div style="display:grid;place-items:center;height:100%"><p>Sorry — your browser could not start WebGL, which Whisker Walk needs. Try updating your browser or enabling hardware acceleration.</p></div>';
} else {
  init(renderer);
}

function init(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4e8); // placeholder sky, area builders replace it
  scene.fog = new THREE.Fog(0x9fd4e8, 40, 120);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 5);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(30, 50, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ff, 0.9));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: 0x7cb860 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    void dt; // game systems consume this in later tasks
    renderer.render(scene, camera);
  });
}
