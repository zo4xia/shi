@echo off
REM 前端代码质量检查脚本 (Windows 版本)

setlocal enabledelayedexpansion

echo 🔍 前端代码质量检查开始...
echo.

set "passed=0"
set "failed=0"

echo [1/5] 检查代码格式...
call npm run format:check
if %errorlevel% equ 0 (
  echo ✓ 代码格式检查
  set /a passed=passed+1
) else (
  echo ✗ 代码格式检查失败
  set /a failed=failed+1
)

echo.
echo [2/5] 执行 ESLint 规范检查...
call npm run lint
if %errorlevel% equ 0 (
  echo ✓ ESLint 规范检查
  set /a passed=passed+1
) else (
  echo ✗ ESLint 规范检查失败
  set /a failed=failed+1
)

echo.
echo [3/5] 执行 TypeScript 类型检查...
call npx tsc --noEmit
if %errorlevel% equ 0 (
  echo ✓ TypeScript 类型检查
  set /a passed=passed+1
) else (
  echo ✗ TypeScript 类型检查失败
  set /a failed=failed+1
)

echo.
echo [4/5] 构建前端...
call npm run build:web
if %errorlevel% equ 0 (
  echo ✓ 前端构建
  set /a passed=passed+1
) else (
  echo ✗ 前端构建失败
  set /a failed=failed+1
)

echo.
echo [5/5] 检查构建输出...
if exist "server\public" (
  for /f "tokens=*" %%a in ('dir /s /b server\public ^| find /c /v ""') do (
    set count=%%a
  )
  echo ✓ 构建输出文件数: !count!
  set /a passed=passed+1
) else (
  echo ✗ 构建输出目录不存在
  set /a failed=failed+1
)

echo.
if %failed% equ 0 (
  echo ✅ 所有检查已完成！
  echo.
  echo 📊 检查摘要:
  echo   • 代码格式 ✓
  echo   • 规范检查 ✓
  echo   • 类型检查 ✓
  echo   • 构建验证 ✓
  echo   • 体积检查 ✓
  exit /b 0
) else (
  echo ❌ 检查失败！
  echo 通过: %passed% 个
  echo 失败: %failed% 个
  exit /b 1
)
