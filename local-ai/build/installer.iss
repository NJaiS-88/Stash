; Inno Setup Script for Stash Local AI
; Compiles StashLocalAI-Setup.exe

#define MyAppName "Stash Local AI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Stash"
#define MyAppURL "https://stash.app"
#define MyAppExeName "StashLocalAI.exe"

[Setup]
AppId={{6B520847-D577-4AEB-864A-A427F2D1FEE4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Stash Local AI
DisableProgramGroupPage=yes
OutputBaseFilename=StashLocalAI-Setup
OutputDir=dist
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startwithwindows"; Description: "Start Stash Private AI quietly when Windows starts"; GroupDescription: "Startup Options:"; Flags: unchecked
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Standalone compiled executable
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Ensure app data directories exist without being removed upon uninstall to preserve downloaded model weights
Name: "{localappdata}\Stash"; Flags: uninsneveruninstall
Name: "{localappdata}\Stash\models"; Flags: uninsneveruninstall
Name: "{localappdata}\Stash\config"; Flags: uninsneveruninstall
Name: "{localappdata}\Stash\logs"; Flags: uninsneveruninstall

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Configure optional start-with-Windows registry entry
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "StashLocalAI"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: startwithwindows; Flags: uninsdeletevalue

[Run]
; Launch Stash Local AI quietly in background upon installation completion
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
