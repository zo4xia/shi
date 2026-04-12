import React from 'react';
import { conversationActionButtonToneClassMap, type ConversationActionButtonTone } from './conversationActionStyles';

interface ConversationActionButtonProps {
  shortLabel: string;
  label: string;
  tone: ConversationActionButtonTone;
  onClick: () => void | Promise<void>;
  title: string;
  pending?: boolean;
  disabled?: boolean;
  ariaPressed?: boolean;
}

const ConversationActionButton: React.FC<ConversationActionButtonProps> = ({
  shortLabel,
  label,
  tone,
  onClick,
  title,
  pending = false,
  disabled = false,
  ariaPressed,
}) => {
  const className = [
    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium shadow-sm transition-colors',
    conversationActionButtonToneClassMap[tone],
    pending ? 'cursor-wait opacity-85' : '',
  ].filter(Boolean).join(' ');

  const ariaPressedValue = ariaPressed === undefined ? undefined : (ariaPressed ? 'true' : 'false');

  return (
    <button
      type="button"
      onClick={() => { void onClick(); }}
      className={className}
      title={title}
      disabled={disabled}
      aria-pressed={ariaPressedValue}
    >
      <span className="font-semibold">{shortLabel}</span>
      <span>{label}</span>
    </button>
  );
};

export default ConversationActionButton;
