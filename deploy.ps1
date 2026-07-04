# Run this script after signing in to GitHub once: gh auth login
param(
  [string]$RepoName = "crime-classics-tracker",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

function Test-GitRemote {
  param([string]$Name = "origin")
  git remote get-url $Name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Ensure-GitHubRemote {
  param(
    [string]$Owner,
    [string]$Name
  )

  $url = "https://github.com/$Owner/$Name.git"

  if (Test-GitRemote) {
    Write-Host "Remote 'origin' already configured."
    return
  }

  Write-Host "Adding remote 'origin' -> $url"
  git remote add origin $url
}

Write-Host "Checking GitHub authentication..."
gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Not logged in to GitHub. Run: gh auth login"
}

$owner = gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or -not $owner) {
  throw "Could not determine your GitHub username."
}

Write-Host "GitHub account: $owner"

if (Test-GitRemote) {
  Write-Host "Remote already configured: $(git remote get-url origin)"
} elseif (gh repo view "$owner/$RepoName" 2>$null) {
  Write-Host "Repository already exists on GitHub. Linking local repo..."
  Ensure-GitHubRemote -Owner $owner -Name $RepoName
} else {
  Write-Host "Creating GitHub repository: $owner/$RepoName ($Visibility)..."
  gh repo create $RepoName --$Visibility --source=. --remote=origin --push --description "Track your British Library Crime Classics collection"
  if ($LASTEXITCODE -ne 0) {
    if (gh repo view "$owner/$RepoName" 2>$null) {
      Write-Host "Repository exists but create failed to link remote. Retrying..."
      Ensure-GitHubRemote -Owner $owner -Name $RepoName
    } else {
      throw "Failed to create GitHub repository."
    }
  } else {
    Write-Host "Repository created and initial push completed."
  }
}

if (-not (Test-GitRemote)) {
  throw "No 'origin' remote configured. Run: git remote add origin https://github.com/$owner/$RepoName.git"
}

Write-Host "Pushing to GitHub..."
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  throw "git push failed."
}

Write-Host ""
Write-Host "Enabling GitHub Pages (GitHub Actions)..."
gh api "repos/$owner/$RepoName/pages" -X POST -f build_type=workflow 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Pages may already be enabled, or enable manually:"
  Write-Host "  https://github.com/$owner/$RepoName/settings/pages"
  Write-Host "  Source: GitHub Actions"
}

Write-Host ""
Write-Host "Done! After the workflow finishes (1-2 minutes), your app will be at:"
Write-Host "  https://$owner.github.io/$RepoName/"
Write-Host ""
Write-Host "Install on iPhone: open that URL in Safari -> Share -> Add to Home Screen"
