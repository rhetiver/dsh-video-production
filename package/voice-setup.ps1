$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:APPDATA 'dsh-video-production'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$secret = Read-Host '请输入火山引擎 API Key（输入不会显示）' -AsSecureString
if ($secret.Length -eq 0) { throw '未输入 API Key。' }
$cipher = ConvertFrom-SecureString $secret
$dest = Join-Path $dir 'volcengine-key.dpapi'
[IO.File]::WriteAllText($dest, $cipher, [Text.Encoding]::ASCII)
Write-Output 'API Key 已加密保存到当前 Windows 用户配置。'
