Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$workbenchDir = $PSScriptRoot
$script:projectRoot = $null
$script:mode = 'script'
$workerFile = Join-Path $workbenchDir 'worker.mjs'
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$utf8 = New-Object System.Text.UTF8Encoding($false)
[xml]$xaml = [IO.File]::ReadAllText((Join-Path $workbenchDir 'workbench.xaml'), $utf8)
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$ui = @{}
@('Segments','SegmentCount','SegmentTitle','Editor','SegmentInfo','SaveButton','GenerateButton','PlayButton','StopButton','ReloadButton','VideoCuesButton','SyncCuesButton','ImportDraftButton','ApiKey','Speaker','VoicePreset','Rate','RateValue','GenerateAllButton','ManifestButton','ClearVoiceButton','Status','Progress','ChooseProjectButton','ProjectPath') | ForEach-Object { $ui[$_] = $window.FindName($_) }
$voiceCatalog = [IO.File]::ReadAllText((Join-Path $workbenchDir 'voices-2.0.json'), $utf8) | ConvertFrom-Json
foreach ($voice in $voiceCatalog.voices) {
    $option = New-Object System.Windows.Controls.ComboBoxItem
    $option.Content = $voice.name + '  ·  ' + $voice.scene
    $option.Tag = $voice.id
    [void]$ui.VoicePreset.Items.Add($option)
}
$ui.VoicePreset.Add_SelectionChanged({ if ($ui.VoicePreset.SelectedItem) { $ui.Speaker.Text = [string]$ui.VoicePreset.SelectedItem.Tag } })
$ui.Speaker.Add_TextChanged({ if ($ui.VoicePreset.SelectedItem -and $ui.Speaker.Text -cne [string]$ui.VoicePreset.SelectedItem.Tag) { $ui.VoicePreset.SelectedIndex = -1 } })
$ui.VoicePreset.SelectedIndex = 0
$player = New-Object System.Windows.Media.MediaPlayer
$script:segments = @()
$script:current = $null
$script:busy = $false
$script:queue = New-Object System.Collections.ArrayList
$script:process = $null
$script:jobPath = $null
$script:resultPath = $null
$script:pendingItem = $null
$script:autoBuild = $false

function Set-Status([string]$message) { $ui.Status.Text = $message }
function Write-Json([string]$destination, $value) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    $json = ConvertTo-Json -InputObject $value -Depth 20
    [IO.File]::WriteAllText($destination, $json, $utf8)
}
function Save-Project { Write-Json $script:projectFile @{version=1; mode=$script:mode; source=$scriptPath; segments=@($script:segments)} }
function Import-Script {
    $raw = [IO.File]::ReadAllText($scriptPath, $utf8) -replace "`r`n", "`n"
    $raw = $raw -replace '(?s)<!--.*?-->', ''
    $section = '开场'; $items = New-Object System.Collections.ArrayList
    $numberedBeats = $raw -match '(?m)^\*\*\d{2}-\d{2}\*\*\s*'
    foreach ($block in ($raw -split "`n\s*`n")) {
        $block = $block.Trim()
        if (-not $block) { continue }
        if ($block.StartsWith('# ')) { continue }
        if ($block.StartsWith('## ')) { $section = $block.Substring(3).Trim(); continue }
        $text = ($block -replace "`n", ' ').Trim()
        if ($numberedBeats) {
            if ($text -notmatch '^\*\*\d{2}-\d{2}\*\*\s*') { continue }
            $text = ($text -replace '^\*\*\d{2}-\d{2}\*\*\s*', '').Trim()
        }
        if ($text -match '^[-*_\s]+$') { continue }
        if ($text) { $id = 'segment-{0:D3}' -f ($items.Count + 1); [void]$items.Add([pscustomobject]@{id=$id; section=$section; text=$text; audio=$null}) }
    }
    return ,@($items)
}
function Is-Current($item) {
    if (-not $item -or -not $item.audio) { return $false }
    $file = Join-Path $audioDir ($item.id + '.mp3')
    return ((Test-Path -LiteralPath $file) -and $item.audio.text -ceq $item.text -and $item.audio.speaker -ceq $ui.Speaker.Text.Trim() -and [int]$item.audio.rate -eq [int]$ui.Rate.Value)
}
function Refresh-List([int]$selected = -1) {
    $ui.Segments.Items.Clear()
    for ($i=0; $i -lt $script:segments.Count; $i++) {
        $item=$script:segments[$i]; $state = if (Is-Current $item) { '已生成' } elseif ($item.audio) { '需重新生成' } else { '待生成' }
        $prefix = '{0:D2}' -f ($i+1); $preview = $item.text -replace '\s+', ' '; if ($preview.Length -gt 30) { $preview = $preview.Substring(0,30) + '…' }
        [void]$ui.Segments.Items.Add("$prefix  $($item.section)`n$state  ·  $preview")
    }
    $modeLabel=if($script:mode -eq 'video-cues'){'画面字幕对齐'}else{'脚本分段'}
    $ui.SegmentCount.Text = "$($script:segments.Count) 个片段  ·  $modeLabel"
    if ($selected -ge 0 -and $selected -lt $script:segments.Count) { $ui.Segments.SelectedIndex=$selected }
}
function Save-Current {
    if ($null -eq $script:current) { return }
    $script:current.text=$ui.Editor.Text.Trim()
    Save-Project
}
function Show-Current {
    $idx=$ui.Segments.SelectedIndex
    if ($idx -lt 0 -or $idx -ge $script:segments.Count) { return }
    $script:current=$script:segments[$idx]
    $ui.SegmentTitle.Text = ('{0:D2}  /  {1}' -f ($idx+1), $script:current.section)
    $ui.Editor.Text=$script:current.text
    $stateText = if (Is-Current $script:current) { '音频已生成  ·  {0:N1} 秒' -f [double]$script:current.audio.duration } elseif ($script:current.audio) { '文字、音色或语速已变更；请重新生成。' } else { '尚未生成音频' }
    $ui.SegmentInfo.Text = if ($script:mode -eq 'video-cues') { ('原画面 {0:N2}—{1:N2} 秒  ·  ' -f ($script:current.startFrame/30),($script:current.endFrame/30)) + $stateText } else { $stateText }
}
function Lock-UI([bool]$locked) {
    $script:busy=$locked
    foreach($name in @('Segments','Editor','SaveButton','GenerateButton','GenerateAllButton','ReloadButton','VideoCuesButton','ManifestButton','ClearVoiceButton','Speaker','VoicePreset','Rate','ApiKey','PlayButton','ChooseProjectButton')) { $ui[$name].IsEnabled = -not $locked }
    $ui.SyncCuesButton.IsEnabled = (-not $locked -and $script:mode -eq 'video-cues')
    $ui.ImportDraftButton.IsEnabled = (-not $locked -and $script:mode -eq 'video-cues' -and (Test-Path -LiteralPath (Join-Path $projectDataDir 'subtitle-segments.节奏优化.json')))
    $ui.VideoCuesButton.IsEnabled = (-not $locked -and (Test-Path -LiteralPath $script:cueExtractor -PathType Leaf) -and (Test-Path -LiteralPath $script:timelineBuilder -PathType Leaf))
}
function Create-VideoPreview {
    try {
        $result=(& $nodeExe $timelineBuilder $script:projectFile | Out-String)
        if($LASTEXITCODE -ne 0){throw '对齐清单生成失败，请检查画面字幕是否已变更。'}
        $data=$result|ConvertFrom-Json
        Set-Status ('已接入当前视频预览：{0:N1} 秒；请刷新 Remotion 预览。' -f ($data.durationInFrames/30))
    } catch { Set-Status ('创建失败：'+$_.Exception.Message) }
}
function Start-Next {
    if ($script:queue.Count -eq 0) { Lock-UI $false; $ui.Progress.Text=''; Set-Status '生成完成。'; Refresh-List $ui.Segments.SelectedIndex; if($script:autoBuild -and $script:mode -eq 'video-cues'){ $script:autoBuild=$false; Create-VideoPreview }; return }
    $item=$script:queue[0]; $script:queue.RemoveAt(0); $script:pendingItem=$item
    $ui.Progress.Text="剩余 $($script:queue.Count) 段"; Set-Status "正在生成 $($item.id)…"
    $tempBase=Join-Path ([IO.Path]::GetTempPath()) ('voice-workbench-' + [guid]::NewGuid().ToString('N'))
    $script:jobPath=$tempBase+'.job.json'; $script:resultPath=$tempBase+'.result.json'
    Write-Json $script:jobPath @{id=$item.id;text=$item.text;speaker=$ui.Speaker.Text.Trim();rate=[int]$ui.Rate.Value;audioDir=$audioDir}
    $start=New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName=$nodeExe
    $start.Arguments='"{0}" "{1}" "{2}"' -f $workerFile,$script:jobPath,$script:resultPath
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.EnvironmentVariables['VOLCENGINE_TTS_API_KEY']=$ui.ApiKey.Password
    try { $script:process=[Diagnostics.Process]::Start($start) } catch { Lock-UI $false; $script:queue.Clear(); Set-Status ('启动失败：'+$_.Exception.Message) }
}
function Begin-Generation([bool]$all) {
    if ($script:busy) { return }
    Save-Current
    if (-not $ui.ApiKey.Password) { Set-Status '请先填写火山引擎 API Key。'; return }
    if (-not $ui.Speaker.Text.Trim()) { Set-Status '请先填写音色 ID。'; return }
    $player.Stop(); $player.Close(); $script:queue.Clear(); $script:autoBuild=($all -and $script:mode -eq 'video-cues')
    if ($all) { foreach($item in $script:segments) { if ($item.text -and -not (Is-Current $item)) { [void]$script:queue.Add($item) } } }
    elseif ($script:current -and $script:current.text) { [void]$script:queue.Add($script:current) }
    if ($script:queue.Count -eq 0) { if ($script:autoBuild) { Create-VideoPreview } else { Set-Status '没有需要生成的片段。' }; return }
    Lock-UI $true; Start-Next
}
$timer=New-Object Windows.Threading.DispatcherTimer
$timer.Interval=[TimeSpan]::FromMilliseconds(350)
$timer.Add_Tick({
    if (-not $script:busy -or -not $script:process -or -not $script:process.HasExited) { return }
    $result=$null
    try { if(Test-Path -LiteralPath $script:resultPath) { $result=[IO.File]::ReadAllText($script:resultPath,$utf8) | ConvertFrom-Json } } catch { $result=$null }
    if (Test-Path -LiteralPath $script:jobPath) { Remove-Item -LiteralPath $script:jobPath -Force }
    if (Test-Path -LiteralPath $script:resultPath) { Remove-Item -LiteralPath $script:resultPath -Force }
    $script:process.Dispose(); $script:process=$null
    if (-not $result -or -not $result.ok) { $errorMessage=if($result){$result.error}else{'未收到生成结果，请检查网络、Node 和 ffprobe。'}; $script:queue.Clear(); Lock-UI $false; Set-Status "生成失败：$errorMessage"; return }
    $script:pendingItem.audio=[pscustomobject]@{duration=$result.duration;text=$result.text;speaker=$result.speaker;rate=$result.rate;timestamps=$result.sentences}
    Save-Project
    Start-Next
})
$ui.Segments.Add_SelectionChanged({ if ($null -ne $script:current) { Save-Current }; Show-Current })
$ui.SaveButton.Add_Click({ $idx=$ui.Segments.SelectedIndex; Save-Current; Refresh-List $idx; Set-Status '片段文字已保存。' })
$ui.GenerateButton.Add_Click({ Begin-Generation $false })
$ui.GenerateAllButton.Add_Click({ Begin-Generation $true })
$ui.StopButton.Add_Click({ $player.Stop(); Set-Status '已停止试听。' })
$ui.ClearVoiceButton.Add_Click({
    if($script:busy -or -not $script:projectRoot){return}
    $message="将删除当前项目的工作台配音、时间戳和配音清单，并重置草稿中的音频状态。口播文字和视频画面会保留。`n`n项目：$script:projectRoot`n`n此操作不可撤销，是否继续？"
    if([Windows.MessageBox]::Show($message,'清除当前项目配音','YesNo','Warning') -ne 'Yes'){return}
    try {
        Save-Current; $player.Stop(); $player.Close()
        $output=(& $nodeExe (Join-Path $workbenchDir 'clear-voice.mjs') $script:projectRoot | Out-String)
        if($LASTEXITCODE -ne 0){throw '清除失败，请检查其他程序是否正在使用配音文件。'}
        $result=$output|ConvertFrom-Json
        foreach($item in $script:segments){$item.audio=$null}
        $idx=$ui.Segments.SelectedIndex; $script:current=$null; Refresh-List $idx
        Set-Status "已清除 $($result.files) 个音频及时间文件，重置 $($result.drafts) 个草稿。"
    } catch { Set-Status ('清除失败：'+$_.Exception.Message) }
})
$ui.PlayButton.Add_Click({ if(-not (Is-Current $script:current)){Set-Status '当前音频不存在或已过期，请先生成。';return}; $player.Open([Uri](Join-Path $audioDir ($script:current.id+'.mp3')));$player.Play();Set-Status '正在试听当前段。' })
$ui.Rate.Add_ValueChanged({ $ui.RateValue.Text=[string][int]$ui.Rate.Value })
$ui.VideoCuesButton.Add_Click({
    Save-Current
    try {
        if(Test-Path -LiteralPath $cueProjectFile) { $fresh=[IO.File]::ReadAllText($cueProjectFile,$utf8)|ConvertFrom-Json }
        else { $raw=(& $nodeExe $cueExtractor | Out-String); if($LASTEXITCODE -ne 0){throw '画面字幕提取失败'}; $fresh=$raw|ConvertFrom-Json }
        $script:current=$null; $script:projectFile=$cueProjectFile; $script:mode='video-cues'; $script:segments=@($fresh.segments)
        $ui.ManifestButton.Content='创建画面配音对齐预览'; $ui.ReloadButton.Content='切回脚本分段'; $ui.SyncCuesButton.IsEnabled=$true; $ui.ImportDraftButton.IsEnabled=(Test-Path -LiteralPath (Join-Path $projectDataDir 'subtitle-segments.节奏优化.json')); Save-Project; Refresh-List 0
        Set-Status '已载入画面字幕；配音文字可编辑，字幕与配音使用同一文字。'
    } catch { Set-Status ('导入失败：'+$_.Exception.Message) }
})
$ui.SyncCuesButton.Add_Click({
    if($script:mode -ne 'video-cues'){return}
    Save-Current
    try {
        $raw=(& $nodeExe $cueExtractor | Out-String); if($LASTEXITCODE -ne 0){throw '画面字幕提取失败'}; $fresh=$raw|ConvertFrom-Json
        $backup=Join-Path $projectDataDir ('subtitle-segments.backup-'+[guid]::NewGuid().ToString('N')+'.json')
        Copy-Item -LiteralPath $cueProjectFile -Destination $backup
        $oldById=@{}; foreach($old in $script:segments){$oldById[$old.id]=$old}
        foreach($item in $fresh.segments){$old=$oldById[$item.id]; if($old -and $old.sourceText -ceq $item.sourceText){$item.text=$old.text;$item.audio=$old.audio}}
        $script:current=$null; $script:segments=@($fresh.segments); Save-Project; Refresh-List 0
        Set-Status '已刷新字幕；未变化片段保留编辑与配音，旧草稿已备份。'
    } catch { Set-Status ('刷新失败：'+$_.Exception.Message) }
})
$ui.ImportDraftButton.Add_Click({
    if ($script:mode -ne 'video-cues') { return }
    Save-Current
    try {
        $draftPath=Join-Path $projectDataDir 'subtitle-segments.节奏优化.json'
        $draft=[IO.File]::ReadAllText($draftPath,$utf8)|ConvertFrom-Json
        $raw=(& $nodeExe $cueExtractor | Out-String); if($LASTEXITCODE -ne 0){throw '画面字幕提取失败'}; $source=$raw|ConvertFrom-Json
        if($draft.segments.Count -ne $source.segments.Count -or $script:segments.Count -ne $source.segments.Count){throw '画面字幕数量已变化，不能直接应用草稿。'}
        for($i=0;$i -lt $source.segments.Count;$i++) {
            $a=$draft.segments[$i]; $b=$source.segments[$i]; $c=$script:segments[$i]
            if($a.id -cne $b.id -or $a.sourceText -cne $b.sourceText -or $a.startFrame -ne $b.startFrame -or $a.endFrame -ne $b.endFrame -or $c.id -cne $b.id -or $c.sourceText -cne $b.sourceText -or $c.startFrame -ne $b.startFrame -or $c.endFrame -ne $b.endFrame){throw "第 $($i+1) 段画面字幕已变化，不能直接应用草稿。"}
        }
        $backup=Join-Path $projectDataDir ('subtitle-segments.before-rhythm-'+[guid]::NewGuid().ToString('N')+'.json')
        Copy-Item -LiteralPath $script:projectFile -Destination $backup
        $changed=0
        for($i=0;$i -lt $script:segments.Count;$i++){if($script:segments[$i].text -cne $draft.segments[$i].text){$script:segments[$i].text=$draft.segments[$i].text;$changed++}}
        $script:current=$null; Save-Project; Refresh-List 0
        Set-Status "已应用节奏优化稿：修改 $changed 段，旧草稿已备份；请重新生成待处理片段。"
    } catch { Set-Status ('应用优化稿失败：'+$_.Exception.Message) }
})
$ui.ReloadButton.Add_Click({
    if($script:mode -eq 'video-cues') { Save-Current; $script:current=$null; $script:projectFile=Join-Path $projectDataDir 'segments.json'; $script:mode='script'; $saved=[IO.File]::ReadAllText($script:projectFile,$utf8)|ConvertFrom-Json; $script:segments=@($saved.segments); $ui.ManifestButton.Content='生成 Remotion 音频清单'; $ui.ReloadButton.Content='从脚本重新导入'; $ui.SyncCuesButton.IsEnabled=$false; $ui.ImportDraftButton.IsEnabled=$false; Refresh-List 0; Set-Status '已切回脚本分段，画面字幕草稿已保留。'; return }
    if([Windows.MessageBox]::Show('重新导入会替换当前分段草稿。已有音频文件不会删除。是否继续？','重新导入','YesNo','Question') -eq 'Yes') { $script:segments=Import-Script; Save-Project; Refresh-List 0; Set-Status '已重新导入脚本。' }
})
$ui.ManifestButton.Add_Click({
    Save-Current; $missing=@($script:segments | Where-Object { -not (Is-Current $_) })
    if ($missing.Count) { Set-Status "还有 $($missing.Count) 段没有当前版本音频；请先生成。"; return }
    if ($script:mode -eq 'video-cues') {
        Create-VideoPreview
        return
    }
    $time=0.0; $entries=New-Object System.Collections.ArrayList
    foreach($item in $script:segments) { [void]$entries.Add(@{id=$item.id;section=$item.section;text=$item.text;src="audio/voice-workbench/$($item.id).mp3";timestamps="audio/voice-workbench/$($item.id).timestamps.json";startSeconds=[math]::Round($time,3);durationSeconds=[math]::Round([double]$item.audio.duration,3)}); $time += [double]$item.audio.duration + .35 }
    Write-Json (Join-Path $audioDir 'manifest.json') @{version=1;gapSeconds=.35;totalSeconds=[math]::Round(($time-.35),3);segments=@($entries)}
    Set-Status ('已生成音频清单，总时长约 {0:N1} 秒；尚未自动调整视频。' -f ($time-.35))
})
$window.Add_Closing({ if($script:busy){$_.Cancel=$true;Set-Status '生成进行中，请等待当前队列结束后关闭。';return};Save-Current;$timer.Stop();$player.Close() })
function Open-Project([string]$folder) {
    $resolved=(Resolve-Path -LiteralPath $folder -ErrorAction Stop).Path
    $newScript=Join-Path $resolved 'script/script.md'
    $newRemotion=Join-Path $resolved 'production/remotion'
    if (-not (Test-Path -LiteralPath $newScript -PathType Leaf)) { throw '项目缺少 script/script.md，请选择视频项目根目录。' }
    if (-not (Test-Path -LiteralPath $newRemotion -PathType Container)) { throw '项目缺少 production/remotion，请选择视频项目根目录。' }
    $newData=Join-Path $resolved 'production/配音工作台'
    $newProjectFile=Join-Path $newData 'segments.json'
    if (Test-Path -LiteralPath $newProjectFile) { $loaded=[IO.File]::ReadAllText($newProjectFile,$utf8)|ConvertFrom-Json; if ($null -eq $loaded.segments) { throw '项目配音草稿格式无效。' } } else { $loaded=$null }
    if ($script:projectRoot) { Save-Current }
    $player.Stop(); $player.Close(); $script:current=$null
    $script:projectRoot=$resolved; $script:scriptPath=$newScript; $script:remotionRoot=$newRemotion
    $script:projectDataDir=$newData; $script:audioDir=Join-Path $newRemotion 'public/audio/voice-workbench'
    $script:projectFile=$newProjectFile; $script:cueProjectFile=Join-Path $newData 'subtitle-segments.json'
    $script:cueExtractor=Join-Path $newRemotion 'tools/extract-video-cues.cjs'; $script:timelineBuilder=Join-Path $newRemotion 'tools/build-dubbed-timeline.cjs'
    $script:mode='script'
    if ($loaded) { $script:segments=@($loaded.segments) } else { $script:segments=Import-Script; Save-Project }
    $ui.ProjectPath.Text=$resolved; $window.Title='配音工作台 · '+(Split-Path $resolved -Leaf)
    $ui.ManifestButton.Content='生成 Remotion 音频清单'; $ui.ReloadButton.Content='从脚本重新导入'; $ui.SyncCuesButton.IsEnabled=$false; $ui.ImportDraftButton.IsEnabled=$false
    $ui.VideoCuesButton.IsEnabled=(Test-Path -LiteralPath $script:cueExtractor -PathType Leaf) -and (Test-Path -LiteralPath $script:timelineBuilder -PathType Leaf)
    Refresh-List 0
    if ($ui.VideoCuesButton.IsEnabled) { Set-Status '项目已打开，可导入画面字幕或使用脚本分段。' } else { Set-Status '项目已打开。该项目尚未接入画面字幕对齐，可使用脚本分段配音。' }
}
function Select-Project {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description='选择包含 script 和 production/remotion 的视频项目根目录'; $dialog.ShowNewFolderButton=$false
    if ($script:projectRoot) { $dialog.SelectedPath=$script:projectRoot } else { $dialog.SelectedPath=Join-Path (Split-Path $workbenchDir -Parent) 'project' }
    try { if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { try { Open-Project $dialog.SelectedPath } catch { [Windows.MessageBox]::Show($_.Exception.Message,'无法打开项目','OK','Warning') | Out-Null } } } finally { $dialog.Dispose() }
}
$ui.ChooseProjectButton.Add_Click({ Select-Project })
if ($env:VOICE_WORKBENCH_TEST_PROJECT) { Open-Project $env:VOICE_WORKBENCH_TEST_PROJECT } else { Select-Project }
if (-not $script:projectRoot) { return }
if ($env:VOICE_WORKBENCH_VOICETEST -eq '1') {
    for ($i=0; $i -lt $voiceCatalog.voices.Count; $i++) {
        $ui.VoicePreset.SelectedIndex=$i
        if ($ui.Speaker.Text -cne $voiceCatalog.voices[$i].id) { throw "音色预设映射错误：$i" }
    }
    $ui.Speaker.Text='custom_voice_id'
    if ($ui.VoicePreset.SelectedIndex -ne -1 -or $ui.Speaker.Text -cne 'custom_voice_id') { throw '手动输入音色 ID 失败' }
    Write-Output "OK: $($voiceCatalog.voices.Count) voice mappings and manual ID"; return
}
if ($env:VOICE_WORKBENCH_IMPORTTEST -eq '1') {
    $ui.VideoCuesButton.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent)))
    if($script:segments.Count -ne 38 -or $script:segments[0].text -notmatch '公开') { throw "字幕导入失败：$($ui.Status.Text)" }
    Write-Output "OK: $($script:segments.Count) video cues; first=$($script:segments[0].text)"; return
}
if ($env:VOICE_WORKBENCH_FLOWTEST -eq '1') {
    $expectedScript=if($env:VOICE_WORKBENCH_EXPECTED_SCRIPT){[int]$env:VOICE_WORKBENCH_EXPECTED_SCRIPT}else{25}
    if($script:segments.Count -ne $expectedScript -or $script:segments[0].text -match '<!--') { throw '脚本导入未正确处理节拍标记' }
    $ui.VideoCuesButton.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent)))
    $expected=if($env:VOICE_WORKBENCH_EXPECTED_CUES){[int]$env:VOICE_WORKBENCH_EXPECTED_CUES}else{5}
    if($script:segments.Count -ne $expected -or $script:mode -ne 'video-cues') { throw '画面字幕导入失败' }
    $ui.SyncCuesButton.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent)))
    if($ui.Status.Text -notmatch '已刷新字幕') { throw ('刷新失败：'+$ui.Status.Text) }
    if(-not $ui.ImportDraftButton.IsEnabled) { throw '优化稿按钮未启用' }
    $ui.ImportDraftButton.RaiseEvent((New-Object System.Windows.RoutedEventArgs([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent)))
    if($ui.Status.Text -notmatch '已应用节奏优化稿：修改 [1-9]') { throw ('优化稿应用失败：'+$ui.Status.Text) }
    Write-Output ('OK: '+$expectedScript+' script beats, import/refresh/optimized draft; '+$ui.Status.Text); return
}
if ($env:VOICE_WORKBENCH_SELFTEST -eq '1') { Write-Output "OK: $($script:segments.Count) segments; XAML loaded"; return }
$timer.Start()
[void]$window.ShowDialog()
