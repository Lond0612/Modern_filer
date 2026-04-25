#include <stdio.h>
#include <io.h>
#include <fcntl.h>
#include <windows.h>
#include "gui.h"
#include "cui.h"

static DWORD WINAPI cui_thread(LPVOID _unused)
{
    (void)_unused;

    // --- ステップ1: AllocConsole ---
    BOOL ok_alloc = AllocConsole();
    {
        char msg[128];
        _snprintf(msg, sizeof(msg), "AllocConsole: %s (LastError=%lu)",
                  ok_alloc ? "OK" : "FAIL", GetLastError());
        MessageBoxA(NULL, msg, "DEBUG step1", MB_OK);
    }

    // --- ステップ2: CreateFileA ---
    HANDLE hIn  = CreateFileA("CONIN$",  GENERIC_READ,
                              FILE_SHARE_READ,  NULL, OPEN_EXISTING, 0, NULL);
    HANDLE hOut = CreateFileA("CONOUT$", GENERIC_WRITE,
                              FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
    {
        char msg[128];
        _snprintf(msg, sizeof(msg),
                  "hIn=%s  hOut=%s",
                  hIn  != INVALID_HANDLE_VALUE ? "OK" : "INVALID",
                  hOut != INVALID_HANDLE_VALUE ? "OK" : "INVALID");
        MessageBoxA(NULL, msg, "DEBUG step2", MB_OK);
    }

    // --- ステップ3: _open_osfhandle + _dup2 ---
    int fd_in = -1, fd_out = -1;
    if (hIn != INVALID_HANDLE_VALUE)
    {
        fd_in = _open_osfhandle((intptr_t)hIn, _O_RDONLY | _O_TEXT);
        if (fd_in >= 0) _dup2(fd_in, 0);
    }
    if (hOut != INVALID_HANDLE_VALUE)
    {
        fd_out = _open_osfhandle((intptr_t)hOut, _O_WRONLY | _O_TEXT);
        if (fd_out >= 0) { _dup2(fd_out, 1); _dup2(fd_out, 2); }
    }
    {
        char msg[128];
        _snprintf(msg, sizeof(msg),
                  "fd_in=%d (dup2->0: %s)  fd_out=%d (dup2->1,2: %s)",
                  fd_in,  fd_in  >= 0 ? "OK" : "FAIL",
                  fd_out, fd_out >= 0 ? "OK" : "FAIL");
        MessageBoxA(NULL, msg, "DEBUG step3", MB_OK);
    }

    // --- ステップ4: freopen ---
    FILE *r_in  = freopen("CONIN$",  "r", stdin);
    FILE *r_out = freopen("CONOUT$", "w", stdout);
    {
        char msg[128];
        _snprintf(msg, sizeof(msg),
                  "freopen stdin: %s  stdout: %s",
                  r_in  ? "OK" : "FAIL",
                  r_out ? "OK" : "FAIL");
        MessageBoxA(NULL, msg, "DEBUG step4", MB_OK);
    }

    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    SetConsoleCP(65001);
    SetConsoleOutputCP(65001);

    // --- ステップ5: 実際に printf と fgets が動くか ---
    printf("=== CUI DEBUG: printf OK ===\n");
    printf("何か入力してください > ");
    fflush(stdout);

    char buf[64] = {0};
    char *got = fgets(buf, sizeof(buf), stdin);
    {
        char msg[256];
        _snprintf(msg, sizeof(msg),
                  "fgets: %s\n入力内容: [%s]",
                  got ? "OK" : "FAIL(NULL)",
                  got ? buf : "(なし)");
        MessageBoxA(NULL, msg, "DEBUG step5", MB_OK);
    }

    // --- 正常ループへ ---
    printf("Filer CUI Started. Type 'exit' to quit CUI.\n");
    while (1)
    {
        if (process_user_input() == 0)
            break;
    }
    printf("CUI Shutdown.\n");
    return 0;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE _prev, LPSTR _cmdline, int nCmdShow)
{
    (void)_prev;
    (void)_cmdline;

    HANDLE hThread = CreateThread(NULL, 0, cui_thread, NULL, 0, NULL);
    if (hThread) CloseHandle(hThread);

    return gui_run(hInstance, nCmdShow);
}
