// Prompts for the fixed reference sheets that anchor a story: who the people
// are, where it happens, and which prop matters. Shared by story-to-video.mjs
// and storyboard-sheet.mjs so a preview is anchored by exactly the same words
// as the render it is meant to approve.
export const CHARACTER_SHEET_SIZE = '2048x1024';
export const SET_SHEET_SIZE = '1024x1024';

export const referenceFileName = (kind, id) =>
  kind === 'character' ? '00_character_reference.png' : `00_${kind}_${id}.png`;

// Style images teach drawing language only; their content must be ignored.
export const styleLegendFor = (style) =>
  style.references
    .map((reference, index) => `image ${index + 1} is the ${reference.role}, for drawing language only`)
    .join('; ');

export const styleBriefFor = (style) => {
  const legend = styleLegendFor(style);
  return legend
    ? `Input images: ${legend}. Ignore their depicted people, actions, objects and text.`
    : 'Input images: no fixed style image is required for this style. Follow the named style profile exactly and do not drift toward the project\'s default colored-pencil look.';
};

export const backgroundFor = (style) =>
  style.is_default ? 'pure white digital paper' : 'a clean, light, style-appropriate paper or background surface';

const sheet = ({style, brief, assetType, request, detail, composition}) =>
  `Use case: illustration-story
Asset type: ${assetType} for a hand-drawn Chinese story video in the "${style.name_zh}" style
${brief}
Primary request: ${request}
${detail}
Style: ${style.prompt}
Composition: ${composition}
Color and material: ${style.color_hint}
Constraints: this is a reference only; no story action; no text, letters, numbers, labels, captions, speech bubbles, logo, signature or watermark; ${style.avoid}.`;

export const characterSheetPrompt = ({style, characterLock, brief = styleBriefFor(style)}) =>
  sheet({
    style,
    brief,
    assetType: 'fixed protagonist character reference sheet',
    request:
      'draw ONLY the recurring protagonists described below as a character ' +
      'turnaround. Give each protagonist one row of four standing full-body ' +
      'views, left to right: front, three-quarter, side profile, and back. Keep ' +
      'the arms relaxed at the sides in every view so the clothing reads clearly.',
    detail: `Character lock: ${characterLock}`,
    composition: `wide canvas on ${backgroundFor(style)}. One protagonist per row. Within a row the four views share the same height and stand on a common baseline, evenly spaced, so they read as the same person rotating. Every figure is uncropped full-body with a clean 8% safe border. No scenery, furniture, extra people, props or decorative marks.`,
  });

export const locationSheetPrompt = ({style, entry, brief = styleBriefFor(style)}) =>
  sheet({
    style,
    brief,
    assetType: 'fixed location reference',
    request:
      'draw this place EMPTY — no people, no animals, no action. One clear ' +
      'establishing view that shows its layout and structure, so later scenes ' +
      'can be staged inside the same space.',
    detail: [entry.name ? `Name: ${entry.name}` : null, `Description: ${entry.description}`]
      .filter(Boolean)
      .join('\n'),
    composition: `a single wide establishing view on ${backgroundFor(style)}, everything uncropped inside a clean 8% safe border. No people or animals anywhere in frame.`,
  });

export const objectSheetPrompt = ({style, entry, brief = styleBriefFor(style)}) =>
  sheet({
    style,
    brief,
    assetType: 'fixed prop reference',
    request:
      'draw ONLY this object, by itself, in two views side by side: front and ' +
      'three-quarter. Nobody holds it and nothing else shares the frame.',
    detail: [entry.name ? `Name: ${entry.name}` : null, `Description: ${entry.description}`]
      .filter(Boolean)
      .join('\n'),
    composition: `two uncropped views side by side on ${backgroundFor(style)}, evenly spaced with a clean 10% safe border, no scenery, surface detail or cast shadow.`,
  });
