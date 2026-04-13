import React, { useEffect, useMemo, useState } from 'react';
import ComposeIcon from '../icons/ComposeIcon';
import { showGlobalToast } from '../../services/toast';
import {
  appendRoomMessage,
  createRoom,
  getRoomRoleChoices,
  invokeRoomParticipant,
  loadRooms,
  resolveMentionTargets,
  saveRooms,
  type RoomAttachment,
  type RoomMessage,
  type RoomSessionRecord,
} from '../../services/room';
import type { AgentRoleKey } from '../../../shared/agentRoleConfig';
import { EXPORT_STORAGE_BOUNDARY_NOTICE, UPLOAD_STORAGE_BOUNDARY_NOTICE } from '../../../shared/storageBoundaryCopy';
import { renderAgentRoleAvatar } from '../../utils/agentRoleDisplay';
import PageHeaderShell from '../ui/PageHeaderShell';

interface RoomViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  updateBadge?: React.ReactNode;
}

const RoomView: React.FC<RoomViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  updateBadge,
}) => {
  const DEFAULT_ATTACHMENT_SUMMARY_PROMPT = '请先按需阅读我刚挂上的文件，给我一份清楚的总结。先说重点，再说结构；如果有不确定或没读到的部分，请明确说。';
  const DEFAULT_ATTACHMENT_SUMMARY_EXPORT_PROMPT = '请先按需阅读我刚挂上的文件，给我一份清楚的总结，并把最终整理结果写成 markdown 文档保存到你自己的 export 区。如果成功写入，请在回复里告诉我文件名和保存路径；如果没写成，请明确说明卡在哪里。';
  const roleChoices = useMemo(() => getRoomRoleChoices(), []);
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<AgentRoleKey[]>(['organizer', 'writer']);
  const [rooms, setRooms] = useState<RoomSessionRecord[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<RoomAttachment[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingNames, setPendingNames] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const loadedRooms = await loadRooms();
      setRooms(loadedRooms);
      const latestActive = loadedRooms.find((room) => room.status === 'active') ?? loadedRooms.find((room) => room.status === 'paused') ?? null;
      setActiveRoomId(latestActive?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    void saveRooms(rooms);
  }, [rooms]);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const recentRooms = useMemo(
    () => [...rooms].sort((a, b) => b.updatedAt - a.updatedAt),
    [rooms]
  );

  const updateRoom = (roomId: string, updater: (room: RoomSessionRecord) => RoomSessionRecord) => {
    setRooms((prev) => prev.map((room) => (room.id === roomId ? updater(room) : room)));
  };

  const handleToggleRole = (roleKey: AgentRoleKey) => {
    setSelectedRoleKeys((prev) => (
      prev.includes(roleKey)
        ? prev.filter((item) => item !== roleKey)
        : [...prev, roleKey]
    ));
  };

  const handleCreateRoom = () => {
    if (selectedRoleKeys.length === 0) {
      showGlobalToast('先拉一个小伙伴进来');
      return;
    }
    const nextRoom = createRoom(selectedRoleKeys);
    setRooms((prev) => [nextRoom, ...prev]);
    setActiveRoomId(nextRoom.id);
    setDraft('');
    setDraftAttachments([]);
  };

  const handlePauseRoom = () => {
    if (!activeRoom) return;
    updateRoom(activeRoom.id, (room) => ({
      ...room,
      status: 'paused',
      updatedAt: Date.now(),
    }));
    setActiveRoomId(null);
    setDraft('');
    setDraftAttachments([]);
  };

  const handleEndRoom = () => {
    if (!activeRoom) return;
    updateRoom(activeRoom.id, (room) => appendRoomMessage({
      ...room,
      status: 'ended',
      updatedAt: Date.now(),
    }, {
      kind: 'system',
      senderId: 'system',
      senderName: 'Room',
      content: '今天先聊到这里，房间已经解散，记录会留下。',
    }));
    setActiveRoomId(null);
    setDraft('');
    setDraftAttachments([]);
  };

  const handleOpenRoom = (roomId: string, resume = false) => {
    if (resume) {
      updateRoom(roomId, (room) => ({
        ...room,
        status: 'active',
        updatedAt: Date.now(),
      }));
    }
    setActiveRoomId(roomId);
    setDraftAttachments([]);
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const handleAttachFiles = async (fileList: FileList | File[]) => {
    if (isBusy || activeRoom?.status !== 'active') return;
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const staged: RoomAttachment[] = [];
    for (const file of files) {
      try {
        const dataBase64 = await fileToBase64(file);
        const result = await window.electron.dialog.saveInlineFile({
          dataBase64,
          fileName: file.name,
          mimeType: file.type,
          purpose: 'attachment',
        });
        if (result.success && result.path) {
          staged.push({
            path: result.path,
            name: file.name,
          });
        }
      } catch (error) {
        console.error('Failed to stage Room attachment:', error);
      }
    }

    if (staged.length === 0) {
      showGlobalToast('这次没有顺利挂上文件');
      return;
    }

    setDraftAttachments((prev) => {
      const seen = new Set(prev.map((item) => item.path));
      const next = [...prev];
      for (const attachment of staged) {
        if (seen.has(attachment.path)) continue;
        seen.add(attachment.path);
        next.push(attachment);
      }
      return next;
    });
  };

  const handleRemoveDraftAttachment = (path: string) => {
    setDraftAttachments((prev) => prev.filter((attachment) => attachment.path !== path));
  };

  const handleSend = async (mode: 'reply' | 'export' = 'reply') => {
    if (!activeRoom || isBusy) return;
    const text = draft.trim();
    const effectiveText = text || (
      draftAttachments.length > 0
        ? mode === 'export'
          ? DEFAULT_ATTACHMENT_SUMMARY_EXPORT_PROMPT
          : DEFAULT_ATTACHMENT_SUMMARY_PROMPT
        : ''
    );
    if (!effectiveText && draftAttachments.length === 0) return;

    const roomAfterHuman = appendRoomMessage(activeRoom, {
      kind: 'human',
      senderId: 'human',
      senderName: '夏夏',
      content: effectiveText,
      attachments: draftAttachments,
    });
    updateRoom(activeRoom.id, () => roomAfterHuman);
    setDraft('');
    setDraftAttachments([]);

    const targets = resolveMentionTargets(roomAfterHuman, text);
    if (targets.length === 0) {
      showGlobalToast('现在房间里还没有小伙伴');
      return;
    }

    setIsBusy(true);
    setPendingNames(targets.map((item) => item.roleLabel));

    let workingRoom = roomAfterHuman;
    try {
      for (const participant of targets) {
        const reply = await invokeRoomParticipant(workingRoom, participant);
        workingRoom = appendRoomMessage(workingRoom, {
          kind: 'agent',
          senderId: participant.roleKey,
          senderName: `${participant.seatLabel} · ${participant.roleLabel}`,
          content: reply,
        });
        updateRoom(activeRoom.id, () => workingRoom);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Room 调用失败';
      workingRoom = appendRoomMessage(workingRoom, {
        kind: 'system',
        senderId: 'system',
        senderName: 'Room',
        content: message,
      });
      updateRoom(activeRoom.id, () => workingRoom);
      showGlobalToast(message);
    } finally {
      setPendingNames([]);
      setIsBusy(false);
    }
  };

  const renderMessage = (message: RoomMessage) => {
    const isHuman = message.kind === 'human';
    const isSystem = message.kind === 'system';
    const bubbleClass = isSystem
      ? 'mx-auto bg-violet-50/70 text-violet-700 dark:bg-violet-400/[0.08] dark:text-violet-200'
      : isHuman
        ? 'ml-auto bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
        : 'mr-auto bg-white/86 text-claude-text dark:bg-white/[0.08] dark:text-claude-darkText';

    return (
      <div key={message.id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[78%] rounded-[22px] px-4 py-3 shadow-sm ${bubbleClass}`}>
          <div className={`text-[11px] font-medium ${isHuman ? 'text-white/80' : 'text-claude-textSecondary dark:text-claude-darkTextSecondary'}`}>
            {message.senderName}
          </div>
          <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
            {message.content}
          </div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <span
                  key={`${message.id}:${attachment.path}`}
                  className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-claude-textSecondary dark:bg-white/[0.08] dark:text-claude-darkTextSecondary"
                >
                  {attachment.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-transparent h-full">
      <PageHeaderShell
        title="Room"
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        updateBadge={updateBadge}
        headerClassName="draggable flex h-12 items-center justify-between px-6 border-b dark:border-claude-darkBorder/50 border-claude-border/30 shrink-0 backdrop-blur-xl bg-gradient-pearl-header"
      />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-10">
          {!activeRoom ? (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto inline-flex items-center rounded-full border border-white/50 bg-white/65 px-4 py-1.5 text-xs font-medium tracking-[0.16em] text-claude-textSecondary shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-claude-darkTextSecondary">
                  ROOM
                </div>
                <h2 className="mt-4 text-[28px] font-semibold text-claude-text dark:text-claude-darkText">
                  小小游乐场
                </h2>
                <p className="mt-2 text-sm leading-6 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  拉几个小伙伴进来，一起聊天、散心、接龙，想停就暂停，想收工就解散。
                </p>
              </div>

              <div className="uclaw-panel-shell p-5 dark:bg-claude-darkSurface/45">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  邀请伙伴
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {roleChoices.map((choice) => {
                    const active = selectedRoleKeys.includes(choice.roleKey);
                    return (
                      <button
                        key={choice.roleKey}
                        type="button"
                        onClick={() => handleToggleRole(choice.roleKey)}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all ${active ? 'bg-white text-claude-text shadow-sm border-white/70 ring-2 ring-violet-200/60 dark:bg-white/[0.08] dark:text-claude-darkText dark:border-white/10 dark:ring-violet-400/20' : 'bg-white/50 text-claude-textSecondary border-white/45 hover:bg-white/70 dark:bg-white/[0.04] dark:text-claude-darkTextSecondary dark:border-white/10'}`}
                      >
                        <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-white/55 bg-white/80 text-[18px] shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
                          {renderAgentRoleAvatar(choice.icon, {
                            alt: choice.label,
                            className: 'h-full w-full object-cover text-[18px] leading-none flex items-center justify-center',
                          })}
                        </span>
                        <span>{choice.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-[1.02]"
                  >
                    <ComposeIcon className="h-4 w-4" />
                    <span>打开 Room</span>
                  </button>
                  <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    不用太严肃，@谁谁就说话，不@也可以大家一起接话。
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  最近的 Room
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {recentRooms.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-white/50 bg-white/35 px-4 py-8 text-sm text-center text-claude-textSecondary dark:border-white/10 dark:bg-white/[0.03] dark:text-claude-darkTextSecondary">
                      还没有房间，先拉几个小伙伴试试看。
                    </div>
                  ) : recentRooms.map((room) => (
                    <div key={room.id} className="rounded-[24px] border border-white/50 bg-white/55 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-claude-text dark:text-claude-darkText">
                            {room.title}
                          </div>
                          <div className="mt-1 truncate text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            {room.participants.map((item) => `${item.seatLabel}${item.roleLabel}`).join('、')}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          room.status === 'paused'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : room.status === 'ended'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}>
                          {room.status === 'paused' ? '暂停中' : room.status === 'ended' ? '已结束' : '聊天中'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenRoom(room.id, room.status !== 'active')}
                          className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-medium text-claude-text shadow-sm dark:bg-white/[0.08] dark:text-claude-darkText"
                        >
                          {room.status === 'ended' ? '打开记录' : '继续聊天'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    Room
                  </div>
                  <h2 className="mt-1 text-[24px] font-semibold text-claude-text dark:text-claude-darkText">
                    {activeRoom.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {activeRoom.status !== 'ended' && (
                    <button
                      type="button"
                      onClick={handlePauseRoom}
                      className="inline-flex items-center rounded-full border border-amber-200/70 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-200"
                    >
                      暂停
                    </button>
                  )}
                  {activeRoom.status !== 'ended' && (
                    <button
                      type="button"
                      onClick={handleEndRoom}
                      className="inline-flex items-center rounded-full border border-rose-200/70 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/[0.08] dark:text-rose-200"
                    >
                      结束聊天
                    </button>
                  )}
                  {activeRoom.status === 'ended' && (
                    <button
                      type="button"
                      onClick={() => handleOpenRoom(activeRoom.id, true)}
                      className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-claude-text shadow-sm dark:bg-white/[0.08] dark:text-claude-darkText"
                    >
                      重新打开
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {activeRoom.participants.map((participant) => (
                  <div key={participant.seat} className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-3 py-1.5 text-sm text-claude-text shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-claude-darkText">
                    <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/55 bg-white/80 text-[15px] shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
                      {renderAgentRoleAvatar(participant.icon, {
                        alt: participant.roleLabel,
                        className: 'h-full w-full object-cover text-[15px] leading-none flex items-center justify-center',
                      })}
                    </span>
                    <span>{participant.seatLabel}</span>
                    <span className="text-claude-textSecondary dark:text-claude-darkTextSecondary">{participant.roleLabel}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-[30px] border border-white/55 bg-gradient-to-br from-white/90 via-pearl-50/84 to-[#f4e8de]/90 p-4 shadow-[0_12px_32px_rgba(140,116,96,0.12)] dark:border-white/10 dark:bg-claude-darkSurface/40">
                <div className="h-[420px] overflow-y-auto rounded-[24px] bg-white/45 px-4 py-4 dark:bg-black/10">
                  <div className="space-y-3">
                    {activeRoom.messages.map(renderMessage)}
                    {isBusy && pendingNames.length > 0 && (
                      <div className="flex justify-start">
                        <div className="rounded-[22px] bg-white/80 px-4 py-3 text-sm text-claude-textSecondary shadow-sm dark:bg-white/[0.06] dark:text-claude-darkTextSecondary">
                          {pendingNames.join('、')} 正在回话…
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    可以用 <code>@A</code>、<code>@B</code>、<code>@浏览器助手</code>、<code>@全部</code> 点名。
                  </div>
                  <div className="uclaw-panel-inner p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        文件会跟着这轮对话一起交给小家伙；如果你只挂文件不写话，这轮会默认先请它做总结。
                      </div>
                      <label className="inline-flex cursor-pointer items-center rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-claude-text shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-claude-darkText">
                        挂文件
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={isBusy || activeRoom.status !== 'active'}
                          onChange={(event) => {
                            const files = event.target.files;
                            if (files?.length) {
                              void handleAttachFiles(files);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <div className="mb-3 text-[11px] leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                      {UPLOAD_STORAGE_BOUNDARY_NOTICE}
                    </div>
                    {draftAttachments.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {draftAttachments.map((attachment) => (
                          <button
                            key={attachment.path}
                            type="button"
                            onClick={() => handleRemoveDraftAttachment(attachment.path)}
                            className="rounded-full bg-white px-3 py-1 text-[11px] text-claude-text shadow-sm transition hover:bg-rose-50 hover:text-rose-700 dark:bg-white/[0.08] dark:text-claude-darkText dark:hover:bg-rose-400/[0.12] dark:hover:text-rose-200"
                          >
                            {attachment.name} ×
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder="先拉几个小伙伴进来，想和谁说话就 @谁"
                      disabled={isBusy || activeRoom.status !== 'active'}
                      className="min-h-[92px] w-full resize-none bg-transparent px-2 py-2 text-[13px] leading-5 text-claude-text outline-none placeholder:text-claude-textSecondary dark:text-claude-darkText dark:placeholder:text-claude-darkTextSecondary"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {activeRoom.status === 'active' ? '想停就暂停，晚上回来还能继续。' : '这个 Room 现在是只读状态。'}
                      </div>
                      <div className="flex items-center gap-2">
                        {!draft.trim() && draftAttachments.length > 0 && (
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => { void handleSend('export'); }}
                              disabled={isBusy || activeRoom.status !== 'active'}
                              className="inline-flex items-center rounded-full border border-white/60 bg-white px-4 py-2 text-sm font-medium text-claude-text shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.08] dark:text-claude-darkText"
                            >
                              总结并导出
                            </button>
                            <div className="max-w-[260px] text-right text-[11px] leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                              {EXPORT_STORAGE_BOUNDARY_NOTICE}
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { void handleSend(); }}
                          disabled={isBusy || activeRoom.status !== 'active' || (!draft.trim() && draftAttachments.length === 0)}
                          className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {!draft.trim() && draftAttachments.length > 0 ? '总结附件' : '发送'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomView;
