#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include "gui.h"
#include "../proc/cmd_proc.h"
#include "../core/filelist.h"
#include "../core/sort.h"
#include "config.h"

#define ID_BTN_UP 101
#define ID_BTN_REFRESH 102
#define ID_LISTVIEW 103
#define ID_CONSOLE 104
#define ID_INPUT 105
#define ID_BTN_EXEC 106
#define ID_TREEVIEW 107
#define ID_ADDRESSBAR 108
#define ID_BTN_TERMINAL 109

#define WM_GUI_LOG (WM_USER + 1)

#define NAVBAR_H 44
#define BTN_W 72
#define BTN_H 28
#define BTN_MARGIN 8
#define CONTENT_MARGIN 8
#define PANE_GAP 8
#define INPUTBAR_H 36
#define INPUT_BTN_W 64
#define CONSOLE_TOGGLE_W 92
#define HSPLIT_W 4
#define CONSOLE_H_DEFAULT 180
#define TREE_W_DEFAULT 220
#define TREE_W_MIN 160
#define TIMER_ID_SYNC_CD 1

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
static HWND g_hBtnTerminal = NULL;
static WNDPROC g_orig_input_proc = NULL;
static WNDPROC g_orig_addr_proc = NULL;

static int g_tree_w = TREE_W_DEFAULT;
static BOOL g_console_visible = FALSE;
static BOOL g_dragging_split = FALSE;
static int g_drag_start_x = 0;
static int g_drag_tree_w = 0;

static void on_resize(int cx, int cy);

static void append_log(const char *text)
{
    if (g_hConsole == NULL)
        return;

    {
        int len = GetWindowTextLength(g_hConsole);
        SendMessage(g_hConsole, EM_SETSEL, (WPARAM)len, (LPARAM)len);
        SendMessage(g_hConsole, EM_REPLACESEL, FALSE, (LPARAM)text);
    }
}

void gui_log(const char *text)
{
    char *buf;

    if (g_hwnd == NULL)
        return;

    buf = _strdup(text);
    if (buf != NULL)
        PostMessage(g_hwnd, WM_GUI_LOG, 0, (LPARAM)buf);
}

static void on_cmd_output(const char *text)
{
    gui_log(text);
}

static void update_terminal_button(void)
{
    if (g_hBtnTerminal == NULL)
        return;

    SetWindowTextA(g_hBtnTerminal, g_console_visible ? "Hide pane" : "Terminal");
}

static void set_console_visible(BOOL visible)
{
    RECT rc;

    g_console_visible = visible;
    update_terminal_button();

    if (g_hwnd == NULL)
        return;

    GetClientRect(g_hwnd, &rc);
    on_resize(rc.right, rc.bottom);

    if (g_console_visible && g_hInput != NULL)
        SetFocus(g_hInput);
}

static void update_addressbar(void)
{
    char path[MAX_PATH];
    char title[MAX_PATH + 32];

    GetCurrentDirectoryA(MAX_PATH, path);
    SetWindowTextA(g_hAddrBar, path);

    _snprintf(title, sizeof(title) - 1, "Filer - %s", path);
    title[sizeof(title) - 1] = '\0';
    SetWindowTextA(g_hwnd, title);
}

static void navigate_to(const char *path)
{
    char msg[MAX_PATH + 64];

    if (!SetCurrentDirectoryA(path))
    {
        _snprintf(msg, sizeof(msg) - 1, "Cannot navigate to: %s\r\n", path);
        msg[sizeof(msg) - 1] = '\0';
        append_log(msg);
        return;
    }

    cmd_proc_cd(path);
    update_addressbar();
}

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
    WIN32_FIND_DATAA fd;
    HANDLE hFind;

    _snprintf(search, sizeof(search) - 1, "%s\\*", path);
    search[sizeof(search) - 1] = '\0';

    hFind = FindFirstFileA(search, &fd);
    if (hFind == INVALID_HANDLE_VALUE)
        return;

    do
    {
        char child_path[MAX_PATH];
        char grandchild[MAX_PATH];
        WIN32_FIND_DATAA fd2;
        HANDLE hFind2;
        BOOL hasChildren = FALSE;

        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY))
            continue;
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0)
            continue;

        _snprintf(child_path, sizeof(child_path) - 1, "%s\\%s", path, fd.cFileName);
        child_path[sizeof(child_path) - 1] = '\0';

        _snprintf(grandchild, sizeof(grandchild) - 1, "%s\\*", child_path);
        grandchild[sizeof(grandchild) - 1] = '\0';

        hFind2 = FindFirstFileA(grandchild, &fd2);
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
    int i;

    for (i = 0; i < 26; i++)
    {
        char label[4] = {'A' + i, ':', '\\', '\0'};

        if (!(drives & (1 << i)))
            continue;

        tree_add_item(TVI_ROOT, label, label, TRUE);
    }
}

static void tree_free_lparams(HTREEITEM hItem)
{
    TVITEMA tvi;
    HTREEITEM hChild;

    if (hItem == NULL)
        return;

    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
    free((void *)tvi.lParam);

    hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_CHILD, (LPARAM)hItem);
    while (hChild != NULL)
    {
        HTREEITEM hNext = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_NEXT, (LPARAM)hChild);
        tree_free_lparams(hChild);
        hChild = hNext;
    }
}

static void on_treeview_expand(HTREEITEM hItem)
{
    HTREEITEM hChild;
    TVITEMA tvi;
    const char *path;

    hChild = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_CHILD, (LPARAM)hItem);
    if (hChild != NULL)
    {
        ZeroMemory(&tvi, sizeof(tvi));
        tvi.mask = TVIF_PARAM | TVIF_HANDLE;
        tvi.hItem = hChild;
        SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
        if (tvi.lParam != 0)
            return;

        SendMessage(g_hTreeView, TVM_DELETEITEM, 0, (LPARAM)hChild);
    }

    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
    path = (const char *)tvi.lParam;
    if (path != NULL)
        tree_populate_children(hItem, path);
}

static void refresh_listview(void)
{
    char path[MAX_PATH];
    FileList list;
    LVITEMA lvi;
    int i;

    GetCurrentDirectoryA(MAX_PATH, path);
    update_addressbar();
    ListView_DeleteAllItems(g_hListView);

    list = filelist_create();
    if (filelist_fetch(&list, path) < 0)
    {
        filelist_free(&list);
        return;
    }

    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});

    ZeroMemory(&lvi, sizeof(lvi));
    lvi.mask = LVIF_TEXT;

    for (i = 0; i < list.count; i++)
    {
        char size_str[32];
        FileEntry *e = &list.entries[i];
        const char *kind = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "[DIR]" : "[FILE]";

        lvi.iItem = i;
        lvi.iSubItem = 0;
        lvi.pszText = e->name;
        SendMessage(g_hListView, LVM_INSERTITEMA, 0, (LPARAM)&lvi);

        ListView_SetItemText(g_hListView, i, 1, (LPSTR)kind);

        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY)
            _snprintf(size_str, sizeof(size_str) - 1, "-");
        else
            _snprintf(size_str, sizeof(size_str) - 1, "%lld", e->size);
        size_str[sizeof(size_str) - 1] = '\0';
        ListView_SetItemText(g_hListView, i, 2, size_str);
    }

    filelist_free(&list);
}

static void on_listview_dblclick(void)
{
    int sel = ListView_GetNextItem(g_hListView, -1, LVNI_SELECTED);
    char name[MAX_PATH];
    char kind[16];
    char path[MAX_PATH];
    char fullpath[MAX_PATH];

    if (sel < 0)
        return;

    ListView_GetItemText(g_hListView, sel, 0, name, MAX_PATH);
    ListView_GetItemText(g_hListView, sel, 1, kind, sizeof(kind));
    GetCurrentDirectoryA(MAX_PATH, path);

    _snprintf(fullpath, sizeof(fullpath) - 1, "%s\\%s", path, name);
    fullpath[sizeof(fullpath) - 1] = '\0';

    if (strcmp(kind, "[DIR]") == 0)
    {
        navigate_to(fullpath);
        refresh_listview();
    }
    else
    {
        ShellExecuteA(NULL, "open", fullpath, NULL, NULL, SW_SHOWNORMAL);
    }
}

static void on_treeview_select(HTREEITEM hItem)
{
    TVITEMA tvi;
    const char *path;

    ZeroMemory(&tvi, sizeof(tvi));
    tvi.mask = TVIF_PARAM | TVIF_HANDLE;
    tvi.hItem = hItem;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);

    path = (const char *)tvi.lParam;
    if (path == NULL || strlen(path) == 0)
        return;

    navigate_to(path);
    refresh_listview();
}

static void execute_input(void)
{
    WCHAR winput[1024];
    char input[1024];
    char trimmed[1024];
    char *p;

    ZeroMemory(winput, sizeof(winput));
    ZeroMemory(input, sizeof(input));
    ZeroMemory(trimmed, sizeof(trimmed));

    GetWindowTextW(g_hInput, winput, 1024);
    if (wcslen(winput) == 0)
        return;

    WideCharToMultiByte(CP_ACP, 0, winput, -1, input, sizeof(input) - 1, NULL, NULL);
    SetWindowTextA(g_hInput, "");
    set_console_visible(TRUE);

    strncpy(trimmed, input, sizeof(trimmed) - 1);
    trimmed[sizeof(trimmed) - 1] = '\0';

    p = trimmed;
    while (*p == ' ')
        p++;

    if (_stricmp(p, "exit") == 0)
    {
        cmd_proc_stop();
        DestroyWindow(g_hwnd);
        return;
    }

    cmd_proc_send(input);

    if (_strnicmp(p, "cd", 2) == 0 && (p[2] == ' ' || p[2] == '\0'))
    {
        Sleep(100);
        SetTimer(g_hwnd, TIMER_ID_SYNC_CD, 200, NULL);
    }
}

static LRESULT CALLBACK addr_subclass_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    (void)hwnd;

    if (msg == WM_KEYDOWN && wp == VK_RETURN)
    {
        WCHAR wpath[MAX_PATH];
        char path[MAX_PATH];

        ZeroMemory(wpath, sizeof(wpath));
        ZeroMemory(path, sizeof(path));

        GetWindowTextW(g_hAddrBar, wpath, MAX_PATH);
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

static LRESULT CALLBACK input_subclass_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    (void)hwnd;

    if (msg == WM_KEYDOWN && wp == VK_RETURN)
    {
        execute_input();
        return 0;
    }

    return CallWindowProc(g_orig_input_proc, hwnd, msg, wp, lp);
}

static void create_controls(HWND hwnd)
{
    HINSTANCE hInst = GetModuleHandle(NULL);
    HFONT hFont = CreateFontA(
        g_config.font_size, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY, FIXED_PITCH | FF_MODERN, g_config.font_name);
    LVCOLUMNA col;

    g_hBtnUp = CreateWindowExA(0, "BUTTON", "Up",
                               WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                               BTN_MARGIN, (NAVBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                               hwnd, (HMENU)(INT_PTR)ID_BTN_UP, hInst, NULL);
    SendMessage(g_hBtnUp, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hBtnRefresh = CreateWindowExA(0, "BUTTON", "Refresh",
                                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                    BTN_MARGIN * 2 + BTN_W, (NAVBAR_H - BTN_H) / 2, BTN_W, BTN_H,
                                    hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, hInst, NULL);
    SendMessage(g_hBtnRefresh, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hBtnTerminal = CreateWindowExA(0, "BUTTON", "Terminal",
                                     WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                                     0, (NAVBAR_H - BTN_H) / 2, CONSOLE_TOGGLE_W, BTN_H,
                                     hwnd, (HMENU)(INT_PTR)ID_BTN_TERMINAL, hInst, NULL);
    SendMessage(g_hBtnTerminal, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hAddrBar = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                 BTN_MARGIN * 3 + BTN_W * 2, (NAVBAR_H - BTN_H) / 2, 0, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_ADDRESSBAR, hInst, NULL);
    SendMessage(g_hAddrBar, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_addr_proc = (WNDPROC)SetWindowLongPtr(g_hAddrBar, GWLP_WNDPROC, (LONG_PTR)addr_subclass_proc);

    g_hTreeView = CreateWindowExA(WS_EX_CLIENTEDGE, WC_TREEVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | TVS_HASLINES | TVS_HASBUTTONS |
                                      TVS_LINESATROOT | TVS_SHOWSELALWAYS,
                                  0, NAVBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_TREEVIEW, hInst, NULL);
    SendMessage(g_hTreeView, WM_SETFONT, (WPARAM)hFont, TRUE);
    tree_populate_drives();

    g_hListView = CreateWindowExA(WS_EX_CLIENTEDGE, WC_LISTVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS,
                                  0, NAVBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_LISTVIEW, hInst, NULL);
    ListView_SetExtendedListViewStyle(g_hListView, LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES);
    SendMessage(g_hListView, WM_SETFONT, (WPARAM)hFont, TRUE);

    ZeroMemory(&col, sizeof(col));
    col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_FMT;
    col.pszText = "Name";
    col.cx = 300;
    col.fmt = LVCFMT_LEFT;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 0, (LPARAM)&col);

    col.pszText = "Type";
    col.cx = 80;
    col.fmt = LVCFMT_CENTER;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 1, (LPARAM)&col);

    col.pszText = "Size";
    col.cx = 100;
    col.fmt = LVCFMT_RIGHT;
    SendMessage(g_hListView, LVM_INSERTCOLUMNA, 2, (LPARAM)&col);

    g_hConsole = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                                 WS_CHILD | WS_VSCROLL | ES_MULTILINE |
                                     ES_READONLY | ES_AUTOVSCROLL,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_CONSOLE, hInst, NULL);
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)hFont, TRUE);

    g_hInput = CreateWindowExA(WS_EX_CLIENTEDGE, "EDIT", "",
                               WS_CHILD | ES_AUTOHSCROLL,
                               0, 0, 0, 0,
                               hwnd, (HMENU)(INT_PTR)ID_INPUT, hInst, NULL);
    SendMessage(g_hInput, WM_SETFONT, (WPARAM)hFont, TRUE);
    g_orig_input_proc = (WNDPROC)SetWindowLongPtr(g_hInput, GWLP_WNDPROC, (LONG_PTR)input_subclass_proc);

    g_hBtnExec = CreateWindowExA(0, "BUTTON", "Run",
                                 WS_CHILD | BS_PUSHBUTTON,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_EXEC, hInst, NULL);
    SendMessage(g_hBtnExec, WM_SETFONT, (WPARAM)hFont, TRUE);

    update_terminal_button();
}

static void on_resize(int cx, int cy)
{
    int nav_y = (NAVBAR_H - BTN_H) / 2;
    int terminal_x = cx - BTN_MARGIN - CONSOLE_TOGGLE_W;
    int addr_x = BTN_MARGIN * 3 + BTN_W * 2;
    int addr_w;
    int console_block_h = 0;
    int panel_h;
    int tree_x = CONTENT_MARGIN;
    int tree_w;
    int list_x;
    int list_w;
    int y_panel;
    int y_console;
    int y_input;
    int input_w;
    int input_y;

    if (terminal_x < BTN_MARGIN)
        terminal_x = BTN_MARGIN;

    SetWindowPos(g_hBtnTerminal, NULL, terminal_x, nav_y, CONSOLE_TOGGLE_W, BTN_H, SWP_NOZORDER);

    addr_w = terminal_x - BTN_MARGIN - addr_x;
    if (addr_w < 0)
        addr_w = 0;
    SetWindowPos(g_hAddrBar, NULL, addr_x, nav_y, addr_w, BTN_H, SWP_NOZORDER);

    if (g_console_visible)
        console_block_h = PANE_GAP + g_config.console_height + INPUTBAR_H;

    panel_h = cy - NAVBAR_H - CONTENT_MARGIN * 2 - console_block_h;
    if (panel_h < 0)
        panel_h = 0;

    tree_w = g_tree_w;
    if (tree_w < TREE_W_MIN)
        tree_w = TREE_W_MIN;
    if (tree_w > cx - CONTENT_MARGIN * 2 - HSPLIT_W - 120)
        tree_w = cx - CONTENT_MARGIN * 2 - HSPLIT_W - 120;
    if (tree_w < TREE_W_MIN)
        tree_w = TREE_W_MIN;

    list_x = tree_x + tree_w + HSPLIT_W;
    list_w = cx - list_x - CONTENT_MARGIN;
    if (list_w < 0)
        list_w = 0;

    y_panel = NAVBAR_H + CONTENT_MARGIN;
    y_console = y_panel + panel_h + PANE_GAP;
    y_input = y_console + g_config.console_height;
    input_y = y_input + (INPUTBAR_H - BTN_H) / 2;
    input_w = cx - CONTENT_MARGIN * 2 - INPUT_BTN_W;
    if (input_w < 0)
        input_w = 0;

    SetWindowPos(g_hTreeView, NULL, tree_x, y_panel, tree_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hListView, NULL, list_x, y_panel, list_w, panel_h, SWP_NOZORDER);

    if (g_console_visible)
    {
        ShowWindow(g_hConsole, SW_SHOW);
        ShowWindow(g_hInput, SW_SHOW);
        ShowWindow(g_hBtnExec, SW_SHOW);

        SetWindowPos(g_hConsole, NULL, CONTENT_MARGIN, y_console,
                     cx - CONTENT_MARGIN * 2, g_config.console_height, SWP_NOZORDER);
        SetWindowPos(g_hInput, NULL, CONTENT_MARGIN, input_y, input_w, BTN_H, SWP_NOZORDER);
        SetWindowPos(g_hBtnExec, NULL, CONTENT_MARGIN + input_w, input_y,
                     INPUT_BTN_W, BTN_H, SWP_NOZORDER);
    }
    else
    {
        ShowWindow(g_hConsole, SW_HIDE);
        ShowWindow(g_hInput, SW_HIDE);
        ShowWindow(g_hBtnExec, SW_HIDE);
    }

    ListView_SetColumnWidth(g_hListView, 0, list_w > 220 ? list_w - 180 : 160);
    ListView_SetColumnWidth(g_hListView, 1, 80);
    ListView_SetColumnWidth(g_hListView, 2, 100);
}

static BOOL is_on_splitter(int x, int y)
{
    RECT rc;
    int console_block_h = 0;
    int panel_h;

    GetClientRect(g_hwnd, &rc);

    if (g_console_visible)
        console_block_h = PANE_GAP + g_config.console_height + INPUTBAR_H;

    panel_h = rc.bottom - NAVBAR_H - CONTENT_MARGIN * 2 - console_block_h;
    if (panel_h < 0)
        panel_h = 0;

    return (x >= CONTENT_MARGIN + g_tree_w &&
            x <= CONTENT_MARGIN + g_tree_w + HSPLIT_W &&
            y >= NAVBAR_H + CONTENT_MARGIN &&
            y < NAVBAR_H + CONTENT_MARGIN + panel_h);
}

static LRESULT CALLBACK wnd_proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg)
    {
    case WM_CREATE:
        g_hwnd = hwnd;
        g_tree_w = g_config.tree_width > 0 ? g_config.tree_width : TREE_W_DEFAULT;
        if (g_config.console_height <= 0)
            g_config.console_height = CONSOLE_H_DEFAULT;
        create_controls(hwnd);
        refresh_listview();
        if (!cmd_proc_start(on_cmd_output))
            MessageBoxA(hwnd, "Failed to start cmd.exe.", "Error", MB_OK | MB_ICONERROR);
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
            RECT rc;
            int dx = mx - g_drag_start_x;

            g_tree_w = g_drag_tree_w + dx;
            if (g_tree_w < TREE_W_MIN)
                g_tree_w = TREE_W_MIN;

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

        SetTextColor(hdc, g_config.color_text);
        SetBkColor(hdc, g_config.color_bg);
        return (LRESULT)CreateSolidBrush(g_config.color_bg);
    }

    case WM_ERASEBKGND:
    {
        HDC hdc = (HDC)wp;
        RECT rc;
        HBRUSH hBr;

        GetClientRect(hwnd, &rc);
        hBr = CreateSolidBrush(g_config.color_bg);
        FillRect(hdc, &rc, hBr);
        DeleteObject(hBr);
        return 1;
    }

    case WM_TIMER:
        if (wp == TIMER_ID_SYNC_CD)
        {
            KillTimer(hwnd, TIMER_ID_SYNC_CD);
            refresh_listview();
            return 0;
        }
        break;

    case WM_GUI_LOG:
    {
        char *text = (char *)lp;

        if (text != NULL)
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
            char *sep;

            GetCurrentDirectoryA(MAX_PATH, path);
            sep = strrchr(path, '\\');
            if (sep != NULL && sep != path)
                *sep = '\0';
            else if (sep == path)
                path[1] = '\0';

            navigate_to(path);
            refresh_listview();
            break;
        }

        case ID_BTN_REFRESH:
            refresh_listview();
            break;

        case ID_BTN_TERMINAL:
            set_console_visible(!g_console_visible);
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
            while (h != NULL)
            {
                HTREEITEM hNext = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_NEXT, (LPARAM)h);
                tree_free_lparams(h);
                h = hNext;
            }
        }
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProc(hwnd, msg, wp, lp);
}

int gui_run(HINSTANCE hInstance, int nCmdShow)
{
    INITCOMMONCONTROLSEX icc;
    WNDCLASSEXA wc;
    HWND hwnd;
    MSG msg;

    SetThreadLocale(MAKELCID(MAKELANGID(LANG_JAPANESE, SUBLANG_DEFAULT), SORT_DEFAULT));

    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_LISTVIEW_CLASSES | ICC_TREEVIEW_CLASSES;
    InitCommonControlsEx(&icc);

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

    hwnd = CreateWindowExA(0, CLASS_NAME, "Filer",
                           WS_OVERLAPPEDWINDOW,
                           CW_USEDEFAULT, CW_USEDEFAULT, 1000, 700,
                           NULL, NULL, hInstance, NULL);
    if (hwnd == NULL)
        return -1;

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}
