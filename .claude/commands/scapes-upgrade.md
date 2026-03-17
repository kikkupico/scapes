---
description: Upgrade a generated scape's SVG sprites to AI-generated images
---

You are upgrading an existing scape from SVG sprites to high-quality AI-generated images. The upgrade creates a new HD copy — the original SVG scape is preserved.

User's request: $ARGUMENTS

## Choose the mode

- If the user said "manual", or if `GEMINI_API_KEY` is not set, use the **Manual workflow** below.
- Otherwise, use the **Auto workflow**.

---

## Auto workflow

### Step 1 — Identify the scape

If the user specified a scape name, use that. Otherwise, list available scapes:
```bash
ls generated/
```

### Step 2 — Run the auto upgrade

```bash
node scripts/upgrade-scape.js auto <name>
```

### Step 3 — Add to the demo

Add the HD scape to `demo.js` SCAPES array and report results.

---

## Manual workflow

This is a collaborative workflow — you prepare the assets, the user generates the image, then you finish extraction.

### Step 1 — Identify the scape

If the user specified a scape name, use that. Otherwise, list available scapes:
```bash
ls generated/
```

### Step 2 — Prepare

```bash
node scripts/upgrade-scape.js prepare <name>
```

This creates `generated/<name>-hd/` with:
- `assets/reference-sheet.png` — the composite sprite sheet to upload
- `prompt.txt` — the prompt to paste into the image generator
- `layout.json` — grid coordinates for extraction

### Step 3 — Hand off to the user

Tell the user:

1. **Open** `generated/<name>-hd/assets/reference-sheet.png` — this is the sprite sheet to upload
2. **Copy the prompt** from `generated/<name>-hd/prompt.txt`
3. **Go to an image generator** (e.g. Gemini in Google AI Studio, ChatGPT, Midjourney, etc.)
4. **Upload the reference sheet** and **paste the prompt**
5. **Download the result** and save it as: `generated/<name>-hd/assets/sheet.png`
6. **Tell you** when it's done

Read `prompt.txt` and display it so the user can copy it easily.

Then STOP and wait for the user to confirm they've placed the image.

### Step 4 — Extract (after user confirms)

When the user says the image is ready:

```bash
node scripts/upgrade-scape.js extract <name>
```

### Step 5 — Add to the demo

Add the HD scape to `demo.js` SCAPES array:
```js
{ id: '<name>-hd', name: '<Name> HD', url: './generated/<name>-hd/definition.json', tag: 'generated' },
```

Report results — how many sprites extracted, both versions available.

---

## Error handling

| Problem | Fix |
|---------|-----|
| `GEMINI_API_KEY not set` | Switch to manual workflow |
| `No brief.json found` | Recreate the scape with `/scapes` |
| `No SVG sprites to upgrade` | Already using PNG images |
| `No sheet.png found` | User hasn't placed the upgraded image yet |
| `Gemini did not return an image` | Switch to manual workflow |
