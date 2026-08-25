// Expand a one-line premise into a multi-beat Chinese story that the renderer
// can storyboard, using FAL's any-llm endpoint and the same FAL_KEY the
// illustrations use.
//
//   node scripts/expand-story.mjs --premise "一个男孩把风筝放上了天" --scenes 8 --out story.txt
//
// Writes the story text to --out and the character lock to --lock-out, so both
// can be handed to `npm run story`.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {splitStory} from './lib/split-story.mjs';

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
const premise = String(args.premise || '').trim();
if (!premise) throw new Error('--premise is required');

const scenes = Number(args.scenes || 8);
if (!Number.isInteger(scenes) || scenes < 2 || scenes > 20) {
  throw new Error('--scenes must be an integer between 2 and 20');
}

const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
if (!apiKey) throw new Error('FAL_KEY is required');

// Overridable so the chain can be exercised without spending credits.
const endpoint = process.env.FAL_ANY_LLM_URL || 'https://fal.run/fal-ai/any-llm';
const candidates = args.model
  ? [String(args.model)]
  : [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-pro-1.5',
    ];

// The renderer splits on 。！？；and gives every beat one illustration, so the
// story has to arrive already shaped like a shot list.
const system = `你是一位中文短篇故事作者，为无配音的手绘故事动画写分镜文案。

读者会看到：每一句话配一张手绘插画，一句一个画面。

请把用户给的一句话前提，扩写成恰好 ${scenes} 句的完整故事。硬性要求：

1. 每句话必须是一个完整句子，以「。」结尾，不使用分号、感叹号、问号。
2. 每句话不超过 30 个汉字——超过会被自动拆成两个画面，破坏节奏。
3. 每句话都要能被单独画出来：写具体的人、动作、地点、物件，不要写抽象心理活动。
4. 全篇必须构成起承转合：开场交代人物与处境，中段推进，要有一个转折，结尾收束。
5. 用简体中文。不要引号对白、不要旁白腔、不要标题。
6. 不写血腥、伤口、医疗处置或任何未成年人受伤的画面。

同时给出角色锁定（character_lock）：用一段话固定所有反复出现的角色，写明各自的年龄、脸型、发型、服装颜色与身体比例。这段文字会被送进每一张插画的提示词，用来保证同一个人在所有画面里长得一样。只描述外观，不要写剧情。

再给出镜头设计（shots），与 story 一一对应、长度相同。每格是一个对象，含 camera / action / environment 三栏英文：

camera（怎么拍）
1. 只用这四种景别：wide establishing shot、full shot、medium shot、medium close-up。
2. medium close-up 只能用在情绪反应的那一两格，其余用中景或更远。不要 extreme close-up，也不要要求裁切人物。
3. 不要连续两格用同一种景别——景别变化是这支片子唯一的节奏来源。
4. 一并写明视角（eye level / low angle / high angle）与画面重心放什么。
5. 不超过 20 个英文单词。

action（角色在做什么）
6. 只写看得见的动作与姿态，不写心理活动、不写台词。
7. 只出现这一句里必须出场的角色，不要凭空加人。
8. 不超过 20 个英文单词。

position（主体在空间里的位置）
9a. 写主体相对镜头和场景的站位，例如 far end of the aisle、just inside the doorway、close to camera at frame right。
9b. 这一栏是给画面用的实际调度信息，不是形容词；不超过 12 个英文单词。

move（相对上一格的取景推进）
9c. 只用这五个值：static、push-in、pull-back、track-left、track-right。
9d. 这支片子本身没有镜头运动，所以 move 描述的是**这一格相对上一格的取景变化**：push-in = 比上一格更近，pull-back = 比上一格更远，track-* = 距离相近但横向移位。第一格固定用 static。
9e. move 必须和 camera 的景别一致：写了 push-in，景别就要真的比上一格紧。

environment（场景）
9. 写地点、时间感、以及这一格必须出现的关键道具。
10. 同一个地点在相邻几格里要用一致的描述，读者才不会觉得场景在跳。
11. 不要提颜色、画材或笔触——那些由风格锁定统一管。
12. 不超过 20 个英文单词。

再给出地点清单（locations）与关键道具清单（objects）。这两份清单各自会被画成一张参考图，然后钉住所有画面——就像角色锁定钉住人一样。规则：

13. locations 最多 4 个，只列真正不同的地点；同一个地方不要因为时间或天气不同就拆成两个。
14. 每个地点的 description 写空景：格局、结构、主要陈设、光线方向。不写人，不写剧情。用英文，不超过 40 个单词。
15. objects 最多 2 个，只列贯穿全片、且观众会认得出来的关键道具；没有就给空数组。
16. 每个道具的 description 写它单独放着的样子：形状、材质、大小、磨损痕迹。用英文，不超过 30 个单词。
17. id 用小写英文短词，例如 courtyard、drying-yard、kite。
18. 每一格的 shots 要写明 location（必须是上面列过的 id）；这一格若出现关键道具，objects 填对应 id 的数组，否则给空数组。

再给出调色板（palette）：4 到 6 个 hex 色值，取自这个风格实际会用到的颜色，从浅到深排列。只输出 #rrggbb 格式。

只输出 JSON，不要任何其他文字：
{"title": "四到八字的标题", "character_lock": "...", "palette": ["#f4efe6", "#8fa6a0"], "locations": [{"id": "courtyard", "name": "旧院门口", "description": "..."}], "objects": [{"id": "kite", "name": "断线风筝", "description": "..."}], "story": ["第一句。", "第二句。"], "shots": [{"camera": "Wide establishing shot, eye level, ...", "action": "...", "position": "...", "move": "static", "environment": "...", "location": "courtyard", "objects": ["kite"]}]}`;

const parseJson = (text) => {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  const candidatesJson = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) candidatesJson.push(cleaned.slice(start, end + 1));
  for (const candidate of candidatesJson) {
    try {
      const data = JSON.parse(candidate);
      if (data && Array.isArray(data.story) && data.story.length > 0) return data;
    } catch {
      // try the next shape
    }
  }
  return null;
};

let result = null;
let usedModel = null;
for (const model of candidates) {
  console.log(`→ Expanding premise (${endpoint} / ${model})`);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({model, prompt: premise, system_prompt: system}),
    });
  } catch (error) {
    console.log(`   request failed: ${error.message}`);
    continue;
  }
  if (!response.ok) {
    console.log(`   HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    continue;
  }
  const body = await response.json();
  const parsed = parseJson(body.output ?? body.text ?? body.response ?? '');
  if (parsed) {
    result = parsed;
    usedModel = model;
    break;
  }
  console.log('   response was not the expected JSON, trying the next model');
}

if (!result) {
  throw new Error(
    'Story expansion failed on every candidate model. Pass --model to pick one explicitly.',
  );
}

// The renderer will split anything longer anyway; warn rather than fail, so a
// good-enough story still gets through.
const overLong = result.story.filter((line) => line.replace(/[^\p{Letter}]/gu, '').length > 30);
if (overLong.length > 0) {
  console.log(`⚠️  ${overLong.length} sentence(s) exceed 30 characters and will be split further.`);
}
if (result.story.length !== scenes) {
  console.log(`⚠️  Asked for ${scenes} sentences, got ${result.story.length}.`);
}

const storyPath = resolve(String(args.out || 'story.generated.txt'));
const lockPath = resolve(String(args['lock-out'] || 'character-lock.generated.txt'));
const planPath = resolve(String(args['plan-out'] || 'visual-plan.generated.json'));
writeFileSync(storyPath, `${result.story.join('\n')}\n`);
writeFileSync(lockPath, `${String(result.character_lock || '').trim()}\n`);

// The renderer numbers scenes from the *split* story, and a sentence over 36
// characters becomes two beats. Split here with the same function so the plan's
// keys land on the scenes they were written for; when a sentence does split,
// both halves inherit its shot.
const asEntries = (list, kind) => {
  const entries = {};
  for (const item of Array.isArray(list) ? list : []) {
    const id = String(item?.id || '').trim();
    const description = String(item?.description || '').trim();
    if (!id || !description) {
      console.log(`⚠️  Skipping a ${kind} with no id or description.`);
      continue;
    }
    entries[id] = {name: String(item.name || id).trim(), description};
  }
  return entries;
};
const locations = asEntries(result.locations, 'location');
const objects = asEntries(result.objects, 'object');

const knownIds = (ids, pool, kind) => {
  const kept = [];
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    const value = String(id || '').trim();
    if (!value) continue;
    if (pool[value]) kept.push(value);
    else console.log(`⚠️  Shot refers to unknown ${kind} "${value}"; it will have no reference image.`);
  }
  return kept;
};

const MOVES = ['static', 'push-in', 'pull-back', 'track-left', 'track-right'];
const paletteFrom = (value) => {
  const colors = (Array.isArray(value) ? value : [])
    .map((color) => String(color || '').trim().toLowerCase())
    .filter((color) => /^#[0-9a-f]{6}$/.test(color));
  if (Array.isArray(value) && colors.length < value.length) {
    console.log(`⚠️  Dropped ${value.length - colors.length} palette entries that were not #rrggbb.`);
  }
  return colors.slice(0, 6);
};
const palette = paletteFrom(result.palette);

const shotFields = ['camera', 'action', 'position', 'environment'];
const normaliseShot = (shot) => {
  if (typeof shot === 'string') return shot.trim();
  if (!shot || typeof shot !== 'object') return '';
  const filled = shotFields.filter((field) => String(shot[field] || '').trim());
  if (filled.length === 0) return '';
  if (filled.length < shotFields.length) {
    console.log(`⚠️  A shot is missing ${shotFields.filter((f) => !filled.includes(f)).join(', ')}.`);
  }
  return filled
    .map((field) => `${field[0].toUpperCase()}${field.slice(1)}: ${String(shot[field]).trim()}`)
    .join('; ');
};
const rawShots = Array.isArray(result.shots) ? result.shots : [];
const shots = rawShots.map(normaliseShot);
const visualPlan = {};
let beatIndex = 0;
for (const [sentenceIndex, sentence] of result.story.entries()) {
  const beats = splitStory(sentence);
  const shot = shots[sentenceIndex] || '';
  const raw = rawShots[sentenceIndex];
  const location = knownIds([raw?.location], locations, 'location')[0] || null;
  const shotObjects = knownIds(raw?.objects, objects, 'object');
  for (let offset = 0; offset < beats.length; offset += 1) {
    beatIndex += 1;
    if (!shot && !location && shotObjects.length === 0) continue;
    visualPlan[String(beatIndex).padStart(2, '0')] = {
      ...(shot ? {direction: shot} : {}),
      ...(location ? {location} : {}),
      ...(shotObjects.length ? {objects: shotObjects} : {}),
    };
  }
  if (beats.length > 1) {
    console.log(`⚠️  Sentence ${sentenceIndex + 1} splits into ${beats.length} beats; each reuses its shot.`);
  }
}
writeFileSync(
  planPath,
  `${JSON.stringify({locations, objects, beats: visualPlan}, null, 2)}\n`,
);

const sheetPath = resolve(String(args['sheet-out'] || 'shot-list.generated.json'));
writeFileSync(
  sheetPath,
  `${JSON.stringify(
    {
      title: result.title || '',
      character_lock: String(result.character_lock || '').trim(),
      palette,
      locations,
      objects,
      shots: result.story.map((sentence, sentenceIndex) => ({
        text: sentence,
        ...(typeof rawShots[sentenceIndex] === 'object' && rawShots[sentenceIndex]
          ? {
              ...rawShots[sentenceIndex],
              move: MOVES.includes(String(rawShots[sentenceIndex].move || '').trim())
                ? String(rawShots[sentenceIndex].move).trim()
                : 'static',
            }
          : {camera: shots[sentenceIndex] || ''}),
      })),
    },
    null,
    2,
  )}\n`,
);

if (shots.length !== result.story.length) {
  console.log(`⚠️  ${shots.length} shot directions for ${result.story.length} sentences; the rest fall back to the default framing.`);
}

console.log(
  `Model: ${usedModel}\n` +
    `Title: ${result.title || '(none)'}\n` +
    `Story (${result.story.length} sentences → ${beatIndex} beats) → ${storyPath}\n` +
    `Character lock → ${lockPath}\n` +
    `Palette: ${palette.join(' ') || '(none)'}\n` +
    `Locations: ${Object.keys(locations).join(', ') || '(none)'}\n` +
    `Objects: ${Object.keys(objects).join(', ') || '(none)'}\n` +
    `Visual plan (${Object.keys(visualPlan).length} beats) → ${planPath}\n` +
    `Shot list → ${sheetPath}`,
);
