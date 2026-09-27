# Full-scene stills for movies with a confirmed sync and a file on disk.
# Skips JPEGs already in inbox/stills-preview. Does not push to R2.
# Start when ready: npm run content:stills:overnight
#
# Held back (sync recorded, not eyeballed): Lebowski, A New Hope, Return of the Jedi, Two Towers.
# Already complete: Empire, Wolf, Payback, Inglourious Basterds, Matrix, My Cousin Vinny.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root "inbox\stills-preview"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "playable-overnight.log"

$titles = @(
  "the-lord-of-the-rings---the-fellowship-of-the-ring-2001",
  "oceans-thirteen-2007",
  "the-gentlemen-2019",
  "lord-of-the-rings-the-return-of-the-king-2003",
  "oceans-eleven-2001",
  "rocknrolla-2008",
  "friday-1995",
  "django-unchained-2012",
  "batman-begins-2005",
  "goodfellas-1990"
)

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format o), $Message
  Add-Content -Path $log -Value $line
  Write-Host $line
}

Write-Log "queue start ($($titles.Count) titles)"
foreach ($titleId in $titles) {
  Write-Log "START $titleId"
  & npm run content:stills -- --title $titleId --playable 2>&1 | ForEach-Object {
    $text = "$_"
    Add-Content -Path $log -Value $text
    Write-Host $text
  }
  Write-Log "END $titleId exit $LASTEXITCODE"
}
Write-Log "queue done"
