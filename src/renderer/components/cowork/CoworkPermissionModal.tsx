import React, { useEffect, useMemo, useState } from 'react';
import type { CoworkPermissionRequest, CoworkPermissionResult } from '../../types/cowork';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import ModalWrapper from '../ui/ModalWrapper';

interface CoworkPermissionModalProps {
  permission: CoworkPermissionRequest;
  onRespond: (result: CoworkPermissionResult) => void;
}

type QuestionOption = {
  label: string;
  description?: string;
};

type QuestionItem = {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

const CoworkPermissionModal: React.FC<CoworkPermissionModalProps> = ({
  permission,
  onRespond,
}) => {
  const toolInput = permission.toolInput ?? {};

  const questions = useMemo<QuestionItem[]>(() => {
    if (permission.toolName !== 'AskUserQuestion') return [];
    if (!toolInput || typeof toolInput !== 'object') return [];
    const rawQuestions = (toolInput as Record<string, unknown>).questions;
    if (!Array.isArray(rawQuestions)) return [];

    return rawQuestions
      .map((question) => {
        if (!question || typeof question !== 'object') return null;
        const record = question as Record<string, unknown>;
        const options = Array.isArray(record.options)
          ? record.options
              .map((option) => {
                if (!option || typeof option !== 'object') return null;
                const optionRecord = option as Record<string, unknown>;
                if (typeof optionRecord.label !== 'string') return null;
                return {
                  label: optionRecord.label,
                  description: typeof optionRecord.description === 'string'
                    ? optionRecord.description
                    : undefined,
                } as QuestionOption;
              })
              .filter(Boolean) as QuestionOption[]
          : [];

        if (typeof record.question !== 'string' || options.length === 0) {
          return null;
        }

        return {
          question: record.question,
          header: typeof record.header === 'string' ? record.header : undefined,
          options,
          multiSelect: Boolean(record.multiSelect),
        } as QuestionItem;
      })
      .filter(Boolean) as QuestionItem[];
  }, [permission.toolName, toolInput]);

  const isQuestionTool = questions.length > 0;

  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isQuestionTool) {
      setAnswers({});
      return;
    }

    const rawAnswers = (toolInput as Record<string, unknown>).answers;
    if (rawAnswers && typeof rawAnswers === 'object') {
      const initial: Record<string, string> = {};
      Object.entries(rawAnswers as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'string') {
          initial[key] = value;
        }
      });
      setAnswers(initial);
    } else {
      setAnswers({});
    }
  }, [isQuestionTool, permission.requestId, toolInput]);

  const formatToolInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  const isDangerousBash = (() => {
    if (permission.toolName !== 'Bash') return false;
    const command = String((permission.toolInput as Record<string, unknown>)?.command ?? '');
    const dangerousPatterns = [
      /\brm\s+-rf?\b/i,
      /\bsudo\b/i,
      /\bdd\b/i,
      /\bmkfs\b/i,
      /\bformat\b/i,
      />\s*\/dev\//i,
    ];
    return dangerousPatterns.some(pattern => pattern.test(command));
  })();

  const getSelectedValues = (question: QuestionItem): string[] => {
    const rawValue = answers[question.question] ?? '';
    if (!rawValue) return [];
    if (!question.multiSelect) return [rawValue];
    return rawValue
      .split('|||')
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const handleSelectOption = (question: QuestionItem, optionLabel: string) => {
    setAnswers((prev) => {
      if (!question.multiSelect) {
        return { ...prev, [question.question]: optionLabel };
      }

      const rawValue = prev[question.question] ?? '';
      const current = new Set(
        rawValue
          .split('|||')
          .map((value) => value.trim())
          .filter(Boolean)
      );
      if (current.has(optionLabel)) {
        current.delete(optionLabel);
      } else {
        current.add(optionLabel);
      }

      return {
        ...prev,
        [question.question]: Array.from(current).join('|||'),
      };
    });
  };

  const isComplete = isQuestionTool
    ? questions.every((question) => (answers[question.question] ?? '').trim())
    : true;

  const denyButtonLabel = isQuestionTool
    ? '直接拒绝请求'
    : '拒绝';
  const approveButtonLabel = isQuestionTool
    ? '提交当前选择'
    : '允许';

  const handleApprove = () => {
    if (isQuestionTool) {
      if (!isComplete) return;
      onRespond({
        behavior: 'allow',
        updatedInput: {
          ...(toolInput && typeof toolInput === 'object' ? toolInput : {}),
          answers,
        },
      });
      return;
    }

    onRespond({
      behavior: 'allow',
      updatedInput: toolInput && typeof toolInput === 'object' ? toolInput : {},
    });
  };

  const handleDeny = () => {
    onRespond({
      behavior: 'deny',
      message: 'Permission denied',
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDeny();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ModalWrapper
      isOpen={true}
      onClose={handleDeny}
      title={'需要权限确认'}
      maxWidth="lg"
      maxHeight="55vh"
      headerExtra={(
        <div className="p-2.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
          <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
        </div>
      )}
      footer={(
        <>
          <button
            onClick={handleDeny}
            className="px-4 py-2 text-sm font-medium rounded-xl dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
          >
            {denyButtonLabel}
          </button>
          <button
            onClick={handleApprove}
            disabled={!isComplete}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 hover:from-amber-500 hover:to-orange-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40"
          >
            {approveButtonLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {'LobsterAI 请求执行以下操作'}
        </div>
          {isQuestionTool ? (
            <>
              {questions.map((question) => {
                const selectedValues = getSelectedValues(question);
                return (
                  <div
                    key={question.question}
                    className="rounded-2xl border dark:border-claude-darkBorder border-claude-border p-5 space-y-3 card-pearl"
                  >
                    <div className="flex items-start gap-2">
                      {question.header && (
                        <span className="text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-full bg-claude-surfaceHover dark:bg-claude-darkSurfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          {question.header}
                        </span>
                      )}
                      <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                        {question.question}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {question.options.map((option) => {
                        const isSelected = selectedValues.includes(option.label);
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => handleSelectOption(question, option.label)}
                            className={`w-full text-left rounded-xl border px-4 py-2.5 transition-colors ${
                              isSelected
                                ? 'border-claude-accent bg-claude-accent/15 text-claude-text dark:text-claude-darkText shadow-sm'
                                : 'border-claude-border dark:border-claude-darkBorder dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover'
                            }`}
                          >
                            <div className="text-sm font-medium">{option.label}</div>
                            {option.description && (
                              <div className="text-xs mt-1 opacity-80">{option.description}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {/* Tool name */}
              <div>
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary uppercase tracking-wider mb-2">
                  {'工具名称'}
                </label>
                <div className="px-4 py-3 rounded-xl dark:bg-claude-darkBg bg-claude-bg card-pearl">
                  <code className="text-sm dark:text-claude-darkText text-claude-text">
                    {permission.toolName}
                  </code>
                </div>
              </div>

              {/* Tool input */}
              <div>
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary uppercase tracking-wider mb-2">
                  {'工具参数'}
                </label>
                <div className="px-4 py-3 rounded-xl dark:bg-claude-darkBg bg-claude-bg card-pearl max-h-48 overflow-y-auto">
                  <pre className="text-xs dark:text-claude-darkText text-claude-text whitespace-pre-wrap break-words font-mono">
                    {formatToolInput(permission.toolInput)}
                  </pre>
                </div>
              </div>

              {/* Warning for dangerous operations */}
              {isDangerousBash && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {'警告：此操作可能会修改文件或执行系统命令，请仔细检查。'}
                  </p>
                </div>
              )}
            </>
          )}
      </div>
    </ModalWrapper>
  );
};

export default CoworkPermissionModal;
