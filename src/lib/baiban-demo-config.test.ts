import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_BAIBAN_DEMO_CONFIG,
  parseStoredBaibanDemoConfig,
  serializeBaibanDemoConfig,
} from './baiban-demo-config'

test('parseStoredBaibanDemoConfig falls back to defaults when storage is empty or broken', () => {
  assert.deepEqual(parseStoredBaibanDemoConfig(null), DEFAULT_BAIBAN_DEMO_CONFIG)
  assert.deepEqual(parseStoredBaibanDemoConfig('{bad json'), DEFAULT_BAIBAN_DEMO_CONFIG)
})

test('parseStoredBaibanDemoConfig keeps saved values and fills missing fields from defaults', () => {
  const parsed = parseStoredBaibanDemoConfig(
    JSON.stringify({
      serviceUrl: 'http://192.168.1.8:3003',
      voice: 'longwan',
      text: '自定义文本',
    }),
  )

  assert.equal(parsed.serviceUrl, 'http://192.168.1.8:3003')
  assert.equal(parsed.voice, 'longwan')
  assert.equal(parsed.text, '自定义文本')
  assert.equal(parsed.aliyunApiKey, DEFAULT_BAIBAN_DEMO_CONFIG.aliyunApiKey)
  assert.equal(parsed.adjustAgentBaseUrl, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentBaseUrl)
  assert.equal(parsed.adjustAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentModel)
  assert.equal(parsed.controlAgentBaseUrl, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentBaseUrl)
  assert.equal(parsed.controlAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentModel)
  assert.equal(parsed.boardLines, DEFAULT_BAIBAN_DEMO_CONFIG.boardLines)
})

test('serializeBaibanDemoConfig outputs storable json', () => {
  const raw = serializeBaibanDemoConfig(DEFAULT_BAIBAN_DEMO_CONFIG)
  const reparsed = JSON.parse(raw)

  assert.equal(reparsed.serviceUrl, DEFAULT_BAIBAN_DEMO_CONFIG.serviceUrl)
  assert.equal(reparsed.voice, DEFAULT_BAIBAN_DEMO_CONFIG.voice)
  assert.equal(reparsed.adjustAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.adjustAgentModel)
  assert.equal(reparsed.controlAgentModel, DEFAULT_BAIBAN_DEMO_CONFIG.controlAgentModel)
})
