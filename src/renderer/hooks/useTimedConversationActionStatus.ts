import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationActionStatus, ConversationActionStatusAccent } from '../components/cowork/conversationActionStatus';

interface TimedConversationActionStage {
  label: string;
  description: string;
}

interface UseTimedConversationActionStatusOptions {
  accent: ConversationActionStatusAccent;
  pending: boolean;
  initialStage: TimedConversationActionStage;
  waitingStage?: TimedConversationActionStage;
  waitingAfterMs?: number;
  slowStage?: TimedConversationActionStage;
  slowAfterMs?: number;
  settledVisibleMs?: number;
}

interface UseTimedConversationActionStatusResult {
  status: ConversationActionStatus | null;
  showSuccess: (stage: TimedConversationActionStage, accent?: ConversationActionStatusAccent) => void;
  showError: (stage: TimedConversationActionStage, accent?: ConversationActionStatusAccent) => void;
}

function buildStatus(accent: ConversationActionStatusAccent, stage: TimedConversationActionStage): ConversationActionStatus {
  return {
    accent,
    label: stage.label,
    description: stage.description,
  };
}

export function useTimedConversationActionStatus(
  options: UseTimedConversationActionStatusOptions,
): UseTimedConversationActionStatusResult {
  const {
    accent,
    pending,
    initialStage,
    waitingStage,
    waitingAfterMs = 1200,
    slowStage,
    slowAfterMs = 4500,
    settledVisibleMs = 2200,
  } = options;
  const [pendingStatus, setPendingStatus] = useState<ConversationActionStatus | null>(null);
  const [settledStatus, setSettledStatus] = useState<ConversationActionStatus | null>(null);
  const timerRefs = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    timerRefs.current = [];
  }, []);

  const showSettledStatus = useCallback((stage: TimedConversationActionStage, nextAccent: ConversationActionStatusAccent) => {
    clearTimers();
    setPendingStatus(null);
    const nextStatus = buildStatus(nextAccent, stage);
    setSettledStatus(nextStatus);
    const timerId = window.setTimeout(() => {
      setSettledStatus((current) => (current === nextStatus ? null : current));
    }, settledVisibleMs);
    timerRefs.current = [timerId];
  }, [clearTimers, settledVisibleMs]);

  useEffect(() => {
    clearTimers();

    if (!pending) {
      setPendingStatus(null);
      return;
    }

    setSettledStatus(null);
    setPendingStatus(buildStatus(accent, initialStage));

    if (waitingStage) {
      const timerId = window.setTimeout(() => {
        setPendingStatus(buildStatus(accent, waitingStage));
      }, waitingAfterMs);
      timerRefs.current.push(timerId);
    }

    if (slowStage) {
      const timerId = window.setTimeout(() => {
        setPendingStatus(buildStatus(accent, slowStage));
      }, slowAfterMs);
      timerRefs.current.push(timerId);
    }

    return clearTimers;
  }, [accent, clearTimers, initialStage, pending, slowAfterMs, slowStage, waitingAfterMs, waitingStage]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    status: pending ? pendingStatus : settledStatus,
    showSuccess: (stage, nextAccent = 'emerald') => showSettledStatus(stage, nextAccent),
    showError: (stage, nextAccent = 'rose') => showSettledStatus(stage, nextAccent),
  };
}
