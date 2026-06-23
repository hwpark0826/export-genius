param(
    [switch]$SkipClean,
    [switch]$CreateArchive,
    [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildRoot = Join-Path $ProjectRoot "build"
$DistRoot = Join-Path $ProjectRoot "dist"
$PackageRoot = Join-Path $DistRoot "ExportGenius"
$ReleaseRoot = Join-Path $ProjectRoot "release"

if ($PythonPath) {
    $Python = $PythonPath
} else {
    $CondaPython = Join-Path $env:LOCALAPPDATA "Miniconda3-ExportGeniusBuild\python.exe"
    $VenvPython = Join-Path $ProjectRoot ".venv-build\Scripts\python.exe"
    $Python = if (Test-Path -LiteralPath $CondaPython) { $CondaPython } else { $VenvPython }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Build Python not found. Pass -PythonPath or configure the build environment first."
}

$PythonRoot = Split-Path -Parent $Python
$CondaLibraryBin = Join-Path $PythonRoot "Library\bin"
if (Test-Path -LiteralPath $CondaLibraryBin) {
    $env:CONDA_PREFIX = $PythonRoot
    $env:PATH = "$CondaLibraryBin;$PythonRoot;$env:PATH"
    Write-Output "Conda DLL path: $CondaLibraryBin"
}

Write-Output "Build Python: $Python"
& $Python -c "import tkinter as tk; t = tk.Tcl(); print('Tk ready:', tk.TkVersion, t.eval('info patchlevel'))"
if ($LASTEXITCODE -ne 0) {
    throw "The selected build Python cannot initialize Tcl/Tk."
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
$UserGuideSource = Join-Path $ProjectRoot "사용자_안내.txt"
if (Test-Path -LiteralPath $UserGuideSource) {
    Copy-Item -LiteralPath $UserGuideSource -Destination (Join-Path $PackageRoot "사용자_안내.txt") -Force
}

Write-Output "Build complete: $PackageRoot"
Write-Output "Executable: $(Join-Path $PackageRoot 'ExportGenius.exe')"

if ($CreateArchive) {
    $Manifest = Get-Content -LiteralPath (Join-Path $ProjectRoot "extension\manifest.json") -Encoding utf8 -Raw | ConvertFrom-Json
    $Version = [string]$Manifest.version
    $ArchivePath = Join-Path $ReleaseRoot "ExportGenius-$Version-win64.zip"
    New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null
    if (Test-Path -LiteralPath $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }
    Compress-Archive -Path (Join-Path $PackageRoot "*") -DestinationPath $ArchivePath -CompressionLevel Optimal
    Write-Output "Release archive: $ArchivePath"
} else {
    Write-Output "Release archive skipped. Use -CreateArchive for a release ZIP."
}
