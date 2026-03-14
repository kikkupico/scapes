import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

import { Camera } from './Camera';
import { Scene as CustomScene } from './Scene';

export class Engine {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private customScene: CustomScene;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private threeCamera: THREE.PerspectiveCamera;

  private composer: EffectComposer;
  private bokehPass: BokehPass;

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  private objectMeshes: Map<string, THREE.Sprite> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();

  constructor(canvas: HTMLCanvasElement, camera: Camera, scene: CustomScene) {
    this.canvas = canvas;
    this.camera = camera;
    this.customScene = scene;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.customScene.horizonColor, 10, 500);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2;
    bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      const gradient = bgCtx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, this.customScene.backgroundColor);
      gradient.addColorStop(1, this.customScene.horizonColor);
      bgCtx.fillStyle = gradient;
      bgCtx.fillRect(0, 0, 2, 512);
    }
    const bgTexture = new THREE.CanvasTexture(bgCanvas);
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = bgTexture;

    const fovDeg = THREE.MathUtils.radToDeg(this.camera.fov);
    this.threeCamera = new THREE.PerspectiveCamera(
      fovDeg,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.threeCamera);
    this.composer.addPass(renderPass);

    this.bokehPass = new BokehPass(this.scene, this.threeCamera, {
      focus: this.camera.focalDistance,
      aperture: this.camera.aperture * 0.0001,
      maxblur: 0.01
    });
    this.composer.addPass(this.bokehPass);

    window.addEventListener('resize', this.resize.bind(this));
  }

  private resize() {
    this.threeCamera.aspect = window.innerWidth / window.innerHeight;
    this.threeCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    if (!this.isRunning) {
      this.render();
    }
  }

  public start() {
    this.isRunning = true;
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private loop = () => {
    if (!this.isRunning) return;
    this.render();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private getTexture(image: HTMLImageElement): THREE.Texture {
    if (this.textureCache.has(image.src)) {
      return this.textureCache.get(image.src)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.width || 512;
    canvas.height = image.height || 512;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    this.textureCache.set(image.src, texture);
    return texture;
  }

  private updateCamera() {
    this.threeCamera.position.set(this.camera.x, 2, 0);
    this.threeCamera.lookAt(this.camera.x, 2, -100);
  }

  private updateObjects() {
    const loadedObjects = this.customScene.objects;
    const processedIds = new Set<string>();

    for (const obj of loadedObjects) {
      processedIds.add(obj.id);

      let sprite = this.objectMeshes.get(obj.id);

      if (!sprite) {
        const texture = this.getTexture(obj.image);
        const material = new THREE.SpriteMaterial({
          map: texture,
          color: 0xffffff,
          fog: true,
          transparent: true,
          depthTest: true,
          depthWrite: false
        });
        sprite = new THREE.Sprite(material);
        this.scene.add(sprite);
        this.objectMeshes.set(obj.id, sprite);
      }

      sprite.renderOrder = -obj.distance;

      // Position mapping
      sprite.position.x = obj.x;
      sprite.position.z = -obj.distance;
      sprite.position.y = obj.y + (obj.height / 2);

      // Scale mapping
      sprite.scale.set(obj.width, obj.height, 1);
    }

    // Remove old sprites
    for (const [id, sprite] of this.objectMeshes.entries()) {
      if (!processedIds.has(id)) {
        this.scene.remove(sprite);
        this.objectMeshes.delete(id);
      }
    }
  }

  private updatePostProcessing() {
    (this.bokehPass.uniforms as any)['focus'].value = this.camera.focalDistance;
    (this.bokehPass.uniforms as any)['aperture'].value = this.camera.aperture * 0.0001;
  }

  private updateUI() {
    const statsOverlay = document.getElementById('stats-overlay');
    if (!statsOverlay) {
      const div = document.createElement('div');
      div.id = 'stats-overlay';
      div.style.position = 'absolute';
      div.style.top = '10px';
      div.style.left = '10px';
      div.style.color = 'black';
      div.style.fontFamily = 'sans-serif';
      div.style.pointerEvents = 'none';
      document.body.appendChild(div);
    }

    const el = document.getElementById('stats-overlay')!;
    el.innerHTML = `
      <div>Camera X: ${this.camera.x.toFixed(1)}</div>
      <div>Aperture: f/${this.camera.aperture.toFixed(1)}</div>
      <div>Focal Dist: ${this.camera.focalDistance.toFixed(1)}m</div>
    `;
  }

  public render() {
    this.updateCamera();
    this.updateObjects();
    this.updatePostProcessing();
    this.updateUI();

    this.composer.render();
  }
}
