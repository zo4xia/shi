import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '白板 TTS 时间轴演示台',
  description: '文本输入、音频生成、逐字时间轴预览与客户演示用最小闭环页面。',
};

export default function TtsTimelineLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
