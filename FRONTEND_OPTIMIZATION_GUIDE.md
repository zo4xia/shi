# 前端优化维护指南

## 📋 优化完成项目

### 1. ✅ 代码规范化配置
- **ESLint 配置** (`.eslintrc.json`)
  - 严格的 TypeScript 类型检查
  - React Hooks 规则
  - 导入一致性检查
  - 命名规范约束
  - 异步操作安全检查（`no-floating-promises`, `no-misused-promises`）

- **Prettier 配置** (`.prettierrc.json`)
  - 统一代码格式
  - 100字符每行限制
  - 支持 TypeScript/JSX/CSS/JSON

- **Editor Config** (`.editorconfig`)
  - 跨编辑器配置统一
  - 保证缩进和换行一致

### 2. ✅ TypeScript 增强
- 启用 `exactOptionalPropertyTypes` - 更严格的可选属性检查
- 启用 `forceConsistentCasingInFileNames` - 文件名大小写一致性
- 启用 `esModuleInterop` 和 `allowSyntheticDefaultImports` - 模块兼容性
- 启用 `noImplicitReturns` - 函数必须有返回值

### 3. ✅ Vite 构建优化
- **改进的代码分割策略**
  - `react-vendor` - React 核心库 (~350KB)
  - `markdown-vendor` - Markdown 渲染库 (~400KB)
  - `ui-vendor` - UI 框架库 (~250KB)
  - `component-vendor` - UI 组件库

- **依赖预优化** - 关键依赖预打包，加速开发
- **构建日志优化** - 减少控制台噪音

### 4. ✅ Package.json 新增脚本
```json
"lint": "ESLint 静态检查，0 警告",
"lint:fix": "自动修复 ESLint 问题",
"format": "格式化 src 和 scripts 目录下的代码",
"format:check": "检查代码格式是否符合规范"
```

---

## 🏗️ 推荐的后续优化项目

### 高优先级 (立即处理)

#### 1. 拆分 App.tsx (1112 行 → 分散到模块)
**问题**: App.tsx 过大，难以维护
**建议方案**:
```
src/renderer/
├── App.tsx (核心容器，~200 行)
├── store/
│   ├── appSlice.ts (UI 状态：主视图、侧边栏、模态框等)
│   └── uiSlice.ts (新增：集中 UI 状态管理)
├── hooks/
│   ├── useAppInitialization.ts (初始化逻辑，~200 行)
│   ├── useAppEventHandlers.ts (事件处理，~150 行)
│   └── useUpdateChecker.ts (更新检查，~100 行)
└── components/
    ├── AppShell.tsx (布局容器，~100 行)
    └── AppModals.tsx (所有模态框组件)
```

#### 2. 移除类型重复定义
**问题**: `src/renderer/types/cowork.ts` 和 `src/renderer/types/electron.d.ts` 中有重复的内存类型

**建议**:
```bash
# 创建统一的类型文件
src/renderer/types/
├── cowork.ts (仅保留业务类型)
├── memory.ts (所有内存相关类型 - 新建或移动)
└── electron.d.ts (仅 Electron IPC 签名)
```

#### 3. 性能优化: 添加 React.memo 和 useMemo
**建议**:
- 大列表组件使用 `React.memo`
- 复杂计算结果使用 `useMemo`
- 回调函数使用 `useCallback`

示例:
```typescript
// src/renderer/components/CoworkSessionList.tsx
const SessionListItem = React.memo(({ session, onSelect }: Props) => {
  return <div>{session.title}</div>;
}, (prev, next) => 
  prev.session.id === next.session.id && 
  prev.onSelect === next.onSelect
);
```

#### 4. 添加模块路径别名
**建议**: 在 `tsconfig.json` 中添加常用路径
```jsonc
{
  "paths": {
    "@/*": ["src/renderer/*"],
    "@components/*": ["src/renderer/components/*"],
    "@hooks/*": ["src/renderer/hooks/*"],
    "@services/*": ["src/renderer/services/*"],
    "@store/*": ["src/renderer/store/*"],
    "@types/*": ["src/renderer/types/*"],
    "@utils/*": ["src/renderer/utils/*"]
  }
}
```

### 中优先级 (1-2周内)

#### 5. 添加单元测试覆盖
- 关键业务逻辑测试 (services)
- 组件单元测试 (使用 Vitest)
- 集成测试 (关键用户流程)

#### 6. 性能监控
```typescript
// src/renderer/utils/performance.ts
export const measureComponentRender = (name: string) => {
  const startTime = performance.now();
  return () => {
    const duration = performance.now() - startTime;
    console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
  };
};
```

#### 7. 添加 Storybook
- 组件库文档
- 交互式组件测试
- UI 一致性验证

### 低优先级 (优化项)

#### 8. 国际化 (i18n) 可选
如果需要多语言支持，推荐 `react-i18next`

#### 9. 深色模式完善
- 系统主题检测优化
- 主题过渡动画
- 存储用户偏好

#### 10. 无障碍访问 (a11y)
- ARIA 标签补全
- 键盘导航支持
- 屏幕阅读器测试

---

## 🔍 代码质量检查清单

在每次提交前，请运行:

```bash
# 1. 格式检查
npm run format:check

# 2. 静态分析
npm run lint

# 3. 构建验证
npm run build:web

# 4. 类型检查
npx tsc --noEmit
```

或使用一个命令完成全部检查:
```bash
npm run format:check && npm run lint && npx tsc --noEmit
```

---

## 📝 ESLint 常见解决方案

### 问题：`Do not create an object for prop types` 或 `@typescript-eslint/no-explicit-any`

**解决**:
```typescript
// ❌ 不推荐
const Component: React.FC<any> = (props) => <div>{props.text}</div>;

// ✅ 推荐
interface ComponentProps {
  text: string;
}

const Component: React.FC<ComponentProps> = ({ text }) => <div>{text}</div>;
```

### 问题：`Variable assigned a value, but never used`

**解决**:
```typescript
// 使用下划线前缀表示故意未使用的变量
const _unusedVariable = await somePromise(); // ESLint 会忽略

// 或配置 eslint 规则:
// "_.*": { "argsIgnorePattern": "^_" }
```

### 问题：`Promise returned from useEffect() is not valid`

**解决**:
```typescript
// ❌ 不推荐
useEffect(async () => {
  await fetchData();
}, []);

// ✅ 推荐
useEffect(() => {
  const loadData = async () => {
    await fetchData();
  };
  loadData();
}, []);
```

---

## 🚀 快速开始

### 安装依赖并运行规范检查
```bash
npm install
npm run format          # 格式化代码
npm run lint:fix       # 修复 ESLint 问题
npm run build:web      # 构建前端
```

### 配置 VS Code (推荐)

在 `.vscode/settings.json` 中添加:
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

### 推荐安装的 VS Code 扩展
- ESLint (@microsoft)
- Prettier
- TypeScript Vue Plugin
- EditorConfig

---

## 📚 参考资源

- [ESLint 文档](https://eslint.org/docs/)
- [Prettier 文档](https://prettier.io/)
- [TypeScript 严格模式](https://www.typescriptlang.org/tsconfig#strict)
- [Vite 优化指南](https://vitejs.dev/guide/features.html#code-splitting)
- [React 性能优化](https://react.dev/reference/react/memo)

---

**最后更新**: 2026-04-07
**下一次审查建议**: 2项高优先级完成后（~1周）
