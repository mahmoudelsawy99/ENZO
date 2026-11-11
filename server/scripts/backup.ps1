param(
  [string]$Uri = $env:MONGODB_URI,
  [string]$Destination = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path (Get-Location) 'backups' }),
  [int]$RetentionDays = $(if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 14 }),
  [string]$ConfirmDatabase = ''
)

if (-not $Uri) {
  throw 'Set MONGODB_URI before running a backup.'
}
if ($env:NODE_ENV -eq 'production' -and $ConfirmDatabase -eq '') {
  throw 'Refusing a production backup without -ConfirmDatabase set to the database name in the URI.'
}
$databaseName = (($Uri -split '\?')[0] -split '/')[-1]
if ($databaseName -eq 'enzo' -and $ConfirmDatabase -ne 'enzo') {
  throw 'Refusing to back up the live enzo database. Pass -ConfirmDatabase enzo only for an intentional copy. Do not restore that copy over enzo.'
}
if (-not (Get-Command mongodump -ErrorAction SilentlyContinue)) {
  throw 'Install MongoDB Database Tools so mongodump is on PATH. This script does not mark backups as scheduled.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$folder = Join-Path $Destination "enzo-$stamp"
New-Item -ItemType Directory -Force -Path $folder | Out-Null
& mongodump --uri $Uri --out $folder
if ($LASTEXITCODE -ne 0) {
  throw "mongodump exited with $LASTEXITCODE"
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $Destination -Directory -Filter 'enzo-*' |
  Where-Object { $_.CreationTime -lt $cutoff } |
  Remove-Item -Recurse -Force

Write-Output "Backup written to $folder"
