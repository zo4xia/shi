import path from 'path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:3001';
const prompt = process.argv[3] || '请只回复 OK，不要加任何解释。';
const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const projectRoot = path.normalize(path.join(scriptDir, '..'));
const cwd = process.argv[4] || projectRoot;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const startResponse = await fetch(`${baseUrl}/api/cowork/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt,
    cwd,
    title: `smoke-check-${Date.now()}`,
    activeSkillIds: [],
  }),
});

assert(startResponse.ok, `start session failed with ${startResponse.status}`);
const started = await startResponse.json();
assert(started.success && started.session?.id, 'start session returned no session');

let session = started.session;
for (let i = 0; i < 60; i += 1) {
  if (['completed', 'error', 'idle'].includes(session.status)) {
    break;
  }
  await sleep(2000);
  const sessionResponse = await fetch(`${baseUrl}/api/cowork/sessions/${session.id}`);
  assert(sessionResponse.ok, `get session failed with ${sessionResponse.status}`);
  const current = await sessionResponse.json();
  assert(current.success && current.session, 'get session returned no session');
  session = current.session;
}

const messages = Array.isArray(session.messages) ? session.messages : [];
const assistantMessages = messages.filter((message) => message.type === 'assistant');

console.log(JSON.stringify({
  success: true,
  baseUrl,
  sessionId: session.id,
  status: session.status,
  agentRoleKey: session.agentRoleKey,
  modelId: session.modelId,
  messageCount: messages.length,
  assistantMessageCount: assistantMessages.length,
  lastAssistant: assistantMessages.at(-1)?.content ?? null,
}, null, 2));

assert(session.status === 'completed', `session did not complete: ${session.status}`);
assert(assistantMessages.length > 0, 'assistant did not produce a reply');
