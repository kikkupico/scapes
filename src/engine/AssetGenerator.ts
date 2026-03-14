export class AssetGenerator {
  public static async createTreeSVG(colorMain: string, colorTrunk: string): Promise<HTMLImageElement> {
    const svg = `<svg width="200" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="85" y="150" width="30" height="150" fill="${colorTrunk}" rx="5" /><circle cx="100" cy="120" r="80" fill="${colorMain}" /><circle cx="60" cy="160" r="50" fill="${colorMain}" /><circle cx="140" cy="160" r="50" fill="${colorMain}" /><circle cx="100" cy="60" r="40" fill="${colorMain}" opacity="0.8"/></svg>`;
    return this.loadSVG(svg);
  }

  public static async createPineTreeSVG(colorMain: string, colorTrunk: string): Promise<HTMLImageElement> {
    const svg = `<svg width="200" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="90" y="250" width="20" height="50" fill="${colorTrunk}" /><polygon points="100,20 40,120 160,120" fill="${colorMain}" /><polygon points="100,80 30,190 170,190" fill="${colorMain}" /><polygon points="100,150 20,270 180,270" fill="${colorMain}" /></svg>`;
    return this.loadSVG(svg);
  }

  public static async createBushSVG(colorMain: string): Promise<HTMLImageElement> {
    const svg = `<svg width="150" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="60" r="40" fill="${colorMain}" /><circle cx="100" cy="60" r="40" fill="${colorMain}" /><circle cx="75" cy="40" r="45" fill="${colorMain}" /></svg>`;
    return this.loadSVG(svg);
  }

  public static async createMountainSVG(colorMain: string, colorPeak: string): Promise<HTMLImageElement> {
    const svg = `<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg"><!-- Mountain base --><polygon points="400,50 50,500 750,500" fill="${colorMain}" /><!-- Snow peak --><polygon points="400,50 320,150 360,130 400,160 440,130 480,150" fill="${colorPeak}" /></svg>`;
    return this.loadSVG(svg);
  }

  public static async createCloudSVG(color: string, opacity: number): Promise<HTMLImageElement> {
    const svg = `<svg width="300" height="150" xmlns="http://www.w3.org/2000/svg"><g fill="${color}" opacity="${opacity}"><circle cx="100" cy="80" r="40" /><circle cx="150" cy="60" r="50" /><circle cx="200" cy="80" r="40" /><rect x="100" y="80" width="100" height="40" rx="20" /></g></svg>`;
    return this.loadSVG(svg);
  }

  private static loadSVG(svgString: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      const encoded = encodeURIComponent(svgString);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encoded;
    });
  }
}
