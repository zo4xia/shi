$ErrorActionPreference = 'Stop'
Import-Module Posh-SSH

$sec = ConvertTo-SecureString 'uV30ic*EFsSFY2ctH' -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential('ubuntu', $sec)
$ssh = New-SSHSession -ComputerName 43.156.84.242 -Credential $cred -AcceptKey -ConnectionTimeout 20

$commands = @(
  'set -e',
  'export DEBIAN_FRONTEND=noninteractive',
  'sudo apt-get update -y',
  'sudo apt-get install -y curl ca-certificates tar gzip build-essential',
  'if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -; sudo apt-get install -y nodejs; fi',
  'NODE_MAJOR=$(node -v | sed -E ''s/^v([0-9]+).*/\1/'')',
  'if [ "$NODE_MAJOR" -lt 20 ] || [ "$NODE_MAJOR" -ge 25 ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -; sudo apt-get install -y nodejs; fi',
  'sudo mkdir -p /opt/uclaw',
  'sudo chown -R ubuntu:ubuntu /opt/uclaw',
  'rm -rf /opt/uclaw/*',
  'tar -xzf /home/ubuntu/.deploy-sg.tar.gz -C /opt/uclaw',
  'cd /opt/uclaw',
  'npm ci',
  'npm run build:web',
  'npm run build:server || true',
  'test -f /opt/uclaw/server/dist/server/src/cli.js',
  'sudo mkdir -p /etc/uclaw',
  "printf '%s\\n' 'NODE_ENV=production' 'PORT=3001' 'CORS_ORIGIN=http://43.156.84.242:3001' 'UCLAW_DATA_PATH=.uclaw' 'UCLAW_API_BASE_URL=https://api.openai.com/v1' 'UCLAW_API_KEY=replace_me' 'UCLAW_DEFAULT_MODEL=gpt-5.4' | sudo tee /etc/uclaw/uclaw.env >/dev/null",
  "printf '%s\\n' '[Unit]' 'Description=UCLAW Web Server' 'After=network.target' '' '[Service]' 'Type=simple' 'User=ubuntu' 'Group=ubuntu' 'WorkingDirectory=/opt/uclaw' 'EnvironmentFile=/etc/uclaw/uclaw.env' 'ExecStart=/usr/bin/npm --prefix /opt/uclaw start' 'Restart=always' 'RestartSec=5' '' '[Install]' 'WantedBy=multi-user.target' | sudo tee /etc/systemd/system/uclaw.service >/dev/null",
  'sudo systemctl daemon-reload',
  'sudo systemctl enable --now uclaw',
  'sleep 3',
  'systemctl is-active uclaw',
  'curl -sS http://127.0.0.1:3001/health'
)

$remote = ($commands -join '; ')
$r = Invoke-SSHCommand -SessionId $ssh.SessionId -Command $remote -TimeOut 3600
$r.Output
if ($r.Error) { $r.Error }
Remove-SSHSession -SessionId $ssh.SessionId | Out-Null
