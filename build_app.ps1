param(
    [switch]$SkipClean
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectRoot ".venv-build\Scripts\python.exe"
$BuildRoot = Join-Path $ProjectRoot "build"
$DistRoot = Join-Path $ProjectRoot "dist"
$PackageRoot = Join-Path $DistRoot "ExportGenius"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Build environment not found. Create .venv-build and install requirements-build.txt first."
}

$arguments = @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--windowed",
    "--onedir",
    "--name", "ExportGenius",
    "--contents-directory", "_internal",
    "--distpath", $DistRoot,
    "--workpath", (Join-Path $BuildRoot "pyinstaller"),
    "--specpath", $BuildRoot
)

if (-not $SkipClean) {
    $arguments += "--clean"
}

$arguments += (Join-Path $ProjectRoot "excel_gui.py")

& $Python @arguments
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed with exit code $LASTEXITCODE."
}

$ExtensionSource = Join-Path $ProjectRoot "extension"
$ExtensionTarget = Join-Path $PackageRoot "extension"
if (Test-Path -LiteralPath $ExtensionTarget) {
    Remove-Item -LiteralPath $ExtensionTarget -Recurse -Force
}
Copy-Item -LiteralPath $ExtensionSource -Destination $ExtensionTarget -Recurse -Force

$TemplateSource = Join-Path $ProjectRoot "template.xlsx"
if (Test-Path -LiteralPath $TemplateSource) {
    Copy-Item -LiteralPath $TemplateSource -Destination (Join-Path $PackageRoot "template.xlsx") -Force
} else {
    Write-Warning "template.xlsx was not found. Users must select a template in the GUI."
}

Copy-Item -LiteralPath (Join-Path $ProjectRoot "README.md") -Destination (Join-Path $PackageRoot "README.md") -Force

Write-Output "Build complete: $PackageRoot"
Write-Output "Executable: $(Join-Path $PackageRoot 'ExportGenius.exe')"
