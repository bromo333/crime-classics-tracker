# Run this script after signing in to GitHub once: gh auth login
param(
  [string]$RepoName = "crime-classics-tracker",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public"
)

$ErrorActionPreference = "Stop"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Checking GitHub authentication..."
gh auth status | Out-Null

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host "Creating GitHub repository: $RepoName ($Visibility)..."
  gh repo create $RepoName --$Visibility --source=. --remote=origin --description "Track your British Library Crime Classics collection"
  Write-Host "Pushing to GitHub..."
  git push -u origin main
} else {
  Write-Host "Remote already configured: $remote"
  Write-Host "Pushing to GitHub..."
  git push -u origin main
}

Write-Host ""
Write-Host "Enabling GitHub Pages (GitHub Actions)..."
$owner = gh api user --jq .login
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
