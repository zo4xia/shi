import { NextRequest, NextResponse } from 'next/server';

import { getSafeRemoteAudioUrl } from '@/lib/tts-audio';

export const dynamic = 'force-dynamic';

const PASSTHROUGH_HEADERS = [
  'content-type',
  'content-length',
  'accept-ranges',
  'content-range',
  'content-disposition',
  'etag',
  'last-modified',
] as const;

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('source') || '';
  const safeSource = getSafeRemoteAudioUrl(source);

  if (!safeSource) {
    return NextResponse.json({ message: '非法音频地址' }, { status: 400 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get('range');
  if (range) {
    upstreamHeaders.set('range', range);
  }

  const upstream = await fetch(safeSource, {
    method: 'GET',
    headers: upstreamHeaders,
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text().catch(() => '');
    return NextResponse.json(
      {
        message: `音频代理失败: HTTP ${upstream.status}${message ? ` ${message}` : ''}`.trim(),
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const header of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }
  responseHeaders.set('cache-control', 'no-store');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
