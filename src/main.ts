import './style.css';
import { Engine } from './engine/Engine';
import { Camera } from './engine/Camera';
import { Scene } from './engine/Scene';
import { AssetGenerator } from './engine/AssetGenerator';
import { InputHandler } from './engine/InputHandler';

async function init() {
  const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
  if (!canvas) throw new Error("Canvas not found");

  const camera = new Camera();
  camera.focalDistance = 10;
  camera.aperture = 2.8;
  camera.fov = Math.PI / 4;
  camera.x = 0;

  const scene = new Scene();
  scene.backgroundColor = '#87CEEB'; // Sky blue
  scene.horizonColor = '#E0F6FF'; // Misty light blue horizon

  const engine = new Engine(canvas, camera, scene);

  // Attach Input Handler
  new InputHandler(camera, canvas);

  // Generate assets
  const tree1 = await AssetGenerator.createTreeSVG('#2E8B57', '#8B4513');
  const tree2 = await AssetGenerator.createPineTreeSVG('#006400', '#5C4033');
  const tree3 = await AssetGenerator.createTreeSVG('#3CB371', '#A0522D');
  const bush1 = await AssetGenerator.createBushSVG('#228B22');
  const mountain1 = await AssetGenerator.createMountainSVG('#4B5320', '#FFFFFF');
  const mountain2 = await AssetGenerator.createMountainSVG('#3C4119', '#EEEEEE');
  const cloud1 = await AssetGenerator.createCloudSVG('#FFFFFF', 0.8);

  // Mountains (very far) - Make them huge (e.g. 800m wide)
  for (let i = -10; i < 10; i++) {
    scene.addObject({
      id: `mountain_\${i}`,
      x: i * 800,
      y: -200,
      width: 800,
      height: 500,
      distance: 100 + Math.random() * 20, // 100-120m
      image: Math.random() > 0.5 ? mountain1 : mountain2
    });
  }

  // Clouds (far) - 300m wide
  for (let i = -20; i < 20; i++) {
    scene.addObject({
      id: `cloud_\${i}`,
      x: i * 300 + Math.random() * 100,
      y: -500 - Math.random() * 200,
      width: 300,
      height: 150,
      distance: 80 + Math.random() * 40,
      image: cloud1
    });
  }

  // Midground Trees (15m tall)
  for (let i = -30; i < 30; i++) {
    const dist = 15 + Math.random() * 30; // 15m - 45m
    scene.addObject({
      id: `mid_tree_\${i}`,
      x: i * 15 + (Math.random() * 5),
      y: -5, // ground level roughly
      width: 10,
      height: 15,
      distance: dist,
      image: Math.random() > 0.5 ? tree1 : tree3
    });
  }

  // Focal point trees (10m) - perfectly in focus. 20m tall
  for (let i = -15; i < 15; i++) {
    scene.addObject({
      id: `focus_tree_\${i}`,
      x: i * 15,
      y: -8,
      width: 12,
      height: 20,
      distance: 10,
      image: tree2
    });

    // Some bushes (2m tall)
    scene.addObject({
      id: `focus_bush_\${i}`,
      x: i * 15 + 6,
      y: 4,
      width: 4,
      height: 2.5,
      distance: 10.5,
      image: bush1
    });
  }

  // Foreground (close) - blurry. 25m tall
  for (let i = -10; i < 10; i++) {
    const dist = 2 + Math.random() * 3; // 2m - 5m
    scene.addObject({
      id: `fg_tree_\${i}`,
      x: i * 30 + Math.random() * 10,
      y: 5,
      width: 15,
      height: 25,
      distance: dist,
      image: tree1
    });
  }

  engine.start();

  // Basic UI binding
  setupUI(camera);
}

function setupUI(camera: Camera) {
  const apertureSlider = document.getElementById('aperture') as HTMLInputElement;

  if (apertureSlider) {
    apertureSlider.value = camera.aperture.toString();
    apertureSlider.addEventListener('input', (e) => {
      camera.aperture = parseFloat((e.target as HTMLInputElement).value);
    });
  }
}

init().catch(console.error);
