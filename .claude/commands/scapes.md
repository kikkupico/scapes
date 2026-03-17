---
description: Generate a 2.5D parallax scrolling scape with SVG sprites
---

You are the Scapes generator. The user wants to create a parallax scrolling background environment.

User's request: $ARGUMENTS

## Your workflow

### Step 1 — Clarify

Ask focused questions — only for things not already answered in the request above. Maximum 4 questions, keep them conversational:

1. **Time of day / atmosphere** — dawn, noon, dusk, night, or overcast?
2. **Specific props** — list 5–7 props you'd generate if unspecified, and ask if they want changes. Good props are specific: "snow-capped pine tree" not "tree".
3. **Density** — sparse, medium, or dense?
4. **Style** — flat illustration, watercolor, painterly, or pixel art? (this also guides the SVGs you'll create and will be used if the user later upgrades to AI images with `/scapes upgrade`)

If the request already answers some of these, skip those questions and go straight to generation.

---

### Step 2 — Create SVG sprites

**Step 2a — Create the output directory:**
```bash
mkdir -p generated/<name>/assets
```

**Step 2b — Generate SVG files:**
For each prop, write an SVG file to `generated/<name>/assets/<prop-slug>.svg` using the Write tool.

SVG guidelines:
- Include `width` and `height` attributes on the root `<svg>` element (required for image loading)
- Include a `viewBox` matching the dimensions
- Side-view profile suitable for a 2.5D parallax scroller
- Use the palette colours specified
- Keep SVGs clean: shapes, paths, gradients. No embedded raster data.
- Taller props (trees, buildings) should have tall aspect ratios (e.g. 60×280)
- Shorter props (rocks, bushes) should have squatter aspect ratios (e.g. 40×20)
- Match the mood and style requested — watercolor can use soft gradients and irregular edges, pixel art should use crisp rectangles, etc.
- Make distinct silhouettes — vary shapes so the scene looks natural

Example conifer SVG:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="280" viewBox="0 0 60 280">
  <polygon points="30,0 47,82 13,82" fill="#2a5030"/>
  <polygon points="30,51 54,133 6,133" fill="#2a5030"/>
  <polygon points="30,103 60,185 0,185" fill="#2a5030"/>
  <rect x="24.6" y="218" width="10.8" height="62" fill="#1a2010"/>
</svg>
```

---

### Step 3 — Assemble the scape

Construct a brief JSON and run the pipeline script. The script reads the SVGs, parses their dimensions, generates object placements, and creates the definition.

**Brief JSON shape:**
```json
{
  "name": "kebab-slug-max-20-chars",
  "theme": "forest|mountain|city|desert|beach|generic",
  "timeOfDay": "dawn|noon|dusk|night|overcast",
  "mood": "one-sentence atmosphere description",
  "props": [
    { "name": "detailed prop 1 description", "worldHeight": 220, "placement": "background" },
    { "name": "detailed prop 2 description", "worldHeight": 45, "placement": "foreground" }
  ],
  "density": "sparse|medium|dense",
  "style": "flat illustration|watercolor|painterly",
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "seed": 42
}
```

Each prop is an object with:
- `name` — descriptive label, slugified to match SVG filename (e.g. `"snow-dusted alpine pine"` → `snow-dusted-alpine-pine.svg`)
- `worldHeight` — height in world units. You decide this based on what the prop represents. Tall structures (towers, trees): 200–340. Medium buildings (houses, stalls): 100–180. Small objects (pots, baskets, lanterns): 30–60.
- `placement` — where in the scene depth the prop appears:
  - `"landmark"` — single instance, far away (unique props like a lighthouse, windmill, or castle)
  - `"background"` — placed at far, mid, and near z-levels (good for large structures that define the skyline)
  - `"midground"` — placed at mid and near z-levels (medium-sized props)
  - `"foreground"` — scattered at near z only (small ground-level detail props)

**Run the script:**
```bash
node scripts/generate-scape.js '<brief-json-on-one-line>'
```

---

### Step 4 — Load in the demo

After the script succeeds, update `demo.js` to make the new scape loadable. Add it to `PRESET_URLS`:

```js
const PRESET_URLS = {
  // … existing presets …
  'your-scape-name': './generated/your-scape-name/definition.json',
};
```

Then add a button in `index.html` inside the Scene Presets panel:
```html
<button data-preset="your-scape-name">Your Scape Name</button>
```

Tell the user the scape is ready. Mention they can upgrade to AI-generated images with `/scapes upgrade <name>` — this creates a separate HD version (`<name>-hd`) while preserving the original SVG scape.

---

## Props guidance — be specific and visual

- Good names: `"snow-dusted alpine pine"`, `"crumbling stone watchtower"`, `"arched wooden bridge"`
- Bad names: `"tree"`, `"building"`, `"bridge"`
- Aim for 2–4 tall/background props and 2–4 short/foreground props. 6–8 total is ideal.
- Vary the descriptions so sprites have distinct silhouettes.
- You decide `worldHeight` and `placement` for each prop — match the SVG's aspect ratio to the worldHeight you choose. A 60×280 SVG with worldHeight 280 will look natural; worldHeight 50 would squish it.
- Example props array:
  ```json
  [
    { "name": "ornate market stall", "worldHeight": 220, "placement": "background" },
    { "name": "sandstone minaret tower", "worldHeight": 320, "placement": "background" },
    { "name": "domed clay hut", "worldHeight": 140, "placement": "midground" },
    { "name": "clay pot stack", "worldHeight": 45, "placement": "foreground" },
    { "name": "woven basket with spices", "worldHeight": 30, "placement": "foreground" }
  ]
  ```

## Palette guidance

- 4–5 colours: sky/light highlight, mid tone, shadow, ground, accent.
- Dawn example: `["#f0c080", "#d4956a", "#8ba4b8", "#4a6040", "#2a1a10"]`

---

## Error handling

| Problem | Fix |
|---------|-----|
| `No SVG sprites found` | SVG filenames must match slugified prop names |
| Sprites look wrong | Edit `generated/<name>/definition.json` directly to tune positions/sizes |
| Want better art | Run `/scapes upgrade <name>` to upgrade SVGs to AI-generated images |

---

## Quick reference — scene parameters

**Time of day → sky colours**
- `dawn`: warm pink/orange fade from dark blue
- `noon`: bright blue sky
- `dusk`: purple/orange sunset
- `night`: deep black-blue, minimal gradient
- `overcast`: flat grey tones

**Theme → backdrop ridges + ground**
- `forest` / `generic`: rolling green ridges, green ground
- `mountain`: dramatic snow-capped ridges
- `city`: flat dark ridges (acts as distant skyline)
- `desert`: warm tan/ochre ridges and ground
- `beach`: low ridges, sandy ground

**Density → objects per tile**
- `sparse`: wide open, contemplative
- `medium`: balanced
- `dense`: busy, jungle-like
