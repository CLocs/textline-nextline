# Same queue as npm run content:stills:overnight:
# titles with syncedAt and no batchedAt. Does not push to R2.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
npx tsx scripts/stills-overnight.ts
