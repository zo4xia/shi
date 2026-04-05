import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/react/24/solid';
import teamTaskExample from '../../mock/teamTask.example.json';
import {
  buildRuntimeSteps,
  buildTeamRuntime,
  getActiveBoardBlocks,
  getBoardRevealProgress,
} from '../../lib/handwriteAdapter';
import type {
  RuntimeTimelinePoint,
  SeatConfig,
  TeamTaskDefinition,
  TeamSeat,
} from '../../types/teamRuntime';

const taskDefinition = teamTaskExample as TeamTaskDefinition;
const initialRuntime = buildTeamRuntime(taskDefinition);

const stateChip = {
  done: 'bg-emerald-100 text-emerald-700',
  running: 'bg-amber-100 text-amber-700',
  queued: 'bg-slate-100 text-slate-600',
  blocked: 'bg-rose-100 text-rose-700',
} as const;

const SingleTaskRunnerPage: React.FC = () => {
  // #路由_Team单页
  // Team 是外挂式单页，不回旧主壳，先承接专业业务小延展。
  const [seatConfig, setSeatConfig] = useState(initialRuntime.seats);
  const [timeline, setTimeline] = useState(initialRuntime.timeline);
  const [boardTimeline, setBoardTimeline] = useState(initialRuntime.boardTimeline);
  const [lectureText, setLectureText] = useState(initialRuntime.lectureText);
  const [currentMs, setCurrentMs] = useState(initialRuntime.currentMs);
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [autoRecord, setAutoRecord] = useState(true);
  const [loadStrokeWithAudio, setLoadStrokeWithAudio] = useState(true);
  const [selectedPointId, setSelectedPointId] = useState(initialRuntime.timeline[0]?.id ?? null);
  const [draftStart, setDraftStart] = useState(String(initialRuntime.timeline[0]?.startTime ?? 0));
  const [draftEnd, setDraftEnd] = useState(String(initialRuntime.timeline[0]?.endTime ?? 0));
  const [draftSpeed, setDraftSpeed] = useState(String(initialRuntime.timeline[0]?.speed ?? 1));
  const [draftLabel, setDraftLabel] = useState(initialRuntime.timeline[0]?.label ?? '');

  const durationMs = useMemo(() => timeline.reduce((max, point) => Math.max(max, point.endTime), 1000), [timeline]);

  const steps = useMemo(
    // #业务流_418_170_118
    // Team 当前最小标准例子：A 语音轴 -> B 板书步骤 -> C 画布显示。
    () => buildRuntimeSteps(taskDefinition.audioTimeline, boardTimeline, currentMs),
    [boardTimeline, currentMs],
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
  };

  return (
    // #边界_Team外挂
    // 这页是家庭业务的专业外挂壳，不伤主家园，先独立长专业能力。
    <main className="min-h-screen bg-[#f7f6f4] px-6 py-8 text-[#47423e]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
        <div className="rounded-[28px] border border-[#ebe1d7] bg-white/85 px-6 py-4 shadow-[0_20px_50px_rgba(180,170,160,0.12)]">
          <div className="text-xs text-[#6d645d]">MacBook 1</div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <section className="space-y-4">
            <div className="rounded-[26px] border border-[#d9f4a8] bg-[#efffbf] px-5 py-8 text-center shadow-sm">
              <div className="text-sm font-semibold text-[#5f6b34]">点击查看全部</div>
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
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${stateChip[step.state]}`}>{step.state}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs leading-5 text-[#6f6760]">
                    <div>{step.summary}</div>
                    {step.payload ? <div>{step.payload}</div> : null}
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-[28px] border border-[#ebe1d7] bg-white/85 px-5 py-5 shadow-[0_12px_28px_rgba(180,170,160,0.1)]">
              <div className="mb-4 rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-4">
                <div className="mb-2 text-xs font-semibold text-[#645a52]">讲解文本</div>
                <textarea
                  value={lectureText}
                  onChange={(e) => setLectureText(e.target.value)}
                  rows={7}
                  className="w-full rounded-[16px] border border-[#e3d9cf] bg-white px-3 py-3 text-sm leading-6 text-[#544b44]"
                />
              </div>

              <div className="mb-4 rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-4">
                <div className="mb-2 text-xs font-semibold text-[#645a52]">板书块（每行一个）</div>
                <textarea
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

              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#82776d]">A/B/C/D API 配置</div>
              <div className="mt-4 space-y-4">
                {(['A', 'B', 'C', 'D'] as const).map((seat) => (
                  <div key={seat} className="rounded-[20px] border border-[#ece3da] bg-[#faf9f7] px-4 py-4">
                    <div className="mb-3 text-xs font-semibold text-[#645a52]">@{seat}</div>
                    <div className="grid gap-3">
                      <input
                        value={seatConfig[seat].provider}
                        onChange={(e) => updateSeat(seat, 'provider', e.target.value)}
                        className="rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm"
                        placeholder="provider"
                      />
                      <input
                        value={seatConfig[seat].baseUrl}
                        onChange={(e) => updateSeat(seat, 'baseUrl', e.target.value)}
                        className="rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm"
                        placeholder="baseUrl"
                      />
                      <input
                        value={seatConfig[seat].apiKey}
                        onChange={(e) => updateSeat(seat, 'apiKey', e.target.value)}
                        className="rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm"
                        placeholder="apiKey"
                      />
                      <input
                        value={seatConfig[seat].modelOrEngine}
                        onChange={(e) => updateSeat(seat, 'modelOrEngine', e.target.value)}
                        className="rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm"
                        placeholder="model / engine"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-[32px] border border-[#ebe1d7] bg-white/88 px-6 py-6 shadow-[0_24px_56px_rgba(180,170,160,0.14)]">
            <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
              <div className="space-y-4 rounded-[22px] border border-[#e5ddd5] bg-[#f7f5f2] px-4 py-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">task_id</div>
                  <div className="mt-1 text-base font-semibold">{taskDefinition.taskId}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">当前题目</div>
                  <div className="mt-1 text-sm font-medium leading-6">{taskDefinition.title}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-[#7a6f65]">任务文件默认保存路径</div>
                  <div className="mt-1 break-all text-xs leading-5 text-[#6f6760]">{taskDefinition.savePath}</div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#d8d8d8] bg-[#d8d8d8] px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium text-[#8d5d5d]">agent 时间轴</div>
                  <div className="text-xs text-[#615a55]">手动可以滑动调整轴</div>
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
                        className={`absolute top-3 h-4 w-4 rounded-full border border-white ${point.colorClass} ${selectedPointId === point.id ? 'ring-2 ring-white' : ''}`}
                        style={{ left }}
                        title={point.label}
                      />
                    );
                  })}
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
                        <input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                        <div className="grid gap-2 grid-cols-2">
                          <input value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                          <input value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                        </div>
                        <input value={draftSpeed} onChange={(e) => setDraftSpeed(e.target.value)} className="w-full rounded-[12px] border border-[#e3d9cf] bg-[#faf9f7] px-3 py-2 text-sm" />
                        <button type="button" onClick={applyTimelineDraft} className="rounded-full border border-[#d7c9be] bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
                          应用
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

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
                    <div className="mt-2 text-sm font-medium">{taskDefinition.savePath}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button type="button" onClick={() => setPlaybackState((v) => (v === 'playing' ? 'paused' : 'playing'))} className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-[#e1d8ce] bg-white px-4 py-2 shadow-sm">
                    {playbackState === 'playing' ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                    {playbackState === 'playing' ? '暂停播放' : '画布播放'}
                  </button>
                  <button type="button" onClick={() => { setPlaybackState('idle'); setCurrentMs(taskDefinition.currentMs); }} className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-[#e1d8ce] bg-white px-4 py-2 shadow-sm">
                    <ArrowUturnLeftIcon className="h-4 w-4" />
                    重置
                  </button>
                  <button type="button" onClick={() => setAutoRecord((v) => !v)} className="inline-flex w-full items-center justify-center rounded-full border border-[#e1d8ce] bg-white px-4 py-2 shadow-sm">
                    自动录屏 {autoRecord ? '开启' : '关闭'}
                  </button>
                  <button type="button" onClick={() => setLoadStrokeWithAudio((v) => !v)} className="inline-flex w-full items-center justify-center rounded-full border border-[#e1d8ce] bg-white px-4 py-2 shadow-sm">
                    音频同步笔迹 {loadStrokeWithAudio ? '开启' : '关闭'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border-[3px] border-[#4a72ff] bg-[#e6ecff]/30 px-6 py-6">
              <div
                className="relative overflow-hidden rounded-[18px] bg-white/90"
                style={{ width: 960, height: 640, maxWidth: '100%' }}
              >
                <div className="absolute left-4 top-4 rounded-full bg-[#f7f6f4] px-3 py-1 text-xs shadow-sm">
                  当前时间：{Math.round(currentMs)} ms
                </div>
                {activeBoardBlocks.map((block, index) => (
                  (() => {
                    const revealProgress = getBoardRevealProgress(block, currentMs);
                    const blockWidth = 520;
                    const crop = block.imageCrop;
                    const naturalWidth = block.imageNaturalWidth ?? crop?.width ?? blockWidth;
                    const naturalHeight = block.imageNaturalHeight ?? crop?.height ?? 96;
                    const scale = crop ? blockWidth / crop.width : 1;
                    const renderedImageHeight = naturalHeight * scale;
                    const croppedBlockHeight = crop ? Math.max(crop.height * scale, 76) : 96;
                    return (
                      <div
                        key={block.id}
                        className="absolute rounded-[18px] border border-[#ded6cf] bg-white/95 px-4 py-3 shadow-sm"
                        style={{
                          left: 80,
                          top: 120 + index * 100,
                          width: blockWidth,
                          minHeight: crop ? croppedBlockHeight + 44 : 96,
                          opacity: 0.92 - index * 0.08,
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-[#8a7f75]">board</div>
                          <div className="text-[11px] text-[#8a7f75]">{Math.round(revealProgress * 100)}%</div>
                        </div>
                        {block.imageUrl ? (
                          <div className="mt-3 rounded-[14px] border border-[#ebe4dc] bg-[#fdfcf8] p-3">
                            <div
                              className="relative overflow-hidden"
                              style={{ width: blockWidth - 24, height: croppedBlockHeight }}
                            >
                              <div
                                className="absolute inset-y-0 left-0 overflow-hidden"
                                style={{ width: `${revealProgress * 100}%` }}
                              >
                                <img
                                  src={block.imageUrl}
                                  alt={block.label}
                                  className="absolute max-w-none"
                                  style={{
                                    width: naturalWidth * scale,
                                    height: renderedImageHeight,
                                    left: crop ? -crop.x * scale : 0,
                                    top: crop ? -crop.y * scale : 0,
                                    opacity: 0.42 + revealProgress * 0.58,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="mt-2 text-[13px] text-[#7b7168]">快线手写图试跑</div>
                          </div>
                        ) : (
                          <div className="mt-2 overflow-hidden">
                            <div
                              style={{
                                clipPath: `inset(0 ${Math.max(0, 100 - revealProgress * 100)}% 0 0)`,
                                opacity: 0.42 + revealProgress * 0.58,
                              }}
                            >
                              <div className="text-[30px] font-semibold text-[#4d4540]">{block.label}</div>
                            </div>
                          </div>
                        )}
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

            <div className="flex justify-end">
              <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#e1d8ce] bg-white px-3 py-1.5 text-xs shadow-sm">
                <ArrowDownTrayIcon className="h-4 w-4" />
                自动保存下载
              </button>
            </div>

            <div className="rounded-[24px] border border-[#ebe1d7] bg-[#111827] px-5 py-5 shadow-[0_16px_34px_rgba(17,24,39,0.18)]">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d1d5db]">阿里云时间轴原始结果</div>
              <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#d1fae5]">
                {JSON.stringify(initialRuntime.timelineJson, null, 2)}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default SingleTaskRunnerPage;
