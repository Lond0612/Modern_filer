#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "cmd_proc.h"

// ---------------------------------------------------------------------------
// 内部状態
// ---------------------------------------------------------------------------
static HANDLE s_hProc = NULL;       // cmd.exe プロセスハンドル
static HANDLE s_hStdin = NULL;      // cmd の stdin  書き込み端
static HANDLE s_hStdout = NULL;     // cmd の stdout 読み込み端
static HANDLE s_hReadThread = NULL; // 出力読み取りスレッド
static CmdOutputCallback s_callback = NULL;
static volatile BOOL s_running = FALSE;

// ---------------------------------------------------------------------------
// 出力読み取りスレッド
// cmd の stdout/stderr を読み続けてコールバックに渡す
// ---------------------------------------------------------------------------
static DWORD WINAPI read_thread(LPVOID _unused)
{
    (void)_unused;
    char buf[8192];
    DWORD read;

    while (s_running)
    {
        // PeekNamedPipe で読み取り可能バイト数を確認してからReadする
        // (ReadFile はブロックするためプロセス終了検出が遅れる対策)
        DWORD avail = 0;
        if (!PeekNamedPipe(s_hStdout, NULL, 0, NULL, &avail, NULL))
            break;

        if (avail == 0)
        {
            // データなし: プロセスが生きているか確認
            DWORD exit_code;
            if (GetExitCodeProcess(s_hProc, &exit_code) &&
                exit_code != STILL_ACTIVE)
                break;
            Sleep(20);
            continue;
        }

        DWORD to_read = avail < sizeof(buf) - 1 ? avail : sizeof(buf) - 1;
        if (!ReadFile(s_hStdout, buf, to_read, &read, NULL) || read == 0)
            break;

        buf[read] = '\0';

        // \n を \r\n に正規化してコールバックへ
        // (Edit コントロールは \r\n が必要)
        char norm[16384];
        int ni = 0;
        for (DWORD i = 0; i < read && ni < (int)sizeof(norm) - 3; i++)
        {
            if (buf[i] == '\n' && (i == 0 || buf[i - 1] != '\r'))
            {
                norm[ni++] = '\r';
                norm[ni++] = '\n';
            }
            else
            {
                norm[ni++] = buf[i];
            }
        }
        norm[ni] = '\0';

        if (s_callback)
            s_callback(norm);
    }
    
    // Pipe closed or cmd.exe is gone.
    s_running = FALSE;
    if (s_callback)
    {
        s_callback("\r\n[Terminal process terminated]\r\n");
    }
    return 0;
}

// ---------------------------------------------------------------------------
// cmd_proc_start
// ---------------------------------------------------------------------------
int cmd_proc_start(CmdOutputCallback cb)
{
    s_callback = cb;

    // パイプを作成
    // stdin 用: GUI → cmd
    HANDLE hStdinRead = NULL, hStdinWrite = NULL;
    // stdout 用: cmd → GUI (stderr もここに合流させる)
    HANDLE hStdoutRead = NULL, hStdoutWrite = NULL;

    SECURITY_ATTRIBUTES sa;
    sa.nLength = sizeof(sa);
    sa.lpSecurityDescriptor = NULL;
    sa.bInheritHandle = TRUE; // 子プロセスに継承させる

    if (!CreatePipe(&hStdinRead, &hStdinWrite, &sa, 0))
        return 0;
    if (!CreatePipe(&hStdoutRead, &hStdoutWrite, &sa, 0))
    {
        CloseHandle(hStdinRead);
        CloseHandle(hStdinWrite);
        return 0;
    }

    // 親側のハンドルは継承させない（子プロセスに見えないようにする）
    SetHandleInformation(hStdinWrite, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(hStdoutRead, HANDLE_FLAG_INHERIT, 0);

    // cmd.exe を起動
    STARTUPINFOA si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE; // コンソールウィンドウを非表示
    si.hStdInput = hStdinRead;
    si.hStdOutput = hStdoutWrite;
    si.hStdError = hStdoutWrite; // stderr も同じパイプへ

    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));

    char cmdline[MAX_PATH + 16];
    char comspec[MAX_PATH];
    if (GetEnvironmentVariableA("COMSPEC", comspec, MAX_PATH) == 0)
    {
        strcpy(comspec, "cmd.exe");
    }
    _snprintf(cmdline, sizeof(cmdline) - 1, "%s /Q", comspec);

    if (!CreateProcessA(NULL, cmdline, NULL, NULL,
                        TRUE, // bInheritHandles
                        CREATE_NO_WINDOW,
                        NULL, NULL, &si, &pi))
    {
        CloseHandle(hStdinRead);
        CloseHandle(hStdinWrite);
        CloseHandle(hStdoutRead);
        CloseHandle(hStdoutWrite);
        return 0;
    }

    // 子プロセス側のハンドルは親では不要なので閉じる
    CloseHandle(hStdinRead);
    CloseHandle(hStdoutWrite);
    CloseHandle(pi.hThread);

    s_hProc = pi.hProcess;
    s_hStdin = hStdinWrite;
    s_hStdout = hStdoutRead;
    s_running = TRUE;

    // 出力読み取りスレッドを起動
    s_hReadThread = CreateThread(NULL, 0, read_thread, NULL, 0, NULL);

    return 1;
}

// ---------------------------------------------------------------------------
// cmd_proc_send: stdin に1行送る
// ---------------------------------------------------------------------------
void cmd_proc_send(const char *line)
{
    if (s_hStdin == NULL || !s_running)
        return;

    char buf[4096];
    int len = _snprintf(buf, sizeof(buf) - 3, "%s", line);
    if (len < 0)
        len = (int)sizeof(buf) - 3;

    // 末尾に \r\n を付与
    buf[len] = '\r';
    buf[len + 1] = '\n';
    buf[len + 2] = '\0';

    DWORD written;
    if (!WriteFile(s_hStdin, buf, len + 2, &written, NULL)) {
        fprintf(stderr, "ERROR|WriteFile to cmd stdin failed: %lu\n", GetLastError());
    } else if (written < (DWORD)(len + 2)) {
        fprintf(stderr, "ERROR|WriteFile incomplete: %lu/%d\n", written, len + 2);
    }
}

// ---------------------------------------------------------------------------
// cmd_proc_cd: GUI のディレクトリ移動を cmd に反映
// ---------------------------------------------------------------------------
void cmd_proc_cd(const char *path)
{
    char buf[MAX_PATH + 8];
    _snprintf(buf, sizeof(buf) - 1, "cd /d \"%s\"", path);
    cmd_proc_send(buf);
}

// ---------------------------------------------------------------------------
// cmd_proc_stop
// ---------------------------------------------------------------------------
void cmd_proc_stop(void)
{
    if (!s_running)
        return;
    s_running = FALSE;

    // cmd に exit を送って正常終了させる
    cmd_proc_send("exit");

    // 読み取りスレッドの終了を待つ
    if (s_hReadThread)
    {
        WaitForSingleObject(s_hReadThread, 2000);
        CloseHandle(s_hReadThread);
        s_hReadThread = NULL;
    }

    if (s_hStdin)
    {
        CloseHandle(s_hStdin);
        s_hStdin = NULL;
    }
    if (s_hStdout)
    {
        CloseHandle(s_hStdout);
        s_hStdout = NULL;
    }
    if (s_hProc)
    {
        WaitForSingleObject(s_hProc, 2000);
        CloseHandle(s_hProc);
        s_hProc = NULL;
    }
}

int cmd_proc_is_alive(void) {
    DWORD exitCode;
    if (s_hProc && GetExitCodeProcess(s_hProc, &exitCode)) {
        return exitCode == STILL_ACTIVE;
    }
    return 0;
}