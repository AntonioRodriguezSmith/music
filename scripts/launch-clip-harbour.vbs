' Silent launcher: no console flash. Shows splash via PowerShell STA.
' Always use System32 Windows PowerShell (not WindowsApps stub).
Option Explicit
Dim sh, fso, root, ps1, psExe, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
ps1 = root & "\scripts\launch-clip-harbour.ps1"
psExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
If Not fso.FileExists(psExe) Then
  psExe = "powershell.exe"
End If
cmd = """" & psExe & """ -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run cmd, 0, False
