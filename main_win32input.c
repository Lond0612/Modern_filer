#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "gui.h"
#include "cui.h"

// ---------------------------------------------------------------------------
// FILE*/fgets を一切使わず ReadConsoleA で直接読む版
//
// process_user_input() は内部で fgets を使っているため、
// こちらでは cui.h の代わりに各コマンド関数を直接呼ぶ専用ループを持つ。
// ---------------------------------------------------------------------------

// cui.c の内部と同じコマンド処理を Win32 入力で再実装
#include "fs_ops.h"
#include "filelist.h"
#include "sort.h"
#include "search.h"

static void win32_cmd_ls(const char *path)
{
    FileList list = filelist_create();
    if (filelist_fetch(&list, path) < 0) { filelist_free(&list); return; }
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});
    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];
        char buf[MAX_PATH + 64];
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY)
            _snprintf(buf, sizeof(buf), "[DIR]  %s\r\n", e->name);
        else
            _snprintf(buf, sizeof(buf), "[FILE] %s  (%lld bytes)\r\n", e->name, e->size);
        DWORD written;
        WriteConsoleA(GetStdHandle(STD_OUTPUT_HANDLE), buf, (DWORD)strlen(buf), &written, NULL);
        gui_log(buf);
    }
    filelist_free(&list);
}

static void con_print(HANDLE hOut, const char *s)
{
    DWORD w;
    WriteConsoleA(hOut, s, (DWORD)strlen(s), &w, NULL);
    gui_log(s);
}

static DWORD WINAPI cui_thread(LPVOID _unused)
{
    (void)_unused;

    AllocConsole();
    HANDLE hIn  = GetStdHandle(STD_INPUT_HANDLE);
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);

    // コードページ設定
    SetConsoleCP(65001);
    SetConsoleOutputCP(65001);

    con_print(hOut, "Filer CUI Started. Type 'exit' to quit.\r\n");

    char input[256];
    while (1)
    {
        char path[MAX_PATH];
        GetCurrentDirectoryA(MAX_PATH, path);

        // プロンプト表示
        char prompt[MAX_PATH + 4];
        _snprintf(prompt, sizeof(prompt), "\n%s\n> ", path);
        con_print(hOut, prompt);

        // ReadConsoleA で1行読む（FILE*/fgets を使わない）
        DWORD read = 0;
        memset(input, 0, sizeof(input));
        if (!ReadConsoleA(hIn, input, sizeof(input) - 1, &read, NULL))
            break;

        // 末尾の \r\n を除去
        for (int i = (int)read - 1; i >= 0 && (input[i] == '\r' || input[i] == '\n'); i--)
            input[i] = '\0';

        if (strlen(input) == 0) continue;

        // ログに記録
        char log_buf[280];
        _snprintf(log_buf, sizeof(log_buf), "> %s\r\n", input);
        gui_log(log_buf);

        // --- コマンド解析 ---
        char *argv[8] = {0};
        int argc = 0;
        char *tok = strtok(input, " ");
        while (tok && argc < 8) { argv[argc++] = tok; tok = strtok(NULL, " "); }
        if (argc == 0) continue;

        if      (strcmp(argv[0], "exit") == 0) break;
        else if (strcmp(argv[0], "ls")   == 0) win32_cmd_ls(path);
        else if (strcmp(argv[0], "cd")   == 0)
        {
            if (argc < 2) con_print(hOut, "Usage: cd <path>\r\n");
            else { cmd_cd(argv[1]); gui_log("cd: OK\r\n"); }
        }
        else if (strcmp(argv[0], "touch") == 0)
        {
            if (argc < 2) con_print(hOut, "Usage: touch <file>\r\n");
            else cmd_touch(argv[1]);
        }
        else if (strcmp(argv[0], "rm") == 0)
        {
            if (argc < 2) con_print(hOut, "Usage: rm <file>\r\n");
            else cmd_rm(argv[1], 0);
        }
        else if (strcmp(argv[0], "cp") == 0)
        {
            if (argc < 3) con_print(hOut, "Usage: cp <src> <dst>\r\n");
            else cmd_cp(argv[1], argv[2], 0);
        }
        else if (strcmp(argv[0], "mv") == 0)
        {
            if (argc < 3) con_print(hOut, "Usage: mv <src> <dst>\r\n");
            else cmd_mv(argv[1], argv[2], 0);
        }
        else if (strcmp(argv[0], "open") == 0)
        {
            if (argc < 2) con_print(hOut, "Usage: open <file>\r\n");
            else cmd_open(argv[1]);
        }
        else
        {
            char unk[64];
            _snprintf(unk, sizeof(unk), "Unknown command: %s\r\n", argv[0]);
            con_print(hOut, unk);
        }
    }

    con_print(hOut, "CUI Shutdown.\r\n");
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
