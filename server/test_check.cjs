const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cat /opt/uclaw/server/tsconfig.json | grep outDir`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => { conn.end(); })
          .on('data', (d) => process.stdout.write(d.toString()))
          .stderr.on('data', (d) => process.stderr.write(d.toString()));
  });
}).connect({
  host: '43.128.67.216',
  port: 22,
  username: 'ubuntu',
  password: 'z}DXz+Y&H+}0OM9-7'
});
