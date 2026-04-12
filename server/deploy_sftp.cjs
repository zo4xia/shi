const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const file1 = fs.readFileSync('libs/httpSessionExecutor.ts');
    let offset1 = 0;
    const stream1 = sftp.createWriteStream('/home/ubuntu/httpSessionExecutor.ts');
    stream1.write(file1);
    stream1.end();
    stream1.on('close', () => {
      console.log('Uploaded httpSessionExecutor.ts');
      const file2 = fs.readFileSync('libs/identityThreadHelper.ts');
      const stream2 = sftp.createWriteStream('/home/ubuntu/identityThreadHelper.ts');
      stream2.write(file2);
      stream2.end();
      stream2.on('close', () => {
         console.log('Uploaded identityThreadHelper.ts');
         conn.exec('sudo mv /home/ubuntu/*.ts /opt/uclaw/server/libs/ && cd /opt/uclaw/server && npm run build && sudo systemctl restart uclaw', (err, shell) => {
           if(err) throw err;
           shell.on('data', d => process.stdout.write(d.toString()))
                .on('close', () => conn.end())
                .stderr.on('data', d => process.stderr.write(d.toString()));
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
