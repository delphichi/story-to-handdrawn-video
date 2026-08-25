// Composite a preview shot plan: the storyboard grid, the shot list, the fixed
// references and the palette, on one page.
//
//   node scripts/preview-board.mjs --shot-list shot-list.generated.json
//
// The page is rendered locally by Remotion rather than drawn by the image
// model. Typography is the reason: a model asked to letter "Full shot, low
// angle | 4.4s | PUSH-IN" reliably garbles it, while a browser renders it
// crisply and identically every time. The model draws pictures; the browser
// sets type.
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
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

const selectedStyle = resolveStyle(root, args.style);
const referenceDir = resolve(root, String(args['reference-dir'] || 'references.generated'));
const sheetPath = resolve(root, String(args.sheet || 'storyboard-sheet.generated.png'));
const outPath = resolve(root, String(args.out || 'preview-board.generated.png'));

// Remotion serves images through staticFile, so everything the page shows has
// to live under public/ first.
const stageDir = resolve(root, 'public/assets/generated/board');
mkdirSync(stageDir, {recursive: true});
const stage = (source, name) => {
  copyFileSync(source, resolve(stageDir, name));
  return `assets/generated/board/${name}`;
};

const sheet = existsSync(sheetPath) ? stage(sheetPath, 'storyboard-sheet.png') : null;
if (!sheet) console.log(`⚠️  No storyboard sheet at ${sheetPath}; the board will show the shot list only.`);

const labelFor = (name) => {
  if (name === '00_character_reference.png') return 'Character';
  const location = name.match(/^00_location_(.+)\.png$/);
  if (location) return `Location — ${shotList.locations?.[location[1]]?.name || location[1]}`;
  const object = name.match(/^00_object_(.+)\.png$/);
  if (object) return `Prop — ${shotList.objects?.[object[1]]?.name || object[1]}`;
  return name;
};

const references = existsSync(referenceDir)
  ? readdirSync(referenceDir)
      .filter((name) => name.endsWith('.png'))
      .sort()
      .map((name) => ({label: labelFor(name), file: stage(resolve(referenceDir, name), name)}))
  : [];
if (references.length === 0) console.log(`⚠️  No reference images in ${referenceDir}.`);

// Durations are opt-in via --storyboard. Defaulting to storyboard.json would
// silently label a sheet-only board with the durations of whatever unrelated
// story happens to be checked in, since the ids overlap.
const storyboardPath = args.storyboard ? resolve(root, String(args.storyboard)) : null;
const durations = {};
if (storyboardPath && existsSync(storyboardPath)) {
  try {
    for (const scene of JSON.parse(readFileSync(storyboardPath, 'utf8')).scenes || []) {
      durations[scene.id] = scene.duration_sec;
    }
  } catch (error) {
    console.log(`⚠️  Could not read durations from ${storyboardPath}: ${error.message}`);
  }
}

const props = {
  title: String(shotList.title || ''),
  styleName: `${selectedStyle.name_zh} · ${selectedStyle.id}`,
  characterLock: String(shotList.character_lock || ''),
  palette: Array.isArray(shotList.palette) ? shotList.palette : [],
  sheet,
  references,
  shots: shots.map((shot, index) => {
    const id = String(index + 1).padStart(2, '0');
    return {
      id,
      text: String(shot.text || ''),
      camera: String(shot.camera || ''),
      action: String(shot.action || ''),
      position: String(shot.position || ''),
      move: String(shot.move || ''),
      environment: String(shot.environment || ''),
      duration_sec: durations[id] ?? null,
    };
  }),
};

const propsPath = resolve(root, 'preview-board.props.generated.json');
writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);

console.log(`→ Rendering the board: ${shots.length} shots, ${references.length} references`);
execFileSync(
  'npx',
  [
    'remotion',
    'still',
    'src/index.ts',
    'PreviewBoard',
    outPath,
    `--props=${propsPath}`,
    ...(process.env.REMOTION_BROWSER_EXECUTABLE
      ? [`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`]
      : []),
  ],
  {cwd: root, stdio: 'inherit'},
);

console.log(`Preview board → ${outPath}`);
