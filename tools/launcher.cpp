// CodeStats 定时同步的隐藏启动器
// 编译：g++ -O2 -mwindows -o codestats-sync.exe launcher.cpp
// 作用：以 GUI 子系统运行（无控制台窗口），再用 CREATE_NO_WINDOW 拉起 node.exe
// 参数固定写在代码里，因为只有这一个用途

#include <windows.h>

static const char* NODE_EXE = "D:\\DevEco Studio\\tools\\node\\node.exe";
static const char* SCRIPT = "C:\\Users\\yuhang\\Desktop\\codestats\\tools\\sync-gist.js";
static const char* WORKDIR = "C:\\Users\\yuhang\\Desktop\\codestats";

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    char cmd[1024];
    wsprintfA(cmd, "\"%s\" \"%s\"", NODE_EXE, SCRIPT);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    ZeroMemory(&pi, sizeof(pi));

    if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE,
                        CREATE_NO_WINDOW, NULL, WORKDIR, &si, &pi)) {
        return 1;
    }

    // 等子进程结束，把退出码带回给计划任务
    WaitForSingleObject(pi.hProcess, 120000);
    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return (int)code;
}
