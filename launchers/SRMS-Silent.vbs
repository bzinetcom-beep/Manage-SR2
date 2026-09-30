' ===========================================================================
'  SRMS - Silent launcher
'  Starts the application WITHOUT showing the black console window,
'  then opens the browser automatically.
'  This is what the desktop shortcut points to.
' ===========================================================================

Option Explicit

Dim fso, shell, scriptDir, projectRoot, batFile, cmd

Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' --- path-safe: resolve the project root from this script's own location ----
scriptDir   = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\launchers
projectRoot = fso.GetParentFolderName(scriptDir)                ' ...\SRMS

batFile = fso.BuildPath(scriptDir, "SRMS-Start.bat")

If Not fso.FileExists(batFile) Then
    MsgBox "فایل اجرایی پیدا نشد:" & vbCrLf & batFile & vbCrLf & vbCrLf & _
           "پوشه پروژه ناقص است. لطفاً بسته را دوباره استخراج کنید.", _
           vbCritical, "SRMS"
    WScript.Quit 1
End If

' Work from the project root so every relative path resolves correctly.
shell.CurrentDirectory = projectRoot

' 0 = hidden window, False = do not wait for it to finish
cmd = """" & batFile & """ --silent"
shell.Run cmd, 0, False

' The launcher opens the browser itself once the health check passes.
Set shell = Nothing
Set fso   = Nothing
