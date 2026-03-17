---
description: Upgrade a generated scape's SVG sprites to AI-generated images via Gemini
---

You are upgrading an existing scape from SVG sprites to high-quality AI-generated images. The upgrade creates a new HD copy — the original SVG scape is preserved.

User's request: $ARGUMENTS

## Your workflow

### Step 1 — Identify the scape

If the user specified a scape name, use that. Otherwise, list available scapes:
```bash
ls generated/
```

Verify the scape exists and has SVG sprites:
```bash
ls generated/<name>/assets/*.svg
```

If there are no SVGs (already upgraded or never generated), tell the user.

---

### Step 2 — Run the upgrade

```bash
node scripts/upgrade-scape.js <name>
```

This will:
1. Copy the original scape to `generated/<name>-hd/`
2. Render the SVGs into a reference sprite sheet
3. Send the sheet to Gemini with style/mood from the original brief
4. Gemini redraws the sprites with higher quality in the same layout
5. Extract individual PNGs via chroma-key background removal
6. Update `generated/<name>-hd/definition.json` to reference the new PNGs

The original scape at `generated/<name>/` is left completely untouched.

---

### Step 3 — Add to the demo

After the script succeeds, add the HD scape to `demo.js` PRESET_URLS:
```js
'<name>-hd': './generated/<name>-hd/definition.json',
```

And add a button in `index.html`:
```html
<button data-preset="<name>-hd">Name HD</button>
```

---

### Step 4 — Report results

Tell the user:
- How many sprites were upgraded
- That the HD scape is at `generated/<name>-hd/`
- That the original SVG scape is preserved at `generated/<name>/`
- That they can preview either version in the demo

---

## Error handling

| Problem | Fix |
|---------|-----|
| `GEMINI_API_KEY not set` | Ask user to set it: `export GEMINI_API_KEY=…` |
| `No brief.json found` | The scape was created before the brief was saved. Ask the user to recreate it with `/scapes` |
| `No SVG sprites to upgrade` | The scape already uses PNG images |
| `Gemini did not return an image` | Try setting `GEMINI_MODEL=gemini-2.0-flash-exp` |
| Fewer sprites than expected | Gemini may have merged some. The script falls back to per-prop generation |
