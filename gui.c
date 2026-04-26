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
#define ID_BTN_UP 101
#define ID_BTN_REFRESH 102
#define ID_LISTVIEW 103
#define ID_CONSOLE 104
#define ID_INPUT 105
#define ID_BTN_EXEC 106
#define ID_TREEVIEW 107
#define ID_ADDRESSBAR 108

// カスタムメッセージ: CUIスレッドから安全にログ追記
#define WM_GUI_LOG (WM_USER + 1)

// ---------------------------------------------------------------------------
// レイアウト定数
// ---------------------------------------------------------------------------
#define TOOLBAR_H 36       // ツールバー行の高さ
#define BTN_W 80           // [..] / 更新ボタン幅
#define BTN_H 24           // ボタン高さ
#define BTN_MARGIN 8       // ボタン間マージン
#define ADDR_MARGIN 4      // アドレスバーのマージン
#define INPUTBAR_H 32      // 入力バー行の高さ
#define INPUT_BTN_W 64     // 実行ボタン幅
#define CONSOLE_H 160      // ログペインの高さ
#define VSPLIT_H 4         // 水平スプリッター（余白）
#define HSPLIT_W 4         // 垂直スプリッター（ツリー|ListView間）
#define TREE_W_DEFAULT 200 // ツリーペインの初期幅
#define TREE_W_MIN 60      // ツリーペインの最小幅

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

// 垂直スプリッター（ツリーとListViewの境界）
static int g_tree_w = TREE_W_DEFAULT;
static BOOL g_dragging_split = FALSE;
static int g_drag_start_x = 0;
static int g_drag_tree_w = 0;

// ---------------------------------------------------------------------------
// append_log / gui_log
// ---------------------------------------------------------------------------
static void append_log(const char *text)
{
    if (g_hConsole == NULL)
        return;
    int len = GetWindowTextLength(g_hConsole);
    SendMessage(g_hConsole, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    SendMessage(g_hConsole, EM_REPLACESEL, FALSE, (LPARAM)text);
}

void gui_log(const char *text)
{
    if (g_hwnd == NULL)
        return;
    char *buf = _strdup(text);
    if (buf)
        PostMessage(g_hwnd, WM_GUI_LOG, 0, (LPARAM)buf);
}

// ---------------------------------------------------------------------------
// アドレスバーをカレントパスで更新
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
// TreeView: ドライブ一覧とディレクトリを列挙して追加
// ---------------------------------------------------------------------------

// ツリーアイテムにパスを lParam として持たせるため、動的に確保した文字列を使う。
// WM_DESTROY で解放する。

static HTREEITEM tree_add_item(HTREEITEM hParent, const char *label, const char *path, BOOL hasChildren)
{
    TVINSERTSTRUCTA tvis;
    ZeroMemory(&tvis, sizeof(tvis));
    tvis.hParent = hParent;
    tvis.hInsertAfter = TVI_SORT;
    tvis.item.mask = TVIF_TEXT | TVIF_PARAM | TVIF_CHILDREN;
    tvis.item.pszText = (LPSTR)label;
    tvis.item.lParam = (LPARAM)_strdup(path); // WM_DESTROY で free
    tvis.item.cChildren = hasChildren ? 1 : 0;
    return (HTREEITEM)SendMessage(g_hTreeView, TVM_INSERTITEMA, 0, (LPARAM)&tvis);
}

// 指定パスの直下サブディレクトリを親アイテムに追加
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

        // 子ディレクトリがあるかチェック（展開矢印の有無）
        char grandchild[MAX_PATH];
        _snprintf(grandchild, sizeof(grandchild) - 1, "%s\\*", child_path);
        grandchild[sizeof(grandchild) - 1] = '\0';

        BOOL hasChildren = FALSE;
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

// ドライブ一覧をルートに追加
static void tree_populate_drives(void)
{
    DWORD drives = GetLogicalDrives();
    for (int i = 0; i < 26; i++)
    {
        if (!(drives & (1 << i)))
            continue;
        char label[4];
        label[0] = 'A' + i;
        label[1] = ':';
        label[2] = '\\';
        label[3] = '\0';
        tree_add_item(TVI_ROOT, label, label, TRUE);
    }
}

// lParam（_strdup したパス文字列）を再帰的に解放
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

    // 子を再帰
    HTREEITEM hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                              TVGN_CHILD, (LPARAM)hItem);
    while (hChild)
    {
        tree_free_lparams(hChild);
        hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                        TVGN_NEXT, (LPARAM)hChild);
    }
}

// ---------------------------------------------------------------------------
// ListView の更新（ツリー連動・アドレスバー更新含む）
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

    char log_buf[MAX_PATH + 32];
    _snprintf(log_buf, sizeof(log_buf) - 1, "ls: %s\r\n", path);
    append_log(log_buf);
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

    char log_buf[MAX_PATH + 16];
    if (strcmp(kind, "[DIR]") == 0)
    {
        _snprintf(log_buf, sizeof(log_buf) - 1, "cd %s\r\n", name);
        append_log(log_buf);
        cmd_cd(name);
        refresh_listview();
    }
    else
    {
        _snprintf(log_buf, sizeof(log_buf) - 1, "open %s\r\n", name);
        append_log(log_buf);
        cmd_open(name);
    }
}

// TreeView 展開時に子を動的追加（初回展開のみ）
static void on_treeview_expand(HTREEITEM hItem)
{
    // 既に子が存在すれば再展開なのでスキップ
    HTREEITEM hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                              TVGN_CHILD, (LPARAM)hItem);
    // 子が既にあれば展開済みと判断してスキップ
    if (hChild != NULL)
    {
        // 孫の有無を確認して cChildren を更新する必要があるかチェック
        return;
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
// execute_input: 入力欄コマンドの解析・実行
// ---------------------------------------------------------------------------
static void execute_input(void)
{
    WCHAR winput[512];
    ZeroMemory(winput, sizeof(winput));
    GetWindowTextW(g_hInput, winput, 512);
    if (wcslen(winput) == 0)
        return;

    char input[512];
    ZeroMemory(input, sizeof(input));
    WideCharToMultiByte(CP_ACP, 0, winput, -1, input, sizeof(input) - 1, NULL, NULL);

    char log_buf[560];
    _snprintf(log_buf, sizeof(log_buf) - 1, "> %s\r\n", input);
    append_log(log_buf);
    SetWindowTextA(g_hInput, "");

    char *p = input;
    while (*p == ' ')
        p++;
    if (*p == '\0')
        return;

    char cmd[64];
    ZeroMemory(cmd, sizeof(cmd));
    char *sp = strchr(p, ' ');
    if (sp != NULL)
    {
        size_t clen = (size_t)(sp - p);
        if (clen >= sizeof(cmd))
            clen = sizeof(cmd) - 1;
        strncpy(cmd, p, clen);
        p = sp + 1;
        while (*p == ' ')
            p++;
    }
    else
    {
        strncpy(cmd, p, sizeof(cmd) - 1);
        p = p + strlen(p);
    }

    char *arg1 = p;
    char *arg2 = NULL;
    char *sp2 = strchr(arg1, ' ');
    if (sp2 != NULL)
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
        {
            append_log("Usage: rm <file>\r\n");
        }
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
        if (strlen(arg1) == 0 || arg2 == NULL || strlen(arg2) == 0)
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
        if (strlen(arg1) == 0 || arg2 == NULL || strlen(arg2) == 0)
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
#ifdef DEBUG
        FreeConsole();
#endif
        DestroyWindow(g_hwnd);
    }
    else
    {
        char unk[128];
        _snprintf(unk, sizeof(unk) - 1, "Unknown command: %s\r\n", cmd);
        append_log(unk);
    }
}

// ---------------------------------------------------------------------------
// アドレスバーの Enter フック
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
            char log_buf[MAX_PATH + 16];
            _snprintf(log_buf, sizeof(log_buf) - 1, "cd %s\r\n", path);
            append_log(log_buf);
            cmd_cd(path);
            refresh_listview();
        }
        return 0;
    }
    return CallWindowProc(g_orig_addr_proc, hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
// 入力欄の Enter フック
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
// create_controls
// ---------------------------------------------------------------------------
static void create_controls(HWND hwnd)
{
    HINSTANCE hInst = GetModuleHandle(NULL);

    // フォント（全コントロール共通）
    HFONT hFont = CreateFontA(
        14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, "MS Gothic");

    // --- ツールバー行 ---
    // [..] ボタン
    g_hBtnUp = CreateWindowExA(0, "BUTTON", "[ .. ]",
                               WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                               BTN_MARGIN, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                               hwnd, (HMENU)(INT_PTR)ID_BTN_UP, hInst, NULL);
    SendMessage(g_hBtnUp, WM_SETFONT, (WPARAM)hFont, TRUE);

    // 更新ボタン
    g_hBtnRefresh = CreateWindowExA(0, "BUTTON", "更新",
                                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                    BTN_MARGIN * 2 + BTN_W, (TOOLBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                                    hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, hInst, NULL);
    SendMessage(g_hBtnRefresh, WM_SETFONT, (WPARAM)hFont, TRUE);

    // アドレスバー（[..][更新] の右に伸びる・WM_SIZEで幅調整）
    g_hAddrBar = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                 BTN_MARGIN * 3 + BTN_W * 2, (TOOLBAR_H - BTN_H) / 2, 0, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_ADDRESSBAR, hInst, NULL);
    SendMessage(g_hAddrBar, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_addr_proc = (WNDPROC)SetWindowLongPtr(
        g_hAddrBar, GWLP_WNDPROC, (LONG_PTR)addr_subclass_proc);

    // --- TreeView（左パネル）---
    g_hTreeView = CreateWindowExA(WS_EX_CLIENTEDGE, WC_TREEVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | TVS_HASLINES | TVS_HASBUTTONS | TVS_LINESATROOT | TVS_SHOWSELALWAYS,
                                  0, TOOLBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_TREEVIEW, hInst, NULL);
    SendMessage(g_hTreeView, WM_SETFONT, (WPARAM)hFont, TRUE);
    tree_populate_drives();

    // --- ListView（右パネル）---
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

    // --- ログペイン ---
    g_hConsole = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | WS_VSCROLL |
                                     ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_CONSOLE, hInst, NULL);
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)hFont, TRUE);

    // --- 入力欄 ---
    g_hInput = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                               WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                               0, 0, 0, 0,
                               hwnd, (HMENU)(INT_PTR)ID_INPUT, hInst, NULL);
    SendMessage(g_hInput, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_input_proc = (WNDPROC)SetWindowLongPtr(
        g_hInput, GWLP_WNDPROC, (LONG_PTR)input_subclass_proc);

    // --- 実行ボタン ---
    g_hBtnExec = CreateWindowExA(0, "BUTTON", "実行",
                                 WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_EXEC, hInst, NULL);
    SendMessage(g_hBtnExec, WM_SETFONT, (WPARAM)hFont, TRUE);
}

// ---------------------------------------------------------------------------
// on_resize: レイアウト計算
// ---------------------------------------------------------------------------
static void on_resize(int cx, int cy)
{
    // ツールバー: [..][更新][アドレスバー(残り全幅)]
    int addr_x = BTN_MARGIN * 3 + BTN_W * 2;
    int addr_w = cx - addr_x - BTN_MARGIN;
    if (addr_w < 0)
        addr_w = 0;
    int btn_v = (TOOLBAR_H - BTN_H) / 2;
    SetWindowPos(g_hAddrBar, NULL, addr_x, btn_v, addr_w, BTN_H, SWP_NOZORDER);

    // 中段: ツリー | スプリッター | ListView
    int panel_h = cy - TOOLBAR_H - VSPLIT_H - CONSOLE_H - INPUTBAR_H;
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
    int y_input = y_console + CONSOLE_H;
    int btn_margin_v = (INPUTBAR_H - BTN_H) / 2;
    int input_w = cx - INPUT_BTN_W - BTN_MARGIN;
    if (input_w < 0)
        input_w = 0;

    SetWindowPos(g_hTreeView, NULL, 0, y_panel, tree_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hListView, NULL, list_x, y_panel, list_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hConsole, NULL, 0, y_console, cx, CONSOLE_H, SWP_NOZORDER);
    SetWindowPos(g_hInput, NULL, 0, y_input + btn_margin_v, input_w, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnExec, NULL, input_w, y_input + btn_margin_v, INPUT_BTN_W, BTN_H, SWP_NOZORDER);
}

// スプリッターのヒット判定（ツリーとListViewの境界）
static BOOL is_on_splitter(int x, int cy)
{
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    int panel_h = rc.bottom - TOOLBAR_H - VSPLIT_H - CONSOLE_H - INPUTBAR_H;
    if (panel_h < 0)
        panel_h = 0;

    // スプリッター領域: x が tree_w ± HSPLIT_W、y が中段パネル内
    return (x >= g_tree_w && x <= g_tree_w + HSPLIT_W &&
            cy >= TOOLBAR_H && cy < TOOLBAR_H + panel_h);
}

// ---------------------------------------------------------------------------
// wnd_proc
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

    // --- スプリッタードラッグ ---
    case WM_MOUSEMOVE:
    {
        int mx = LOWORD(lp), my = HIWORD(lp);
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
        int mx = LOWORD(lp), my = HIWORD(lp);
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

    // --- CUIスレッドからのログ追記 ---
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
        }
        return 0;

    case WM_NOTIFY:
    {
        NMHDR *nm = (NMHDR *)lp;

        // ListView ダブルクリック
        if (nm->idFrom == ID_LISTVIEW && nm->code == NM_DBLCLK)
        {
            on_listview_dblclick();
            return 0;
        }

        // TreeView 展開 → 子を動的追加
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
        // TreeView の lParam（_strdup したパス文字列）を解放
        {
            HTREEITEM hRoot = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                                     TVGN_ROOT, 0);
            while (hRoot)
            {
                tree_free_lparams(hRoot);
                hRoot = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM,
                                               TVGN_NEXT, (LPARAM)hRoot);
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
    fs_ops_set_output_hook(gui_log);
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