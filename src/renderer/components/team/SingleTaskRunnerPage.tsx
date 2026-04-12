import {
    ArrowDownTrayIcon,
    ArrowUturnLeftIcon,
    CheckCircleIcon,
    ClockIcon,
    ExclamationCircleIcon,
    PauseIcon,
    PlayIcon,
} from '@heroicons/react/24/solid';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    buildRuntimeSteps,
    buildTimeline,
    getActiveBoardBlocks,
    getBoardRevealProgress,
} from '../../lib/handwriteAdapter';
import type {
    RuntimeTimelinePoint,
    SeatConfig,
    TeamSeat,
} from '../../types/teamRuntime';
import { buildDemoAudioTimeline, splitLectureTextToSegments } from './teamDemoRuntime';
import {
  initialTeamRuntime,
  teamStateChip,
  TEAM_ACTION_BUTTON_CLASS,
  TEAM_BUTTON_CLASS,
  TEAM_CANVAS_ANCHORS,
  TEAM_CANVAS_ANCHOR_ORDER,
  TEAM_CANVAS_VIEWPORT,
  TEAM_HORIZONTAL_RULER_MARKS,
  TEAM_INPUT_CLASS,
  TEAM_VERTICAL_RULER_MARKS,
  teamTaskDefinition,
} from './teamRuntimeConfig';

const SingleTaskRunnerPage: React.FC = () => {
  // #路由_Team单页
  // Team 是外挂式单页，不回旧主壳，先承接专业业务小延展。
  // {标记} TEAM_DEMO_ONLY: 这个页面的稳态真相主要是本地 React state；initialTeamRuntime 只是演示 seed，不是长期运行时真相源。
  const audioRef = useRef<HTMLAudioElement>(null);
  const [seatConfig, setSeatConfig] = useState(initialTeamRuntime.seats);
  const [audioTimeline, setAudioTimeline] = useState(initialTeamRuntime.audioTimeline);
  const [timeline, setTimeline] = useState(initialTeamRuntime.timeline);
  const [boardTimeline, setBoardTimeline] = useState(initialTeamRuntime.boardTimeline);
  const [taskTitle, setTaskTitle] = useState(initialTeamRuntime.title);
  const [savePath, setSavePath] = useState(initialTeamRuntime.savePath);
  const [lectureText, setLectureText] = useState(initialTeamRuntime.lectureText);
  const [timelineJson, setTimelineJson] = useState(initialTeamRuntime.timelineJson);
  const [currentMs, setCurrentMs] = useState(initialTeamRuntime.currentMs);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [loadStrokeWithAudio, setLoadStrokeWithAudio] = useState(true);
  const [isApiConfigOpen, setIsApiConfigOpen] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState(initialTeamRuntime.timeline[0]?.id ?? null);
  const [draftStart, setDraftStart] = useState(String(initialTeamRuntime.timeline[0]?.startTime ?? 0));
  const [draftEnd, setDraftEnd] = useState(String(initialTeamRuntime.timeline[0]?.endTime ?? 0));
  const [draftSpeed, setDraftSpeed] = useState(String(initialTeamRuntime.timeline[0]?.speed ?? 1));
  const [draftLabel, setDraftLabel] = useState(initialTeamRuntime.timeline[0]?.label ?? '');

  const durationMs = useMemo(() => timeline.reduce((max, point) => Math.max(max, point.endTime), 1000), [timeline]);

  const steps = useMemo(
    // #业务流_418_170_118
    // Team 当前最小标准例子：A 语音轴 -> B 板书步骤 -> C 画布显示。
    () => buildRuntimeSteps(audioTimeline, boardTimeline, currentMs),
    [audioTimeline, boardTimeline, currentMs],
  );

  const selectedPoint = useMemo(
    () => timeline.find((point) => point.id === selectedPointId) ?? null,
    [timeline, selectedPointId],
  );

  const activeBoardBlocks = useMemo(() => getActiveBoardBlocks(boardTimeline, currentMs), [boardTimeline, currentMs]);

  useEffect(() => {
    if (!selectedPoint) return;
    setDraftStart(String(selectedPoint.startTime));
    setDraftEnd(String(selectedPoint.endTime));
    setDraftSpeed(String(selectedPoint.speed ?? 1));
    setDraftLabel(selectedPoint.label);
  }, [selectedPointId, selectedPoint]);

  useEffect(() => {
    if (playbackState !== 'playing') return;

    const timer = window.setInterval(() => {
      setCurrentMs((current) => {
        const next = Math.min(current + 80, durationMs);
        if (next >= durationMs) {
          window.clearInterval(timer);
          setPlaybackState('idle');
        }
        return next;
      });
    }, 80);

    return () => window.clearInterval(timer);
  }, [durationMs, playbackState]);

  // #同步_音频播放状态
  // 同步 playbackState 与音频播放/暂停
  useEffect(() => {
    if (!audioRef.current) return;

    if (playbackState === 'playing') {
      audioRef.current.play().catch(() => {
        // 音频播放失败（例如没有 audioUrl），继续前进进度条
      });
    } else {
      audioRef.current.pause();
    }
  }, [playbackState]);

  // #同步_音频进度
  // 同步 currentMs 与音频播放进度
  useEffect(() => {
    if (!audioRef.current || !timelineJson.audioUrl) return;

    const audioCurrentMs = audioRef.current.currentTime * 1000;
    const diff = Math.abs(currentMs - audioCurrentMs);

    // 如果差异超过 100ms，则同步音频时间
    if (diff > 100) {
      audioRef.current.currentTime = currentMs / 1000;
    }
  }, [currentMs, timelineJson.audioUrl]);

  const updateSeat = (seat: TeamSeat, field: keyof SeatConfig, value: string) => {
    // #接口_Agent配置
    // 这里是 Team 单页里 A/B/C/D 各工位的独立接口配置入口。
    setSeatConfig((current) => ({
      ...current,
      [seat]: {
        ...current[seat],
        [field]: value,
      },
    }));
  };

  const syncBoardPoint = (pointId: string, nextPoint: RuntimeTimelinePoint) => {
    setBoardTimeline((current) =>
      current.map((point) =>
        point.id === pointId
          ? {
              ...point,
              label: nextPoint.label,
              expression: nextPoint.label,
              startTime: nextPoint.startTime,
              endTime: nextPoint.endTime,
              speed: nextPoint.speed ?? point.speed,
            }
          : point,
      ),
    );
  };

  const syncAudioPoint = (pointId: string, nextPoint: RuntimeTimelinePoint) => {
    setAudioTimeline((current) =>
      current.map((point) =>
        point.id === pointId
          ? {
              ...point,
              label: nextPoint.label,
              startTime: nextPoint.startTime,
              endTime: nextPoint.endTime,
            }
          : point,
      ),
    );
  };

  const handleGenerateSpeechTimeline = () => {
    const segments = splitLectureTextToSegments(lectureText);
    if (segments.length === 0) return;

    setIsGeneratingSpeech(true);
    try {
      const nextAudioTimeline = buildDemoAudioTimeline(segments);
      setAudioTimeline(nextAudioTimeline);
      setTimeline(buildTimeline({ audioTimeline: nextAudioTimeline, boardTimeline }));
      setCurrentMs(0);
      setPlaybackState('idle');
      setSelectedPointId(nextAudioTimeline[0]?.id ?? null);

      setTimelineJson({
        requestId: `team-demo-${Date.now()}`,
        audioUrl: seatConfig.A.baseUrl
          ? `${seatConfig.A.baseUrl.replace(/\/$/, '')}/api/tts-audio?source=team-demo`
          : '',
        sentences: [
          {
            index: 0,
            originalText: lectureText,
            words: nextAudioTimeline.map((point) => ({
              text: point.text || point.label,
              beginTime: point.startTime,
              endTime: point.endTime,
            })),
          },
        ],
      });
    } finally {
      setIsGeneratingSpeech(false);
    }
  };

  const applyTimelineDraft = () => {
    const nextStart = Number(draftStart);
    const nextEnd = Number(draftEnd);
    const nextSpeed = Number(draftSpeed);
    if (!selectedPoint || !Number.isFinite(nextStart) || !Number.isFinite(nextEnd) || nextEnd < nextStart) return;

    const patchedPoint: RuntimeTimelinePoint = {
      ...selectedPoint,
      label: draftLabel.trim() || selectedPoint.label,
      startTime: nextStart,
      endTime: nextEnd,
      speed:
        selectedPoint.type === 'board'
          ? (Number.isFinite(nextSpeed) ? Math.max(1, nextSpeed) : selectedPoint.speed)
          : selectedPoint.speed,
    };

    setTimeline((current) => {
      return current.map((point) => (point.id === selectedPoint.id ? patchedPoint : point));
    });

    if (patchedPoint.type === 'board') {
      syncBoardPoint(selectedPoint.id, patchedPoint);
    }

    if (patchedPoint.type === 'speech') {
      syncAudioPoint(selectedPoint.id, patchedPoint);
    }
  };

  return (
    // #边界_Team外挂
    // 这页是家庭业务的专业外挂壳，不伤主家园，先独立长专业能力。
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-6 text-[#47423e] md:px-6 md:py-8">
      <audio
        ref={audioRef}
        src={timelineJson.audioUrl}
        crossOrigin="anonymous"
        onEnded={() => {
          setPlaybackState('idle');
          setCurrentMs(initialTeamRuntime.currentMs);
        }}
      />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
        <div className="rounded-[30px] border border-[#d8f0ff] bg-white px-5 py-4 shadow-[0_22px_56px_rgba(117,149,168,0.14)] md:px-6">
          <div className="flex flex-col gap-3 min-[980px]:flex-row min-[980px]:items-end min-[980px]:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#55a9c8]">Team 单页独立包</div>
              <div className="mt-1 text-lg font-semibold text-[#2e4e5c]">A/B/C/D 板书演示沙箱</div>
              <div className="mt-1 text-sm leading-6 text-[#6a7f89]">
                这个版本已经从主家园里拆出来，单独承接题目输入、语音轴、控制轴、画布排版和导出前检查。
              </div>
            </div>
            <div className="grid gap-1 text-xs text-[#6a7f89] min-[980px]:text-right">
              <div>task_id：{teamTaskDefinition.taskId}</div>
              <div>当前游标：{Math.round(currentMs)} ms</div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 min-[980px]:grid-cols-[320px_minmax(0,1fr)] min-[980px]:items-start">
          <section className="w-full min-w-0 space-y-4 self-start min-[980px]:sticky min-[980px]:top-6">
            <div className="rounded-[24px] border border-[#d8f0ff] bg-[#f4fbff] px-4 py-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#55a9c8]">当前边界</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-[#365968]">
                左边是 A/B/C/D 接力和输入面板，右边是控制轴、画布和原始时间轴。中等屏宽优先维持两栏，不再突然摊成长页。
              </div>
            </div>

            {steps.map((step, index) => (
              <div key={step.seat} className="flex items-start gap-3">
                <div className="mt-2 flex flex-col items-center">
                  {index > 0 ? <div className="h-4 w-px bg-[#bfb7b0]" /> : null}
                  <div className="text-sm font-semibold text-[#6d6158]">@{step.seat}</div>
                  {index < steps.length - 1 ? <div className="h-4 w-px bg-[#bfb7b0]" /> : null}
                </div>
                <div className="flex-1 rounded-[24px] border border-white/60 bg-white/80 px-4 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{step.title}</div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${teamStateChip[step.state]}`}>{step.state}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs leading-5 text-[#6f6760]">
                    <div>{step.summary}</div>
                    {step.payload ? <div>{step.payload}</div> : null}
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-[28px] border border-[#ebe1d7] bg-white/85 px-5 py-5 shadow-[0_12px_28px_rgba(180,170,160,0.1)]">
              <div className="grid gap-4 md:grid-cols-2 min-[980px]:grid-cols-1">
                <div className="rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-4">
                  <div className="mb-2 text-xs font-semibold text-[#645a52]">讲解文本</div>
                  <textarea
                    aria-label="讲解文本"
                    title="讲解文本"
                    value={lectureText}
                    onChange={(e) => setLectureText(e.target.value)}
                    rows={7}
                    className="w-full rounded-[16px] border border-[#e3d9cf] bg-white px-3 py-3 text-sm leading-6 text-[#544b44]"
                  />
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleGenerateSpeechTimeline}
                      disabled={isGeneratingSpeech || !lectureText.trim()}
                      className={`${TEAM_BUTTON_CLASS} inline-flex items-center disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {isGeneratingSpeech ? '生成中...' : '生成语音轴'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-4">
                  <div className="mb-2 text-xs font-semibold text-[#645a52]">板书块（每行一个）</div>
                  <textarea
                    aria-label="板书块（每行一个）"
                    title="板书块（每行一个）"
                    placeholder="请输入板书块内容，每行一个"
                    value={boardTimeline.map((point) => point.label).join('\n')}
                    onChange={(e) => {
                      const nextLines = e.target.value.split('\n').map((line) => line.trim());
                      setBoardTimeline((current) =>
                        current.map((point, index) => ({
                          ...point,
                          label: nextLines[index] || point.label,
                          expression: nextLines[index] || point.expression,
                        })),
                      );
                      setTimeline((current) =>
                        current.map((point) => {
                          if (point.type !== 'board') return point;
                          const boardIndex = boardTimeline.findIndex((boardPoint) => boardPoint.id === point.id);
                          const nextLabel = boardIndex >= 0 ? nextLines[boardIndex] : '';
                          return nextLabel
                            ? {
                                ...point,
                                label: nextLabel,
                              }
                            : point;
                        }),
                      );
                    }}
                    rows={8}
                    className="w-full rounded-[16px] border border-[#e3d9cf] bg-white px-3 py-3 text-sm leading-6 text-[#544b44]"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setIsApiConfigOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#82776d]">A/B/C/D API 配置</span>
                  <span className="rounded-full border border-[#e3d9cf] bg-white px-2.5 py-1 text-[10px] font-medium text-[#6d645d]">
                    {isApiConfigOpen ? '收起' : '展开'}
                  </span>
                </button>

                {isApiConfigOpen && (
                  <div className="mt-4 space-y-4">
                    {(['A', 'B', 'C', 'D'] as const).map((seat) => (
                      <div key={seat} className="rounded-[20px] border border-[#ece3da] bg-white/80 px-4 py-4">
                        <div className="mb-3 text-xs font-semibold text-[#645a52]">@{seat}</div>
                        <div className="grid gap-3">
                          <input
                            aria-label={`${seat} Provider`}
                            title="Provider"
                            value={seatConfig[seat].provider}
                            onChange={(e) => updateSeat(seat, 'provider', e.target.value)}
                            className={`${TEAM_INPUT_CLASS} min-w-0`}
                            placeholder="provider"
                          />
                          <input
                            aria-label={`${seat} Base URL`}
                            title="Base URL"
                            value={seatConfig[seat].baseUrl}
                            onChange={(e) => updateSeat(seat, 'baseUrl', e.target.value)}
                            className={`${TEAM_INPUT_CLASS} min-w-0`}
                            placeholder="baseUrl"
                          />
                          <input
                            aria-label={`${seat} API Key`}
                            title="API Key"
                            value={seatConfig[seat].apiKey}
                            onChange={(e) => updateSeat(seat, 'apiKey', e.target.value)}
                            className={`${TEAM_INPUT_CLASS} min-w-0`}
                            placeholder="apiKey"
                          />
                          <input
                            aria-label={`${seat} Model or Engine`}
                            title="Model or Engine"
                            value={seatConfig[seat].modelOrEngine}
                            onChange={(e) => updateSeat(seat, 'modelOrEngine', e.target.value)}
                            className={`${TEAM_INPUT_CLASS} min-w-0`}
                            placeholder="model / engine"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="w-full min-w-0 space-y-5 rounded-[32px] border border-[#dce9f2] bg-white/92 px-4 py-4 shadow-[0_24px_56px_rgba(117,149,168,0.14)] md:px-6 md:py-6 overflow-hidden">
            <div className="grid gap-4 min-[1080px]:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <div className="grid gap-4 min-[1120px]:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-[22px] border border-[#e5ddd5] bg-[#f7f5f2] px-4 py-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">task_id</div>
                      <div className="mt-1 text-base font-semibold">{teamTaskDefinition.taskId}</div>
                    </div>
                    <div className="mt-4">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">题目输入</div>
                      <textarea
                        aria-label="题目输入"
                        title="题目输入"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm leading-6 text-[#544b44]"
                      />
                    </div>
                    <div className="mt-4">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">任务文件默认保存路径</div>
                      <input
                        aria-label="任务文件默认保存路径"
                        title="任务文件默认保存路径"
                        value={savePath}
                        onChange={(e) => setSavePath(e.target.value)}
                        className="mt-2 w-full rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-xs leading-5 text-[#6f6760]"
                      />
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#d9effa] bg-[#f7fcff] px-5 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium text-[#4b7394]">agent 时间轴</div>
                      <div className="text-xs text-[#61727d]">手动滑动调整语音点与板书区间</div>
                    </div>
                    <div className="relative mt-4 h-12">
                      <div className="absolute inset-x-4 top-5 h-px bg-rose-400" />
                      {timeline.map((point) => {
                        const left = `calc(16px + ${(point.startTime / durationMs) * 100}% - 8px)`;
                        return (
                          <button
                            key={point.id}
                            type="button"
                            onClick={() => setSelectedPointId(point.id)}
                            aria-label={`选择时间点 ${point.label}`}
                            className={`absolute top-3 h-4 w-4 rounded-full border border-white ${point.colorClass} ${selectedPointId === point.id ? 'ring-2 ring-white' : ''}`}
                            style={{ left }}
                            title={point.label}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-[16px] border border-[#d9d9d9] bg-white/88 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#6f6660]">控制轴 / 板书区间</div>
                        <div className="text-[11px] text-[#6f6660]">区间长短以后决定描红快慢</div>
                      </div>
                      <div className="relative mt-3 h-14">
                        <div className="absolute inset-x-2 top-6 h-px bg-sky-300" />
                        {boardTimeline.map((point) => {
                          const left = `calc(8px + ${(point.startTime / durationMs) * 100}%)`;
                          const width = `max(18px, calc(${((point.endTime - point.startTime) / durationMs) * 100}% - 8px))`;
                          return (
                            <div
                              key={`control-${point.id}`}
                              className="absolute top-3 flex h-6 items-center rounded-full bg-sky-100/95 px-2 text-[11px] text-sky-700 shadow-sm ring-1 ring-sky-300/70"
                              style={{ left, width }}
                              title={`${point.label} ${point.startTime}-${point.endTime}`}
                            >
                              <span className="truncate">{point.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <label className="space-y-1">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6660]">当前游标</span>
                        <input
                          type="range"
                          min={0}
                          max={durationMs}
                          step={50}
                          value={currentMs}
                          onChange={(event) => setCurrentMs(Number(event.target.value))}
                          className="w-full"
                        />
                      </label>
                      <div className="rounded-[18px] border border-[#e5ddd5] bg-white px-4 py-4">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[#6f6660]">点详情</div>
                        {selectedPoint ? (
                          <div className="mt-3 space-y-2">
                            <input aria-label="节点标签" title="节点标签" placeholder="节点标签" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                            <div className="grid gap-2 grid-cols-2">
                              <input aria-label="开始时间" title="开始时间" placeholder="开始时间" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                              <input aria-label="结束时间" title="结束时间" placeholder="结束时间" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                            </div>
                            <input aria-label="绘制速度" title="绘制速度" placeholder="绘制速度" value={draftSpeed} onChange={(e) => setDraftSpeed(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                            <button type="button" onClick={applyTimelineDraft} className={TEAM_BUTTON_CLASS}>
                              应用
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="space-y-4 rounded-[22px] border border-[#e5ddd5] bg-[#f7f5f2] px-4 py-4">
                  <div className="grid gap-3">
                    <div className="rounded-[16px] border border-[#ebe1d7] bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">录制完毕</div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                        {playbackState === 'playing' ? <ClockIcon className="h-5 w-5 text-amber-500" /> : <CheckCircleIcon className="h-5 w-5 text-emerald-500" />}
                        {playbackState === 'playing' ? '录制中' : '待生成 / 已完成'}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#ebe1d7] bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">是否合格</div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                        <ExclamationCircleIcon className="h-5 w-5 text-amber-500" />
                        待校验
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#ebe1d7] bg-white/90 px-4 py-3 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">合格存档</div>
                      <div className="mt-2 text-sm font-medium break-all">{savePath}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button type="button" onClick={() => setPlaybackState((v) => (v === 'playing' ? 'paused' : 'playing'))} className={`${TEAM_ACTION_BUTTON_CLASS} gap-1`}>
                      {playbackState === 'playing' ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                      {playbackState === 'playing' ? '暂停播放' : '画布播放'}
                    </button>
                    <button type="button" onClick={() => { setPlaybackState('idle'); setCurrentMs(teamTaskDefinition.currentMs); }} className={`${TEAM_ACTION_BUTTON_CLASS} gap-1`}>
                      <ArrowUturnLeftIcon className="h-4 w-4" />
                      重置
                    </button>
                    <button type="button" onClick={() => setAutoRecord((v) => !v)} className={TEAM_ACTION_BUTTON_CLASS}>
                      自动录屏 {autoRecord ? '开启' : '关闭'}
                    </button>
                    <button type="button" onClick={() => setLoadStrokeWithAudio((v) => !v)} className={TEAM_ACTION_BUTTON_CLASS}>
                      音频同步笔迹 {loadStrokeWithAudio ? '开启' : '关闭'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d8e5ef] bg-white px-4 py-4 shadow-sm">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f6660]">阿里云时间轴原始结果</div>
                  <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-[16px] bg-[#f7fafc] px-3 py-3 text-xs leading-6 text-[#334155]">
                    {JSON.stringify(timelineJson, null, 2)}
                  </pre>
                </div>
              </aside>
            </div>

            <div className="team-canvas-stage-wrap">
              <div className="team-canvas-stage">
                <div className="team-canvas-frame">
                  <div className="team-canvas-ruler team-canvas-ruler-top">
                    {TEAM_HORIZONTAL_RULER_MARKS.map((value) => (
                      <div key={`top-${value}`} className="team-canvas-ruler-tick" style={{ left: value }}>
                        <span className="team-canvas-ruler-label">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="team-canvas-ruler team-canvas-ruler-left">
                    {TEAM_VERTICAL_RULER_MARKS.map((value) => (
                      <div key={`left-${value}`} className="team-canvas-ruler-tick" style={{ top: value }}>
                        <span className="team-canvas-ruler-label">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="team-canvas-shell team-canvas-background">
                    <div className="absolute left-2 md:left-4 top-2 md:top-4 z-10 rounded-full bg-[#f7f6f4] px-3 py-1 text-[10px] md:text-xs shadow-sm">
                      当前时间：{Math.round(currentMs)} ms
                    </div>
                    {activeBoardBlocks.map((block, index) => (
                      (() => {
                        const revealProgress = getBoardRevealProgress(block, currentMs);
                        const anchorKey = TEAM_CANVAS_ANCHOR_ORDER[index % TEAM_CANVAS_ANCHOR_ORDER.length];
                        const anchor = TEAM_CANVAS_ANCHORS[anchorKey];
                        const boardText = block.expression?.trim() || block.label;
                        const boardWidth = Math.min(Math.max(block.width ?? Math.max(boardText.length * 26, 240), 220), 520);
                        const boardHeight = Math.max(Math.min(block.height ?? 112, 180), 88);
                        const boardShellHeight = boardHeight + 34 + (block.imageUrl ? 26 : 0);
                        const left = block.x ?? anchor.x;
                        const top = block.y ?? anchor.y;
                        return (
                          <div
                            key={block.id}
                            className="team-board-block absolute"
                            style={{
                              left: Math.min(Math.max(left, 16), TEAM_CANVAS_VIEWPORT.width - boardWidth - 16),
                              top: Math.min(Math.max(top, 44), TEAM_CANVAS_VIEWPORT.height - boardShellHeight - 16),
                              width: boardWidth,
                              minHeight: boardShellHeight,
                              opacity: 0.92 - index * 0.06,
                            }}
                          >
                            <div className="team-board-chip">
                              B · {Math.round(revealProgress * 100)}%
                            </div>
                            <div className="team-board-expression-shell" style={{ minHeight: boardHeight - 18 }}>
                              <div className="team-board-expression-ghost">{boardText}</div>
                              <div className="team-board-expression-mask" style={{ width: `${revealProgress * 100}%` }}>
                                <div className="team-board-expression">{boardText}</div>
                              </div>
                            </div>
                            {block.imageUrl ? (
                              <div className="team-board-footnote">旧图片轨仍保留，可后续切回描图参考。</div>
                            ) : null}
                          </div>
                        );
                      })()
                    ))}
                    <div className="absolute bottom-4 left-4 rounded-[16px] border border-[#e3d9cf] bg-white/95 px-4 py-3 text-xs shadow-sm">
                      <div>当前激活块：{activeBoardBlocks.length}</div>
                      <div>待生成块：{boardTimeline.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#e1d8ce] bg-white px-3 py-1.5 text-xs shadow-sm">
                <ArrowDownTrayIcon className="h-4 w-4" />
                自动保存下载
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default SingleTaskRunnerPage;
