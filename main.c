#include <stdio.h>
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

    // コンソールウィンドウを確保
    AllocConsole();
    freopen("CONIN$", "r", stdin);
    freopen("CONOUT$", "w", stdout);
    freopen("CONOUT$", "w", stderr);

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