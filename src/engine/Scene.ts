export interface SceneObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  distance: number; // distance from camera (Z-axis effectively)
  image: HTMLImageElement;
}

export class Scene {
  public objects: SceneObject[] = [];
  public backgroundColor: string = '#87CEEB'; // Sky blue default
  public horizonColor: string = '#B0E0E6'; // Lighter blue default

  public addObject(obj: SceneObject) {
    this.objects.push(obj);
    // Sort back to front (painter's algorithm)
    this.objects.sort((a, b) => b.distance - a.distance);
  }
}
