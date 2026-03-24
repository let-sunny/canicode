# Design to Code — Standard Prompt

This prompt is used by all code generation pipelines:
- Calibration Converter
- Rule Discovery A/B Validation
- User-facing `canicode implement` command
- design-to-code GitHub Action (via `canicode prompt`)

## Stack Selection

Choose the stack that matches the target project. Default is `html-css`.

Available stacks:
- `html-css` — Standalone HTML + CSS (default, no build step)
- `react-tailwind` — React + Tailwind CSS
- `react-css-modules` — React + CSS Modules
- `vue-css` — Vue 3 + scoped CSS

Stack-specific conventions are in `stacks/<stack-name>.md`. The rules below apply to ALL stacks.

## CRITICAL: Do NOT Interpret. Reproduce Exactly.

Every pixel in the Figma file is intentional. A designer made each decision deliberately.
Your job is to translate the Figma data to code — nothing more.

### Rules
- Do NOT add any value that isn't in the Figma data (no extra padding, margin, gap, transition, hover effect)
- Do NOT change any value from the Figma data (if it says 160px padding, use 160px)
- Do NOT "improve" the design — if something looks wrong, reproduce it anyway
- Do NOT add responsive behavior unless the Figma data explicitly shows it
- Do NOT use min-height or min-width — use exact height and width from the data
- Do NOT add overflow: auto or scroll unless specified
- Fonts: load via Google Fonts CDN. Do NOT use system font fallbacks as primary.

### Image Assets
- If the design tree shows `background-image: url(images/...)`, use that path directly
- If it shows `background-image: [IMAGE]`, the image asset is unavailable — use a placeholder color

### If data is missing
When the Figma data does not specify a value, you MUST list it as an interpretation.
Do not silently guess — always declare what you assumed.

## Output

### 1. Code
Output as a code block with filename (varies by stack).

### 2. Interpretations
After the code block, output a section listing every value you had to guess or assume:
```
// interpretations:
- Used system font "Inter" fallback: -apple-system, BlinkMacSystemFont (font not embedded in data)
- Set body margin to 0 (not specified in Figma data)
```

If you did not interpret anything, write:
```
// interpretations: none
```
