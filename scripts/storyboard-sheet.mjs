// Draw all beats as one storyboard sheet, before spending a credit per scene.
//
//   node scripts/storyboard-sheet.mjs --shot-list shot-list.generated.json --style ink-wash
//
// One image shows the whole story at a glance: pacing, framing variety, and —
// the reason this exists — whether the character actually holds together across
// shots. Panels are 3:4 like the finished frames, so what you check is the
// framing you will get, not a letterboxed approximation of it.
//
// The sheet reuses (or draws) the same character sheet the real run uses, so
// --character-sheet can hand it to story-to-video.mjs and the anchor stays
// identical between preview and final.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createImageGenerator, gridSize} from './lib/image-gen.mjs';
import {resolveStyle} from './handdrawn-style-library.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const parseArgs = (tokens) => {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const next = tokens[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[token.slice(2)] = next;
      index += 1;
    } else {
      parsed[token.slice(2)] = true;
    }
  }
  return parsed;
};

const args = parseArgs(process.argv.slice(2));
const shotListPath = resolve(root, String(args['shot-list'] || 'shot-list.generated.json'));
if (!existsSync(shotListPath)) throw new Error(`Shot list not found: ${shotListPath}`);
const shotList = JSON.parse(readFileSync(shotListPath, 'utf8'));
const shots = Array.isArray(shotList.shots) ? shotList.shots : [];
if (shots.length === 0) throw new Error('Shot list contains no shots');
if (shots.length > 20) throw new Error(`${shots.length} panels is too many to stay legible on one sheet`);

const selectedStyle = resolveStyle(root, args.style);
const styleReferencePaths = selectedStyle.references.map((reference) => reference.absolute_path);
const characterLock = String(args['character-lock'] || shotList.character_lock || '').trim();
if (!characterLock) throw new Error('No character lock: pass --character-lock or put one in the shot list');

const outPath = resolve(root, String(args.out || 'storyboard-sheet.generated.png'));
const textPath = resolve(root, String(args['text-out'] || 'storyboard-sheet.generated.txt'));
const promptDir = resolve(root, 'prompts/generated/sheet');
mkdirSync(promptDir, {recursive: true});
mkdirSync(dirname(outPath), {recursive: true});

const runImage2 = createImageGenerator({root, force: args.force === true});
const writePrompt = (name, value) => {
  const path = resolve(promptDir, name);
  writeFileSync(path, `${value.trim()}\n`);
  return path;
};

const illustrationBackground = selectedStyle.is_default
  ? 'pure white digital paper'
  : 'a clean, light, style-appropriate paper or background surface';
const styleLegend = selectedStyle.references
  .map((reference, index) => `image ${index + 1} is the ${reference.role}, for drawing language only`)
  .join('; ');

// Reuse the run's character sheet when given one so the preview is anchored to
// exactly what the final render will use; otherwise draw it here.
let characterSheet = args['character-sheet']
  ? resolve(root, String(args['character-sheet']))
  : resolve(root, 'character-sheet.generated.png');
if (args['character-sheet'] && !existsSync(characterSheet)) {
  throw new Error(`Character sheet not found: ${characterSheet}`);
}
if (!args['character-sheet']) {
  const characterPrompt = writePrompt(
    'character_reference.txt',
    `Use case: illustration-story
Asset type: fixed protagonist character reference sheet for a hand-drawn Chinese story video in the "${selectedStyle.name_zh}" style
${styleLegend ? `Input images: ${styleLegend}. Ignore their depicted people, actions, objects and text.` : 'Input images: none. Follow the named style profile exactly.'}
Primary request: draw ONLY the recurring protagonists described below as a character turnaround. Give each protagonist one row of four standing full-body views, left to right: front, three-quarter, side profile, and back. Keep the arms relaxed at the sides in every view so the clothing reads clearly.
Character lock: ${characterLock}
Style: ${selectedStyle.prompt}
Composition: wide canvas on ${illustrationBackground}. One protagonist per row. Within a row the four views share the same height and stand on a common baseline, evenly spaced, so they read as the same person rotating. Every figure is uncropped full-body with a clean 8% safe border. No scenery, furniture, extra people, props or decorative marks.
Color and material: ${selectedStyle.color_hint}
Constraints: this is an identity reference only; no text, letters, numbers, labels, captions, speech bubbles, logo, signature or watermark; ${selectedStyle.avoid}.`,
  );
  console.log('→ Drawing the character sheet');
  runImage2({
    images: styleReferencePaths,
    promptFile: characterPrompt,
    size: '2048x1024',
    out: characterSheet,
  });
}

const columns = Math.min(4, shots.length);
const rows = Math.ceil(shots.length / columns);
const size = gridSize({columns, rows});

const panelLines = shots
  .map((shot, index) => {
    const number = String(index + 1).padStart(2, '0');
    const parts = [
      shot.camera && `Camera: ${shot.camera}`,
      shot.action && `Action: ${shot.action}`,
      shot.environment && `Environment: ${shot.environment}`,
    ].filter(Boolean);
    return `Panel ${number} — ${parts.join(' | ')}`;
  })
  .join('\n');

// Only the panel number is drawn as text. Asking the model to letter full
// Camera/Action/Environment captions garbles them at this size; the readable
// breakdown is written beside the sheet instead.
const sheetPrompt = writePrompt(
  'storyboard_sheet.txt',
  `Use case: illustration-story
Asset type: one professional previsualisation storyboard sheet for a hand-drawn Chinese story video in the "${selectedStyle.name_zh}" style.
Input images: ${styleLegend ? `${styleLegend}; ` : ''}image ${styleReferencePaths.length + 1} is the fixed character sheet — the single source of truth for every protagonist's face, hair, age, build and clothing colours. Copy the identity exactly into every panel and never copy its poses.${styleLegend ? " Ignore the style images' depicted people, actions, objects and text." : ''}
Primary request: draw a ${columns}-column by ${rows}-row grid of ${shots.length} storyboard panels on one sheet, read left to right then top to bottom, in story order.
Panels:
${panelLines}
Character lock: ${characterLock}
Style: ${selectedStyle.prompt}
Composition: every panel is an upright 3:4 rectangle with a thin even border, all panels the same size, evenly gutter-spaced on ${illustrationBackground}. Inside each panel stage the described shot with the subject group filling roughly 70-82% of the frame and nothing touching a panel edge. Consecutive panels must differ in framing, matching the Camera line given for each.
Color and material: ${selectedStyle.color_hint}
Constraints: the ONLY text anywhere on the sheet is the two-digit panel number in the top-left corner inside each panel; no captions, sentences, labels, arrows, speech bubbles, logo, signature or watermark; non-graphic, emotionally restrained storytelling; no blood, wounds or injury; ${selectedStyle.avoid}.`,
);

console.log(`→ Drawing the sheet: ${shots.length} panels, ${columns}x${rows}, ${size}`);
runImage2({
  images: [...styleReferencePaths, characterSheet],
  promptFile: sheetPrompt,
  size,
  out: outPath,
});

writeFileSync(
  textPath,
  `${[
    shotList.title ? `Title: ${shotList.title}` : null,
    `Style: ${selectedStyle.name_zh} (${selectedStyle.id})`,
    `Character lock: ${characterLock}`,
    '',
    ...shots.map((shot, index) => {
      const number = String(index + 1).padStart(2, '0');
      return [
        `Shot ${number}`,
        shot.text ? `Text: ${shot.text}` : null,
        `Camera: ${shot.camera || '(none)'}`,
        `Action: ${shot.action || '(none)'}`,
        `Environment: ${shot.environment || '(none)'}`,
        '',
      ]
        .filter((line) => line !== null)
        .join('\n');
    }),
  ]
    .filter((line) => line !== null)
    .join('\n')
    .trim()}\n`,
);

console.log(
  `Storyboard sheet → ${outPath}\n` +
    `Shot breakdown → ${textPath}\n` +
    `Character sheet → ${characterSheet}\n` +
    'Reuse it in the real run: npm run story -- ... --character-sheet ' +
    `${characterSheet.replace(`${root}/`, '')}`,
);
