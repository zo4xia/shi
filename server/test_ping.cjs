const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  console.log('Connected!');
  conn.exec('echo hello', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => { conn.end(); })
          .on('data', (d) => console.log('OUT:', d.toString()));
  });
}).on('error', (err) => {
  console.log('ERR:', err);
}).connect({
  host: '43.128.67.216',
  port: 22,
  username: 'ubuntu',
  password: 'z}DXz+Y&H+}0OM9-7'
});
