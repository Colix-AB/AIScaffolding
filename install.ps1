<#
.SYNOPSIS
  Copy the AIScaffolding template into a target repository.

.EXAMPLE
  ./install.ps1 C:\path\to\your\repo

.NOTES
  Existing files are never overwritten: a conflicting file is written alongside
  with a .aiscaffolding-new suffix so you can diff and merge it yourself.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Target
)

$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "template"

if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
  Write-Error "error: $Target is not a directory"
}

if (-not (Test-Path -LiteralPath (Join-Path $Target ".git"))) {
  Write-Warning "$Target does not look like a git repository (no .git)"
}

Write-Host "Installing AIScaffolding into $Target"
Write-Host ""

$copied = 0
$skipped = 0

Get-ChildItem -LiteralPath $src -Recurse -File | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length).TrimStart('\', '/')
  $to = Join-Path $Target $rel
  $toDir = Split-Path -Parent $to

  if (-not (Test-Path -LiteralPath $toDir)) {
    New-Item -ItemType Directory -Path $toDir -Force | Out-Null
  }

  if (Test-Path -LiteralPath $to) {
    Copy-Item -LiteralPath $_.FullName -Destination "$to.aiscaffolding-new" -Force
    Write-Host "  exists, wrote alongside: $rel.aiscaffolding-new"
    $skipped++
  }
  else {
    Copy-Item -LiteralPath $_.FullName -Destination $to
    Write-Host "  + $rel"
    $copied++
  }
}

Write-Host ""
Write-Host "Copied $copied file(s), $skipped already existed."
Write-Host ""
Write-Host @"
Next steps (see docs/customizing.md):

  1. Create the issue labels:            docs/issue-tracking.md
  2. Find every decision to make:        grep -rn "<[A-Z]" CLAUDE.md .claude/skills/
  3. Rewrite for your stack:             .claude/skills/stack-conventions/SKILL.md
  4. Delete the gates that don't apply:  CLAUDE.md section 8 (single host), the flag skills
  5. Add to .gitignore:                  .worktrees/  and  .claude/dev-notes/
  6. Try it:                             "create an issue for <something small>", then "ship #<N>"
"@
