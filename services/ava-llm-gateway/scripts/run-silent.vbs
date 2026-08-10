Option Explicit
Dim sh, ps1, cmd, waitFlag
If WScript.Arguments.Count < 1 Then WScript.Quit 1
ps1 = WScript.Arguments(0)
waitFlag = True
If WScript.Arguments.Count >= 2 Then
  If LCase(WScript.Arguments(1)) = "nowait" Then waitFlag = False
End If
Set sh = CreateObject("WScript.Shell")
cmd = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, waitFlag
