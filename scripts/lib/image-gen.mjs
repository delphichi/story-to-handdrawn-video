// The Codex imagegen CLI contract, shared by story-to-video.mjs and
// storyboard-sheet.mjs. CODEX_HOME decides which implementation answers:
// Codex's own CLI locally, or tools/fal-imagegen/ on a runner.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

export const imageCliPath = () =>
  resolve(
    process.env.CODEX_HOME || resolve(homedir(), '.codex'),
    'skills/.system/imagegen/scripts/image_gen.py',
  );

export const createImageGenerator = ({root, force = false}) => {
  const imageCli = imageCliPath();
  return ({images, promptFile, size, out}) => {
    if (!existsSync(imageCli)) throw new Error(`Image 2 CLI not found: ${imageCli}`);
    const operation = images.length > 0 ? 'edit' : 'generate';
    const commandArgs = [
      imageCli,
      operation,
      '--model',
      'gpt-image-2',
      ...images.flatMap((image) => ['--image', image]),
      '--prompt-file',
      promptFile,
      '--size',
      size,
      '--quality',
      'high',
      '--out',
      out,
      ...(force ? ['--force'] : []),
    ];
    execFileSync(process.env.PYTHON || 'python3', commandArgs, {
      cwd: root,
      stdio: 'inherit',
    });
  };
};

// gpt-image-2 wants both edges on a multiple of 16, the longest under 3840, and
// the total pixels inside its accepted band. Panels are 3:4 so a sheet previews
// the real framing rather than a letterboxed guess at it.
export const gridSize = ({columns, rows, panelRatio = 3 / 4, targetPixels = 2_000_000}) => {
  const ratio = (columns * panelRatio) / rows;
  let width = Math.round(Math.sqrt(targetPixels * ratio) / 16) * 16;
  let height = Math.round(width / ratio / 16) * 16;
  const longest = Math.max(width, height);
  if (longest > 3840) {
    const shrink = 3840 / longest;
    width = Math.max(16, Math.round((width * shrink) / 16) * 16);
    height = Math.max(16, Math.round((height * shrink) / 16) * 16);
  }
  return `${width}x${height}`;
};
