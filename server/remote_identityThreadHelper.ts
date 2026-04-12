/**
 * ##混淆点注意：
 * 1. 这个文件不再维护独立实现。
 * 2. remote_identityThreadHelper 过去和现役 identityThreadHelper 出现过分叉，已经证明会污染边界判断。
 * 3. 现在这里退化为“兼容壳”：所有行为统一转到现役 `server/libs/identityThreadHelper.ts`。
 * 4. 如果要改 24h 线程/广播板/连续性逻辑，只改现役 helper，不要再在这里分叉。
 */

export * from './libs/identityThreadHelper';
