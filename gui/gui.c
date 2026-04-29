#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <uxtheme.h>
#include <shlobj.h>
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
#define ID_BTN_NEW 110
#define ID_BTN_VIEW 111
#define ID_STATUSBAR 112
#define ID_BTN_BACK 113
#define ID_BTN_FORWARD 114

#define WM_GUI_LOG (WM_USER + 1)

#define NAVBAR_H 44
#define ICON_BTN_W 32
#define BTN_H 28
#define BTN_MARGIN 8
#define CONTENT_MARGIN 8
#define PANE_GAP 8
#define INPUTBAR_H 36
#define INPUT_BTN_W 64
#define ACCORDION_H 28
#define HSPLIT_W 4
#define CONSOLE_H_DEFAULT 180
#define CONSOLE_H_MIN 100
#define MAIN_PANEL_H_MIN 140
#define TREE_W_DEFAULT 220
#define TREE_W_MIN 160
#define TIMER_ID_SYNC_CD 1
#define CMD_HISTORY_MAX 100
#define NAV_HISTORY_MAX 50

static const char *CLASS_NAME = "FilerMainWindow";
static const COLORREF COLOR_APP_BG = RGB(246, 247, 249);
static const COLORREF COLOR_ADDR_BG = RGB(251, 251, 252);
static const COLORREF COLOR_INPUT_BG = RGB(18, 18, 18);
static const COLORREF COLOR_MUTED_TEXT = RGB(120, 120, 120);
static const COLORREF COLOR_TREE_ROOT_BG = RGB(238, 241, 245);
static const COLORREF COLOR_TREE_ROOT_SEL_BG = RGB(222, 232, 245);
static const COLORREF COLOR_TERMINAL_TEXT = RGB(245, 245, 245);

static HWND g_hwnd = NULL;
static HWND g_hTreeView = NULL;
static HWND g_hListView = NULL;
static HWND g_hConsole = NULL;
static HWND g_hInput = NULL;
static HWND g_hAddrBar = NULL;
static HWND g_hPathCrumb = NULL;
static HWND g_hBtnUp = NULL;
static HWND g_hBtnRefresh = NULL;
static HWND g_hBtnExec = NULL;
static HWND g_hBtnTerminal = NULL;
static HWND g_hBtnNew = NULL;
static HWND g_hBtnView = NULL;
static HWND g_hStatusBar = NULL;
static HWND g_hBtnBack = NULL;
static HWND g_hBtnForward = NULL;
static HIMAGELIST g_hShellSmallIcons = NULL;
static HIMAGELIST g_hFolderIcons = NULL;
static HBRUSH g_hBrushAppBg = NULL;
static HBRUSH g_hBrushAddrBg = NULL;
static HBRUSH g_hBrushInputBg = NULL;
static HFONT g_hUiFont = NULL;
static HFONT g_hIconFont = NULL;
static WNDPROC g_orig_input_proc = NULL;
static WNDPROC g_orig_addr_proc = NULL;

// ナビゲーション履歴
static char *g_nav_history[NAV_HISTORY_MAX];
static int g_nav_history_count = 0;
static int g_nav_history_index = -1;

// ステータスバー情報
static int g_status_item_count = 0;
static ULONGLONG g_status_selected_size = 0;
static int g_status_selected_count = 0;

static int g_tree_w = TREE_W_DEFAULT;
static BOOL g_console_visible = TRUE;
static BOOL g_dragging_vsplit = FALSE;
static int g_drag_start_x = 0;
static int g_drag_tree_w = 0;
static BOOL g_dragging_hsplit = FALSE;
static int g_drag_start_y = 0;
static int g_drag_console_h = 0;
static HFONT g_hHeaderFont = NULL;
static char *g_cmd_history[CMD_HISTORY_MAX];
static int g_cmd_history_count = 0;
static int g_cmd_history_index = -1;
static char g_cmd_draft[1024];

static void on_resize(int cx, int cy);

static HFONT create_ui_font(void)
{
    HDC hdc;
    int height;

    hdc = GetDC(NULL);
    height = -MulDiv(g_config.font_size, GetDeviceCaps(hdc, LOGPIXELSY), 72);
    ReleaseDC(NULL, hdc);

    return CreateFontA(height, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, g_config.font_name);
}

static HFONT create_icon_font(void)
{
    return CreateFontW(-16, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe Fluent Icons");
}

static HFONT create_header_font(void)
{
    HDC hdc;
    int height;

    hdc = GetDC(NULL);
    height = -MulDiv(g_config.font_size - 1, GetDeviceCaps(hdc, LOGPIXELSY), 72);
    ReleaseDC(NULL, hdc);

    return CreateFontA(height, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                       CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, g_config.font_name);
}

static void apply_explorer_theme(void)
{
    COLORREF window_bg = g_config.color_bg;
    COLORREF window_text = g_config.color_text;
    HWND hHeader;

    SetWindowTheme(g_hTreeView, L"Explorer", NULL);
    SetWindowTheme(g_hListView, L"Explorer", NULL);

    TreeView_SetBkColor(g_hTreeView, window_bg);
    TreeView_SetTextColor(g_hTreeView, window_text);

    ListView_SetBkColor(g_hListView, window_bg);
    ListView_SetTextBkColor(g_hListView, window_bg);
    ListView_SetTextColor(g_hListView, window_text);

    hHeader = ListView_GetHeader(g_hListView);
    if (hHeader != NULL)
    {
        LONG_PTR style = GetWindowLongPtr(hHeader, GWL_STYLE);
        SetWindowLongPtr(hHeader, GWL_STYLE, style | HDS_FLAT);
        SetWindowTheme(hHeader, L"ItemsView", NULL);
    }
}

static int get_shell_icon_index(const char *path, DWORD attributes)
{
    SHFILEINFOA sfi;
    UINT flags = SHGFI_SYSICONINDEX | SHGFI_SMALLICON;

    ZeroMemory(&sfi, sizeof(sfi));

    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0)
        flags |= SHGFI_USEFILEATTRIBUTES;

    SHGetFileInfoA(path, attributes, &sfi, sizeof(sfi), flags);
    return sfi.iIcon;
}

static BOOL tree_is_root_item(HTREEITEM hItem)
{
    return TreeView_GetParent(g_hTreeView, hItem) == NULL;
}

static void tree_collapse_other_roots(HTREEITEM hKeep)
{
    HTREEITEM hItem;

    hItem = TreeView_GetRoot(g_hTreeView);
    while (hItem != NULL)
    {
        if (hItem != hKeep)
            TreeView_Expand(g_hTreeView, hItem, TVE_COLLAPSE);
        hItem = TreeView_GetNextSibling(g_hTreeView, hItem);
    }
}

static void tree_draw_root_item(NMTVCUSTOMDRAW *tvcd)
{
    RECT rc = tvcd->nmcd.rc;
    RECT client;
    TVITEMA tvi;
    char text[MAX_PATH];
    HTREEITEM hItem = (HTREEITEM)tvcd->nmcd.dwItemSpec;
    HBRUSH hBrush;
    HPEN hPen;
    HFONT hOldFont;
    int icon_x;
    int text_x;
    int text_y;
    int icon_y;
    int mid_y;
    POINT arrow[3];

    GetClientRect(g_hTreeView, &client);
    rc.left = 4;
    rc.right = client.right - 4;
    rc.top += 2;
    rc.bottom -= 2;

    hBrush = CreateSolidBrush((tvcd->nmcd.uItemState & CDIS_SELECTED) ? COLOR_TREE_ROOT_SEL_BG : COLOR_TREE_ROOT_BG);
    hPen = CreatePen(PS_SOLID, 1, (tvcd->nmcd.uItemState & CDIS_SELECTED) ? RGB(205, 216, 231) : RGB(226, 230, 236));
    SelectObject(tvcd->nmcd.hdc, hPen);
    SelectObject(tvcd->nmcd.hdc, hBrush);
    RoundRect(tvcd->nmcd.hdc, rc.left, rc.top, rc.right, rc.bottom, 8, 8);
    DeleteObject(hBrush);
    DeleteObject(hPen);

    mid_y = (rc.top + rc.bottom) / 2;
    if (TreeView_GetChild(g_hTreeView, hItem) != NULL && (TreeView_GetItemState(g_hTreeView, hItem, TVIS_EXPANDED) & TVIS_EXPANDED))
    {
        arrow[0].x = rc.left + 10;
        arrow[0].y = mid_y - 3;
        arrow[1].x = rc.left + 16;
        arrow[1].y = mid_y - 3;
        arrow[2].x = rc.left + 13;
        arrow[2].y = mid_y + 2;
    }
    else
    {
        arrow[0].x = rc.left + 11;
        arrow[0].y = mid_y - 4;
        arrow[1].x = rc.left + 16;
        arrow[1].y = mid_y;
        arrow[2].x = rc.left + 11;
        arrow[2].y = mid_y + 4;
    }
    hBrush = CreateSolidBrush(RGB(98, 108, 122));
    SelectObject(tvcd->nmcd.hdc, hBrush);
    Polygon(tvcd->nmcd.hdc, arrow, 3);
    DeleteObject(hBrush);

    ZeroMemory(&tvi, sizeof(tvi));
    ZeroMemory(text, sizeof(text));
    tvi.mask = TVIF_TEXT | TVIF_IMAGE | TVIF_HANDLE;
    tvi.hItem = hItem;
    tvi.pszText = text;
    tvi.cchTextMax = MAX_PATH;
    SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);

    icon_x = rc.left + 24;
    icon_y = rc.top + ((rc.bottom - rc.top) - 16) / 2;
    if (g_hShellSmallIcons != NULL)
        ImageList_Draw(g_hShellSmallIcons, tvi.iImage, tvcd->nmcd.hdc, icon_x, icon_y, ILD_TRANSPARENT);

    hOldFont = SelectObject(tvcd->nmcd.hdc, g_hUiFont);
    SetBkMode(tvcd->nmcd.hdc, TRANSPARENT);
    SetTextColor(tvcd->nmcd.hdc, RGB(55, 61, 69));
    text_x = icon_x + 22;
    text_y = rc.top + 6;
    TextOutA(tvcd->nmcd.hdc, text_x, text_y, text, (int)strlen(text));
    SelectObject(tvcd->nmcd.hdc, hOldFont);
}

static void set_input_text(const char *text)
{
    SetWindowTextA(g_hInput, text);
    SendMessage(g_hInput, EM_SETSEL, (WPARAM)strlen(text), (LPARAM)strlen(text));
}

static void history_reset_navigation(void)
{
    g_cmd_history_index = -1;
    g_cmd_draft[0] = '\0';
}

static void history_add(const char *text)
{
    char *copy;

    if (text == NULL || text[0] == '\0')
        return;

    if (g_cmd_history_count > 0 && strcmp(g_cmd_history[g_cmd_history_count - 1], text) == 0)
    {
        history_reset_navigation();
        return;
    }

    copy = _strdup(text);
    if (copy == NULL)
        return;

    if (g_cmd_history_count == CMD_HISTORY_MAX)
    {
        free(g_cmd_history[0]);
        memmove(&g_cmd_history[0], &g_cmd_history[1], sizeof(g_cmd_history[0]) * (CMD_HISTORY_MAX - 1));
        g_cmd_history_count--;
    }

    g_cmd_history[g_cmd_history_count++] = copy;
    history_reset_navigation();
}

static void history_browse(int direction)
{
    char current[1024];

    if (g_cmd_history_count == 0)
        return;

    GetWindowTextA(g_hInput, current, sizeof(current));

    if (direction < 0)
    {
        if (g_cmd_history_index == -1)
        {
            strncpy(g_cmd_draft, current, sizeof(g_cmd_draft) - 1);
            g_cmd_draft[sizeof(g_cmd_draft) - 1] = '\0';
            g_cmd_history_index = g_cmd_history_count - 1;
        }
        else if (g_cmd_history_index > 0)
        {
            g_cmd_history_index--;
        }
    }
    else
    {
        if (g_cmd_history_index == -1)
            return;

        if (g_cmd_history_index < g_cmd_history_count - 1)
        {
            g_cmd_history_index++;
        }
        else
        {
            g_cmd_history_index = -1;
            set_input_text(g_cmd_draft);
            return;
        }
    }

    set_input_text(g_cmd_history[g_cmd_history_index]);
}

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

    SetWindowTextA(g_hBtnTerminal, g_console_visible ? "v Console" : "> Console");
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
    char crumb[64];
    char path[MAX_PATH];
    char title[MAX_PATH + 32];

    GetCurrentDirectoryA(MAX_PATH, path);
    SetWindowTextA(g_hAddrBar, path);

    if (strlen(path) >= 3)
        _snprintf(crumb, sizeof(crumb) - 1, "This PC  >  %.3s", path);
    else
        _snprintf(crumb, sizeof(crumb) - 1, "This PC");
    crumb[sizeof(crumb) - 1] = '\0';
    if (g_hPathCrumb != NULL)
        SetWindowTextA(g_hPathCrumb, crumb);

    _snprintf(title, sizeof(title) - 1, "Filer - %s", path);
    title[sizeof(title) - 1] = '\0';
    SetWindowTextA(g_hwnd, title);
}

static void update_nav_buttons(void)
{
    if (g_hBtnBack != NULL)
        EnableWindow(g_hBtnBack, g_nav_history_index > 0);
    if (g_hBtnForward != NULL)
        EnableWindow(g_hBtnForward, g_nav_history_index < g_nav_history_count - 1);
}

static void navigate_back(void)
{
    if (g_nav_history_index > 0)
    {
        g_nav_history_index--;
        navigate_to(g_nav_history[g_nav_history_index]);
    }
}

static void navigate_forward(void)
{
    if (g_nav_history_index < g_nav_history_count - 1)
    {
        g_nav_history_index++;
        navigate_to(g_nav_history[g_nav_history_index]);
    }
}

static void update_status_bar(void)
{
    char text[256];

    if (g_hStatusBar == NULL)
        return;

    if (g_status_selected_count > 0)
    {
        char size_str[64];
        ULONGLONG size = g_status_selected_size;
        if (size >= 1024ULL * 1024 * 1024)
            _snprintf(size_str, sizeof(size_str) - 1, "%.2f GB", (double)size / (1024.0 * 1024.0 * 1024.0));
        else if (size >= 1024 * 1024)
            _snprintf(size_str, sizeof(size_str) - 1, "%.2f MB", (double)size / (1024.0 * 1024.0));
        else if (size >= 1024)
            _snprintf(size_str, sizeof(size_str) - 1, "%.2f KB", (double)size / 1024.0);
        else
            _snprintf(size_str, sizeof(size_str) - 1, "%llu bytes", size);
        size_str[sizeof(size_str) - 1] = '\0';

        _snprintf(text, sizeof(text) - 1, "%d items  |  %d selected (%s)", g_status_item_count, g_status_selected_count, size_str);
    }
    else
    {
        _snprintf(text, sizeof(text) - 1, "%d items", g_status_item_count);
    }
    text[sizeof(text) - 1] = '\0';

    SendMessage(g_hStatusBar, SB_SETTEXTA, 0, (LPARAM)text);
}

static void create_folder_icons(void)
{
    SHFILEINFOA sfi;
    int icon_idx;

    g_hFolderIcons = ImageList_Create(16, 16, ILC_COLOR32 | ILC_MASK, 4, 0);
    if (g_hFolderIcons == NULL)
        return;

    // フォルダアイコン（開いている）
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON | SHGFI_USEFILEATTRIBUTES);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }

    // フォルダアイコン（閉じた状態）
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\Windows", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }

    // デスクトップアイコン
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\Users\\Public\\Desktop", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }

    // ダウンロードアイコン
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\Users\\Public\\Downloads", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }

    // ドキュメントアイコン
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\Users\\Public\\Documents", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }

    // ピクチャアイコン
    ZeroMemory(&sfi, sizeof(sfi));
    SHGetFileInfoA("C:\\Users\\Public\\Pictures", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                   SHGFI_ICON | SHGFI_SMALLICON);
    if (sfi.hIcon)
    {
        ImageList_AddIcon(g_hFolderIcons, sfi.hIcon);
        DestroyIcon(sfi.hIcon);
    }
}

static void populate_quick_access(void)
{
    HRESULT hr;
    PWSTR path;
    char ansi_path[MAX_PATH];
    int icon_idx = 0;

    // デスクトップ
    hr = SHGetKnownFolderPath(&FOLDERID_Desktop, 0, NULL, &path);
    if (SUCCEEDED(hr) && path != NULL)
    {
        WideCharToMultiByte(CP_ACP, 0, path, -1, ansi_path, sizeof(ansi_path) - 1, NULL, NULL);
        ansi_path[sizeof(ansi_path) - 1] = '\0';
        tree_add_item(TVI_ROOT, "Desktop", ansi_path, TRUE);
        CoTaskMemFree(path);
    }

    // ダウンロード
    hr = SHGetKnownFolderPath(&FOLDERID_Downloads, 0, NULL, &path);
    if (SUCCEEDED(hr) && path != NULL)
    {
        WideCharToMultiByte(CP_ACP, 0, path, -1, ansi_path, sizeof(ansi_path) - 1, NULL, NULL);
        ansi_path[sizeof(ansi_path) - 1] = '\0';
        tree_add_item(TVI_ROOT, "Downloads", ansi_path, TRUE);
        CoTaskMemFree(path);
    }

    // ドキュメント
    hr = SHGetKnownFolderPath(&FOLDERID_Documents, 0, NULL, &path);
    if (SUCCEEDED(hr) && path != NULL)
    {
        WideCharToMultiByte(CP_ACP, 0, path, -1, ansi_path, sizeof(ansi_path) - 1, NULL, NULL);
        ansi_path[sizeof(ansi_path) - 1] = '\0';
        tree_add_item(TVI_ROOT, "Documents", ansi_path, TRUE);
        CoTaskMemFree(path);
    }

    // ピクチャ
    hr = SHGetKnownFolderPath(&FOLDERID_Pictures, 0, NULL, &path);
    if (SUCCEEDED(hr) && path != NULL)
    {
        WideCharToMultiByte(CP_ACP, 0, path, -1, ansi_path, sizeof(ansi_path) - 1, NULL, NULL);
        ansi_path[sizeof(ansi_path) - 1] = '\0';
        tree_add_item(TVI_ROOT, "Pictures", ansi_path, TRUE);
        CoTaskMemFree(path);
    }
}

static void navigate_to(const char *path)
{
    char msg[MAX_PATH + 64];
    char *copy;

    if (!SetCurrentDirectoryA(path))
    {
        _snprintf(msg, sizeof(msg) - 1, "Cannot navigate to: %s\r\n", path);
        msg[sizeof(msg) - 1] = '\0';
        append_log(msg);
        return;
    }

    // ナビゲーション履歴に追加
    copy = _strdup(path);
    if (copy != NULL)
    {
        // 現在の位置より新しい履歴を削除
        while (g_nav_history_count > g_nav_history_index + 1)
        {
            free(g_nav_history[--g_nav_history_count]);
        }

        // 履歴が最大数に達したら古いものを削除
        if (g_nav_history_count >= NAV_HISTORY_MAX)
        {
            free(g_nav_history[0]);
            memmove(&g_nav_history[0], &g_nav_history[1], sizeof(g_nav_history[0]) * (NAV_HISTORY_MAX - 1));
            g_nav_history_count--;
        }

        g_nav_history[g_nav_history_count++] = copy;
        g_nav_history_index = g_nav_history_count - 1;
    }

    cmd_proc_cd(path);
    update_addressbar();
    update_nav_buttons();
}

static HTREEITEM tree_add_item(HTREEITEM hParent, const char *label,
                               const char *path, BOOL hasChildren)
{
    TVINSERTSTRUCTA tvis;
    int icon_index = get_shell_icon_index(path, FILE_ATTRIBUTE_DIRECTORY);

    ZeroMemory(&tvis, sizeof(tvis));
    tvis.hParent = hParent;
    tvis.hInsertAfter = TVI_SORT;
    tvis.item.mask = TVIF_TEXT | TVIF_PARAM | TVIF_CHILDREN | TVIF_IMAGE | TVIF_SELECTEDIMAGE;
    tvis.item.pszText = (LPSTR)label;
    tvis.item.lParam = (LPARAM)_strdup(path);
    tvis.item.cChildren = hasChildren ? 1 : 0;
    tvis.item.iImage = icon_index;
    tvis.item.iSelectedImage = icon_index;
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

static void tree_expand_root_level(void)
{
    HTREEITEM hItem;
    char current[MAX_PATH];
    char current_drive[4] = "";
    HTREEITEM hFirst = NULL;
    HTREEITEM hTarget = NULL;

    GetCurrentDirectoryA(MAX_PATH, current);
    if (strlen(current) >= 3)
    {
        current_drive[0] = current[0];
        current_drive[1] = current[1];
        current_drive[2] = current[2];
        current_drive[3] = '\0';
    }

    hItem = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_ROOT, 0);
    while (hItem != NULL)
    {
        TVITEMA tvi;
        char label[8];

        if (hFirst == NULL)
            hFirst = hItem;

        ZeroMemory(&tvi, sizeof(tvi));
        ZeroMemory(label, sizeof(label));
        tvi.mask = TVIF_PARAM | TVIF_HANDLE | TVIF_TEXT;
        tvi.hItem = hItem;
        tvi.pszText = label;
        tvi.cchTextMax = (int)sizeof(label);
        SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);

        if (current_drive[0] != '\0' && _stricmp(label, current_drive) == 0)
            hTarget = hItem;

        hItem = (HTREEITEM)SendMessage(g_hTreeView, TVM_GETNEXTITEM, TVGN_NEXT, (LPARAM)hItem);
    }

    if (hTarget == NULL)
        hTarget = hFirst;

    if (hTarget != NULL)
    {
        TVITEMA tvi;
        const char *path;

        ZeroMemory(&tvi, sizeof(tvi));
        tvi.mask = TVIF_PARAM | TVIF_HANDLE;
        tvi.hItem = hTarget;
        SendMessage(g_hTreeView, TVM_GETITEMA, 0, (LPARAM)&tvi);
        path = (const char *)tvi.lParam;
        if (path != NULL)
        {
            tree_populate_children(hTarget, path);
            TreeView_Expand(g_hTreeView, hTarget, TVE_EXPAND);
        }
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

    // ④ ステータスバー情報のリセット
    g_status_item_count = 0;
    g_status_selected_size = 0;
    g_status_selected_count = 0;

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
        char fullpath[MAX_PATH];
        char size_str[32];
        FileEntry *e = &list.entries[i];
        const char *kind = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "Folder" : "File";

        // ④ 件数カウント
        g_status_item_count++;

        _snprintf(fullpath, sizeof(fullpath) - 1, "%s\\%s", path, e->name);
        fullpath[sizeof(fullpath) - 1] = '\0';

        lvi.iItem = i;
        lvi.iSubItem = 0;
        lvi.mask = LVIF_TEXT | LVIF_IMAGE;
        lvi.pszText = e->name;
        lvi.iImage = get_shell_icon_index(fullpath, e->attributes);
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

    // ④ ステータスバー更新
    update_status_bar();
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

    if (strcmp(kind, "Folder") == 0)
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

    history_add(p);

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

    if (msg == WM_KEYDOWN && wp == VK_UP)
    {
        history_browse(-1);
        return 0;
    }

    if (msg == WM_KEYDOWN && wp == VK_DOWN)
    {
        history_browse(1);
        return 0;
    }

    if (msg == WM_KEYDOWN &&
        wp != VK_LEFT && wp != VK_RIGHT &&
        wp != VK_HOME && wp != VK_END &&
        wp != VK_SHIFT && wp != VK_CONTROL &&
        wp != VK_MENU && wp != VK_PRIOR &&
        wp != VK_NEXT)
    {
        if (g_cmd_history_index != -1)
            history_reset_navigation();
    }

    return CallWindowProc(g_orig_input_proc, hwnd, msg, wp, lp);
}

static void create_controls(HWND hwnd)
{
    HINSTANCE hInst = GetModuleHandle(NULL);
    g_hUiFont = create_ui_font();
    g_hIconFont = create_icon_font();
    g_hHeaderFont = create_header_font();
    LVCOLUMNA col;
    SHFILEINFOA sfi;

    g_hBtnUp = CreateWindowExW(0, L"BUTTON", L"\xE72B",
                               WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                               BTN_MARGIN, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W, BTN_H,
                               hwnd, (HMENU)(INT_PTR)ID_BTN_UP, hInst, NULL);
    SendMessageW(g_hBtnUp, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);

    g_hBtnRefresh = CreateWindowExW(0, L"BUTTON", L"\xE72C",
                                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                                    BTN_MARGIN * 2 + ICON_BTN_W, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W, BTN_H,
                                    hwnd, (HMENU)(INT_PTR)ID_BTN_REFRESH, hInst, NULL);
    SendMessageW(g_hBtnRefresh, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);

    g_hBtnTerminal = CreateWindowExA(0, "BUTTON", "> Console",
                                     WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT | BS_LEFT | BS_TEXT,
                                     0, 0, 0, ACCORDION_H,
                                     hwnd, (HMENU)(INT_PTR)ID_BTN_TERMINAL, hInst, NULL);
    SendMessage(g_hBtnTerminal, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);

    g_hPathCrumb = CreateWindowExA(0, "STATIC", "This PC",
                                   WS_CHILD | WS_VISIBLE | SS_LEFT,
                                   0, 0, 0, BTN_H,
                                   hwnd, NULL, hInst, NULL);
    SendMessage(g_hPathCrumb, WM_SETFONT, (WPARAM)g_hHeaderFont, TRUE);

    g_hAddrBar = CreateWindowExA(0, "EDIT", "",
                                 WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                 0, (NAVBAR_H - BTN_H) / 2, 0, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_ADDRESSBAR, hInst, NULL);
    SendMessage(g_hAddrBar, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);
    g_orig_addr_proc = (WNDPROC)SetWindowLongPtr(g_hAddrBar, GWLP_WNDPROC, (LONG_PTR)addr_subclass_proc);

    g_hTreeView = CreateWindowExA(0, WC_TREEVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | TVS_HASBUTTONS | TVS_SHOWSELALWAYS | TVS_FULLROWSELECT | TVS_NOHSCROLL,
                                  0, NAVBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_TREEVIEW, hInst, NULL);
    SendMessage(g_hTreeView, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);
    TreeView_SetItemHeight(g_hTreeView, 24);

    ZeroMemory(&sfi, sizeof(sfi));
    g_hShellSmallIcons = (HIMAGELIST)SHGetFileInfoA("C:\\", FILE_ATTRIBUTE_DIRECTORY, &sfi, sizeof(sfi),
                                                    SHGFI_SYSICONINDEX | SHGFI_SMALLICON | SHGFI_USEFILEATTRIBUTES);
    if (g_hShellSmallIcons != NULL)
    {
        TreeView_SetImageList(g_hTreeView, g_hShellSmallIcons, TVSIL_NORMAL);
    }
    tree_populate_drives();
    tree_expand_root_level();

    g_hListView = CreateWindowExA(0, WC_LISTVIEWA, "",
                                  WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL | LVS_SHOWSELALWAYS,
                                  0, NAVBAR_H, 0, 0,
                                  hwnd, (HMENU)(INT_PTR)ID_LISTVIEW, hInst, NULL);
    ListView_SetExtendedListViewStyle(g_hListView,
                                      LVS_EX_FULLROWSELECT | LVS_EX_DOUBLEBUFFER | LVS_EX_LABELTIP);
    SendMessage(g_hListView, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);
    SendMessage(ListView_GetHeader(g_hListView), WM_SETFONT, (WPARAM)g_hHeaderFont, TRUE);
    if (g_hShellSmallIcons != NULL)
        ListView_SetImageList(g_hListView, g_hShellSmallIcons, LVSIL_SMALL);

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

    g_hConsole = CreateWindowExA(0, "EDIT", "",
                                 WS_CHILD | WS_VSCROLL | ES_MULTILINE |
                                     ES_READONLY | ES_AUTOVSCROLL,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_CONSOLE, hInst, NULL);
    SendMessage(g_hConsole, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);

    g_hInput = CreateWindowExA(0, "EDIT", "",
                               WS_CHILD | ES_AUTOHSCROLL,
                               0, 0, 0, 0,
                               hwnd, (HMENU)(INT_PTR)ID_INPUT, hInst, NULL);
    SendMessage(g_hInput, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);
    g_orig_input_proc = (WNDPROC)SetWindowLongPtr(g_hInput, GWLP_WNDPROC, (LONG_PTR)input_subclass_proc);

    g_hBtnExec = CreateWindowExA(0, "BUTTON", "Run",
                                 WS_CHILD | BS_PUSHBUTTON | BS_FLAT,
                                 0, 0, 0, 0,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_EXEC, hInst, NULL);
    SendMessage(g_hBtnExec, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);

    // ① Win11風コマンドバー: 新規作成ボタン
    g_hBtnNew = CreateWindowExW(0, L"BUTTON", L"\xE8A5",
                                WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                                BTN_MARGIN * 3 + ICON_BTN_W * 2, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W + 8, BTN_H,
                                hwnd, (HMENU)(INT_PTR)ID_BTN_NEW, hInst, NULL);
    SendMessageW(g_hBtnNew, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);

    // ① Win11風コマンドバー: 表示切替ボタン
    g_hBtnView = CreateWindowExW(0, L"BUTTON", L"\xE8A1",
                                 WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                                 BTN_MARGIN * 4 + ICON_BTN_W * 2 + 8, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W + 8, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_VIEW, hInst, NULL);
    SendMessageW(g_hBtnView, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);

    // ③ ナビゲーション履歴: 戻るボタン
    g_hBtnBack = CreateWindowExW(0, L"BUTTON", L"\xE72B",
                                 WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                                 BTN_MARGIN, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W, BTN_H,
                                 hwnd, (HMENU)(INT_PTR)ID_BTN_BACK, hInst, NULL);
    SendMessageW(g_hBtnBack, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);
    EnableWindow(g_hBtnBack, FALSE);

    // ③ ナビゲーション履歴: 進むボタン
    g_hBtnForward = CreateWindowExW(0, L"BUTTON", L"\xE72A",
                                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON | BS_FLAT,
                                    BTN_MARGIN * 2 + ICON_BTN_W, (NAVBAR_H - BTN_H) / 2, ICON_BTN_W, BTN_H,
                                    hwnd, (HMENU)(INT_PTR)ID_BTN_FORWARD, hInst, NULL);
    SendMessageW(g_hBtnForward, WM_SETFONT, (WPARAM)g_hIconFont, TRUE);
    EnableWindow(g_hBtnForward, FALSE);

    // ④ ステータスバー
    g_hStatusBar = CreateWindowExA(0, "STATUSBAR", "",
                                   WS_CHILD | WS_VISIBLE,
                                   0, 0, 0, 0,
                                   hwnd, (HMENU)(INT_PTR)ID_STATUSBAR, hInst, NULL);
    SendMessage(g_hStatusBar, WM_SETFONT, (WPARAM)g_hUiFont, TRUE);

    // ⑥ フォルダアイコンリストを作成
    create_folder_icons();

    // ⑤ クイックアクセスを追加（ドライブの前に配置）
    populate_quick_access();

    apply_explorer_theme();
    update_terminal_button();
    update_status_bar();
}

static void on_resize(int cx, int cy)
{
    int nav_y = (NAVBAR_H - BTN_H) / 2;
    // ③ ナビゲーション履歴ボタン配置に合わせる
    int crumb_x = BTN_MARGIN * 5 + ICON_BTN_W * 3 + 8 + 8;
    int crumb_w = 120;
    int addr_x = crumb_x + crumb_w + 8;
    int addr_w;
    int console_block_h = ACCORDION_H + PANE_GAP;
    int panel_h;
    int tree_x = CONTENT_MARGIN;
    int tree_w;
    int list_x;
    int list_w;
    int y_panel;
    int y_accordion;
    int y_console;
    int y_input;
    int input_w;
    int input_y;
    int y_console_area;
    int status_h = 24;

    // ③ ナビゲーション履歴ボタン配置
    SetWindowPos(g_hBtnBack, NULL, BTN_MARGIN, nav_y, ICON_BTN_W, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnForward, NULL, BTN_MARGIN * 2 + ICON_BTN_W, nav_y, ICON_BTN_W, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnUp, NULL, BTN_MARGIN * 3 + ICON_BTN_W * 2, nav_y, ICON_BTN_W, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnRefresh, NULL, BTN_MARGIN * 4 + ICON_BTN_W * 2, nav_y, ICON_BTN_W, BTN_H, SWP_NOZORDER);

    // ① 新規作成・表示切替ボタン
    SetWindowPos(g_hBtnNew, NULL, BTN_MARGIN * 5 + ICON_BTN_W * 2 + 8, nav_y, ICON_BTN_W + 8, BTN_H, SWP_NOZORDER);
    SetWindowPos(g_hBtnView, NULL, BTN_MARGIN * 6 + ICON_BTN_W * 2 + 8 + ICON_BTN_W + 8, nav_y, ICON_BTN_W + 8, BTN_H, SWP_NOZORDER);

    SetWindowPos(g_hPathCrumb, NULL, crumb_x, nav_y + 2, crumb_w, BTN_H, SWP_NOZORDER);

    addr_w = cx - addr_x - BTN_MARGIN;
    if (addr_w < 0)
        addr_w = 0;
    SetWindowPos(g_hAddrBar, NULL, addr_x, nav_y, addr_w, BTN_H, SWP_NOZORDER);

    if (g_console_visible)
        console_block_h += g_config.console_height + INPUTBAR_H;

    // ④ ステータスバー分を引く
    panel_h = cy - NAVBAR_H - CONTENT_MARGIN * 2 - console_block_h - status_h;
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
    y_accordion = y_panel + panel_h + PANE_GAP;
    y_console_area = y_accordion + ACCORDION_H;
    y_console = y_console_area;
    y_input = y_console + g_config.console_height;
    input_y = y_input + (INPUTBAR_H - BTN_H) / 2;
    input_w = cx - CONTENT_MARGIN * 2 - INPUT_BTN_W;
    if (input_w < 0)
        input_w = 0;

    SetWindowPos(g_hTreeView, NULL, tree_x, y_panel, tree_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hListView, NULL, list_x, y_panel, list_w, panel_h, SWP_NOZORDER);
    SetWindowPos(g_hBtnTerminal, NULL, CONTENT_MARGIN, y_accordion,
                 cx - CONTENT_MARGIN * 2, ACCORDION_H, SWP_NOZORDER);

    // ④ ステータスバー配置
    SetWindowPos(g_hStatusBar, NULL, 0, cy - status_h, cx, status_h, SWP_NOZORDER);

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

static BOOL is_on_vsplitter(int x, int y)
{
    RECT rc;
    int console_block_h = ACCORDION_H + PANE_GAP;
    int panel_h;

    GetClientRect(g_hwnd, &rc);

    if (g_console_visible)
        console_block_h += g_config.console_height + INPUTBAR_H;

    panel_h = rc.bottom - NAVBAR_H - CONTENT_MARGIN * 2 - console_block_h;
    if (panel_h < 0)
        panel_h = 0;

    return (x >= CONTENT_MARGIN + g_tree_w &&
            x <= CONTENT_MARGIN + g_tree_w + HSPLIT_W &&
            y >= NAVBAR_H + CONTENT_MARGIN &&
            y < NAVBAR_H + CONTENT_MARGIN + panel_h);
}

static BOOL is_on_hsplitter(int x, int y)
{
    RECT rc;
    int console_top;

    if (!g_console_visible)
        return FALSE;

    GetClientRect(g_hwnd, &rc);
    console_top = rc.bottom - CONTENT_MARGIN - INPUTBAR_H - g_config.console_height - ACCORDION_H;

    return (x >= CONTENT_MARGIN &&
            x <= rc.right - CONTENT_MARGIN &&
            y >= console_top - PANE_GAP &&
            y <= console_top + 2);
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
        g_hBrushAppBg = CreateSolidBrush(COLOR_APP_BG);
        g_hBrushAddrBg = CreateSolidBrush(COLOR_ADDR_BG);
        g_hBrushInputBg = CreateSolidBrush(COLOR_INPUT_BG);
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

        if (g_dragging_vsplit)
        {
            RECT rc;
            int dx = mx - g_drag_start_x;

            g_tree_w = g_drag_tree_w + dx;
            if (g_tree_w < TREE_W_MIN)
                g_tree_w = TREE_W_MIN;

            GetClientRect(hwnd, &rc);
            on_resize(rc.right, rc.bottom);
        }
        else if (g_dragging_hsplit)
        {
            RECT rc;
            int dy = my - g_drag_start_y;

            g_config.console_height = g_drag_console_h - dy;
            if (g_config.console_height < CONSOLE_H_MIN)
                g_config.console_height = CONSOLE_H_MIN;

            GetClientRect(hwnd, &rc);
            if (g_config.console_height > rc.bottom - NAVBAR_H - CONTENT_MARGIN * 2 - ACCORDION_H - INPUTBAR_H - MAIN_PANEL_H_MIN)
                g_config.console_height = rc.bottom - NAVBAR_H - CONTENT_MARGIN * 2 - ACCORDION_H - INPUTBAR_H - MAIN_PANEL_H_MIN;
            if (g_config.console_height < CONSOLE_H_MIN)
                g_config.console_height = CONSOLE_H_MIN;
            on_resize(rc.right, rc.bottom);
        }
        else if (is_on_vsplitter(mx, my))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZEWE));
        }
        else if (is_on_hsplitter(mx, my))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZENS));
        }
        return 0;
    }

    case WM_LBUTTONDOWN:
    {
        int mx = (int)(short)LOWORD(lp);
        int my = (int)(short)HIWORD(lp);

        if (is_on_vsplitter(mx, my))
        {
            g_dragging_vsplit = TRUE;
            g_drag_start_x = mx;
            g_drag_tree_w = g_tree_w;
            SetCapture(hwnd);
        }
        else if (is_on_hsplitter(mx, my))
        {
            g_dragging_hsplit = TRUE;
            g_drag_start_y = my;
            g_drag_console_h = g_config.console_height;
            SetCapture(hwnd);
        }
        return 0;
    }

    case WM_LBUTTONUP:
        if (g_dragging_vsplit || g_dragging_hsplit)
        {
            g_dragging_vsplit = FALSE;
            g_dragging_hsplit = FALSE;
            ReleaseCapture();
        }
        return 0;

    case WM_SETCURSOR:
    {
        POINT pt;

        GetCursorPos(&pt);
        ScreenToClient(hwnd, &pt);
        if (is_on_vsplitter(pt.x, pt.y))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZEWE));
            return TRUE;
        }
        if (is_on_hsplitter(pt.x, pt.y))
        {
            SetCursor(LoadCursor(NULL, IDC_SIZENS));
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
            return (LRESULT)g_hBrushAddrBg;
        }

        if (hCtrl == g_hAddrBar)
        {
            SetTextColor(hdc, g_config.color_text);
            SetBkColor(hdc, COLOR_ADDR_BG);
            return (LRESULT)g_hBrushAddrBg;
        }

        if (hCtrl == g_hInput)
        {
            SetTextColor(hdc, COLOR_TERMINAL_TEXT);
            SetBkColor(hdc, COLOR_INPUT_BG);
            return (LRESULT)g_hBrushInputBg;
        }

        SetTextColor(hdc, g_config.color_text);
        SetBkColor(hdc, g_config.color_bg);
        return (LRESULT)g_hBrushAddrBg;
    }

    case WM_CTLCOLORSTATIC:
    {
        HWND hCtrl = (HWND)lp;
        HDC hdc = (HDC)wp;

        if (hCtrl == g_hPathCrumb)
        {
            SetTextColor(hdc, COLOR_MUTED_TEXT);
            SetBkColor(hdc, COLOR_APP_BG);
            return (LRESULT)g_hBrushAppBg;
        }
        break;
    }

    case WM_ERASEBKGND:
    {
        HDC hdc = (HDC)wp;
        RECT rc;
        HBRUSH hBr;

        GetClientRect(hwnd, &rc);
        hBr = g_hBrushAppBg;
        FillRect(hdc, &rc, hBr);
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

        // ① 新規作成ボタン
        case ID_BTN_NEW:
        {
            HMENU hMenu, hSubMenu;
            POINT pt;
            RECT rc;

            GetWindowRect(g_hBtnNew, &rc);
            pt.x = rc.left;
            pt.y = rc.bottom;

            hMenu = CreatePopupMenu();
            hSubMenu = CreatePopupMenu();

            AppendMenuW(hSubMenu, MF_STRING, 1, L"新規フォルダ");
            AppendMenuW(hSubMenu, MF_STRING, 2, L"テキストファイル");
            AppendMenuW(hMenu, MF_POPUP | MF_STRING, (UINT_PTR)hSubMenu, L"新規作成");

            TrackPopupMenu(hMenu, TPM_LEFTALIGN | TPM_TOPALIGN, pt.x, pt.y, 0, g_hwnd, NULL);

            // メニュー選択結果は WM_COMMAND で受け取る
            break;
        }

        // ① 表示切替ボタン
        case ID_BTN_VIEW:
        {
            HMENU hMenu;
            POINT pt;
            RECT rc;

            GetWindowRect(g_hBtnView, &rc);
            pt.x = rc.left;
            pt.y = rc.bottom;

            hMenu = CreatePopupMenu();
            AppendMenuW(hMenu, MF_STRING, 10, L"詳細");
            AppendMenuW(hMenu, MF_STRING, 11, L"アイコン");
            AppendMenuW(hMenu, MF_STRING, 12, L"一覧");
            AppendMenuW(hMenu, MF_SEPARATOR, 0, NULL);
            AppendMenuW(hMenu, MF_STRING, 13, g_console_visible ? L"コンソールを隠す" : L"コンソールを表示");

            TrackPopupMenu(hMenu, TPM_LEFTALIGN | TPM_TOPALIGN, pt.x, pt.y, 0, g_hwnd, NULL);
            break;
        }

        // ③ 戻るボタン
        case ID_BTN_BACK:
            navigate_back();
            refresh_listview();
            break;

        // ③ 進むボタン
        case ID_BTN_FORWARD:
            navigate_forward();
            refresh_listview();
            break;

        // ① メニュー選択結果
        case 1: // 新規フォルダ
            cmd_proc_send("mkdir NewFolder");
            Sleep(200);
            refresh_listview();
            break;
        case 2: // テキストファイル
        {
            FILE *f = fopen("NewTextFile.txt", "w");
            if (f)
                fclose(f);
            refresh_listview();
            break;
        }
        case 10: // 詳細表示
        case 11: // アイコン表示
        case 12: // 一覧表示
            break;
        case 13: // コンソール表示切替
            set_console_visible(!g_console_visible);
            break;
        }
        return 0;

    case WM_NOTIFY:
    {
        NMHDR *nm = (NMHDR *)lp;
        HWND hHeader = ListView_GetHeader(g_hListView);

        if (nm->hwndFrom == hHeader && nm->code == NM_CUSTOMDRAW)
        {
            NMCUSTOMDRAW *cd = (NMCUSTOMDRAW *)lp;
            if (cd->dwDrawStage == CDDS_PREPAINT)
                return CDRF_NOTIFYITEMDRAW;
            if (cd->dwDrawStage == CDDS_ITEMPREPAINT)
            {
                SetTextColor(cd->hdc, RGB(110, 110, 110));
                SetBkColor(cd->hdc, g_config.color_bg);
                return CDRF_DODEFAULT;
            }
        }

        if (nm->idFrom == ID_TREEVIEW && nm->code == NM_CUSTOMDRAW)
        {
            NMTVCUSTOMDRAW *tvcd = (NMTVCUSTOMDRAW *)lp;
            if (tvcd->nmcd.dwDrawStage == CDDS_PREPAINT)
                return CDRF_NOTIFYITEMDRAW;
            if (tvcd->nmcd.dwDrawStage == CDDS_ITEMPREPAINT)
            {
                if (tree_is_root_item((HTREEITEM)tvcd->nmcd.dwItemSpec))
                {
                    tree_draw_root_item(tvcd);
                    return CDRF_SKIPDEFAULT;
                }
                return CDRF_DODEFAULT;
            }
        }

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
            {
                if (tree_is_root_item(ntv->itemNew.hItem))
                    tree_collapse_other_roots(ntv->itemNew.hItem);
                on_treeview_expand(ntv->itemNew.hItem);
            }
            return 0;
        }
        return 0;
    }

    case WM_DESTROY:
        cmd_proc_stop();
        if (g_hBrushAppBg != NULL)
            DeleteObject(g_hBrushAppBg);
        if (g_hBrushAddrBg != NULL)
            DeleteObject(g_hBrushAddrBg);
        if (g_hBrushInputBg != NULL)
            DeleteObject(g_hBrushInputBg);
        if (g_hUiFont != NULL)
            DeleteObject(g_hUiFont);
        if (g_hIconFont != NULL)
            DeleteObject(g_hIconFont);
        if (g_hHeaderFont != NULL)
            DeleteObject(g_hHeaderFont);
        if (g_hFolderIcons != NULL)
            ImageList_Destroy(g_hFolderIcons);
        {
            int i;
            for (i = 0; i < g_cmd_history_count; i++)
                free(g_cmd_history[i]);
        }
        // ③ ナビゲーション履歴の解放
        {
            int i;
            for (i = 0; i < g_nav_history_count; i++)
                free(g_nav_history[i]);
        }
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
