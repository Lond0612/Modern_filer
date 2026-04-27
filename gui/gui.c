#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <windows.h>
#include <commctrl.h>
#include "gui.h"
#include "../proc/cmd_proc.h"
#include "../core/filelist.h"
#include "../core/sort.h"
#include "config.h"

// ---------------------------------------------------------------------------
// コントロール ID
// ---------------------------------------------------------------------------
#define ID_BTN_UP 101
#define ID_BTN_REFRESH 102
#define ID_LISTVIEW 103
#define ID_CONSOLE 104
#define ID_INPUT 105
#define ID_BTN_EXEC 106
#define ID_TREEVIEW 107
#define ID_ADDRESSBAR 108

// カスタムメッセージ
#define WM_GUI_LOG (WM_USER + 1) // cmd出力をメインスレッドでログペインへ追記

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------
#define TOOLBAR_H 36
#define BTN_W 80
#define BTN_H 24
#define BTN_MARGIN 8
#define INPUTBAR_H 32
#define INPUT_BTN_W 64
#define CONSOLE_H 180
#define VSPLIT_H 4
#define HSPLIT_W 4
#define TREE_W_DEFAULT 200
#define TREE_W_MIN 60

// ---------------------------------------------------------------------------
// グローバルハンドル / 状態
// ---------------------------------------------------------------------------
static const char *CLASS_NAME = "FilerMainWindow";
static HWND g_hwnd = NULL;
static HWND g_hTreeView = NULL;
static HWND g_hListView = NULL;
static HWND g_hConsole = NULL;
static HWND g_hInput = NULL;
static HWND g_hAddrBar = NULL;
static HWND g_hBtnUp = NULL;
static HWND g_hBtnRefresh = NULL;
static HWND g_hBtnExec = NULL;
static WNDPROC g_orig_input_proc = NULL;
static WNDPROC g_orig_addr_proc = NULL;

static int g_tree_w = TREE_W_DEFAULT; // config_load後にWM_CREATEで上書き
static BOOL g_dragging_split = FALSE;
static int g_drag_start_x = 0;
static int g_drag_tree_w = 0; // ---------------------------------------------------------------------------
// ログペインへの追記（メインスレッド専用）
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
// cmd の出力スレッドから呼ばれるため PostMessage で渡す
// ---------------------------------------------------------------------------
void gui_log(const char *text)
{
    if (g_hwnd == NULL)
        return;
    char *buf = _strdup(text);
    if (buf)
        PostMessage(g_hwnd, WM_GUI_LOG, 0, (LPARAM)buf);
}

// ---------------------------------------------------------------------------
// cmd 出力コールバック（読み取りスレッドから呼ばれる）
// ---------------------------------------------------------------------------
static void on_cmd_output(const char *text)
{
    gui_log(text);
}

// ---------------------------------------------------------------------------
// アドレスバーとタイトルバーをカレントパスで更新
// ---------------------------------------------------------------------------
static void update_addressbar(void)
{
    char path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, path);
    SetWindowTextA(g_hAddrBar, path);

    char title[MAX_PATH + 32];
    _snprintf(title, sizeof(title) - 1, "Filer - %s", path);
    title[sizeof(title) - 1] = '\0';
    SetWindowTextA(g_hwnd, title);
}

// ---------------------------------------------------------------------------
// ディレクトリ移動: GUI + cmd を同期して更新
// ---------------------------------------------------------------------------
static void navigate_to(const char *path)
{
    // GUI 側のカレントディレクトリを変更
    if (!SetCurrentDirectoryA(path))
    {
        char msg[MAX_PATH + 32];
        _snprintf(msg, sizeof(msg) - 1, "移動できませんでした: %s\r\n", path);
        append_log(msg);
        return;
    }
    // cmd プロセスのカレントディレクトリも同期
    cmd_proc_cd(path);
    update_addressbar();
}

// ---------------------------------------------------------------------------
// TreeView
// ---------------------------------------------------------------------------
static HTREEITEM tree_add_item(HTREEITEM hParent, const char *label,
                               const char *path, BOOL hasChildren)
{
    TVINSERTSTRUCTA tvis;
    ZeroMemory(&tvis, sizeof(tvis));
    tvis.hParent = hParent;
    tvis.hInsertAfter = TVI_SORT;
    tvis.item.mask = TVIF_TEXT | TVIF_PARAM | TVIF_CHILDREN;
    tvis.item.pszText = (LPSTR)label;
    tvis.item.lParam = (LPARAM)_strdup(path);
    tvis.item.cChildren = hasChildren ? 1 : 0;
    return (HTREEITEM)SendMessage(g_hTreeView, TVM_INSERTITEMA, 0, (LPARAM)&tvis);
}

static void tree_populate_children(HTREEITEM hParent, const char *path)
{
    char search[MAX_PATH];
    _snprintf(search, sizeof(search) - 1, "%s\\*", path);
    search[sizeof(search) - 1] = '\0';

    WIN32_FIND_DATAA fd;
    HANDLE hFind = FindFirstFileA(search, &fd);
    if (hFind == INVALID_HANDLE_VALUE)
        return;

    do
    {
        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY))
            continue;
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        char child_path[MAX_PATH];
        _snprintf(child_path, sizeof(child_path) - 1, "%s\\%s", path, fd.cFileName);
        child_path[sizeof(child_path) - 1] = '\0';

        // 孫ディレクトリの有無（展開矢印の表示判定）
        BOOL hasChildren = FALSE;
        char grandchild[MAX_PATH];
        _snprintf(grandchild, sizeof(grandchild) - 1, "%s\\*", child_path);
        grandchild[sizeof(grandchild) - 1] = '\0';
        WIN32_FIND_DATAA fd2;
        HANDLE hFind2 = FindFirstFileA(grandchild, &fd2);
        if (hFind2 != INVALID_HANDLE_VALUE)
        {
            do
            {
                if ((fd2.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
                    strcmp(fd2.cFileName, ".") != 0 &&
                    strcmp(fd2.cFileName, "..") != 0)
                {
                    hasChildren = TRUE;
                    break;
                }
            } while (FindNextFileA(hFind2, &fd2));
            FindClose(hFind2);
        }
        tree_add_item(hParent, fd.cFileName, child_path, hasChildren);
    } while (FindNextFileA(hFind, &fd));
    FindClose(hFind);
}

static void tree_populate_drives(void)
{
    DWORD drives = GetLogicalDrives();
    for (int i = 0; i < 26; i++)
    {
        if (!(drives & (1 << i)))
            continue;
        char label[4] = {'A' + i, ':', '\\', '\0'};
        tree_add_item(TVI_ROOT, label, label, TRUE);
    }
}

static void tree_free_lparams(HTREEITEM hItem)
{
    if (hItem == NULL)
        return;
    TVITEMA tvi;
    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
    free((void *)tvi.lParam);

    HTREEITEM hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                              TVGN_CHILD, (LPARAM)hItem);
    while (hChild)
    {
        tree_free_lparams(hChild);
        hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                        TVGN_NEXT, (LPARAM)hChild);
    }
}

static void on_treeview_expand(HTREEITEM hItem)
{
    // 子の lParam を確認し、展開済みかどうかを判断
    HTREEITEM hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                              TVGN_CHILD, (LPARAM)hItem);
    if (hChild != NULL)
    {
        TVITEMA tvi;
        ZeroMemory(&tvi, sizeof(tvi));
        tvi.mask = TVIF_PARAM | TVIF_HANDLE;
        tvi.hItem = hChild;
        SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
        if (tvi.lParam != 0)
            return; // 展開済み
        SendMessage(g_hTreeView, TVM_DELETEITEM, 0, (LPARAM)hChild);
    }

    TVITEMA tvi;
    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
    const char *path = (const char *)tvi.lParam;
    if (path)
        tree_populate_children(hItem, path);
}

// ---------------------------------------------------------------------------
// ListView の更新
// ---------------------------------------------------------------------------
static void refresh_listview(void)
{
    char path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, path);
    update_addressbar();
    ListView_DeleteAllItems(g_hListView);

    FileList list = filelist_create();
    if (filelist_fetch(&list, path) < 0)
    {
        filelist_free(&list);
        return;
    }
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});

    LVITEMA lvi;
    ZeroMemory(&lvi, sizeof(lvi));
    lvi.mask = LVIF_TEXT;

    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];
        lvi.iItem = i;
        lvi.iSubItem = 0;
        lvi.pszText = e->name;
        SendMessage(g_hListView, LVM_INSERTITEMA, 0, (LPARAM)&lvi);

        const char *kind = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "[DIR]" : "[FILE]";
        ListView_SetItemText(g_hListView, i, 1, (LPSTR)kind);

        char size_str[32];
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY)
            _snprintf(size_str, sizeof(size_str) - 1, "-");
        else
            _snprintf(size_str, sizeof(size_str) - 1, "%lld", e->size);
        ListView_SetItemText(g_hListView, i, 2, size_str);
    }
    filelist_free(&list);
}

// ---------------------------------------------------------------------------
// ListView ダブルクリック
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

    char path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, path);

    if (strcmp(kind, "[DIR]") == 0)
    {
        char fullpath[MAX_PATH];
        _snprintf(fullpath, sizeof(fullpath) - 1, "%s\\%s", path, name);
        navigate_to(fullpath);
        refresh_listview();
    }
    else
    {
        // ファイル: 関連付けアプリで開く
        char fullpath[MAX_PATH];
        _snprintf(fullpath, sizeof(fullpath) - 1, "%s\\%s", path, name);
        ShellExecuteA(NULL, "open", fullpath, NULL, NULL, SW_SHOWNORMAL);
    }
}

// ---------------------------------------------------------------------------
// TreeView クリック: 選択ディレクトリに移動
// ---------------------------------------------------------------------------
static void on_treeview_select(HTREEITEM hItem)
{
    TVITEMA tvi;
    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);

    const char *path = (const char *)tvi.lParam;
    if (path == NULL || strlen(path) == 0)
        return;

    navigate_to(path);
    refresh_listview();
}

// ---------------------------------------------------------------------------
// 入力欄のコマンドを cmd に送信
// ---------------------------------------------------------------------------
static void execute_input(void)
{
    WCHAR winput[1024];
    ZeroMemory(winput, sizeof(winput));
    GetWindowTextW(g_hInput, winput, 1024);
    if (wcslen(winput) == 0)
        return;

    char input[1024];
    ZeroMemory(input, sizeof(input));
    WideCharToMultiByte(CP_ACP, 0, winput, -1, input, sizeof(input) - 1, NULL, NULL);

    SetWindowTextA(g_hInput, "");

    // exit はアプリ終了
    char trimmed[1024];
    strncpy(trimmed, input, sizeof(trimmed) - 1);
    trimmed[sizeof(trimmed) - 1] = '\0';
    // 先頭の空白をスキップして比較
    char *p = trimmed;
    while (*p == ' ')
        p++;
    if (_stricmp(p, "exit") == 0)
    {
        cmd_proc_stop();
        DestroyWindow(g_hwnd);
        return;
    }

    // それ以外は cmd にそのまま送る
    cmd_proc_send(input);

    // cd コマンドを検出して GUI 側のカレントディレクトリも更新
    // （cmd は別プロセスのため GUI 側に反映されない）
    if (_strnicmp(p, "cd", 2) == 0 && (p[2] == ' ' || p[2] == '\0'))
    {
        // cmd の処理が完了するまで少し待ってから GUI を更新
        Sleep(100);
        // cd の引数からパスを取得するのは複雑なため、
        // cmd に問い合わせて現在のパスを取得する方式を取る。
        // ここでは簡易的に refresh_listview のタイマーで対応。
        SetTimer(g_hwnd, 1, 200, NULL);
    }
}

// ---------------------------------------------------------------------------
// アドレスバー Enter フック
// ---------------------------------------------------------------------------
static LRESULT CALLBACK addr_subclass_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    if (msg == WM_KEYDOWN && wp == VK_RETURN)
    {
        WCHAR wpath[MAX_PATH];
        ZeroMemory(wpath, sizeof(wpath));
        GetWindowTextW(g_hAddrBar, wpath, MAX_PATH);

        char path[MAX_PATH];
        ZeroMemory(path, sizeof(path));
        WideCharToMultiByte(CP_ACP, 0, wpath, -1, path, sizeof(path) - 1, NULL, NULL);

        if (strlen(path) > 0)
        {
            navigate_to(path);
            refresh_listview();
        }
        return 0;
    }
    return CallWindowProc(g_orig_addr_proc, hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// 入力欄 Enter フック
// ---------------------------------------------------------------------------
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
// コントロール生成
// ---------------------------------------------------------------------------
static void create_controls(HWND hwnd)
{
    HINSTANCE hInst = GetModuleHandle(NULL);

    HFONT hFont = CreateFontA(
        g_config.font_size, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, g_config.font_name);

    // ツールバー
    g_hBtnUp = CreateWindowExA(0, "BUTTON", "[ .. ]",
                               WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                               BTN_MARGIN, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                               hwnd, (HMENU)(INT_PTR)ID_BTN_UP, hInst, NULL);
    SendMessage(g_hBtnUp, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hBtnRefresh = CreateWindowExA(0, "BUTTON", "更新",
                                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                    BTN_MARGIN * 2 + BTN_W, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                                    hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, hInst, NULL);
    SendMessage(g_hBtnRefresh, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hAddrBar = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                 BTN_MARGIN * 3 + BTN_W * 2, (TOOLBAR_H - BTN_H) / 2, 0, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_ADDRESSBAR, hInst, NULL);
    SendMessage(g_hAddrBar, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_addr_proc = (WNDPROC)SetWindowLongPtr(
        g_hAddrBar, GWLP_WNDPROC, (LONG_PTR)addr_subclass_proc);

    // TreeView
    g_hTreeView = CreateWindowExA(WS_EX_CLIENTEDGE, WC_TREEVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | TVS_HASLINES | TVS_HASBUTTONS |
                                      TVS_LINESATROOT | TVS_SHOWSELALWAYS,
                                  0, TOOLBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_TREEVIEW, hInst, NULL);
    SendMessage(g_hTreeView, WM_SETFONT, (WPARAM)hFont, TRUE);
    tree_populate_drives();

    // ListView
    g_hListView = CreateWindowExA(WS_EX_CLIENTEDGE, WC_LISTVIEWA, "",
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

    // ログペイン
    g_hConsole = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | WS_VSCROLL |
                                     ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_CONSOLE, hInst, NULL);
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)hFont, TRUE);

    // 入力欄
    g_hInput = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                               WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                               0, 0, 0, 0,
                               hwnd, (HMENU)(INT_PTR)ID_INPUT, hInst, NULL);
    SendMessage(g_hInput, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_input_proc = (WNDPROC)SetWindowLongPtr(
        g_hInput, GWLP_WNDPROC, (LONG_PTR)input_subclass_proc);

    // 実行ボタン
    g_hBtnExec = CreateWindowExA(0, "BUTTON", "実行",
                                 WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_EXEC, hInst, NULL);
    SendMessage(g_hBtnExec, WM_SETFONT, (WPARAM)hFont, TRUE);
}

// ---------------------------------------------------------------------------
// レイアウト計算
// ---------------------------------------------------------------------------
static void on_resize(int cx, int cy)
{
    int addr_x = BTN_MARGIN * 3 + BTN_W * 2;
    int addr_w = cx - addr_x - BTN_MARGIN;
    if (addr_w < 0)
        addr_w = 0;
    int btn_v = (TOOLBAR_H - BTN_H) / 2;
    SetWindowPos(g_hAddrBar, NULL, addr_x, btn_v, addr_w, BTN_H, SWP_NOZORDER);

    int panel_h = cy - TOOLBAR_H - VSPLIT_H - g_config.console_height - INPUTBAR_H;
    if (panel_h < 0)
        panel_h = 0;

    int tree_w = g_tree_w;
    if (tree_w < TREE_W_MIN)
        tree_w = TREE_W_MIN;
    if (tree_w > cx - HSPLIT_W - 80)
        tree_w = cx - HSPLIT_W - 80;

    int list_x = tree_w + HSPLIT_W;
    int list_w = cx - list_x;
    if (list_w < 0)
        list_w = 0;

    int y_panel = TOOLBAR_H;
    int y_console = y_panel + panel_h + VSPLIT_H;
    int y_input = y_console + g_config.console_height;
    int bv = (INPUTBAR_H - BTN_H) / 2;
    int input_w = cx - INPUT_BTN_W - BTN_MARGIN;
    if (input_w < 0)
        input_w = 0;

    SetWindowPos(g_hTreeView, NULL, 0, y_panel, tree_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hListView, NULL, list_x, y_panel, list_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hConsole, NULL, 0, y_console, cx, g_config.console_height, SWP_NOZORDER);
    SetWindowPos(g_hInput, NULL, 0, y_input + bv, input_w, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnExec, NULL, input_w, y_input + bv, INPUT_BTN_W, BTN_H, SWP_NOZORDER);
}

static BOOL is_on_splitter(int x, int y)
{
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    int panel_h = rc.bottom - TOOLBAR_H - VSPLIT_H - g_config.console_height - INPUTBAR_H;
    if (panel_h < 0)
        panel_h = 0;
    return (x >= g_tree_w && x <= g_tree_w + HSPLIT_W &&
            y >= TOOLBAR_H && y < TOOLBAR_H + panel_h);
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
        // config のレイアウト値を反映
        g_tree_w = g_config.tree_width;
        create_controls(hwnd);
        refresh_listview();
        // cmd.exe を起動
        if (!cmd_proc_start(on_cmd_output))
            MessageBoxA(hwnd, "cmd.exe の起動に失敗しました。", "エラー", MB_OK | MB_ICONERROR);
        return 0;

    case WM_SIZE:
        on_resize(LOWORD(lp), HIWORD(lp));
        return 0;

    case WM_MOUSEMOVE:
    {
        int mx = (int)(short)LOWORD(lp);
        int my = (int)(short)HIWORD(lp);
        if (g_dragging_split)
        {
            int dx = mx - g_drag_start_x;
            g_tree_w = g_drag_tree_w + dx;
            if (g_tree_w < TREE_W_MIN)
                g_tree_w = TREE_W_MIN;
            RECT rc;
            GetClientRect(hwnd, &rc);
            on_resize(rc.right, rc.bottom);
        }
        else if (is_on_splitter(mx, my))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZEWE));
        }
        return 0;
    }

    case WM_LBUTTONDOWN:
    {
        int mx = (int)(short)LOWORD(lp);
        int my = (int)(short)HIWORD(lp);
        if (is_on_splitter(mx, my))
        {
            g_dragging_split = TRUE;
            g_drag_start_x = mx;
            g_drag_tree_w = g_tree_w;
            SetCapture(hwnd);
        }
        return 0;
    }

    case WM_LBUTTONUP:
        if (g_dragging_split)
        {
            g_dragging_split = FALSE;
            ReleaseCapture();
        }
        return 0;

    case WM_SETCURSOR:
    {
        POINT pt;
        GetCursorPos(&pt);
        ScreenToClient(hwnd, &pt);
        if (is_on_splitter(pt.x, pt.y))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZEWE));
            return TRUE;
        }
        break;
    }

    case WM_CTLCOLOREDIT:
    {
        HWND hCtrl = (HWND)lp;
        HDC hdc = (HDC)wp;
        if (hCtrl == g_hConsole)
        {
            SetTextColor(hdc, g_config.color_log_text);
            SetBkColor(hdc, g_config.color_log_bg);
            return (LRESULT)CreateSolidBrush(g_config.color_log_bg);
        }
        // 入力欄・アドレスバーは通常色
        SetTextColor(hdc, g_config.color_text);
        SetBkColor(hdc, g_config.color_bg);
        return (LRESULT)CreateSolidBrush(g_config.color_bg);
    }

    case WM_ERASEBKGND:
    {
        // ウィンドウ背景色
        HDC hdc = (HDC)wp;
        RECT rc;
        GetClientRect(hwnd, &rc);
        HBRUSH hBr = CreateSolidBrush(g_config.color_bg);
        FillRect(hdc, &rc, hBr);
        DeleteObject(hBr);
        return 1;
    }
        // cd コマンド後に GUI のカレントディレクトリを cmd に合わせて更新
        KillTimer(hwnd, 1);
        refresh_listview();
        return 0;

    // cmd 出力をログペインへ（スレッドをまたぐため PostMessage 経由）
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
        {
            char path[MAX_PATH];
            GetCurrentDirectoryA(MAX_PATH, path);
            char *sep = strrchr(path, '\\');
            if (sep && sep != path)
                *sep = '\0';
            else if (sep == path)
            {
                path[1] = '\0';
            } // ルート
            navigate_to(path);
            refresh_listview();
            break;
        }
        case ID_BTN_REFRESH:
            refresh_listview();
            break;
        case ID_BTN_EXEC:
            execute_input();
            break;
        }
        return 0;

    case WM_NOTIFY:
    {
        NMHDR *nm = (NMHDR *)lp;
        if (nm->idFrom == ID_LISTVIEW && nm->code == NM_DBLCLK)
        {
            on_listview_dblclick();
            return 0;
        }
        if (nm->idFrom == ID_TREEVIEW && nm->code == TVN_SELCHANGEDA)
        {
            NMTREEVIEWA *ntv = (NMTREEVIEWA *)lp;
            on_treeview_select(ntv->itemNew.hItem);
            return 0;
        }
        if (nm->idFrom == ID_TREEVIEW && nm->code == TVN_ITEMEXPANDINGA)
        {
            NMTREEVIEWA *ntv = (NMTREEVIEWA *)lp;
            if (ntv->action == TVE_EXPAND)
                on_treeview_expand(ntv->itemNew.hItem);
            return 0;
        }
        return 0;
    }

    case WM_DESTROY:
        cmd_proc_stop();
        {
            HTREEITEM h = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_ROOT, 0);
            while (h)
            {
                tree_free_lparams(h);
                h = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_NEXT, (LPARAM)h);
            }
        }
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// gui_run
// ---------------------------------------------------------------------------
int gui_run(HINSTANCE hInstance, int nCmdShow)
{
    SetThreadLocale(MAKELCID(MAKELANGID(LANG_JAPANESE, SUBLANG_DEFAULT), SORT_DEFAULT));

    INITCOMMONCONTROLSEX icc;
    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_LISTVIEW_CLASSES | ICC_TREEVIEW_CLASSES;
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

    HWND hwnd = CreateWindowExA(0, CLASS_NAME, "Filer",
                                WS_OVERLAPPEDWINDOW,
                                CW_USEDEFAULT, CW_USEDEFAULT, 900, 650,
                                NULL, NULL, hInstance, NULL);
    if (hwnd == NULL)
        return -1;

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