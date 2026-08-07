# Keep-alive Fidelatoo — à lancer périodiquement (tâche planifiée).
# N'arrête jamais la VM/app volontairement. Répare seulement si down.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$here\start-fidelatoo-stack.ps1"
