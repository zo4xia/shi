import type {
  AudioTimelinePoint,
  BoardTimelinePoint,
  RuntimeStep,
  RuntimeTimelinePoint,
  StepState,
  TeamTaskDefinition,
  TeamTaskRuntime,
} from '../types/teamRuntime';

// #边界_Team运行时转换层
// Team 的时间轴 / 板书块 / reveal 运行时转换先收在这里。
// 页面可以先是演示壳，但这些转换不要继续反向塞回页面组件。
const TIMELINE_ORDER: Record<RuntimeTimelinePoint['type'], number> = {
  speech: 0,
  board: 1,
};

export function getBoardRevealProgress(point: BoardTimelinePoint, currentMs: number): number {
  if (currentMs <= point.startTime) {
    return 0;
  }

  const durationMs = Math.max(point.revealDurationMs ?? (point.endTime - point.startTime), 1);
  const rawProgress = Math.min(Math.max((currentMs - point.startTime) / durationMs, 0), 1);

  if (!point.pausePoints || point.pausePoints.length === 0) {
    return rawProgress;
  }

  // Keep the drawing motion slightly human by easing progress around the configured pause anchors.
  const anchors = point.pausePoints
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1)
    .sort((left, right) => left - right);

  let slowedProgress = rawProgress;
  for (const anchor of anchors) {
    const distance = Math.abs(rawProgress - anchor);
    if (distance < 0.08) {
      const slowFactor = 0.55 + (distance / 0.08) * 0.45;
      slowedProgress = anchor + (rawProgress - anchor) * slowFactor;
    }
  }

  return Math.min(Math.max(slowedProgress, 0), 1);
}

// #业务流_板书块时间轴
// Team 单页里，板书块当前先以 boardTimeline 形式落地，再给画布消费。
export function getActiveBoardBlocks(boardTimeline: BoardTimelinePoint[], currentMs: number): BoardTimelinePoint[] {
  return boardTimeline.filter((point) => currentMs >= point.startTime && currentMs <= point.endTime);
}

export function getRuntimeDuration(task: Pick<TeamTaskDefinition, 'audioTimeline' | 'boardTimeline'>): number {
  return [...task.audioTimeline, ...task.boardTimeline].reduce(
    (max, point) => Math.max(max, point.endTime),
    1000,
  );
}

export function buildTimeline(task: Pick<TeamTaskDefinition, 'audioTimeline' | 'boardTimeline'>): RuntimeTimelinePoint[] {
  return [
    ...task.audioTimeline.map<RuntimeTimelinePoint>((point) => ({
      id: point.id,
      type: 'speech',
      label: point.label,
      startTime: point.startTime,
      endTime: point.endTime,
      colorClass: 'bg-rose-500',
    })),
    ...task.boardTimeline.map<RuntimeTimelinePoint>((point) => ({
      id: point.id,
      type: 'board',
      label: point.label,
      startTime: point.startTime,
      endTime: point.endTime,
      colorClass: 'bg-sky-500',
      speed: point.speed,
    })),
  ].sort((left, right) => {
    if (left.startTime !== right.startTime) {
      return left.startTime - right.startTime;
    }

    return TIMELINE_ORDER[left.type] - TIMELINE_ORDER[right.type];
  });
}

export function buildRuntimeSteps(
  audioTimeline: AudioTimelinePoint[],
  boardTimeline: BoardTimelinePoint[],
  currentMs: number,
): RuntimeStep[] {
  // #业务流_418_170_118
  // 这里把 A 语音轴 / B 板书块 / C 画布状态收成 Team 页可见的最小运行态。
  const durationMs = getRuntimeDuration({ audioTimeline, boardTimeline });
  const activeBlocks = getActiveBoardBlocks(boardTimeline, currentMs);
  const hasAudio = audioTimeline.length > 0;
  const hasBoard = boardTimeline.length > 0;
  const cState: StepState = activeBlocks.length > 0 ? 'running' : currentMs >= durationMs ? 'done' : 'queued';
  const dState: StepState = currentMs >= durationMs ? 'done' : 'queued';

  return [
    {
      seat: 'A',
      title: '语音生成',
      state: hasAudio ? 'done' : 'blocked',
      summary: hasAudio ? `语音轴已生成 ${audioTimeline.length} 段` : '缺少语音轴',
      payload: hasAudio ? `首段时长：${audioTimeline[0].endTime - audioTimeline[0].startTime} ms` : '等待音频输入',
    },
    {
      seat: 'B',
      title: '调整打点',
      state: hasBoard ? 'done' : 'blocked',
      summary: hasBoard ? `板书步骤已对齐 ${boardTimeline.length} 段` : '缺少板书步骤',
      payload: hasBoard ? `当前最小标准例子：${boardTimeline[0].label}` : '等待板书计划',
    },
    {
      seat: 'C',
      title: '适配轨迹',
      state: cState,
      summary:
        cState === 'running'
          ? `画布正在显示 ${activeBlocks.length} 个激活块`
          : cState === 'done'
            ? '画布适配已跑完整条时间轴'
            : '等待游标进入板书时间',
      payload:
        activeBlocks.length > 0
          ? `当前块：${activeBlocks.map((block) => block.label).join(' / ')}`
          : `时间轴长度：${durationMs} ms`,
    },
    {
      seat: 'D',
      title: '校验收口',
      state: dState,
      summary: dState === 'done' ? '最小标准例子已跑完待复核' : '等待 A 到 C 跑完',
      payload: dState === 'done' ? '可进入合格检查 / 存档' : '暂不触发收口',
    },
  ];
}

export function buildTeamRuntime(task: TeamTaskDefinition): TeamTaskRuntime {
  return {
    taskId: task.taskId,
    title: task.title,
    savePath: task.savePath,
    currentMs: task.currentMs,
    durationMs: getRuntimeDuration(task),
    lectureText: task.lectureText,
    timelineJson: task.timelineJson,
    seats: task.seats,
    audioTimeline: task.audioTimeline,
    boardTimeline: task.boardTimeline,
    timeline: buildTimeline(task),
    steps: buildRuntimeSteps(task.audioTimeline, task.boardTimeline, task.currentMs),
  };
}
