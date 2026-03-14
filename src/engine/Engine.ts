import { Camera } from './Camera';
import { Scene, type SceneObject } from './Scene';

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;
  private scene: Scene;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  // For color filtering (atmospheric perspective)
  private tintCanvas: HTMLCanvasElement;
  private tintCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, camera: Camera, scene: Scene) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;

    this.camera = camera;
    this.scene = scene;

    this.tintCanvas = document.createElement('canvas');
    const tintCtx = this.tintCanvas.getContext('2d', { willReadFrequently: true });
    if (!tintCtx) throw new Error("Could not get offscreen 2D context");
    this.tintCtx = tintCtx;

    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.tintCanvas.width = window.innerWidth;
    this.tintCanvas.height = window.innerHeight;

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

  private calculateBlur(distance: number): number {
    const diff = Math.abs(distance - this.camera.focalDistance);
    const blurAmount = (diff * 1.5) / this.camera.aperture;
    return Math.min(Math.max(blurAmount, 0), 25);
  }

  private drawObject(obj: SceneObject) {
    const z = obj.distance;

    if (z <= 0.1) return;

    const fovScale = this.canvas.height / (2 * Math.tan(this.camera.fov / 2));
    const scaleFactor = fovScale / z;

    const screenX = ((obj.x - this.camera.x) * scaleFactor) + (this.canvas.width / 2);
    const screenY = (this.canvas.height / 2) + (obj.y * scaleFactor);

    const drawWidth = obj.width * scaleFactor;
    const drawHeight = obj.height * scaleFactor;

    if (screenX + drawWidth / 2 < 0 || screenX - drawWidth / 2 > this.canvas.width) {
      return;
    }

    const blur = this.calculateBlur(z);
    const maxViewDist = 150;
    let blendAmount = Math.max(0, Math.min((z - 5) / maxViewDist, 1.0));

    this.ctx.save();

    if (blur > 0.5) {
      this.ctx.filter = `blur(${blur}px)`;
    }

    try {
      if (blendAmount > 0.05) {
        this.tintCanvas.width = Math.max(1, drawWidth);
        this.tintCanvas.height = Math.max(1, drawHeight);
        this.tintCtx.clearRect(0, 0, drawWidth, drawHeight);

        this.tintCtx.globalCompositeOperation = 'source-over';
        this.tintCtx.drawImage(obj.image, 0, 0, drawWidth, drawHeight);

        this.tintCtx.globalCompositeOperation = 'source-atop';
        this.tintCtx.fillStyle = this.scene.horizonColor;
        this.tintCtx.globalAlpha = blendAmount;
        this.tintCtx.fillRect(0, 0, drawWidth, drawHeight);

        this.ctx.drawImage(this.tintCanvas, screenX - drawWidth / 2, screenY - drawHeight, drawWidth, drawHeight);
      } else {
        this.ctx.drawImage(obj.image, screenX - drawWidth / 2, screenY - drawHeight, drawWidth, drawHeight);
      }
    } catch (e) {
      // Ignore draw errors
    }

    this.ctx.restore();
  }

  public render() {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    grad.addColorStop(0, this.scene.backgroundColor);
    grad.addColorStop(1, this.scene.horizonColor);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const loadedObjects = this.scene.objects.filter(obj => obj.image && obj.image.complete && obj.image.naturalWidth > 0);

    for (const obj of loadedObjects) {
      this.drawObject(obj);
    }

    this.drawUI();
  }

  private drawUI() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.ctx.font = '16px sans-serif';
    this.ctx.fillText(`Camera X: ${this.camera.x.toFixed(1)}`, 10, 20);
    this.ctx.fillText(`Aperture: f/${this.camera.aperture.toFixed(1)}`, 10, 40);
    this.ctx.fillText(`Focal Dist: ${this.camera.focalDistance.toFixed(1)}m`, 10, 60);
    this.ctx.restore();
  }
}
