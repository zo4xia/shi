// #边界_Team类型层
// 这里定义的是 Team feature-local 的参数与媒体结构。
// 后续继续拆 Team 时，优先扩展这里，不要把同义参数再散回页面层。
export type TeamSeat = 'A' | 'B' | 'C' | 'D';

export type TimelinePointType = 'speech' | 'board';

export type StepState = 'done' | 'running' | 'queued' | 'blocked';

export type SeatConfig = {
  provider: 'aliyun' | 'system' | 'custom';
  baseUrl: string;
  apiKey: string;
  modelOrEngine: string;
  voice?: string;
  format?: 'wav' | 'mp3';
};

export type AudioTimelinePoint = {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  text?: string;
};

export type BoardTimelinePoint = {
  id: string;
  label: string;
  expression: string;
  startTime: number;
  endTime: number;
  speed: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  imageUrl?: string;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  imageCrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  revealMode?: 'wipe-left-to-right' | 'stroke-fade-segments';
  revealDurationMs?: number;
  pausePoints?: number[];
};

export type RuntimeTimelinePoint = {
  id: string;
  type: TimelinePointType;
  label: string;
  startTime: number;
  endTime: number;
  colorClass: string;
  speed?: number;
};

export type RuntimeStep = {
  seat: TeamSeat;
  title: string;
  state: StepState;
  summary: string;
  payload?: string;
};

export type TeamTaskDefinition = {
  taskId: string;
  title: string;
  savePath: string;
  currentMs: number;
  lectureText: string;
  timelineJson: {
    requestId: string;
    audioUrl: string;
    sentences: Array<{
      index: number;
      originalText?: string;
      words: Array<{
        text: string;
        beginTime: number;
        endTime: number;
      }>;
    }>;
  };
  seats: Record<TeamSeat, SeatConfig>;
  audioTimeline: AudioTimelinePoint[];
  boardTimeline: BoardTimelinePoint[];
};

export type TeamTaskRuntime = {
  taskId: string;
  title: string;
  savePath: string;
  currentMs: number;
  durationMs: number;
  lectureText: string;
  timelineJson: TeamTaskDefinition['timelineJson'];
  seats: Record<TeamSeat, SeatConfig>;
  audioTimeline: AudioTimelinePoint[];
  boardTimeline: BoardTimelinePoint[];
  timeline: RuntimeTimelinePoint[];
  steps: RuntimeStep[];
};
