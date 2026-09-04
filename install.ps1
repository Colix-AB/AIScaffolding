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

  1. Install the 7 agents the flow dispatches (from aitmpl.com), then adapt
     them to your stack - details in .claude/agents/README.md:

       npx claude-code-templates@latest --agent development-team/backend-architect
       npx claude-code-templates@latest --agent development-team/backend-developer
       npx claude-code-templates@latest --agent development-team/frontend-developer
       npx claude-code-templates@latest --agent development-tools/test-engineer
       npx claude-code-templates@latest --agent development-team/ui-ux-designer
       npx claude-code-templates@latest --agent development-tools/code-reviewer
       npx claude-code-templates@latest --agent security/api-security-audit

  2. Create the issue labels:            docs/issue-tracking.md
  3. Find every decision to make:        grep -rn "<[A-Z]" CLAUDE.md .claude/skills/
  4. Rewrite for your stack:             .claude/skills/stack-conventions/SKILL.md
  5. Delete the gates that don't apply:  CLAUDE.md section 8 (single host), the flag skills
  6. Add to .gitignore:                  .worktrees/  and  .claude/dev-notes/
  7. Try it:                             "create an issue for <something small>", then "ship #<N>"
"@
