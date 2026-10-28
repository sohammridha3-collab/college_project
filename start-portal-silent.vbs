Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if backend is already listening on port 3000
ret = WshShell.Run("cmd /c netstat -ano | findstr /R /C "":3000 .*LISTENING""", 0, True)

If ret <> 0 Then
    ' Start server silently in the background (0 = hide window)
    WshShell.Run "cmd /c cd /d """ & strPath & """ && node server/src/server.js", 0, False
    WScript.Sleep 2000
End If

' Open portal in default web browser
WshShell.Run "http://localhost:3000", 1, False
