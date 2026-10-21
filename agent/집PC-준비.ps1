# maim 집 PC 준비 — 한 번만 (다시 돌려도 됩니다)
#   저장소 폴더 명령 창에서:  powershell -ExecutionPolicy Bypass -File agent\집PC-준비.ps1
# 하는 일: Python 확인 → 필요한 것 설치 → 서버 주소·토큰·저장 폴더를 환경변수로 → 서버 연결 시험
# 토큰은 화면에 보이지 않게 입력받아 이 PC 사용자 환경변수에만 둡니다(파일·저장소에 안 남김).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$agent = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'   # 한국어 윈도(cp949)에서 pip 가 requirements.txt 의 한글 주석을 못 읽는 것 막기

Write-Host "`n[1/5] Python 확인" -ForegroundColor Cyan
$py = $null; $pyArgs = @()
if (Get-Command python -ErrorAction SilentlyContinue) { $py = 'python' }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $py = 'py'; $pyArgs = @('-3') }
if (-not $py) { Write-Host "Python 이 없습니다. python.org 에서 3.11 이상을 설치(Add to PATH 체크)한 뒤 다시 돌려 주세요." -ForegroundColor Red; exit 1 }
$ver = & $py @pyArgs -c "import sys; print('%d.%d' % sys.version_info[:2])"
if ([version]$ver -lt [version]'3.11') { Write-Host "Python $ver — 3.11 이상이 필요합니다." -ForegroundColor Red; exit 1 }
Write-Host "  Python $ver OK"

Write-Host "`n[2/5] 필요한 것 설치 (1~3분)" -ForegroundColor Cyan
& $py @pyArgs -m pip install --upgrade --quiet -r "$agent\requirements.txt"
if ($LASTEXITCODE -ne 0) { Write-Host "설치 실패 — 위 빨간 글을 Claude 에 보여 주세요." -ForegroundColor Red; exit 1 }
Write-Host "  OK"

Write-Host "`n[3/5] 서버 주소" -ForegroundColor Cyan
$url = [Environment]::GetEnvironmentVariable('MAIM_SERVER_URL', 'User')
if (-not $url) { $url = 'https://maim-1048530680370.us-central1.run.app' }
$in = Read-Host "  서버 주소 (그냥 Enter = $url)"
if ($in.Trim()) { $url = $in.Trim() }
$url = $url.TrimEnd('/')
[Environment]::SetEnvironmentVariable('MAIM_SERVER_URL', $url, 'User'); $env:MAIM_SERVER_URL = $url

Write-Host "`n[4/5] 집 PC 연결 토큰" -ForegroundColor Cyan
Write-Host "  대시보드 [🕹️ 게임 스샷 → 설정 → 🔑 집 PC 연결] 에서 [📋 복사] 한 것을 붙여 넣으세요(마우스 오른쪽 클릭 = 붙여넣기)."
$cur = [Environment]::GetEnvironmentVariable('MAIM_GAME_AGENT_TOKEN', 'User')
$prompt = if ($cur) { "  토큰 (그냥 Enter = 지금 것 그대로)" } else { "  토큰" }
$sec = Read-Host $prompt -AsSecureString
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
if (-not $tok) { $tok = $cur }
if (-not $tok -or $tok.Length -lt 16) { Write-Host "토큰이 비었거나 너무 짧습니다. 대시보드에서 다시 복사해 주세요." -ForegroundColor Red; exit 1 }
[Environment]::SetEnvironmentVariable('MAIM_GAME_AGENT_TOKEN', $tok, 'User'); $env:MAIM_GAME_AGENT_TOKEN = $tok
Write-Host "  저장했습니다(화면에는 안 보임)."

Write-Host "`n[5/5] 원본 사진 저장 폴더" -ForegroundColor Cyan
$root = [Environment]::GetEnvironmentVariable('MAIM_GAME_ROOT', 'User')
if (-not $root) {
  if (Test-Path 'G:\') { $root = 'G:\maim-game' } elseif (Test-Path 'D:\') { $root = 'D:\maim-game' } else { $root = Join-Path $HOME 'maim-game' }
}
$in = Read-Host "  저장 폴더 (그냥 Enter = $root)"
if ($in.Trim()) { $root = $in.Trim() }
New-Item -ItemType Directory -Force -Path $root | Out-Null
[Environment]::SetEnvironmentVariable('MAIM_GAME_ROOT', $root, 'User'); $env:MAIM_GAME_ROOT = $root

Write-Host "`n연결 시험" -ForegroundColor Cyan
& $py @pyArgs "$agent\main.py" --연결시험
if ($LASTEXITCODE -eq 0) {
  Write-Host "`n✅ 준비 끝. 이제 집 PC 의 Claude Code 에 이렇게 말하세요:" -ForegroundColor Green
  Write-Host '   바탕화면 «maim 게임 켜기» 를 켜고 게임에서 F9 — 대시보드 [🕹️ 게임 스샷] 에 쌓입니다'
} else {
  Write-Host "`n연결이 안 됐습니다. 위 ❌ 문구를 Claude 에 보여 주세요." -ForegroundColor Yellow
}
