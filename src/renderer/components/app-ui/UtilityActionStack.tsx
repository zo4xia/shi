import React from 'react';
import FeedbackButton from '../FeedbackButton';
import SettingsEntryButton from '../SettingsEntryButton';
import FloatingWidgetShell from './FloatingWidgetShell';

interface UtilityActionStackProps {
  compact: boolean;
  onOpenSettings: () => void;
}

const UtilityActionStack: React.FC<UtilityActionStackProps> = ({
  compact,
  onOpenSettings,
}) => {
  return (
    <FloatingWidgetShell>
      <SettingsEntryButton
        onClick={onOpenSettings}
        compact={compact}
        className={compact ? 'h-10 w-10 rounded-full' : 'h-10 px-3 py-0 rounded-full'}
      />
      <FeedbackButton
        iconOnly={compact}
        buttonClassName={compact ? 'static top-auto right-auto h-10 w-10 justify-center px-0 py-0 rounded-full' : 'static top-auto right-auto h-10 px-3 py-0 rounded-full'}
        panelClassName="right-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2"
      />
    </FloatingWidgetShell>
  );
};

export default UtilityActionStack;
