cd /opt/uclaw/server/libs
sed -i 's/const BOUNDED_LOOP_MAX_STEPS = 10;/const BOUNDED_LOOP_MAX_STEPS = 9999;/' httpSessionExecutor.ts
sed -i 's/const BOUNDED_LOOP_MAX_DURATION_MS = 90_000;/const BOUNDED_LOOP_MAX_DURATION_MS = 9000000;/' httpSessionExecutor.ts

# Fix identityThreadHelper
sed -i 's/channelHint?: string/channelHint?: string,\\n  sessionId?: string/' identityThreadHelper.ts
sed -i 's/channelHint);/channelHint, sessionId);/' identityThreadHelper.ts

# Fix httpSessionExecutor sessionId
sed -i 's/const agentRoleKey = session.agentRoleKey?.trim();/const agentRoleKey = session.agentRoleKey?.trim();\n    const sessionId = session.id;/' httpSessionExecutor.ts
sed -i 's/channelHint\n    );/channelHint,\n      sessionId\n    );/' httpSessionExecutor.ts

cd /opt/uclaw/server
npm run build && sudo systemctl restart uclaw
