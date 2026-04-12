const { Client } = require('ssh2');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to remote server...');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    
    // Read the fixed local files
    const executorCode = path.resolve(__dirname, 'libs/httpSessionExecutor.ts');
    const identityCode = path.resolve(__dirname, 'libs/identityThreadHelper.ts');

    console.log('Uploading httpSessionExecutor.ts to home dir...', executorCode);
    sftp.fastPut(executorCode, '/home/ubuntu/httpSessionExecutor.ts', (err) => {
      if (err) { console.error(err); return conn.end(); }
      
      console.log('Uploading identityThreadHelper.ts to home dir...', identityCode);
      sftp.fastPut(identityCode, '/home/ubuntu/identityThreadHelper.ts', (err) => {
         if (err) { console.error(err); return conn.end(); }
         console.log('Uploads complete.');
         
         const restartCmd = `
           sudo mv /home/ubuntu/httpSessionExecutor.ts /opt/uclaw/server/libs/httpSessionExecutor.ts &&
           sudo mv /home/ubuntu/identityThreadHelper.ts /opt/uclaw/server/libs/identityThreadHelper.ts &&
           sudo chown ubuntu:ubuntu /opt/uclaw/server/libs/httpSessionExecutor.ts /opt/uclaw/server/libs/identityThreadHelper.ts &&
           cd /opt/uclaw/server && 
           npm run build && 
           sudo systemctl restart uclaw
         `;
         console.log('Executing mv, build and restart...');
         
         conn.exec(restartCmd, (err, stream) => {
           if (err) throw err;
           stream.on('close', (code, signal) => {
             console.log('Done with code:', code);
             conn.end();
           }).on('data', (data) => {
             process.stdout.write(data);
           }).stderr.on('data', (data) => {
             process.stderr.write(data);
           });
         });
      });
    });
  });
}).on('error', (err) => {
  console.error('Connection Error:', err);
}).connect({
  host: '43.128.67.216',
  port: 22,
  username: 'ubuntu',
  password: 'z}DXz+Y&H+}0OM9-7'
});
