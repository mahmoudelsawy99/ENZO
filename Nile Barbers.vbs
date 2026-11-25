Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

If Not fso.FileExists(scriptDir & "\client\dist\client\browser\index.html") Then
    MsgBox "Nile Barbers is not built yet." & vbCrLf & "Please contact the administrator.", vbExclamation, "Nile Barbers"
    WScript.Quit 1
End If

If SiteIsUp() Then
    OpenSite
    WScript.Quit 0
End If

WshShell.Run "cmd /c npx --yes serve ""client\dist\client\browser"" -s -l 8080", 0, False

For i = 1 To 40
    WScript.Sleep 500
    If SiteIsUp() Then
        OpenSite
        WScript.Quit 0
    End If
Next

MsgBox "Nile Barbers did not start." & vbCrLf & "Check that Node.js is installed.", vbCritical, "Nile Barbers"

Function SiteIsUp()
    On Error Resume Next
    Dim http
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 1000, 1000, 1000, 1000
    http.Open "GET", "http://localhost:8080/", False
    http.Send
    SiteIsUp = (Err.Number = 0 And http.Status = 200)
    On Error GoTo 0
End Function

Sub OpenSite()
    Dim chrome
    chrome = ChromePath()
    If chrome <> "" Then
        WshShell.Run """" & chrome & """ http://localhost:8080", 1, False
    Else
        WshShell.Run "cmd /c start """" ""http://localhost:8080""", 0, False
    End If
End Sub

Function ChromePath()
    Dim paths, p
    paths = Array( _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
        WshShell.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe"))
    For Each p In paths
        If fso.FileExists(p) Then
            ChromePath = p
            Exit Function
        End If
    Next
    ChromePath = ""
End Function
