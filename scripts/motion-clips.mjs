// The other pipeline: turn the keyframes this project already generates into
// animated clips with a video model, then stitch them.
//
//   node scripts/motion-clips.mjs --storyboard storyboard.json --shot-list shot-list.generated.json
//
// This does NOT replace the Remotion render. That one is deterministic, silent
// and cheap, and its motion is a layer reveal. This one spends video-model
// credits to make the picture itself move, and every run comes back different.
// The two share only the keyframes.
//
// Motion prompts are assembled, not written by another model: `move` already
// names the camera behaviour (push-in, track-left) and `action` already names
// what the subject does, so a second LLM pass would only paraphrase them.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';

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

// Duration bounds per model, from fal_image.py. A clip shorter or longer than
// the model accepts is rejected outright, so the storyboard's timing is clamped
// rather than passed through.
const MODELS = {
  'kling-v3-pro': {min: 3, max: 15, note: 'aspect ratio follows the first frame'},
  'seedance-2.0': {min: 4, max: 15, note: 'accepts 480p/720p/1080p'},
  'minimax-h3': {min: 5, max: 15, note: '2K only'},
};
const model = String(args.model || 'kling-v3-pro');
if (!MODELS[model]) {
  throw new Error(`--model must be one of: ${Object.keys(MODELS).join(', ')}`);
}

const falCli = resolve(
  root,
  String(args['fal-cli'] || process.env.FAL_IMAGE_CLI || '.fal-tools/.claude/skills/fal-image-gen/scripts/fal_image.py'),
);
if (!existsSync(falCli)) throw new Error(`fal_image.py not found: ${falCli}`);
if (!process.env.FAL_KEY && !process.env.FAL_API_KEY) throw new Error('FAL_KEY is required');

const storyboardPath = resolve(root, String(args.storyboard || 'storyboard.json'));
if (!existsSync(storyboardPath)) throw new Error(`Storyboard not found: ${storyboardPath}`);
const storyboard = JSON.parse(readFileSync(storyboardPath, 'utf8'));
const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
if (scenes.length === 0) throw new Error('Storyboard has no scenes');

const shotListPath = args['shot-list'] ? resolve(root, String(args['shot-list'])) : null;
const shotsById = {};
if (shotListPath && existsSync(shotListPath)) {
  const list = JSON.parse(readFileSync(shotListPath, 'utf8'));
  (Array.isArray(list.shots) ? list.shots : []).forEach((shot, index) => {
    shotsById[String(index + 1).padStart(2, '0')] = shot;
  });
}

const styleNote = String(storyboard.project?.style_name || '')
  ? `Keep every frame in the ${storyboard.project.style_name} hand-drawn style of the source image.`
  : 'Keep every frame in the hand-drawn style of the source image.';

// The source frame is a drawing; the failure mode is a model "improving" it
// into something photographic partway through the clip.
const CAMERA_FOR = {
  static: 'The camera is locked off and does not move.',
  'push-in': 'A slow, steady push in toward the subject.',
  'pull-back': 'A slow, steady pull back away from the subject.',
  'track-left': 'A slow lateral track to the left.',
  'track-right': 'A slow lateral track to the right.',
};

const clipDuration = (seconds) => {
  const {min, max} = MODELS[model];
  return String(Math.min(max, Math.max(min, Math.round(Number(seconds) || min))));
};

const outDir = resolve(root, String(args['out-dir'] || 'out/motion'));
mkdirSync(outDir, {recursive: true});
const promptDir = resolve(root, 'prompts/generated/motion');
mkdirSync(promptDir, {recursive: true});

const clips = [];
for (const scene of scenes) {
  const id = String(scene.id);
  const colorAsset = scene.assets?.color;
  if (!colorAsset) {
    console.log(`⚠️  Scene ${id} has no colour plate; skipping.`);
    continue;
  }
  const frame = resolve(root, 'public', colorAsset);
  if (!existsSync(frame)) {
    throw new Error(`Keyframe missing: ${frame}. Generate the images before making clips.`);
  }

  const shot = shotsById[id] || {};
  const move = String(shot.move || 'static');
  const prompt = [
    CAMERA_FOR[move] || CAMERA_FOR.static,
    shot.action ? `${shot.action}.` : String(scene.narration || scene.text || '').replace(/\n/g, ''),
    shot.environment ? `Setting: ${shot.environment}.` : null,
    styleNote,
    'The drawing must stay a drawing: no photographic detail, no added text, no new characters, no shot change or cut inside the clip.',
  ]
    .filter(Boolean)
    .join(' ');

  const promptPath = resolve(promptDir, `${id}_motion.txt`);
  writeFileSync(promptPath, `${prompt}\n`);

  const duration = clipDuration(scene.duration_sec);
  const staging = mkdtempSync(resolve(tmpdir(), 'motion-'));
  const command = [
    falCli,
    '--model',
    model,
    '--endpoint',
    'image-to-video',
    '--prompt-file',
    promptPath,
    '--ref',
    frame,
    '--duration',
    duration,
    '--output-dir',
    staging,
    ...(args.resolution ? ['--resolution', String(args.resolution)] : []),
    ...(args.audio === true ? ['--generate-audio'] : ['--no-audio']),
  ];

  console.log(`→ Clip ${id}: ${move}, ${duration}s`);
  execFileSync(process.env.PYTHON || 'python3', command, {cwd: root, stdio: 'inherit'});

  const produced = readdirSync(staging).filter((name) => name.endsWith('.mp4'));
  if (produced.length === 0) throw new Error(`No clip came back for scene ${id}`);
  const clipPath = resolve(outDir, `${id}.mp4`);
  renameSync(resolve(staging, produced[0]), clipPath);
  clips.push(clipPath);
}

if (clips.length === 0) throw new Error('No clips were produced');

// Clips can come back at different sizes; the concat demuxer refuses those, so
// normalise through the filter graph instead of copying streams.
const target = String(args.size || '1080x1440');
const [width, height] = target.split('x');
const stitched = resolve(root, String(args.out || 'out/motion_story.mp4'));
const filters = clips
  .map(
    (_, index) =>
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=30[v${index}]`,
  )
  .join(';');
const concat = `${clips.map((_, index) => `[v${index}]`).join('')}concat=n=${clips.length}:v=1:a=0[out]`;

console.log(`→ Stitching ${clips.length} clips → ${stitched}`);
execFileSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    ...clips.flatMap((clip) => ['-i', clip]),
    '-filter_complex',
    `${filters};${concat}`,
    '-map',
    '[out]',
    '-an',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-y',
    stitched,
  ],
  {cwd: root, stdio: 'inherit'},
);

console.log(
  `Model: ${model} (${MODELS[model].note})\n` +
    `Clips (${clips.length}) → ${outDir}\n` +
    `Stitched → ${stitched}`,
);
