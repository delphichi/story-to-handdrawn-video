# Rendering contract

## Canvas

- 1080×1440, 30fps, white background
- Captions stay in the upper safe area
- Illustrations use `object-fit: contain`; never crop with `cover`

## Motion

- Direct-cut mode: `text → bw_full → color`
- Every layer reveals from left to right
- Page-flip mode: `text → color`, followed by a left-bound 3D page turn
- No camera shake, bounce, narration, or text-synchronized music

## Fixed references

- Every run draws one fixed character sheet before any scene
- The sheet is a turnaround: front, three-quarter, side and back, one row per protagonist
- Each scene references that sheet for identity, never an earlier scene
- Each location and key prop gets its own reference, drawn before any scene
- A location reference is empty; a prop reference stands alone
- A beat cites only the references it uses
- Referencing the previous scene is opt-in; it compounds drift and fights the shot plan

## Assets

- Uploaded masters are copied into a content-addressed generated directory
- Caption, black-and-white, and color plates share aligned canvases
- Generated assets and rendered videos are disposable runtime outputs

## Visual style

- Flat white paper
- Uneven felt-tip outlines and sparse wax-crayon color
- Generous negative space
- No realistic shading, glossy gradients, watermark, or paper texture
