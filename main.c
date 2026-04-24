#include <stdio.h>
#include <io.h>    // _open_osfhandle
#include <fcntl.h> // _O_RDONLY, _O_WRONLY, _O_TEXT
#include <windows.h>
#include "gui.h"
#include "cui.h"

// ---------------------------------------------------------------------------
// CUI スレッド
// GUI と並走して stdin からコマンドを受け付ける。
// process_user_input が 0 を返したら終了。
// ---------------------------------------------------------------------------
static DWORD WINAPI cui_thread(LPVOID _unused)
{
    (void)_unused;

    // --- コンソールウィンドウを確保 ---
    AllocConsole();

    // freopen は -mwindows ビルドでは stdin 再接続に失敗するため、
    // Win32 の CreateFile → SetStdHandle → _open_osfhandle → _fdopen
    // の順で標準入出力を明示的に繋ぎ直す。
    HANDLE hIn = CreateFile("CONIN$", GENERIC_READ,
                            FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    HANDLE hOut = CreateFile("CONOUT$", GENERIC_WRITE,
                             FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);

    SetStdHandle(STD_INPUT_HANDLE, hIn);
    SetStdHandle(STD_OUTPUT_HANDLE, hOut);
    SetStdHandle(STD_ERROR_HANDLE, hOut);

    // C ランタイムの stdin/stdout/stderr も繋ぎ直す
    int fd_in = _open_osfhandle((intptr_t)hIn, _O_RDONLY | _O_TEXT);
    int fd_out = _open_osfhandle((intptr_t)hOut, _O_WRONLY | _O_TEXT);

    if (fd_in >= 0)
    {
        FILE *f = _fdopen(fd_in, "r");
        if (f)
            *stdin = *f;
    }
    if (fd_out >= 0)
    {
        FILE *f = _fdopen(fd_out, "w");
        if (f)
        {
            *stdout = *f;
            *stderr = *f;
        }
    }

    // バッファリングを無効化してプロンプトが即時表示されるようにする
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

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

    // CUI スレッドを起動
    HANDLE hThread = CreateThread(NULL, 0, cui_thread, NULL, 0, NULL);
    if (hThread)
        CloseHandle(hThread); // デタッチ（GUI 終了時に OS がまとめて回収）

    // GUI メッセージループ（メインスレッド）
    return gui_run(hInstance, nCmdShow);
}