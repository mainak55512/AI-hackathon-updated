Component Style Manifest: "Cyber-Terminal"
1. Visual Foundation
Color Palette: Deep dark backgrounds (#0b1220 to #111827) with high-contrast accents.

Accents: Primary Blue (#3b82f6), Success Green, Danger Red (#f87171), and Muted Gray (text-muted).

Surface Logic: Components use var(--surface-2) with a 1px solid var(--border) and 10px border-radius.

Shadows: Subtle elevation using var(--shadow).

2. Typography Rules
Primary Font: Standard sans-serif for body.

Monospace Utility: Use var(--mono) for all labels, numerical values, IDs, timestamps, and button text.

Text Transformation: Headers, labels, and buttons must be uppercase with letter-spacing: 0.08em to 0.12em.

Sizing: * Labels/Badges: 10px to 11px (Bold).

Subtitles: 13px.

Main Values: Large and bold (e.g., 1.8rem).

3. Structural Patterns
The "Corner Mark": A signature decorative element. Every major container should have an absolute-positioned corner-mark div at the bottom-right:

CSS

.corner-mark { position: absolute; right: -1px; bottom: -1px; width: 14px; height: 14px; border-top: 1px solid var(--border); border-left: 1px solid var(--border); }
Status Indicators: Use a combination of a colored dot (8px circle) and monospace text.

Tone Property: Components should support a data-tone attribute (primary, success, info, neutral) which applies a 2px solid left border.

4. Iconography
Style: SVG icons, 24x24 viewbox, none fill, strokeWidth="1.8" or "2".

Container: Icons are housed in a 44px square with a 8px radius and a light background tint (rgba(255, 255, 255, 0.03)).

5. Interaction
Buttons: Rectangular with 6px radius. Primary buttons are solid; secondary/action buttons are transparent with a 1px border.

Transitions: All hover states must use 0.15s ease.
