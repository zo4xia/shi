import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { setSelectedModel, isSameModelIdentity, getModelIdentityKey } from '../store/slices/modelSlice';
import { AGENT_ROLE_ORDER, AGENT_ROLE_LABELS, AGENT_ROLE_ICONS, type AgentRoleKey } from '../../shared/agentRoleConfig';
import { coworkService } from '../services/cowork';

interface ModelSelectorProps {
  dropdownDirection?: 'up' | 'down';
  forcedRoleKey?: AgentRoleKey;
  forcedModelId?: string;
  readOnly?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  dropdownDirection = 'down',
  forcedRoleKey,
  forcedModelId,
  readOnly = false,
}) => {
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selectedModel = useSelector((state: RootState) => state.model.selectedModel);
  const availableModels = useSelector((state: RootState) => state.model.availableModels);

  // 点击外部区域关闭下拉框
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen && !readOnly) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, readOnly]);

  const handleModelSelect = (model: typeof availableModels[0]) => {
    dispatch(setSelectedModel(model));
    setIsOpen(false);

    // {标记} 更新cowork config的agentRoleKey，用于24小时线程
    const role = getRoleFromModel(model);
    coworkService.updateConfig({ agentRoleKey: role }).catch(err => {
      console.error('Failed to update agentRoleKey:', err);
    });
  };

  // 根据模型的providerKey推断角色
  const getRoleFromModel = (model: typeof availableModels[0]): AgentRoleKey => {
    // 如果providerKey是角色key，直接返回
    if (AGENT_ROLE_ORDER.includes(model.providerKey as AgentRoleKey)) {
      return model.providerKey as AgentRoleKey;
    }
    // 默认返回第一个角色
    return 'organizer';
  };

  const forcedModel = React.useMemo(() => {
    if (!forcedRoleKey) {
      return null;
    }
    return availableModels.find((model) => (
      model.providerKey === forcedRoleKey
      && (!forcedModelId || model.id === forcedModelId)
    )) ?? availableModels.find((model) => model.providerKey === forcedRoleKey) ?? null;
  }, [availableModels, forcedModelId, forcedRoleKey]);

  const effectiveModel = forcedModel ?? selectedModel;
  const currentRole = forcedRoleKey ?? getRoleFromModel(effectiveModel);

  // 按角色分组模型
  const modelsByRole = React.useMemo(() => {
    const grouped: Record<AgentRoleKey, typeof availableModels> = {
      organizer: [],
      writer: [],
      designer: [],
      analyst: [],
    };

    availableModels.forEach(model => {
      const role = getRoleFromModel(model);
      grouped[role].push(model);
    });

    return grouped;
  }, [availableModels]);

  // 如果没有可用模型，显示提示
  if (availableModels.length === 0) {
    return (
      <div className="px-3 py-1.5 rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkTextSecondary text-claude-textSecondary text-sm">
        请先在设置中配置员工
      </div>
    );
  }

  const dropdownPositionClass = dropdownDirection === 'up'
    ? 'bottom-full mb-1'
    : 'top-full mt-1';

  return (
    <div ref={containerRef} className="relative cursor-pointer">
      <button
        onClick={() => {
          if (!readOnly) {
            setIsOpen(!isOpen);
          }
        }}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl dark:text-claude-darkText text-claude-text transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'} ${isOpen ? 'dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover' : ''}`}
      >
        <span className="text-base">{AGENT_ROLE_ICONS[currentRole]}</span>
        <span className="font-medium text-sm">{AGENT_ROLE_LABELS[currentRole]}</span>
        {!readOnly && (
          <ChevronDownIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
        )}
      </button>

      {/* ## {提取} OptionSheet / DesktopPopover
          当前模型选择器在桌面是 popover。
          后续移动端适合降级成 OptionSheet，和其它选择器统一壳层。 */}
      {isOpen && !readOnly && (
        <div className={`absolute ${dropdownPositionClass} w-64 dark:bg-claude-darkSurface bg-claude-surface rounded-xl popover-enter shadow-popover z-50 dark:border-claude-darkBorder border-claude-border border overflow-hidden`}>
          <div className="max-h-80 overflow-y-auto">
            {AGENT_ROLE_ORDER.map((roleKey) => {
              const roleModels = modelsByRole[roleKey];
              if (roleModels.length === 0) return null;

              return (
                <div key={roleKey}>
                  {roleModels.map((model) => (
                    <button
                      key={getModelIdentityKey(model)}
                      onClick={() => handleModelSelect(model)}
                      className={`w-full px-4 py-2.5 text-left dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover flex items-center justify-between transition-colors ${
                        isSameModelIdentity(model, effectiveModel) ? 'dark:bg-claude-darkSurfaceHover/50 bg-claude-surfaceHover/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base flex-shrink-0">{AGENT_ROLE_ICONS[roleKey]}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium">{AGENT_ROLE_LABELS[roleKey]}</span>
                          <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary truncate">
                            {model.id}
                          </span>
                        </div>
                      </div>
                      {isSameModelIdentity(model, effectiveModel) && (
                        <CheckIcon className="h-4 w-4 text-claude-accent flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
