# Keep-alive gateway — répare si down, ne coupe jamais volontairement.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& "$here\start-ava-llm-stack.ps1"
