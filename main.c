#include <stdio.h>
#include <windows.h>
#include "gui.h"
#include "cui.h"

// ---------------------------------------------------------------------------
// DEBUG ビルド時のみ: cmdウィンドウを開いてCUIスレッドを起動する
//
// リリースビルド時はcmdウィンドウもCUIスレッドも生成しない。
// 操作はGUIウィンドウ内の入力欄からのみ行う。
// ---------------------------------------------------------------------------

#ifdef DEBUG
#include <io.h>
#include <fcntl.h>

// MinGW -mwindows ビルドでは freopen だけでは FILE* が繋がらないため
// _dup2 で fd レベルで差し替えてから _fdopen + clearerr で同期させる。
static void reconnect_console_streams(void)
{
    HANDLE hIn = CreateFileA("CONIN$", GENERIC_READ,
                             FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    HANDLE hOut = CreateFileA("CONOUT$", GENERIC_WRITE,
                              FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);

    if (hIn != INVALID_HANDLE_VALUE)
    {
        int fd = _open_osfhandle((intptr_t)hIn, _O_RDONLY | _O_TEXT);
        if (fd >= 0)
        {
            _dup2(fd, 0);
            FILE *f = _fdopen(0, "r");
            if (f)
            {
                *stdin = *f;
                clearerr(stdin);
            }
        }
    }
    if (hOut != INVALID_HANDLE_VALUE)
    {
        int fd = _open_osfhandle((intptr_t)hOut, _O_WRONLY | _O_TEXT);
        if (fd >= 0)
        {
            _dup2(fd, 1);
            _dup2(fd, 2);
            FILE *f = _fdopen(1, "w");
            if (f)
            {
                *stdout = *f;
                *stderr = *f;
                clearerr(stdout);
                clearerr(stderr);
            }
        }
    }
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    SetConsoleCP(65001);
    SetConsoleOutputCP(65001);
}

static DWORD WINAPI cui_thread(LPVOID _unused)
{
    (void)_unused;
    AllocConsole();
    reconnect_console_streams();
    printf("Filer CUI [DEBUG] Started. Type 'exit' to quit.\n");
    while (process_user_input())
    {
    }
    printf("CUI Shutdown.\n");
    return 0;
}
#endif // DEBUG

// ---------------------------------------------------------------------------
// WinMain
// ---------------------------------------------------------------------------
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE _prev, LPSTR _cmdline, int nCmdShow)
{
    (void)_prev;
    (void)_cmdline;

#ifdef DEBUG
    // デバッグ時のみ cmdウィンドウ + CUIスレッドを起動
    HANDLE hThread = CreateThread(NULL, 0, cui_thread, NULL, 0, NULL);
    if (hThread)
        CloseHandle(hThread);
#endif

    return gui_run(hInstance, nCmdShow);
}