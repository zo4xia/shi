#!/usr/bin/env bash
# 前端代码质量检查脚本

set -e

echo "🔍 前端代码质量检查开始..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_status() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1"
    return 1
  fi
}

echo -e "${YELLOW}[1/5]${NC} 检查代码格式..."
npm run format:check
check_status "代码格式检查"

echo ""
echo -e "${YELLOW}[2/5]${NC} 执行 ESLint 规范检查..."
npm run lint
check_status "ESLint 规范检查"

echo ""
echo -e "${YELLOW}[3/5]${NC} 执行 TypeScript 类型检查..."
npx tsc --noEmit
check_status "TypeScript 类型检查"

echo ""
echo -e "${YELLOW}[4/5]${NC} 构建前端..."
npm run build:web
check_status "前端构建"

echo ""
echo -e "${YELLOW}[5/5]${NC} 检查构建输出大小..."
if [ -d "server/public" ]; then
  SIZE=$(du -sh server/public | awk '{print $1}')
  echo -e "${GREEN}✓${NC} 构建输出大小: $SIZE"
else
  echo -e "${RED}✗${NC} 构建输出目录不存在"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ 所有检查已完成！${NC}"
echo ""
echo "📊 检查摘要:"
echo "  • 代码格式 ✓"
echo "  • 规范检查 ✓"
echo "  • 类型检查 ✓"
echo "  • 构建验证 ✓"
echo "  • 体积检查 ✓"
