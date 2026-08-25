import {Composition} from 'remotion';
import {BOARD_WIDTH, boardHeight, PreviewBoard} from './PreviewBoard';
import type {PreviewBoardProps} from './PreviewBoard';
import {StoryVideo} from './StoryVideo';
import {storyboard, totalFrames} from './storyboard';
import {UploadedStoryVideo} from './UploadedStoryVideo';
import {
  uploadedStoryboard,
  uploadedTotalFrames,
} from './uploadedStoryboard';

// A still rendered with --props supplies the real board; this keeps the
// composition valid in the Studio and when no props are passed.
const emptyBoard: PreviewBoardProps = {
  title: '',
  styleName: '',
  characterLock: '',
  palette: [],
  sheet: null,
  references: [],
  shots: [],
};

export const RemotionRoot: React.FC = () => {
  const {project} = storyboard;

  return (
    <>
      <Composition
        id="PictureSilent"
        component={StoryVideo}
        durationInFrames={totalFrames}
        fps={project.fps}
        width={project.width}
        height={project.height}
        defaultProps={{}}
      />
      <Composition
        id="PreviewBoard"
        component={PreviewBoard}
        durationInFrames={1}
        fps={1}
        width={BOARD_WIDTH}
        height={1600}
        defaultProps={emptyBoard}
        calculateMetadata={({props}) => ({
          width: BOARD_WIDTH,
          height: boardHeight(props),
        })}
      />
      <Composition
        id="UploadedPictureSilent"
        component={UploadedStoryVideo}
        durationInFrames={uploadedTotalFrames}
        fps={uploadedStoryboard.project.fps}
        width={uploadedStoryboard.project.width}
        height={uploadedStoryboard.project.height}
        defaultProps={{}}
      />
    </>
  );
};
