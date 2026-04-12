const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected.');
  const execCode = fs.readFileSync('libs/httpSessionExecutor.ts', 'base64');
  const helperCode = fs.readFileSync('libs/identityThreadHelper.ts', 'base64');

  conn.exec(`base64 --decode > /tmp/httpSessionExecutor.ts`, (err, stream1) => {
    if (err) throw err;
    stream1.write(execCode);
    stream1.end();
    stream1.on('close', () => {
      console.log('Uploaded 1.');
      conn.exec(`base64 --decode > /tmp/identityThreadHelper.ts`, (err, stream2) => {
        if (err) throw err;
        stream2.write(helperCode);
        stream2.end();
        stream2.on('close', () => {
          console.log('Uploaded 2.');
          conn.exec(`sudo mv /tmp/httpSessionExecutor.ts /opt/uclaw/server/libs/httpSessionExecutor.ts && sudo mv /tmp/identityThreadHelper.ts /opt/uclaw/server/libs/identityThreadHelper.ts && sudo chown ubuntu:ubuntu /opt/uclaw/server/libs/httpSessionExecutor.ts /opt/uclaw/server/libs/identityThreadHelper.ts && cd /opt/uclaw/server && npm run build && sudo systemctl restart uclaw`, (err, stream) => {
            if (err) throw err;
            stream.on('close', (code) => { console.log('Final Done:', code); conn.end(); })
                  .on('data', (d) => process.stdout.write(d))
                  .stderr.on('data', (d) => process.stderr.write(d));
          });
        });
      });
    });
  });
}).connect({
  host: '43.128.67.216',
  port: 22,
  username: 'ubuntu',
  password: 'z}DXz+Y&H+}0OM9-7'
});
