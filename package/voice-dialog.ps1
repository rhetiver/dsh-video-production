param([switch]$SelfTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
$dir = Join-Path $env:APPDATA 'dsh-video-production'
$keyFile = Join-Path $dir 'volcengine-key.dpapi'
$settingsFile = Join-Path $dir 'voice.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$catalog = [IO.File]::ReadAllText($env:DSH_VIDEO_CATALOG, $utf8) | ConvertFrom-Json
$settings = $null
if (Test-Path -LiteralPath $settingsFile) { $settings = [IO.File]::ReadAllText($settingsFile, $utf8) | ConvertFrom-Json }
$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="配音设置" Width="520" Height="540" MinWidth="460" MinHeight="500" WindowStartupLocation="CenterScreen" Background="#F7F8F6" FontFamily="Microsoft YaHei UI">
  <Grid Margin="24"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <ScrollViewer VerticalScrollBarVisibility="Auto"><StackPanel>
      <TextBlock Text="准备配音" FontSize="24" FontWeight="SemiBold" Foreground="#1F3028"/>
      <TextBlock Text="确认后按句生成配音，语音服务会产生用量。" Margin="0,8,0,18" TextWrapping="Wrap" Foreground="#607168"/>
      <TextBlock Text="火山引擎 API Key" FontWeight="SemiBold"/>
      <PasswordBox Name="ApiKey" Margin="0,6,0,0" Padding="8"/>
      <TextBlock Name="KeyHint" Margin="0,5,0,16" Foreground="#607168" TextWrapping="Wrap"/>
      <TextBlock Text="预设音色（豆包语音 2.0）" FontWeight="SemiBold"/>
      <ComboBox Name="Preset" Margin="0,6,0,5" Padding="7" MaxDropDownHeight="260" IsTextSearchEnabled="True"/>
      <TextBlock Text="音色 ID（也可手动填写）" FontWeight="SemiBold" Margin="0,10,0,0"/>
      <TextBox Name="Speaker" Margin="0,6,0,0" Padding="8"/>
      <TextBlock Text="语速（-50 至 100，0 为默认）" FontWeight="SemiBold" Margin="0,16,0,0"/>
      <DockPanel Margin="0,6,0,0"><TextBlock Name="RateValue" DockPanel.Dock="Right" Width="45" TextAlignment="Right"/><Slider Name="Rate" Minimum="-50" Maximum="100" TickFrequency="5" IsSnapToTickEnabled="True"/></DockPanel>
      <TextBlock Text="更换音色后请先试音并重测语速。" Foreground="#607168" Margin="0,7,0,0" TextWrapping="Wrap"/>
    </StackPanel></ScrollViewer>
    <StackPanel Grid.Row="1" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,18,0,0"><Button Name="Cancel" Content="取消" Width="86" Padding="8" Margin="0,0,10,0"/><Button Name="Confirm" Content="保存并开始配音" Padding="14,8" MinWidth="140" Background="#245943" Foreground="White"/></StackPanel>
  </Grid>
</Window>
'@
$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
$controls = @{}
@('ApiKey','KeyHint','Preset','Speaker','Rate','RateValue','Cancel','Confirm') | ForEach-Object { $controls[$_] = $window.FindName($_) }
foreach ($v in $catalog.voices) { $item = New-Object System.Windows.Controls.ComboBoxItem; $item.Content = "$($v.name) · $($v.scene)"; $item.Tag = [string]$v.id; [void]$controls.Preset.Items.Add($item) }
$controls.Preset.Add_SelectionChanged({ if ($controls.Preset.SelectedItem) { $controls.Speaker.Text = [string]$controls.Preset.SelectedItem.Tag } })
$controls.Rate.Add_ValueChanged({ $controls.RateValue.Text = [string][int]$controls.Rate.Value })
$controls.Rate.Value = if ($null -ne $settings -and $null -ne $settings.rate) { [int]$settings.rate } else { 0 }
$controls.RateValue.Text = [string][int]$controls.Rate.Value
if ($settings -and $settings.speaker) {
  $controls.Speaker.Text = [string]$settings.speaker
  foreach ($item in $controls.Preset.Items) { if ($item.Tag -ceq $settings.speaker) { $controls.Preset.SelectedItem = $item; break } }
} elseif ($controls.Preset.Items.Count -gt 0) { $controls.Preset.SelectedIndex = 0 }
$hasKey = (Test-Path -LiteralPath $keyFile) -or [bool]$env:VOLCENGINE_TTS_API_KEY
$controls.KeyHint.Text = if ($hasKey) { '已配置 Key；留空继续使用，填写新 Key 可替换。' } else { '首次使用请填写；Key 将加密保存在当前 Windows 用户下。' }
if ($SelfTest) { if ($controls.Preset.Items.Count -eq 0 -or -not $controls.Speaker.Text) { throw '音色目录加载失败' }; Write-Output '{"status":"selftest-ok"}'; return }
$script:keyChanged = $false
$controls.Cancel.Add_Click({ $window.DialogResult = $false })
$controls.Confirm.Add_Click({
  $speaker = $controls.Speaker.Text.Trim()
  if (-not $speaker) { [void][Windows.MessageBox]::Show('请选择或输入音色 ID。','配音设置'); return }
  if (-not $controls.ApiKey.Password -and -not $hasKey) { [void][Windows.MessageBox]::Show('请先输入火山引擎 API Key。','配音设置'); return }
  try {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    if ($controls.ApiKey.Password) { $secure = $controls.ApiKey.SecurePassword; [IO.File]::WriteAllText($keyFile, (ConvertFrom-SecureString $secure), [Text.Encoding]::ASCII); $script:keyChanged = $true }
    $value = @{speaker=$speaker; rate=[int]$controls.Rate.Value} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($settingsFile, $value, $utf8)
    $window.DialogResult = $true
  } catch { [void][Windows.MessageBox]::Show('设置保存失败，请检查本机用户配置目录的写入权限。','配音设置') }
})
$confirmed = $window.ShowDialog()
if ($confirmed -eq $true) { @{status='confirmed';keyChanged=$script:keyChanged} | ConvertTo-Json -Compress } else { Write-Output '{"status":"cancelled"}' }
