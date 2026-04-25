#include <stdio.h>
#include <io.h>
#include <fcntl.h>
#include <windows.h>
#include "gui.h"
#include "cui.h"

// ---------------------------------------------------------------------------
// MinGW -mwindows での stdin/stdout 再接続
//
// freopen("CONIN$", ..., stdin) は AllocConsole 後でも FILE* 内部の
// EOF/error フラグが残り fgets が即 NULL を返す既知の問題がある。
//
// 回避策：
//   1. _dup2 で fd レベルを差し替える（これは成功している）
//   2. freopen ではなく _fdopen で新しい FILE* を作る
//   3. clearerr() でエラーフラグを明示的にクリアする
// ---------------------------------------------------------------------------
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
            // _dup2 後に _fdopen で fd=0 から新しい FILE* を作り stdin に上書き
            FILE *new_stdin = _fdopen(0, "r");
            if (new_stdin)
            {
                *stdin = *new_stdin;
                clearerr(stdin); // EOF/error フラグをクリア
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
            FILE *new_stdout = _fdopen(1, "w");
            if (new_stdout)
            {
                *stdout = *new_stdout;
                *stderr = *new_stdout;
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

// ---------------------------------------------------------------------------
// CUI スレッド
// ---------------------------------------------------------------------------
static DWORD WINAPI cui_thread(LPVOID _unused)
{
    (void)_unused;

    AllocConsole();
    reconnect_console_streams();

    printf("Filer CUI Started. Type 'exit' to quit CUI.\n");

    while (1)
    {
        if (process_user_input() == 0)
            break;
    }

    printf("CUI Shutdown.\n");
    return 0;
}

// ---------------------------------------------------------------------------
// WinMain
// ---------------------------------------------------------------------------
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE _prev, LPSTR _cmdline, int nCmdShow)
{
    (void)_prev;
    (void)_cmdline;

    HANDLE hThread = CreateThread(NULL, 0, cui_thread, NULL, 0, NULL);
    if (hThread)
        CloseHandle(hThread);

    return gui_run(hInstance, nCmdShow);
}