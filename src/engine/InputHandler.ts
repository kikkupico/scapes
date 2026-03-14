export class InputHandler {
  private camera: any; // using any temporarily to break circular dep if any, but Camera is fine
  private canvas: HTMLCanvasElement;
  private isPointerDown: boolean = false;
  private lastPointerX: number = 0;

  // Velocity for momentum scrolling
  private velocity: number = 0;
  private animationFrameId: number | null = null;

  // Store references for cleanup
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(camera: any, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerUpBound = this.onPointerUp.bind(this);

    // Bind events
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // Start momentum loop
    this.updateMomentum();
  }

  private onPointerDown(e: PointerEvent) {
    this.isPointerDown = true;
    this.lastPointerX = e.clientX;
    this.velocity = 0; // Stop momentum when grabbed
    this.canvas.style.cursor = 'grabbing';
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isPointerDown) return;

    const deltaX = e.clientX - this.lastPointerX;

    const refZ = 10;
    const fovScale = this.canvas.height / (2 * Math.tan(this.camera.fov / 2));
    const scaleFactor = fovScale / refZ;

    // Move camera opposite to drag direction
    const cameraMove = -(deltaX / scaleFactor);

    this.camera.x += cameraMove;
    this.velocity = cameraMove;

    this.lastPointerX = e.clientX;
  }

  private onPointerUp(_e: PointerEvent) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.canvas.style.cursor = 'grab';
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();

    const refZ = 10;
    const fovScale = this.canvas.height / (2 * Math.tan(this.camera.fov / 2));
    const scaleFactor = fovScale / refZ;

    // Favor deltaX for trackpads, fallback to deltaY for standard mouse wheels
    const wheelDelta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;

    // Reverse wheel delta logic based on standard scrolling behavior
    this.camera.x += (wheelDelta / scaleFactor);
    this.velocity = 0;
  }

  private updateMomentum(_time?: number) {
    if (!this.isPointerDown && Math.abs(this.velocity) > 0.001) {
      this.camera.x += this.velocity;
      this.velocity *= 0.92; // Friction
    } else if (!this.isPointerDown) {
      this.velocity = 0;
    }

    this.animationFrameId = requestAnimationFrame(this.updateMomentum.bind(this));
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
  }
}
