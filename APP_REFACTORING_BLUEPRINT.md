# 📌 前端代码拆分 App.tsx 的具体方案

## 问题分析

`src/renderer/App.tsx` 目前有 1112 行，包含太多责任：

- 页面初始化逻辑（配置、主题、API）
- UI 状态管理（模态框、边栏、视图切换）
- 事件处理（快捷键、更新、权限）
- 相关状态：30+ 个 useState

## 目标

将 1112 行拆分为多个模块，每个模块 200-300 行

---

## 🏗️ 推荐的新文件结构

```
src/renderer/
├── App.tsx                          # 核心容器（200 行）← 减少 85%
├── store/
│   ├── slices/
│   │   ├── appSlice.ts              # 导航和视图状态
│   │   ├── settingsSlice.ts         # 设置相关状态
│   │   ├── updateSlice.ts           # 更新检查状态
│   │   └── embeddedBrowserSlice.ts  # 浏览器模态框状态
│   └── index.ts
├── hooks/
│   ├── useAppInitialization.ts      # 初始化逻辑（200 行）
│   ├── useAppEventHandlers.ts       # 事件处理（150 行）
│   ├── useUpdateChecker.ts          # 更新检查逻辑
│   ├── useSettingsAccess.ts         # 设置访问权限逻辑
│   └── useEmbeddedBrowser.ts        # 嵌入浏览器逻辑
├── components/
│   ├── AppShell.tsx                 # 主布局结构
│   ├── AppModals/
│   │   ├── SettingsAccessGate.tsx
│   │   ├── SettingsModal.tsx
│   │   ├── UpdateModal.tsx
│   │   └── EmbeddedBrowserModal.tsx
│   └── AppNotifications.tsx         # 通知/Toast 逻辑
└── types/
    └── appState.ts                  # 类型定义
```

---

## 📝 具体实现步骤

### 第 1 步：创建 Store Slices

**`store/slices/appSlice.ts`** - 导航和视图状态

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  mainView: 'cowork' | 'skills' | 'scheduledTasks' | 'mcp' | 'employeeStore' | 'resourceShare' | 'freeImageGen' | 'sessionHistory' | 'room' | 'aboutUs';
  showSettings: boolean;
  settingsOptions: SettingsOpenOptions;
  showSettingsAccessGate: boolean;
  settingsPasswordInput: string;
  settingsPasswordError: string | null;
  isSidebarCollapsed: boolean;
  sessionHistorySourceFilter: SessionSourceFilter;
  rightDockActions: CoworkRightDockAction[];
}

const initialState: AppState = {
  mainView: 'cowork',
  showSettings: false,
  settingsOptions: {},
  showSettingsAccessGate: false,
  settingsPasswordInput: '',
  settingsPasswordError: null,
  isSidebarCollapsed: false,
  sessionHistorySourceFilter: 'all',
  rightDockActions: [],
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setMainView: (state, action: PayloadAction<AppState['mainView']>) => {
      state.mainView = action.payload;
    },
    openSettings: (state, action: PayloadAction<SettingsOpenOptions>) => {
      state.showSettings = true;
      state.settingsOptions = action.payload;
    },
    closeSettings: (state) => {
      state.showSettings = false;
      state.settingsOptions = {};
    },
    toggleSidebar: (state) => {
      state.isSidebarCollapsed = !state.isSidebarCollapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.isSidebarCollapsed = action.payload;
    },
    setRightDockActions: (state, action: PayloadAction<CoworkRightDockAction[]>) => {
      state.rightDockActions = action.payload;
    },
    // ... 其他 actions
  },
});

export const {
  setMainView,
  openSettings,
  closeSettings,
  toggleSidebar,
  setSidebarCollapsed,
  setRightDockActions,
} = appSlice.actions;
export default appSlice.reducer;
```

**`store/slices/updateSlice.ts`** - 更新相关状态

```typescript
interface UpdateState {
  updateInfo: AppUpdateInfo | null;
  showUpdateModal: boolean;
  updateModalState: 'info' | 'downloading' | 'installing' | 'error';
  downloadProgress: AppUpdateDownloadProgress | null;
  updateError: string | null;
}

const initialState: UpdateState = {
  updateInfo: null,
  showUpdateModal: false,
  updateModalState: 'info',
  downloadProgress: null,
  updateError: null,
};

export const updateSlice = createSlice({
  name: 'update',
  initialState,
  reducers: {
    setUpdateInfo: (state, action: PayloadAction<AppUpdateInfo | null>) => {
      state.updateInfo = action.payload;
    },
    showUpdateModal: (state) => {
      state.showUpdateModal = true;
    },
    closeUpdateModal: (state) => {
      state.showUpdateModal = false;
    },
    setDownloadProgress: (state, action: PayloadAction<AppUpdateDownloadProgress>) => {
      state.downloadProgress = action.payload;
    },
    // ... 其他 actions
  },
});
```

### 第 2 步：创建 Custom Hooks

**`hooks/useAppInitialization.ts`** - 搬家初始化逻辑

```typescript
export const useAppInitialization = () => {
  const dispatch = useDispatch();
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initializeApp = async () => {
      try {
        // 标记平台
        const platform = isWebBuild() || !window.electron ? 'web' : window.electron.platform;
        document.documentElement.classList.add(`platform-${platform}`);

        // 初始化配置
        await configService.init();
        themeService.initialize();

        const config = await configService.getConfig();
        const apiConfig: ApiConfig = {
          apiKey: config.apiKey,
          baseUrl: resolveFinalApiBase(config),
          provider: config.apiProvider,
          apiFormat: config.apiFormat as 'anthropic' | 'openai',
        };

        // ... 其他初始化逻辑

        setIsInitialized(true);
      } catch (error) {
        setInitError(String(error));
      }
    };

    initializeApp();
  }, [dispatch]);

  return { isInitialized, initError };
};
```

**`hooks/useAppEventHandlers.ts`** - 事件处理

```typescript
export const useAppEventHandlers = () => {
  const dispatch = useDispatch();
  const mainView = useSelector((state: RootState) => state.app.mainView);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 处理快捷键...
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, mainView]);

  // 其他事件处理...

  return { toastMessage, setToastMessage };
};
```

### 第 3 步：创建 Modal 组件

**`components/AppModals/SettingsAccessGate.tsx`**

```typescript
interface SettingsAccessGateProps {
  isOpen: boolean;
  password: string;
  error: string | null;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const SettingsAccessGate: React.FC<SettingsAccessGateProps> = ({
  isOpen,
  password,
  error,
  onPasswordChange,
  onSubmit,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <h2>访问设置</h2>
        <Input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="输入访问密码"
        />
        {error && <div className="text-red-600">{error}</div>}
        <Button onClick={onSubmit}>确认</Button>
      </div>
    </Modal>
  );
};
```

### 第 4 步：重构 App.tsx

```typescript
// src/renderer/App.tsx
const App: React.FC = () => {
  // 使用自定义 hooks 替代大量 useState
  const { isInitialized, initError } = useAppInitialization();
  const { toastMessage, setToastMessage } = useAppEventHandlers();

  const dispatch = useDispatch();

  // Redux 选择器
  const mainView = useSelector((state: RootState) => state.app.mainView);
  const showSettings = useSelector((state: RootState) => state.app.showSettings);
  const showUpdateModal = useSelector((state: RootState) => state.update.showUpdateModal);

  // 移动端检测
  const isMobileViewport = useIsMobileViewport();

  if (!isInitialized) {
    return <LoadingScreen error={initError} />;
  }

  return (
    <div className="app-container">
      {/* 简洁的主布局 */}
      <WindowTitleBar />

      <div className="flex">
        <Sidebar
          collapsed={useSelector((s: RootState) => s.app.isSidebarCollapsed)}
          onNavigate={(view) => dispatch(setMainView(view))}
        />

        <main className="flex-1">
          {mainView === 'cowork' && <CoworkView setToast={setToastMessage} />}
          {mainView === 'skills' && <SkillsView />}
          {/* ... 其他视图 */}
        </main>
      </div>

      {/* 分离的模态框 */}
      <AppModals />

      {/* 通知 */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  );
};
```

**`components/AppModals.tsx`** - 统一管理所有模态框

```typescript
export const AppModals: React.FC = () => {
  const dispatch = useDispatch();

  // 从 Redux 获取 modal 状态
  const showSettings = useSelector((s: RootState) => s.app.showSettings);
  const showUpdateModal = useSelector((s: RootState) => s.update.showUpdateModal);
  const showSettingsAccessGate = useSelector((s: RootState) => s.settings.showSettingsAccessGate);

  return (
    <>
      <SettingsAccessGate
        isOpen={showSettingsAccessGate}
        onClose={() => dispatch(closeSettingsAccessGate())}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => dispatch(closeSettings())}
      />

      <UpdateModal
        isOpen={showUpdateModal}
        onClose={() => dispatch(closeUpdateModal())}
      />

      <EmbeddedBrowserModal />
    </>
  );
};
```

---

## 📊 重构前后对比

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| App.tsx 行数 | 1112 | 150 | -87% |
| useState 个数 | 30+ | 3-5 | -85% |
| 平均函数长度 | 150 行 | 40 行 | -73% |
| 代码复用性 | 低 | 高 | ✓ |
| 可测试性 | 差 | 好 | ✓ |
| 维护难度 | 高 | 低 | ✓ |

---

## ✅ 迁移清单

- [ ] 1. 创建 Redux slices 文件
- [ ] 2. 创建 custom hooks 文件
- [ ] 3. 创建 modal 组件
- [ ] 4. 更新 store/index.ts 注册新 slices
- [ ] 5. 重写 App.tsx
- [ ] 6. 验证功能完整
- [ ] 7. 运行类型检查和 linting
- [ ] 8. 测试所有快捷键和事件
- [ ] 9. 删除或移动未使用的代码
- [ ] 10. 提交 PR 并审核

---

## 🚀 逐步实施建议

**不要一次性完成，分阶段进行：**

### 第 1 阶段（第 1 周）

1. 创建 appSlice 和 updateSlice
2. 提取 useAppInitialization hook

### 第 2 阶段（第 2 周）

3. 创建 AppModals.tsx 和分离 modal 组件
2. 提取 useAppEventHandlers hook

### 第 3 阶段（第 3 周）

5. 彻底重写 App.tsx
2. 全面测试和修复

---

## 💡 额外建议

1. **使用 Storybook 测试**：为所有 modal 组件添加 stories
2. **添加单元测试**：特别是 hooks 逻辑
3. **性能监控**：使用 React DevTools Profiler 验证
4. **版本控制**：为这个大重构创建单独的分支

---

## 📚 参考

- [Redux Toolkit 文档](https://redux-toolkit.js.org/)
- [React Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [App Composition](https://react.dev/learn/thinking-in-react)
