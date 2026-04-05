const { io } = require('C:/Users/Administrator/Desktop/baiban/mini-services/handwriting-service/node_modules/socket.io-client');

const text = process.argv[2] || '我家的后面有一个很大的园。';
const socket = io('http://127.0.0.1:3003', {
  transports: ['websocket'],
});

const timer = setTimeout(() => {
  console.error(JSON.stringify({ type: 'timeout', message: 'generate-tts-timeline timed out' }, null, 2));
  socket.close();
  process.exit(1);
}, 60000);

socket.on('connect', () => {
  console.log(JSON.stringify({ type: 'connect', id: socket.id }, null, 2));
  socket.emit('generate-tts-timeline', { text });
});

socket.on('status', (data) => {
  console.log(JSON.stringify({ type: 'status', data }, null, 2));
});

socket.on('tts-timeline-ready', (data) => {
  console.log(
    JSON.stringify(
      {
        type: 'ready',
        requestId: data.requestId,
        audioUrl: data.audio?.url,
        sentenceCount: Array.isArray(data.sentences) ? data.sentences.length : 0,
        firstSentenceWords: data.sentences?.[0]?.words?.length ?? 0,
        firstSentence: data.sentences?.[0] ?? null,
      },
      null,
      2,
    ),
  );
  clearTimeout(timer);
  socket.close();
  process.exit(0);
});

socket.on('error', (data) => {
  console.error(JSON.stringify({ type: 'error', data }, null, 2));
  clearTimeout(timer);
  socket.close();
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error(JSON.stringify({ type: 'connect_error', message: err.message }, null, 2));
  clearTimeout(timer);
  socket.close();
  process.exit(1);
});
