// ---------------------------------------------------------------------------
// server.c
// 役割: Electron フロントエンドとの Stdin/Stdout パイプ通信ゲートウェイ
//       JSON パケットの解析とルーティングのみを担当する
//       ※ OS依存処理はすべて core/fs_orbit.c / core/win_api.c / core/search.c に委譲する
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <windows.h>
#include <stdarg.h>
#include "core/fs_orbit.h"
#include "core/win_api.h"
#include "core/search.h"
#include "core/sort.h"
#include "proc/cmd_proc.h"

// ---------------------------------------------------------------------------
// グローバル定義
// ---------------------------------------------------------------------------

CRITICAL_SECTION g_stdout_cs;
static char currentPath[MAX_PATH] = {0}; // 現在の作業パス（検索ルート用 / UTF-8）

static SortKey   g_sort_key   = SORT_NAME;
static SortOrder g_sort_order = SORT_ASC;

// ---------------------------------------------------------------------------
// 文字コード変換ヘルパー（CP932 / UTF-8）
// ターミナルペイン（cmd.exe）との文字コード変換専用
// ---------------------------------------------------------------------------

void cp932_to_utf8(const char *cp932, char *utf8, size_t utf8_size)
{
    if (!cp932 || !utf8 || utf8_size == 0) return;
    wchar_t wbuf[16384];
    int wlen = MultiByteToWideChar(932, 0, cp932, -1, wbuf, 16384);
    if (wlen > 0)
        WideCharToMultiByte(CP_UTF8, 0, wbuf, -1, utf8, (int)utf8_size, NULL, NULL);
    else
    {
        strncpy(utf8, cp932, utf8_size - 1);
        utf8[utf8_size - 1] = '\0';
    }
}

void utf8_to_cp932(const char *utf8, char *cp932, size_t cp932_size)
{
    if (!utf8 || !cp932 || cp932_size == 0) return;
    wchar_t wbuf[8192];
    int wlen = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, wbuf, 8192);
    if (wlen > 0)
        WideCharToMultiByte(932, 0, wbuf, -1, cp932, (int)cp932_size, NULL, NULL);
    else
        cp932[0] = '\0';
}

// ---------------------------------------------------------------------------
// JSON 通信
// ---------------------------------------------------------------------------

// JSON 特殊文字のエスケープ
static void json_escape(const char *input, char *output, size_t out_size)
{
    size_t j = 0;
    for (size_t i = 0; input[i] != '\0' && j < out_size - 5; i++)
    {
        switch (input[i])
        {
        case '\"': output[j++] = '\\'; output[j++] = '\"'; break;
        case '\\': output[j++] = '\\'; output[j++] = '\\'; break;
        case '\b': output[j++] = '\\'; output[j++] = 'b';  break;
        case '\f': output[j++] = '\\'; output[j++] = 'f';  break;
        case '\n': output[j++] = '\\'; output[j++] = 'n';  break;
        case '\r': output[j++] = '\\'; output[j++] = 'r';  break;
        case '\t': output[j++] = '\\'; output[j++] = 't';  break;
        default:   output[j++] = input[i];
        }
    }
    output[j] = '\0';
}

// スレッドセーフな JSON 送信（Stdout への書き込みは排他制御で行う）
void send_json_utf8(const char *type, const char *content_utf8)
{
    char escaped[65536];
    json_escape(content_utf8 ? content_utf8 : "", escaped, sizeof(escaped));
    EnterCriticalSection(&g_stdout_cs);
    printf("{\"type\":\"%s\",\"content\":\"%s\"}\n", type, escaped);
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：ファイルリスト表示
// ---------------------------------------------------------------------------

void handle_list(const char *path_utf8)
{
    FileList list = fs_orbit_create();
    int count = fs_orbit_fetch(&list, path_utf8);

    if (count == -5)
    {
        send_json_utf8("ERROR_ACCESS_DENIED", path_utf8);
        fs_orbit_free(&list);
        return;
    }
    if (count < 0)
    {
        send_json_utf8("ERROR", "Failed to list directory");
        fs_orbit_free(&list);
        return;
    }

    filelist_sort(&list, (SortContext){g_sort_key, g_sort_order});
    send_json_utf8("START_LIST", path_utf8);

    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];
        char name_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);

        ULARGE_INTEGER ull;
        ull.LowPart  = e->updated_at.dwLowDateTime;
        ull.HighPart = e->updated_at.dwHighDateTime;
        long long ms = (long long)((ull.QuadPart - 116444736000000000ULL) / 10000ULL);

        char line[MAX_PATH * 4 + 128];
        _snprintf(line, sizeof(line) - 1, "%s|%s|%lld|%d|%lld",
            (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "D" : "F",
            name_utf8, (long long)e->size,
            (e->attributes & FILE_ATTRIBUTE_HIDDEN) ? 1 : 0, ms);
        send_json_utf8("DATA", line);
    }

    send_json_utf8("END_LIST", path_utf8);
    fs_orbit_free(&list);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：ツリービュー（サイドバー用サブフォルダ一覧）
// ---------------------------------------------------------------------------

void handle_tree_list(const char *path_utf8)
{
    FileList list = fs_orbit_create();
    fs_orbit_fetch(&list, path_utf8);
    send_json_utf8("START_TREE", path_utf8);

    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];
        if (!(e->attributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
        char name_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);
        send_json_utf8("TREE_DATA", name_utf8);
    }

    send_json_utf8("END_TREE", path_utf8);
    fs_orbit_free(&list);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：ドライブ一覧
// ---------------------------------------------------------------------------

void handle_get_drives(void)
{
    wchar_t drives[512];
    int len = win_api_fetch_drives(drives, 512);
    if (len == 0)
    {
        send_json_utf8("ERROR", "Failed to get drives");
        return;
    }

    send_json_utf8("START_DRIVES", "");
    wchar_t *p = drives;
    while (*p)
    {
        char drive_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, p, -1, drive_utf8, sizeof(drive_utf8), NULL, NULL);
        send_json_utf8("DRIVE_DATA", drive_utf8);
        p += wcslen(p) + 1;
    }
    send_json_utf8("END_DRIVES", "");
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：ファイル検索
// ---------------------------------------------------------------------------

void handle_search(const char *start_root_utf8, const char *keyword_utf8)
{
    int result_count = 0;
    send_json_utf8("START_SEARCH", keyword_utf8);
    search_recursive(start_root_utf8, keyword_utf8, NULL, &result_count, send_json_utf8);
    send_json_utf8("END_SEARCH", keyword_utf8);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：壁紙用画像再帰スキャン
// ---------------------------------------------------------------------------

void handle_scan_images(const char *root_utf8)
{
    search_scan_images(root_utf8, send_json_utf8);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：ファイルプロパティ（アプリ内表示用）
// ---------------------------------------------------------------------------

void handle_prop(const char *path_utf8)
{
    char result[2048];
    if (!win_api_get_properties(path_utf8, result, sizeof(result)))
    {
        send_json_utf8("ERROR", "Failed to get file attributes");
        return;
    }
    send_json_utf8("PROP_DATA", result);
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：OS標準プロパティダイアログ表示
// ---------------------------------------------------------------------------

void handle_prop_native(const char *path_utf8)
{
    if (!win_api_show_properties(path_utf8))
    {
        char err[256];
        _snprintf(err, sizeof(err) - 1, "ShellExecuteEx failed: %lu", GetLastError());
        send_json_utf8("ERROR", err);
    }
    else
    {
        send_json_utf8("LOG", "Native properties dialog opened");
    }
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：CRUD 操作
// ---------------------------------------------------------------------------

void handle_mkdir(const char *path_utf8)
{
    char final_utf8[MAX_PATH * 4];
    if (!win_api_mkdir(path_utf8, final_utf8, sizeof(final_utf8)))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to create directory: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("CREATED", final_utf8);
    }
}

void handle_new_file(const char *path_utf8)
{
    char final_utf8[MAX_PATH * 4];
    if (!win_api_new_file(path_utf8, final_utf8, sizeof(final_utf8)))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to create file: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("CREATED", final_utf8);
    }
}

void handle_rename(const char *old_path_utf8, const char *new_path_utf8)
{
    if (!win_api_rename(old_path_utf8, new_path_utf8))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to rename: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("RENAMED", new_path_utf8);
    }
}

void handle_delete(const char *path_utf8, int permanent)
{
    if (!win_api_delete(path_utf8, permanent))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to delete: operation failed or cancelled");
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("DELETED", path_utf8);
    }
}

void handle_copy(const char *src_utf8, const char *dst_utf8)
{
    if (!win_api_copy(src_utf8, dst_utf8))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to copy: operation failed or cancelled");
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("COPIED", dst_utf8);
    }
}

void handle_move(const char *src_utf8, const char *dst_utf8)
{
    if (!win_api_move(src_utf8, dst_utf8))
    {
        char msg[256];
        _snprintf(msg, sizeof(msg) - 1, "Failed to move: operation failed or cancelled");
        send_json_utf8("ERROR", msg);
    }
    else
    {
        send_json_utf8("MOVED", dst_utf8);
    }
}

// ---------------------------------------------------------------------------
// コマンドハンドラ：権限昇格
// ---------------------------------------------------------------------------

void handle_elevate(const char *path_utf8)
{
    int result = win_api_elevate(path_utf8);
    if (result == 0)
    {
        send_json_utf8("LOG", "Permissions granted. Retrying...");
        handle_list(path_utf8);
    }
    else if (result == -1)
    {
        send_json_utf8("LOG", "Elevation cancelled by user");
    }
    else
    {
        send_json_utf8("ERROR", "Elevation failed");
    }
}

// ---------------------------------------------------------------------------
// ターミナルペイン：コマンド出力コールバック（cmd.exe からの標準出力を受信）
// ---------------------------------------------------------------------------

void on_cmd_output(const char *text_cp932)
{
    char *marker = strstr(text_cp932, "__CWD__:");
    if (marker)
    {
        // CWD マーカーより前のテキストを出力
        if (marker > text_cp932)
        {
            char *prefix = _strdup(text_cp932);
            prefix[marker - text_cp932] = '\0';
            char prefix_utf8[16384];
            cp932_to_utf8(prefix, prefix_utf8, sizeof(prefix_utf8));
            send_json_utf8("CMD_OUT", prefix_utf8);
            free(prefix);
        }

        // カレントディレクトリを抽出して currentPath を更新
        char path_cp932[MAX_PATH];
        char *start = marker + 8;
        char *end   = strpbrk(start, "\r\n");
        size_t len  = end ? (size_t)(end - start) : strlen(start);

        if (len > 0 && len < MAX_PATH)
        {
            strncpy(path_cp932, start, len);
            path_cp932[len] = '\0';

            char path_utf8[MAX_PATH * 4];
            cp932_to_utf8(path_cp932, path_utf8, sizeof(path_utf8));

            strncpy(currentPath, path_utf8, MAX_PATH - 1);
            if (currentPath[strlen(currentPath) - 1] != '\\')
                strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);

            send_json_utf8("SYNC_PATH", path_utf8);
            Sleep(100);
            handle_list(path_utf8);
        }
        if (end) on_cmd_output(end + strspn(end, "\r\n"));
    }
    else
    {
        if (strlen(text_cp932) > 0)
        {
            char text_utf8[32768];
            cp932_to_utf8(text_cp932, text_utf8, sizeof(text_utf8));
            send_json_utf8("CMD_OUT", text_utf8);
        }
    }
}

// ---------------------------------------------------------------------------
// エントリーポイント（メインループ）
// ---------------------------------------------------------------------------

int main(void)
{
    char line[4096];
    InitializeCriticalSection(&g_stdout_cs);
    setvbuf(stdout, NULL, _IONBF, 0); // stdout をアンバッファリングモードに設定

    // ターミナルペインのプロセスを起動
    if (!cmd_proc_start(on_cmd_output))
    {
        send_json_utf8("ERROR", "Failed to start cmd.exe");
        return 1;
    }

    // 起動時の初期パスを送信
    char initial_path_a[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, initial_path_a);
    char initial_path_utf8[MAX_PATH * 4];
    cp932_to_utf8(initial_path_a, initial_path_utf8, sizeof(initial_path_utf8));

    strncpy(currentPath, initial_path_utf8, MAX_PATH - 1);
    if (currentPath[strlen(currentPath) - 1] != '\\')
        strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);

    send_json_utf8("READY", initial_path_utf8);
    handle_list(initial_path_utf8);

    // ---------------------------------------------------------------------------
    // メインループ: Stdin から 1行ずつ JSON コマンドを受信してルーティング
    // ---------------------------------------------------------------------------
    while (fgets(line, sizeof(line), stdin))
    {
        line[strcspn(line, "\r\n")] = 0;

        // --- ファイル一覧表示 ---
        if (strncmp(line, "LIST|", 5) == 0)
        {
            handle_list(line + 5);
        }
        // --- ソート設定変更 ---
        else if (strncmp(line, "SORT|", 5) == 0)
        {
            char *k = line + 5;
            char *o = strchr(k, '|');
            if (o)
            {
                *o = '\0';
                g_sort_key   = (SortKey)atoi(k);
                g_sort_order = (SortOrder)atoi(o + 1);
                handle_list(currentPath);
            }
        }
        // --- ツリービュー ---
        else if (strncmp(line, "TREE_LIST|", 10) == 0)
        {
            handle_tree_list(line + 10);
        }
        // --- ファイル検索 ---
        else if (strncmp(line, "SEARCH|", 7) == 0)
        {
            handle_search(currentPath, line + 7);
        }
        // --- 壁紙用画像スキャン ---
        else if (strncmp(line, "SCAN_IMAGES|", 12) == 0)
        {
            handle_scan_images(line + 12);
        }
        // --- ドライブ一覧 ---
        else if (strcmp(line, "GET_DRIVES") == 0)
        {
            handle_get_drives();
        }
        // --- フォルダ作成 ---
        else if (strncmp(line, "MKDIR|", 6) == 0)
        {
            handle_mkdir(line + 6);
        }
        // --- ファイル作成 ---
        else if (strncmp(line, "NEW_FILE|", 9) == 0)
        {
            handle_new_file(line + 9);
        }
        // --- 名前変更 ---
        else if (strncmp(line, "RENAME|", 7) == 0)
        {
            char *old_p = line + 7;
            char *new_p = strchr(old_p, '|');
            if (new_p) { *new_p = '\0'; handle_rename(old_p, new_p + 1); }
        }
        // --- 完全削除 ---
        else if (strncmp(line, "DELETE_FORCE|", 13) == 0)
        {
            handle_delete(line + 13, 1);
        }
        // --- ゴミ箱削除 ---
        else if (strncmp(line, "DELETE|", 7) == 0)
        {
            handle_delete(line + 7, 0);
        }
        // --- コピー ---
        else if (strncmp(line, "COPY|", 5) == 0)
        {
            char *src = line + 5;
            char *dst = strchr(src, '|');
            if (dst) { *dst = '\0'; handle_copy(src, dst + 1); }
        }
        // --- 移動 ---
        else if (strncmp(line, "MOVE|", 5) == 0)
        {
            char *src = line + 5;
            char *dst = strchr(src, '|');
            if (dst) { *dst = '\0'; handle_move(src, dst + 1); }
        }
        // --- ターミナル：コマンド実行 ---
        else if (strncmp(line, "EXEC|", 5) == 0)
        {
            char cmd_cp932[4096];
            utf8_to_cp932(line + 5, cmd_cp932, sizeof(cmd_cp932));
            char combined[8192];
            _snprintf(combined, sizeof(combined) - 1,
                      "%s & @echo __CWD__:%%cd%%", cmd_cp932);
            combined[sizeof(combined) - 1] = '\0';
            cmd_proc_send(combined);
        }
        // --- ターミナル：カレントディレクトリ変更 ---
        else if (strncmp(line, "CD|", 3) == 0)
        {
            char path_cp932[MAX_PATH];
            utf8_to_cp932(line + 3, path_cp932, sizeof(path_cp932));
            cmd_proc_cd(path_cp932);
            handle_list(line + 3);
        }
        // --- ファイルを既定アプリで開く ---
        else if (strncmp(line, "OPEN|", 5) == 0)
        {
            win_api_open(line + 5);
        }
        // --- 権限昇格（UAC） ---
        else if (strncmp(line, "ELEVATE|", 8) == 0)
        {
            handle_elevate(line + 8);
        }
        // --- OS標準プロパティダイアログ ---
        else if (strncmp(line, "PROP_NATIVE|", 12) == 0)
        {
            handle_prop_native(line + 12);
        }
        // --- アプリ内プロパティ表示 ---
        else if (strncmp(line, "PROP|", 5) == 0)
        {
            handle_prop(line + 5);
        }
        // --- 終了 ---
        else if (strcmp(line, "QUIT") == 0)
        {
            break;
        }
    }

    cmd_proc_stop();
    DeleteCriticalSection(&g_stdout_cs);
    return 0;
}
