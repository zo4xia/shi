import type { AudioTimelinePoint } from '../../types/teamRuntime';

// #边界_Team演示运行时辅助
// 这里先收 Team 演示版自己的轻辅助函数。
// 后续如果要继续拆 service/runtime，又不想碰页面骨头，优先往这里收。

export function splitLectureTextToSegments(text: string): string[] {
  return text
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildDemoAudioTimeline(segments: string[]): AudioTimelinePoint[] {
  let cursor = 360;
  return segments.map((segment, index) => {
    const duration = Math.max(900, Math.min(3800, segment.length * 180));
    const point: AudioTimelinePoint = {
      id: `speech-demo-${index + 1}`,
      label: `语音段 ${index + 1}`,
      startTime: cursor,
      endTime: cursor + duration,
      text: segment,
    };
    cursor = point.endTime + 120;
    return point;
  });
}
