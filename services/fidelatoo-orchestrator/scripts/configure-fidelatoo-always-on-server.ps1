# Configure ce PC comme SERVEUR Fidelatoo / A.V.A. toujours actif (100% gratuit, local).
# Realite technique: l'emulateur Android ne peut pas tourner gratuitement dans le cloud.
# Donc CE PC (branche) = serveur boutique 24/7.
#
# Usage (PowerShell en Administrateur recommande pour auto-logon):
#   powershell -ExecutionPolicy Bypass -File .\scripts\configure-fidelatoo-always-on-server.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\configure-fidelatoo-always-on-server.ps1 -EnableAutoLogon

param(
  [switch]$EnableAutoLogon
)

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$svcRoot = Split-Path -Parent $here
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
$repoLocal = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $repoLocal | Out-Null
$marker = Join-Path $repoLocal "SERVER_ROLE.txt"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path (Join-Path $repoLocal "server-role.log") -Value $line -ErrorAction SilentlyContinue
}

Write-Log "=== Configuration SERVEUR Fidelatoo toujours actif ==="

# 1) Anti-veille
$prevent = Join-Path $here "prevent-sleep-fidelatoo.ps1"
if (Test-Path $prevent) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $prevent -ConfigureOnly
}

# Renforce: pas de veille hybride, USB ne met pas en veille le PC
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP HYBRIDSLEEP 0 2>$null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP HYBRIDSLEEP 0 2>$null
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_USB USBSUSPEND 0 2>$null
powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_USB USBSUSPEND 0 2>$null
powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_PCIEXPRESS ASPM 0 2>$null
powercfg -S SCHEME_CURRENT 2>$null | Out-Null
Write-Log "Plan: hybride sleep OFF, USB selective suspend OFF"

# 2) Taches stack + keep-alive + nosleep
$install = Join-Path $here "install-fidelatoo-autostart.ps1"
if (Test-Path $install) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install
}

# 3) Declenchement AU BOOT (en plus du logon) pour Caddy/orchestrateur des que possible
try {
  $stack = Join-Path $here "start-fidelatoo-stack.ps1"
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$stack`""
  $t1 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $t2 = New-ScheduledTaskTrigger -AtStartup
  Register-ScheduledTask -TaskName "AllVapsFidelatooStack" `
    -Action $action -Trigger @($t1, $t2) -Principal $principal -Settings $settings -Force | Out-Null
  Write-Log "Tache AllVapsFidelatooStack: AtLogOn + AtStartup"
} catch {
  Write-Log ("WARN tache startup: " + $_.Exception.Message)
}

# 4) Auto-logon (necessaire pour AVD apres reboot sans intervention)
if ($EnableAutoLogon) {
  $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Log "ERREUR: -EnableAutoLogon exige PowerShell Administrateur"
  } else {
    Write-Host ""
    Write-Host "Auto-logon: entre le mot de passe Windows du compte '$env:USERNAME' (reste local, pas Git)."
    $secure = Read-Host -AsSecureString "Mot de passe"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
    Set-ItemProperty -Path $winlogon -Name "AutoAdminLogon" -Value "1" -Type String
    Set-ItemProperty -Path $winlogon -Name "DefaultUserName" -Value $env:USERNAME -Type String
    Set-ItemProperty -Path $winlogon -Name "DefaultPassword" -Value $plain -Type String
    Set-ItemProperty -Path $winlogon -Name "DefaultDomainName" -Value $env:USERDOMAIN -Type String
    $plain = $null
    Write-Log "Auto-logon ACTIVE pour $env:USERNAME (AVD pourra repartir apres reboot)"
  }
} else {
  Write-Log "Auto-logon non demande. Pour l'activer: relancer avec -EnableAutoLogon (Admin)"
}

# 5) Marqueur role serveur
@"
ROLE=serveur-fidelatoo-allvaps
HOST=$env:COMPUTERNAME
USER=$env:USERNAME
CONFIGURED_AT=$(Get-Date -Format o)
NOTES=Laisser ce PC branche secteur, ne pas eteindre. Veille desactivee. Stack + keep-alive + anti-veille actifs.
"@ | Set-Content -Path $marker -Encoding UTF8
Write-Log "Marqueur ecrit: $marker"

# 6) Demarrage immediat
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "start-fidelatoo-stack.ps1")
Start-ScheduledTask -TaskName "AllVapsFidelatooNoSleep" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== SERVEUR Fidelatoo pret ==="
Write-Host "Ce PC doit rester ALLUME et BRANCHE."
Write-Host "Apres coupure de courant: il redemarre -> auto-logon (si active) -> stack Fidelatoo."
Write-Host "Pas de serveur Android cloud gratuit fiable: ce PC EST le serveur."
