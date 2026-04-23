#include <stdio.h>
#include <string.h>
#include <windows.h>
#include <commctrl.h>
#include "gui.h"
#include "filelist.h"
#include "sort.h"
#include "fs_ops.h"

// ---------------------------------------------------------------------------
// コントロール ID
// ---------------------------------------------------------------------------
#define ID_BTN_UP       101   // 「cd ..」ボタン
#define ID_BTN_REFRESH  102   // 更新ボタン
#define ID_LISTVIEW     103   // ディレクトリ表示（ListView）
#define ID_CONSOLE      104   // コンソールペイン（Edit）

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------
#define TOOLBAR_H   36   // ツールバー行の高さ
#define BTN_W       80   // ボタン幅
#define BTN_H       24   // ボタン高さ
#define BTN_MARGIN   8   // ボタン間マージン
#define CONSOLE_H  160   // コンソールペインの高さ
#define SPLITTER_H   4   // スプリッター（視覚的余白）

// ---------------------------------------------------------------------------
// ウィンドウクラス名
// ---------------------------------------------------------------------------
static const char *CLASS_NAME = "FilerMainWindow";

// ---------------------------------------------------------------------------
// グローバルハンドル（このファイル内でのみ使用）
// ---------------------------------------------------------------------------
static HWND g_hwnd        = NULL;
static HWND g_hListView   = NULL;
static HWND g_hConsole    = NULL;
static HWND g_hBtnUp      = NULL;
static HWND g_hBtnRefresh = NULL;

// ---------------------------------------------------------------------------
// ディレクトリ表示の更新
// ---------------------------------------------------------------------------
static void refresh_listview(void)
{
    char path[MAX_PATH];
    GetCurrentDirectory(MAX_PATH, path);

    // タイトルバーにカレントパスを表示
    char title[MAX_PATH + 32];
    _snprintf(title, sizeof(title) - 1, "Filer - %s", path);
    title[sizeof(title) - 1] = '\0';
    SetWindowText(g_hwnd, title);

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

        // 列0: 名前
        lvi.iItem    = i;
        lvi.iSubItem = 0;
        lvi.pszText  = e->name;
        ListView_InsertItem(g_hListView, &lvi);

        // 列1: 種別
        const char *kind = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "[DIR]" : "[FILE]";
        ListView_SetItemText(g_hListView, i, 1, (LPSTR)kind);

        // 列2: サイズ
        char size_str[32] = "-";
        if (!(e->attributes & FILE_ATTRIBUTE_DIRECTORY))
            _snprintf(size_str, sizeof(size_str) - 1, "%lld", e->size);
        ListView_SetItemText(g_hListView, i, 2, size_str);
    }

    filelist_free(&list);

    // ログにも記録
    char log_buf[MAX_PATH + 32];
    _snprintf(log_buf, sizeof(log_buf) - 1, "ls: %s\r\n", path);
    gui_log(log_buf);
}

// ---------------------------------------------------------------------------
// gui_log: コンソールペインへテキストを追記
// ---------------------------------------------------------------------------
void gui_log(const char *text)
{
    if (g_hConsole == NULL)
        return;

    // Edit コントロールの末尾に追記する
    int len = GetWindowTextLength(g_hConsole);
    SendMessage(g_hConsole, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    SendMessage(g_hConsole, EM_REPLACESEL, FALSE, (LPARAM)text);
}

// ---------------------------------------------------------------------------
// ListView のダブルクリック：ディレクトリならcdして更新
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
        cmd_cd(name);         // fs_ops の cmd_cd を使う
        refresh_listview();
    }
}

// ---------------------------------------------------------------------------
// コントロールの生成
// ---------------------------------------------------------------------------
static void create_controls(HWND hwnd)
{
    // --- ツールバー行のボタン ---
    g_hBtnUp = CreateWindowEx(
        0, "BUTTON", "[ .. ]",
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
        BTN_MARGIN, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
        hwnd, (HMENU)(INT_PTR)ID_BTN_UP, GetModuleHandle(NULL), NULL);

    g_hBtnRefresh = CreateWindowEx(
        0, "BUTTON", "更新",
        WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
        BTN_MARGIN * 2 + BTN_W, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
        hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, GetModuleHandle(NULL), NULL);

    // --- ListView（ディレクトリ表示） ---
    g_hListView = CreateWindowEx(
        WS_EX_CLIENTEDGE, WC_LISTVIEW, "",
        WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS,
        0, TOOLBAR_H, 0, 0,   // サイズは WM_SIZE で決定
        hwnd, (HMENU)(INT_PTR)ID_LISTVIEW, GetModuleHandle(NULL), NULL);

    ListView_SetExtendedListViewStyle(g_hListView,
        LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES);

    // 列の追加
    LVCOLUMN col;
    ZeroMemory(&col, sizeof(col));
    col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_FMT;

    col.pszText = "名前";   col.cx = 300; col.fmt = LVCFMT_LEFT;
    ListView_InsertColumn(g_hListView, 0, &col);

    col.pszText = "種別";   col.cx =  60; col.fmt = LVCFMT_CENTER;
    ListView_InsertColumn(g_hListView, 1, &col);

    col.pszText = "サイズ"; col.cx = 100; col.fmt = LVCFMT_RIGHT;
    ListView_InsertColumn(g_hListView, 2, &col);

    // --- コンソールペイン（読み取り専用 Edit） ---
    g_hConsole = CreateWindowEx(
        WS_EX_CLIENTEDGE, "EDIT", "",
        WS_CHILD | WS_VISIBLE | WS_VSCROLL |
        ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
        0, 0, 0, 0,   // サイズは WM_SIZE で決定
        hwnd, (HMENU)(INT_PTR)ID_CONSOLE, GetModuleHandle(NULL), NULL);

    // 等幅フォントを設定
    HFONT hFont = CreateFont(
        14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        ANSI_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, "Consolas");
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)hFont, TRUE);
}

// ---------------------------------------------------------------------------
// WM_SIZE: コントロールのリサイズ
// ---------------------------------------------------------------------------
static void on_resize(int cx, int cy)
{
    int list_h   = cy - TOOLBAR_H - SPLITTER_H - CONSOLE_H;
    if (list_h < 0) list_h = 0;

    SetWindowPos(g_hListView, NULL,
        0, TOOLBAR_H, cx, list_h,
        SWP_NOZORDER);

    SetWindowPos(g_hConsole, NULL,
        0, TOOLBAR_H + list_h + SPLITTER_H, cx, CONSOLE_H,
        SWP_NOZORDER);
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

    case WM_COMMAND:
        switch (LOWORD(wp))
        {
        case ID_BTN_UP:
            // cd .. と同等
            cmd_cd("..");
            gui_log("cd ..\r\n");
            refresh_listview();
            break;

        case ID_BTN_REFRESH:
            refresh_listview();
            break;
        }
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
// gui_run: ウィンドウ作成とメッセージループ
// ---------------------------------------------------------------------------
int gui_run(HINSTANCE hInstance, int nCmdShow)
{
    // Common Controls（ListView 等）を有効化
    INITCOMMONCONTROLSEX icc;
    icc.dwSize = sizeof(icc);
    icc.dwICC  = ICC_LISTVIEW_CLASSES;
    InitCommonControlsEx(&icc);

    // ウィンドウクラスの登録
    WNDCLASSEX wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize        = sizeof(wc);
    wc.style         = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc   = wnd_proc;
    wc.hInstance     = hInstance;
    wc.hCursor       = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = CLASS_NAME;
    wc.hIcon         = LoadIcon(NULL, IDI_APPLICATION);

    if (!RegisterClassEx(&wc))
        return -1;

    // ウィンドウの作成
    HWND hwnd = CreateWindowEx(
        0, CLASS_NAME, "Filer",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
        NULL, NULL, hInstance, NULL);

    if (hwnd == NULL)
        return -1;

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    // メッセージループ
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}
