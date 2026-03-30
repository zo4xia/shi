import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSelector } from 'react-redux';
import { skillsMcpHelperService, type SkillsMcpHelperManifest } from '../services/skillsMcpHelper';
import { webSocketClient, WS_EVENTS } from '../services/webSocketClient';
import type { RootState } from '../store';
import { AGENT_ROLE_ORDER, type AgentRoleKey } from '../../shared/agentRoleConfig';

// {标记} P0-SKILLS-MCP-HELPER: 标题行独立小窗入口，替代原整条橙色说明横幅
// {标记} UI原则: 轻提示、低噪音、与主聊天和连续性状态完全解耦

interface SkillsMcpHelperButtonProps {
  contextLabel: 'Skills' | 'MCP';
}

interface HelperMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
}

const createMessage = (role: HelperMessage['role'], content: string): HelperMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
});

const SkillsMcpHelperButton: React.FC<SkillsMcpHelperButtonProps> = ({ contextLabel }) => {
  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<SkillsMcpHelperManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [messages, setMessages] = useState<HelperMessage[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const currentRoleKey: AgentRoleKey = (
    selectedModel?.providerKey && AGENT_ROLE_ORDER.includes(selectedModel.providerKey as AgentRoleKey)
      ? selectedModel.providerKey
      : 'organizer'
  ) as AgentRoleKey;

  const introMessage = useMemo(() => {
    const examples = contextLabel === 'MCP'
      ? '可以直接问：这个 MCP 为什么连不上、缺什么配置、绑定给了哪个角色。'
      : '可以直接问：这个 skill 为什么导入失败、密钥填哪里、现在绑给了哪个角色。';

    return [
      `我只处理 ${contextLabel} 相关问题。`,
      '不进入主对话，不写入连续性记忆，也不会在普通聊天里接收明文密钥。',
      examples,
    ].join('\n');
  }, [contextLabel]);

  const quickPrompts = useMemo(
    () => (
      contextLabel === 'MCP'
        ? ['这个 MCP 缺什么配置', '它绑定给了哪个角色', '它现在是真的能用吗']
        : ['这个 skill 为什么导入失败', '这个 skill 的密钥填哪里', '它现在是真的生效了吗']
    ),
    [contextLabel]
  );

  useEffect(() => {
    setMessages([createMessage('assistant', introMessage)]);
  }, [introMessage]);

  useEffect(() => {
    if (!isOpen || manifest || loading) return;

    let isActive = true;
    setLoading(true);
    setError(null);

    void skillsMcpHelperService.getManifest().then((result) => {
      if (!isActive) return;
      if (!result) {
        setError('小助手暂时没有读取到信息。');
      } else {
        setManifest(result);
      }
      setLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [isOpen, manifest, loading]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    setTimeout(() => textareaRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const refreshManifest = async (eventLabel: 'Skills' | 'MCP') => {
      const nextManifest = await skillsMcpHelperService.getManifest();
      if (nextManifest) {
        setManifest(nextManifest);
      }
      setMessages((prev) => [
        ...prev,
        createMessage(
          'assistant',
          `${eventLabel} 有更新。我接下来会按最新运行态重新核验，不沿用旧结果。`
        ),
      ]);
    };

    const offSkillsChanged = webSocketClient.on(WS_EVENTS.SKILLS_CHANGED, () => {
      void refreshManifest('Skills');
    });
    const offMcpChanged = webSocketClient.on(WS_EVENTS.MCP_CHANGED, () => {
      void refreshManifest('MCP');
    });

    return () => {
      offSkillsChanged();
      offMcpChanged();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [isOpen, messages, isSending, showDetails]);

  const handleSend = async (rawMessage?: string) => {
    const message = (rawMessage ?? inputValue).trim();
    if (!message || isSending) return;

    setInputValue('');
    setIsSending(true);
    setError(null);
    setMessages((prev) => [...prev, createMessage('user', message)]);

    const reply = await skillsMcpHelperService.chat(message, contextLabel, currentRoleKey);

    setMessages((prev) => [
      ...prev,
      createMessage(
        'assistant',
        reply || '这次没有成功取到结果。你可以换一种问法，或者直接说报错、绑定对象、缺的字段名。'
      ),
    ]);
    setIsSending(false);
  };

  return (
    <div ref={rootRef} className="non-draggable relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="helper-pulse-glow inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-100/95 via-orange-50/95 to-amber-100/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:border-amber-400/80 hover:bg-amber-100/95 dark:border-amber-700/60 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(251,191,36,0.10))] dark:text-amber-200"
      >
        <span className="helper-pulse-dot h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-300" />
        <span>{`${contextLabel} 小助手`}</span>
      </button>

      {isOpen && (
        <>
          {/* {标记} P0-SKILLS-MCP-HELPER: 轻遮罩，压低页面噪音但不做重模态 */}
          <button
            type="button"
            aria-label="关闭小助手遮罩"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-[rgba(255,248,240,0.32)] backdrop-blur-[1.5px] transition-opacity dark:bg-[rgba(20,16,12,0.28)]"
          />
          <div className="absolute left-0 top-11 z-50 w-[380px] overflow-hidden rounded-2xl border border-amber-200/80 bg-white/95 shadow-2xl backdrop-blur-sm dark:border-amber-900/40 dark:bg-claude-darkSurface">
            <div className="flex items-center justify-between border-b border-amber-100/80 px-4 py-3 dark:border-amber-900/20">
              <div>
                <div className="text-sm font-medium text-claude-text dark:text-claude-darkText">
                  {`${contextLabel} 小助手`}
                </div>
                <div className="mt-0.5 text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {'独立外挂，不进入主对话。'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-claude-textSecondary transition-colors hover:bg-claude-surfaceHover hover:text-claude-text dark:text-claude-darkTextSecondary dark:hover:bg-claude-darkSurfaceHover dark:hover:text-claude-darkText"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex h-[430px] flex-col">
              <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-xs">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-[12px] leading-5 ${
                        message.role === 'user'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'border border-slate-200/80 bg-slate-50/90 text-claude-text dark:border-claude-darkBorder dark:bg-claude-darkBg/40 dark:text-claude-darkText'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {messages.length <= 2 && (
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void handleSend(prompt)}
                        disabled={isSending}
                        className="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1.5 text-[11px] text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100/90 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                    {'小助手核对信息中...'}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    {error}
                  </div>
                )}

                {isSending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 text-[12px] text-claude-textSecondary dark:border-claude-darkBorder dark:bg-claude-darkBg/40 dark:text-claude-darkTextSecondary">
                      {'思考中...'}
                    </div>
                  </div>
                )}

              </div>

              <div className="border-t border-amber-100/80 px-4 py-3 dark:border-amber-900/20">
                <div className="mb-2 flex justify-end">
                  <span className="text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    {'明文密钥不要发这里'}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-2 dark:border-claude-darkBorder dark:bg-claude-darkBg/60">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={3}
                    placeholder={`直接描述你的 ${contextLabel} 问题...`}
                    className="min-h-[64px] w-full resize-none bg-transparent px-1 py-1 text-sm text-claude-text outline-none placeholder:text-claude-textSecondary dark:text-claude-darkText dark:placeholder:text-claude-darkTextSecondary"
                  />
                  <div className="flex justify-end">
                    {/* {标记} P0-SKILLS-MCP-HELPER: 小窗内独立发送，不污染主对话输入框 */}
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!inputValue.trim() || isSending}
                      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                        inputValue.trim() && !isSending
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                      }`}
                    >
                      {isSending ? '发送中...' : '发送'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SkillsMcpHelperButton;
