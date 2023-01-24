import { Vector } from "./utils";

export class Camera {
  distance = 1000;
  fieldOfView: number;
  context: CanvasRenderingContext2D;
  viewport = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
    scale: [1.0, 1.0],
  };
  aspectRatio!: number;
  private canvasSize = [0, 0];
  private lookAtVector = [0, 0];

  constructor(context: CanvasRenderingContext2D, options: CameraSettings = {}) {
    this.context = context;
    this.fieldOfView = options.fieldOfView || Math.PI / 4.0;
    this.resize();
  }

  begin() {
    this.context.save();
    this.applyScale();
    this.applyTranslation();
  }

  end() {
    this.context.restore();
  }

  private applyScale() {
    this.context.scale(this.viewport.scale[0], this.viewport.scale[1]);
  }

  private applyTranslation() {
    this.context.translate(-this.viewport.left, -this.viewport.top);
  }

  private updateViewport() {
    this.aspectRatio = this.canvasSize[0] / this.canvasSize[1];
    this.viewport.width = this.distance * Math.tan(this.fieldOfView);
    this.viewport.height = this.viewport.width / this.aspectRatio;
    this.viewport.left = this.lookAtVector[0] - this.viewport.width / 2;
    this.viewport.top = this.lookAtVector[1] - this.viewport.height / 2;
    this.viewport.right = this.viewport.left + this.viewport.width;
    this.viewport.bottom = this.viewport.top + this.viewport.height;
    this.viewport.scale[0] = this.canvasSize[0] / this.viewport.width;
    this.viewport.scale[1] = this.canvasSize[1] / this.viewport.height;
  }

  zoomTo(z: number) {
    this.distance = z;
    this.updateViewport();
  }

  lookAt([x, y]: number[], lazy = false) {
    this.lookAtVector[0] = x;
    this.lookAtVector[1] = y;
    this.updateViewport();
  }

  screenToWorld(point: Vector) {
    const x = point.x / this.viewport.scale[0] + this.viewport.left;
    const y = point.y / this.viewport.scale[1] + this.viewport.top;
    return { x, y };
  }

  worldToScreen(point: Vector) {
    const x = (point.x - this.viewport.left) * this.viewport.scale[0];
    const y = (point.y - this.viewport.top) * this.viewport.scale[1];
    return { x, y };
  }

  resize() {
    this.canvasSize[0] = this.context.canvas.width;
    this.canvasSize[1] = this.context.canvas.height;
    this.updateViewport();
  }
}

export type CameraSettings = {
  fieldOfView?: number;
};
