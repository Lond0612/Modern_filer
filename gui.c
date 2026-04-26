#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <windows.h>
#include <commctrl.h>
#include "gui.h"
#include "filelist.h"
#include "sort.h"
#include "fs_ops.h"
#include "cui.h"

// ---------------------------------------------------------------------------
// コントロール ID
// ---------------------------------------------------------------------------
#define ID_BTN_UP 101      // 「cd ..」ボタン
#define ID_BTN_REFRESH 102 // 更新ボタン
#define ID_LISTVIEW 103    // ディレクトリ表示（ListView）
#define ID_CONSOLE 104     // ログペイン（読み取り専用 Edit）
#define ID_INPUT 105       // コマンド入力欄
#define ID_BTN_EXEC 106    // 実行ボタン

// ---------------------------------------------------------------------------
// カスタムメッセージ
// gui_log() はCUIスレッドから呼ばれる。
// スレッドをまたいで直接 SendMessage するとデッドロックの危険があるため、
// PostMessage でメインスレッドのメッセージキューに投げ、
// wnd_proc 側で安全に Edit コントロールへ追記する。
// lParam に _strdup した文字列ポインタを渡し、wnd_proc 側で free する。
// ---------------------------------------------------------------------------
#define WM_GUI_LOG (WM_USER + 1)

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------
#define TOOLBAR_H 36   // ツールバー行の高さ
#define BTN_W 80       // ボタン幅
#define BTN_H 24       // ボタン高さ
#define BTN_MARGIN 8   // ボタン間マージン
#define INPUTBAR_H 32  // 入力バーの高さ
#define INPUT_BTN_W 64 // 実行ボタン幅
#define CONSOLE_H 160  // ログペインの高さ
#define SPLITTER_H 4   // スプリッター（視覚的余白）

// ---------------------------------------------------------------------------
// ウィンドウクラス名
// ---------------------------------------------------------------------------
static const char *CLASS_NAME = "FilerMainWindow";

// ---------------------------------------------------------------------------
// グローバルハンドル（このファイル内でのみ使用）
// ---------------------------------------------------------------------------
static HWND g_hwnd = NULL;
static HWND g_hListView = NULL;
static HWND g_hConsole = NULL;
static HWND g_hInput = NULL;
static HWND g_hBtnUp = NULL;
static HWND g_hBtnRefresh = NULL;
static HWND g_hBtnExec = NULL;

// ---------------------------------------------------------------------------
// ログペインへの追記（メインスレッド内から呼ぶこと）
// ---------------------------------------------------------------------------
static void append_log(const char *text)
{
    if (g_hConsole == NULL)
        return;
    int len = GetWindowTextLength(g_hConsole);
    SendMessage(g_hConsole, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    SendMessage(g_hConsole, EM_REPLACESEL, FALSE, (LPARAM)text);
}

// ---------------------------------------------------------------------------
// gui_log: どのスレッドからでも安全に呼べるログ出力
// PostMessage でメインスレッドに文字列を渡す。
// ---------------------------------------------------------------------------
void gui_log(const char *text)
{
    if (g_hwnd == NULL)
        return;
    // _strdup でヒープにコピー → wnd_proc の WM_GUI_LOG で free
    char *buf = _strdup(text);
    if (buf)
        PostMessage(g_hwnd, WM_GUI_LOG, 0, (LPARAM)buf);
}

// ---------------------------------------------------------------------------
// ディレクトリ表示の更新（メインスレッドから呼ぶこと）
// ---------------------------------------------------------------------------
static void refresh_listview(void)
{
    char path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, path);

    // タイトルバーにカレントパスを表示
    char title[MAX_PATH + 32];
    _snprintf(title, sizeof(title) - 1, "Filer - %s", path);
    title[sizeof(title) - 1] = '\0';
    SetWindowTextA(g_hwnd, title);

    // ListView をクリア
    ListView_DeleteAllItems(g_hListView);

    // filelist を取得してソート
    FileList list = filelist_create();
    if (filelist_fetch(&list, path) < 0)
    {
        filelist_free(&list);
        return;
    }
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});

    // ListView に挿入
    LVITEM lvi;
    ZeroMemory(&lvi, sizeof(lvi));
    lvi.mask = LVIF_TEXT;

    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];

        lvi.iItem = i;
        lvi.iSubItem = 0;
        lvi.pszText = e->name;
        ListView_InsertItem(g_hListView, &lvi);

        const char *kind = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "[DIR]" : "[FILE]";
        ListView_SetItemText(g_hListView, i, 1, (LPSTR)kind);

        char size_str[32] = "-";
        if (!(e->attributes & FILE_ATTRIBUTE_DIRECTORY))
            _snprintf(size_str, sizeof(size_str) - 1, "%lld", e->size);
        ListView_SetItemText(g_hListView, i, 2, size_str);
    }

    filelist_free(&list);

    // ログに記録
    char log_buf[MAX_PATH + 32];
    _snprintf(log_buf, sizeof(log_buf) - 1, "ls: %s\r\n", path);
    append_log(log_buf);
}

// ---------------------------------------------------------------------------
// ListView のダブルクリック：ディレクトリなら cd して更新
// ---------------------------------------------------------------------------
static void on_listview_dblclick(void)
{
    int sel = ListView_GetNextItem(g_hListView, -1, LVNI_SELECTED);
    if (sel < 0)
        return;

    char name[MAX_PATH];
    ListView_GetItemText(g_hListView, sel, 0, name, MAX_PATH);

    char kind[16];
    ListView_GetItemText(g_hListView, sel, 1, kind, sizeof(kind));

    if (strcmp(kind, "[DIR]") == 0)
    {
        char log_buf[MAX_PATH + 16];
        _snprintf(log_buf, sizeof(log_buf) - 1, "cd %s\r\n", name);
        append_log(log_buf);
        cmd_cd(name);
        refresh_listview();
    }
}

// ---------------------------------------------------------------------------
// 入力欄のコマンドを実行（メインスレッド）
//
// Editコントロールは内部でUnicode(W)で動いているため、
// GetWindowTextW で取得して CP932 に変換してから処理する。
// これにより日本語パスの文字化けを防ぐ。
//
// コマンド解析は「最初の単語 = コマンド名、残り全体 = 引数」とする。
// strtok でスペース区切りにすると日本語パスやスペース入りパスが壊れる。
// ---------------------------------------------------------------------------
static void execute_input(void)
{
    // --- EditコントロールからUnicodeで取得してCP932に変換 ---
    WCHAR winput[512] = {0};
    GetWindowTextW(g_hInput, winput, 512);
    if (wcslen(winput) == 0)
        return;

    char input[512] = {0};
    WideCharToMultiByte(CP_ACP, 0, winput, -1, input, sizeof(input), NULL, NULL);

    // ログに入力内容を表示
    char log_buf[560];
    _snprintf(log_buf, sizeof(log_buf) - 1, "> %s\r\n", input);
    append_log(log_buf);

    // 入力欄をクリア
    SetWindowTextA(g_hInput, "");

    // --- コマンド名と引数を分離 ---
    // 先頭の空白をスキップ
    char *p = input;
    while (*p == ' ')
        p++;
    if (*p == '\0')
        return;

    // コマンド名（最初のスペースまで）
    char cmd[64] = {0};
    char *sp = strchr(p, ' ');
    if (sp)
    {
        size_t len = sp - p;
        if (len >= sizeof(cmd))
            len = sizeof(cmd) - 1;
        strncpy(cmd, p, len);
        // 引数（コマンド名の後ろ、先頭スペースをスキップ）
        p = sp + 1;
        while (*p == ' ')
            p++;
    }
    else
    {
        strncpy(cmd, p, sizeof(cmd) - 1);
        p = p + strlen(p); // 引数なし（空文字列を指す）
    }
    char *arg1 = p; // 引数全体（スペース含む日本語パスもそのまま通る）

    // --- 2つ目の引数（cp/mv用）: arg1 内の最初のスペースで分割 ---
    char *arg2 = NULL;
    char *sp2 = strchr(arg1, ' ');
    if (sp2)
    {
        *sp2 = '\0';
        arg2 = sp2 + 1;
        while (*arg2 == ' ')
            arg2++;
    }

    if (strcmp(cmd, "ls") == 0)
    {
        refresh_listview();
    }
    else if (strcmp(cmd, "cd") == 0)
    {
        if (strlen(arg1) == 0)
            append_log("Usage: cd <path>\r\n");
        else
        {
            cmd_cd(arg1);
            refresh_listview();
        }
    }
    else if (strcmp(cmd, "cat") == 0)
    {
        if (strlen(arg1) == 0)
            append_log("Usage: cat <file>\r\n");
        else
            cmd_cat(arg1);
    }
    else if (strcmp(cmd, "touch") == 0)
    {
        if (strlen(arg1) == 0)
            append_log("Usage: touch <file>\r\n");
        else
        {
            cmd_touch(arg1);
            refresh_listview();
        }
    }
    else if (strcmp(cmd, "rm") == 0)
    {
        if (strlen(arg1) == 0)
            append_log("Usage: rm <file>\r\n");
        else
        {
            int r = cmd_rm(arg1, 0);
            if (r == FS_NEED_CONFIRM)
            {
                char msg[MAX_PATH + 32];
                _snprintf(msg, sizeof(msg) - 1, "%s\nこのファイルを削除しますか？", arg1);
                if (MessageBoxA(g_hwnd, msg, "確認", MB_YESNO | MB_ICONWARNING) == IDYES)
                    cmd_rm(arg1, 1);
                else
                    append_log("Cancelled.\r\n");
            }
            refresh_listview();
        }
    }
    else if (strcmp(cmd, "cp") == 0)
    {
        if (strlen(arg1) == 0 || arg2 == NULL)
            append_log("Usage: cp <src> <dst>\r\n");
        else
        {
            int r = cmd_cp(arg1, arg2, 0);
            if (r == FS_NEED_CONFIRM)
            {
                char msg[MAX_PATH + 32];
                _snprintf(msg, sizeof(msg) - 1, "%s は既に存在します。上書きしますか？", arg2);
                if (MessageBoxA(g_hwnd, msg, "確認", MB_YESNO | MB_ICONWARNING) == IDYES)
                    cmd_cp(arg1, arg2, 1);
                else
                    append_log("Cancelled.\r\n");
            }
            refresh_listview();
        }
    }
    else if (strcmp(cmd, "mv") == 0)
    {
        if (strlen(arg1) == 0 || arg2 == NULL)
            append_log("Usage: mv <src> <dst>\r\n");
        else
        {
            int r = cmd_mv(arg1, arg2, 0);
            if (r == FS_NEED_CONFIRM)
            {
                char msg[MAX_PATH + 32];
                _snprintf(msg, sizeof(msg) - 1, "%s は既に存在します。上書きしますか？", arg2);
                if (MessageBoxA(g_hwnd, msg, "確認", MB_YESNO | MB_ICONWARNING) == IDYES)
                    cmd_mv(arg1, arg2, 1);
                else
                    append_log("Cancelled.\r\n");
            }
            refresh_listview();
        }
    }
    else if (strcmp(cmd, "open") == 0)
    {
        if (strlen(arg1) == 0)
            append_log("Usage: open <file>\r\n");
        else
            cmd_open(arg1);
    }
    else if (strcmp(cmd, "exit") == 0)
    {
        append_log("GUIを終了するには右上の×ボタンを使用してください。\r\n");
    }
    else
    {
        char unk[128];
        _snprintf(unk, sizeof(unk) - 1, "Unknown command: %s\r\n", cmd);
        append_log(unk);
    }
}
}

// ---------------------------------------------------------------------------
// コントロールの生成
// ---------------------------------------------------------------------------
static void create_controls(HWND hwnd)
{
    HINSTANCE hInst = GetModuleHandle(NULL);

    // --- ツールバー行のボタン ---
    g_hBtnUp = CreateWindowExA(
        0, "BUTTON", "[ .. ]",
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
        BTN_MARGIN, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
        hwnd, (HMENU)(INT_PTR)ID_BTN_UP, hInst, NULL);

    g_hBtnRefresh = CreateWindowExA(
        0, "BUTTON", "更新",
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
        BTN_MARGIN * 2 + BTN_W, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
        hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, hInst, NULL);

    // --- ListView（ディレクトリ表示） ---
    g_hListView = CreateWindowExA(
        WS_EX_CLIENTEDGE, WC_LISTVIEWA, "",
        WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS,
        0, TOOLBAR_H, 0, 0,
        hwnd, (HMENU)(INT_PTR)ID_LISTVIEW, hInst, NULL);

    ListView_SetExtendedListViewStyle(g_hListView,
                                      LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES);

    LVCOLUMNA col;
    ZeroMemory(&col, sizeof(col));
    col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_FMT;

    col.pszText = "名前";
    col.cx = 300;
    col.fmt = LVCFMT_LEFT;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 0, (LPARAM)&col);

    col.pszText = "種別";
    col.cx = 60;
    col.fmt = LVCFMT_CENTER;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 1, (LPARAM)&col);

    col.pszText = "サイズ";
    col.cx = 100;
    col.fmt = LVCFMT_RIGHT;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 2, (LPARAM)&col);

    // --- ログペイン（読み取り専用 Edit） ---
    g_hConsole = CreateWindowExA(
        WS_EX_CLIENTEDGE, "EDIT", "",
        WS_CHILD | WS_VISIBLE | WS_VSCROLL |
            ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
        0, 0, 0, 0,
        hwnd, (HMENU)(INT_PTR)ID_CONSOLE, hInst, NULL);

    // --- 入力欄 ---
    g_hInput = CreateWindowExA(
        WS_EX_CLIENTEDGE, "EDIT", "",
        WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
        0, 0, 0, 0,
        hwnd, (HMENU)(INT_PTR)ID_INPUT, hInst, NULL);

    // --- 実行ボタン ---
    g_hBtnExec = CreateWindowExA(
        0, "BUTTON", "実行",
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_DEFPUSHBUTTON,
        0, 0, 0, 0,
        hwnd, (HMENU)(INT_PTR)ID_BTN_EXEC, hInst, NULL);

    // 等幅フォントを生成（ログペインと入力欄に適用）
    HFONT hFont = CreateFontA(
        14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, "MS Gothic");
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)hFont, TRUE);
    SendMessage(g_hInput, WM_SETFONT, (WPARAM)hFont, TRUE);
    SendMessage(g_hBtnExec, WM_SETFONT, (WPARAM)hFont, TRUE);
}

// ---------------------------------------------------------------------------
// WM_SIZE: コントロールのリサイズ
// ---------------------------------------------------------------------------
static void on_resize(int cx, int cy)
{
    // 縦方向の割り当て:
    //   TOOLBAR_H  : ツールバー
    //   list_h     : ListView（残り全部）
    //   SPLITTER_H : 余白
    //   CONSOLE_H  : ログペイン
    //   INPUTBAR_H : 入力バー
    int list_h = cy - TOOLBAR_H - SPLITTER_H - CONSOLE_H - INPUTBAR_H;
    if (list_h < 0)
        list_h = 0;

    int y_list = TOOLBAR_H;
    int y_console = y_list + list_h + SPLITTER_H;
    int y_input = y_console + CONSOLE_H;

    SetWindowPos(g_hListView, NULL, 0, y_list, cx, list_h, SWP_NOZORDER);
    SetWindowPos(g_hConsole, NULL, 0, y_console, cx, CONSOLE_H, SWP_NOZORDER);

    // 入力バー: [入力欄 | 実行ボタン]
    int input_w = cx - INPUT_BTN_W - BTN_MARGIN;
    int btn_margin_v = (INPUTBAR_H - BTN_H) / 2;
    SetWindowPos(g_hInput, NULL, 0, y_input + btn_margin_v,
                 input_w, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnExec, NULL, input_w, y_input + btn_margin_v,
                 INPUT_BTN_W, BTN_H, SWP_NOZORDER);
}

// ---------------------------------------------------------------------------
// ウィンドウプロシージャ
// ---------------------------------------------------------------------------
static LRESULT CALLBACK wnd_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg)
    {
    case WM_CREATE:
        g_hwnd = hwnd;
        create_controls(hwnd);
        refresh_listview();
        return 0;

    case WM_SIZE:
        on_resize(LOWORD(lp), HIWORD(lp));
        return 0;

    // --- CUIスレッドからの安全なログ追記 ---
    case WM_GUI_LOG:
    {
        char *text = (char *)lp;
        if (text)
        {
            append_log(text);
            free(text);
        }
        return 0;
    }

    case WM_COMMAND:
        switch (LOWORD(wp))
        {
        case ID_BTN_UP:
            append_log("cd ..\r\n");
            cmd_cd("..");
            refresh_listview();
            break;

        case ID_BTN_REFRESH:
            refresh_listview();
            break;

        case ID_BTN_EXEC:
            execute_input();
            break;

        // 入力欄で Enter キーが押された
        case ID_INPUT:
            if (HIWORD(wp) == EN_CHANGE)
                break; // 文字変化は無視
            // EN_CHANGE 以外は実行（Enter = WM_COMMAND が来る）
            break;
        }
        return 0;

    // 入力欄での Enter キーをフックして実行
    case WM_KEYDOWN:
        return 0;

    case WM_NOTIFY:
    {
        NMHDR *nm = (NMHDR *)lp;
        if (nm->idFrom == ID_LISTVIEW && nm->code == NM_DBLCLK)
            on_listview_dblclick();
        return 0;
    }

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// 入力欄の Enter キーをサブクラス化でフック
// ---------------------------------------------------------------------------
static WNDPROC g_orig_input_proc = NULL;

static LRESULT CALLBACK input_subclass_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    if (msg == WM_KEYDOWN && wp == VK_RETURN)
    {
        execute_input();
        return 0;
    }
    return CallWindowProc(g_orig_input_proc, hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// gui_run: ウィンドウ作成とメッセージループ
// ---------------------------------------------------------------------------
int gui_run(HINSTANCE hInstance, int nCmdShow)
{
    SetThreadLocale(MAKELCID(MAKELANGID(LANG_JAPANESE, SUBLANG_DEFAULT), SORT_DEFAULT));

    INITCOMMONCONTROLSEX icc;
    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_LISTVIEW_CLASSES;
    InitCommonControlsEx(&icc);

    WNDCLASSEXA wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = wnd_proc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = CLASS_NAME;
    wc.hIcon = LoadIcon(NULL, IDI_APPLICATION);

    if (!RegisterClassExA(&wc))
        return -1;

    HWND hwnd = CreateWindowExA(
        0, CLASS_NAME, "Filer",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
        NULL, NULL, hInstance, NULL);

    if (hwnd == NULL)
        return -1;

    // 入力欄に Enter フックのサブクラスを設定
    g_orig_input_proc = (WNDPROC)SetWindowLongPtr(
        g_hInput, GWLP_WNDPROC, (LONG_PTR)input_subclass_proc);

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}