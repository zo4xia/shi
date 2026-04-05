import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTtsAudioProxyUrl, getSafeRemoteAudioUrl } from './tts-audio';

test('buildTtsAudioProxyUrl encodes remote audio source for local playback', () => {
  const source =
    'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/demo.wav?Expires=1&Signature=abc%2F123';

  const proxyUrl = buildTtsAudioProxyUrl(source);

  assert.equal(
    proxyUrl,
    '/api/tts-audio?source=http%3A%2F%2Fdashscope-result-bj.oss-cn-beijing.aliyuncs.com%2Fdemo.wav%3FExpires%3D1%26Signature%3Dabc%252F123',
  );
});

test('getSafeRemoteAudioUrl accepts only http and https sources', () => {
  assert.equal(getSafeRemoteAudioUrl('https://example.com/audio.wav'), 'https://example.com/audio.wav');
  assert.equal(getSafeRemoteAudioUrl('http://example.com/audio.wav'), 'http://example.com/audio.wav');
  assert.equal(getSafeRemoteAudioUrl('file:///tmp/audio.wav'), null);
  assert.equal(getSafeRemoteAudioUrl('javascript:alert(1)'), null);
  assert.equal(getSafeRemoteAudioUrl('not-a-url'), null);
});
