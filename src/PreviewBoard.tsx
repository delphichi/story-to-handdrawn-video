import {Img, staticFile} from 'remotion';

export type BoardShot = {
  id: string;
  text?: string;
  camera?: string;
  action?: string;
  position?: string;
  move?: string;
  environment?: string;
  duration_sec?: number | null;
};

export type BoardReference = {
  label: string;
  file: string;
};

export type PreviewBoardProps = {
  title: string;
  styleName: string;
  characterLock: string;
  palette: string[];
  sheet: string | null;
  references: BoardReference[];
  shots: BoardShot[];
};

// The bundled brush face is the only CJK font this repo can rely on: a runner
// may ship none, and missing glyphs render as empty boxes. Latin glyphs resolve
// from the sans stack first, so only Chinese falls through to it.
const FONT = "'Helvetica Neue', Arial, 'OriginalDiaryHand', sans-serif";
const INK = '#1d1d1b';
const MUTED = '#6b6b66';
const RULE = '#d9d6cd';

export const BOARD_WIDTH = 2400;
const GRID_WIDTH = 1440;
const PADDING = 64;
const COLUMN_GAP = 48;
const HEADER_HEIGHT = 230;
const REFERENCE_HEIGHT = 430;
const NUMBER_COLUMN = 84;
const SIDEBAR_TEXT_WIDTH = BOARD_WIDTH - PADDING * 2 - GRID_WIDTH - COLUMN_GAP - NUMBER_COLUMN;

// A still has one fixed canvas, so anything taller than the height declared up
// front is simply cut off. Estimate how far each row wraps rather than assuming
// every shot is one line: CJK glyphs take roughly a full em, Latin about half.
const wrappedLines = (text: string, fontSize: number) => {
  if (!text) return 0;
  const ems = [...text].reduce((total, character) => total + (/[\u3000-\u9fff\uff00-\uffef]/.test(character) ? 1 : 0.5), 0);
  return Math.max(1, Math.ceil((ems * fontSize) / SIDEBAR_TEXT_WIDTH));
};

const shotHeight = (shot: BoardShot) => {
  let height = 40 + 34;
  if (shot.text) height += wrappedLines(shot.text, 20) * 29 + 10;
  for (const line of [shot.action, shot.position, shot.environment]) {
    if (line) height += wrappedLines(line, 18) * 25 + 7;
  }
  return Math.max(132, height);
};

export const boardHeight = ({shots, references, characterLock}: PreviewBoardProps) => {
  const table = 64 + shots.reduce((total, shot) => total + shotHeight(shot), 0);
  const sheetBox = Math.round((GRID_WIDTH * 2) / 3);
  const lockLines = wrappedLines(characterLock, 21);
  return (
    HEADER_HEIGHT +
    lockLines * 32 +
    Math.max(table, sheetBox) +
    (references.length > 0 ? REFERENCE_HEIGHT : 0) +
    PADDING * 2
  );
};

const Label: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div
    style={{
      fontSize: 19,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: MUTED,
      marginBottom: 14,
    }}
  >
    {children}
  </div>
);

export const PreviewBoard: React.FC<PreviewBoardProps> = ({
  title,
  styleName,
  characterLock,
  palette,
  sheet,
  references,
  shots,
}) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: '#faf8f3',
      color: INK,
      fontFamily: FONT,
      padding: PADDING,
      display: 'flex',
      flexDirection: 'column',
      gap: 40,
    }}
  >
    <header style={{borderBottom: `2px solid ${INK}`, paddingBottom: 26}}>
      <div style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40}}>
        <div>
          <div style={{fontSize: 21, letterSpacing: '0.2em', color: MUTED}}>PREVIEW SHOT PLAN</div>
          <div style={{fontSize: 62, lineHeight: 1.1, marginTop: 8}}>{title || '(untitled)'}</div>
        </div>
        <div style={{textAlign: 'right', maxWidth: 900}}>
          <div style={{fontSize: 24}}>{styleName}</div>
          <div style={{fontSize: 20, color: MUTED, marginTop: 8}}>
            {shots.length} shots
          </div>
          {palette.length > 0 ? (
            <div style={{display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end'}}>
              {palette.map((color) => (
                <div key={color} style={{textAlign: 'center'}}>
                  <div
                    style={{
                      width: 72,
                      height: 44,
                      background: color,
                      border: `1px solid ${RULE}`,
                    }}
                  />
                  <div style={{fontSize: 14, color: MUTED, marginTop: 5}}>{color}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {characterLock ? (
        <div style={{fontSize: 21, color: MUTED, marginTop: 18, lineHeight: 1.5}}>
          {characterLock}
        </div>
      ) : null}
    </header>

    <div style={{display: 'flex', gap: COLUMN_GAP, flexShrink: 0}}>
      <div style={{width: GRID_WIDTH, flexShrink: 0}}>
        <Label>Storyboard</Label>
        {sheet ? (
          <Img
            src={staticFile(sheet)}
            style={{width: '100%', border: `1px solid ${RULE}`, background: '#fff'}}
          />
        ) : (
          <div style={{fontSize: 22, color: MUTED}}>No storyboard sheet was drawn.</div>
        )}
      </div>

      <div style={{flex: 1, minWidth: 0}}>
        <Label>Shot list</Label>
        <div style={{borderTop: `1px solid ${RULE}`}}>
          {shots.map((shot) => (
            <div
              key={shot.id}
              style={{
                display: 'flex',
                gap: 22,
                padding: '20px 0',
                borderBottom: `1px solid ${RULE}`,
                minHeight: 132,
              }}
            >
              <div style={{width: NUMBER_COLUMN, flexShrink: 0}}>
                <div style={{fontSize: 34, lineHeight: 1}}>{shot.id}</div>
                {shot.duration_sec ? (
                  <div style={{fontSize: 16, color: MUTED, marginTop: 6}}>{shot.duration_sec}s</div>
                ) : null}
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                  {shot.move ? (
                    <span
                      style={{
                        fontSize: 15,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        border: `1px solid ${INK}`,
                        padding: '3px 10px',
                      }}
                    >
                      {shot.move}
                    </span>
                  ) : null}
                  <span style={{fontSize: 20}}>{shot.camera}</span>
                </div>
                {shot.text ? (
                  <div style={{fontSize: 20, marginTop: 10, lineHeight: 1.45}}>{shot.text}</div>
                ) : null}
                {[
                  shot.action ? `Action — ${shot.action}` : null,
                  shot.position ? `Position — ${shot.position}` : null,
                  shot.environment ? `Environment — ${shot.environment}` : null,
                ]
                  .filter(Boolean)
                  .map((line) => (
                    <div key={line as string} style={{fontSize: 18, color: MUTED, marginTop: 7, lineHeight: 1.4}}>
                      {line}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {references.length > 0 ? (
      <div>
        <Label>Fixed references</Label>
        <div style={{display: 'flex', gap: 26, alignItems: 'flex-start'}}>
          {references.map((reference) => (
            <div key={reference.file} style={{flex: 1, minWidth: 0}}>
              <Img
                src={staticFile(reference.file)}
                style={{
                  width: '100%',
                  height: 280,
                  objectFit: 'contain',
                  border: `1px solid ${RULE}`,
                  background: '#fff',
                }}
              />
              <div style={{fontSize: 18, color: MUTED, marginTop: 10}}>{reference.label}</div>
            </div>
          ))}
        </div>
      </div>
    ) : null}
  </div>
);
