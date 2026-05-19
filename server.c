#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <windows.h>
#include <stdarg.h>
#include "core/filelist.h"
#include "core/sort.h"
#include "proc/cmd_proc.h"

// ---------------------------------------------------------------------------
// グローバル定義
// ---------------------------------------------------------------------------
CRITICAL_SECTION g_stdout_cs;
static char currentPath[MAX_PATH] = {0}; // 検索で使う現在パス (UTF-8)

static SortKey g_sort_key = SORT_NAME;
static SortOrder g_sort_order = SORT_ASC;

// UTF-8への変換
void cp932_to_utf8(const char* cp932, char* utf8, size_t utf8_size) {
    if (!cp932 || !utf8 || utf8_size == 0) return;
    wchar_t wbuf[16384];
    int wlen = MultiByteToWideChar(932, 0, cp932, -1, wbuf, 16384);
    if (wlen > 0) {
        WideCharToMultiByte(CP_UTF8, 0, wbuf, -1, utf8, (int)utf8_size, NULL, NULL);
    } else {
        strncpy(utf8, cp932, utf8_size - 1);
        utf8[utf8_size - 1] = '\0';
    }
}

// CP932への変換
void utf8_to_cp932(const char* utf8, char* cp932, size_t cp932_size) {
    if (!utf8 || !cp932 || cp932_size == 0) return;
    wchar_t wbuf[8192];
    int wlen = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, wbuf, 8192);
    if (wlen > 0) {
        WideCharToMultiByte(932, 0, wbuf, -1, cp932, (int)cp932_size, NULL, NULL);
    } else {
        cp932[0] = '\0';
    }
}

// JSONエスケープ
void json_escape(const char* input, char* output, size_t out_size) {
    size_t j = 0;
    for (size_t i = 0; input[i] != '\0' && j < out_size - 5; i++) {
        switch (input[i]) {
            case '\"': output[j++] = '\\'; output[j++] = '\"'; break;
            case '\\': output[j++] = '\\'; output[j++] = '\\'; break;
            case '\b': output[j++] = '\\'; output[j++] = 'b'; break;
            case '\f': output[j++] = '\\'; output[j++] = 'f'; break;
            case '\n': output[j++] = '\\'; output[j++] = 'n'; break;
            case '\r': output[j++] = '\\'; output[j++] = 'r'; break;
            case '\t': output[j++] = '\\'; output[j++] = 't'; break;
            default: output[j++] = input[i];
        }
    }
    output[j] = '\0';
}

// 共通JSON送信関数 (UTF-8)
void send_json_utf8(const char* type, const char* content_utf8) {
    char escaped[65536];
    json_escape(content_utf8 ? content_utf8 : "", escaped, sizeof(escaped));
    EnterCriticalSection(&g_stdout_cs);
    printf("{\"type\":\"%s\",\"content\":\"%s\"}\n", type, escaped);
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

// ---------------------------------------------------------------------------
// 各種ハンドラ
// ---------------------------------------------------------------------------
void handle_list(const char* path_utf8) {
    FileList list = filelist_create();
    int count = filelist_fetch(&list, path_utf8);
    if (count == -5) {
        send_json_utf8("ERROR_ACCESS_DENIED", path_utf8);
        filelist_free(&list);
        return;
    }
    if (count < 0) {
        send_json_utf8("ERROR", "Failed to list directory");
        filelist_free(&list);
        return;
    }
    filelist_sort(&list, (SortContext){g_sort_key, g_sort_order});
    
    send_json_utf8("START_LIST", path_utf8);
    for (int i = 0; i < list.count; i++) {
        FileEntry *e = &list.entries[i];
        char name_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);

        ULARGE_INTEGER ull;
        ull.LowPart = e->updated_at.dwLowDateTime;
        ull.HighPart = e->updated_at.dwHighDateTime;
        long long ms = (ull.QuadPart - 116444736000000000ULL) / 10000ULL;

        char line[MAX_PATH * 4 + 128];
        _snprintf(line, sizeof(line)-1, "%s|%s|%lld|%d|%lld", 
            (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "D" : "F", 
            name_utf8, (long long)e->size,
            (e->attributes & FILE_ATTRIBUTE_HIDDEN) ? 1 : 0, ms);
        send_json_utf8("DATA", line);
    }
    send_json_utf8("END_LIST", path_utf8);
    filelist_free(&list);
}

void handle_tree_list(const char* path_utf8) {
    FileList list = filelist_create();
    filelist_fetch(&list, path_utf8);
    send_json_utf8("START_TREE", path_utf8);
    for (int i = 0; i < list.count; i++) {
        FileEntry *e = &list.entries[i];
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY) {
            char name_utf8[MAX_PATH * 4];
            WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);
            send_json_utf8("TREE_DATA", name_utf8);
        }
    }
    send_json_utf8("END_TREE", path_utf8);
    filelist_free(&list);
}

void handle_get_drives() {
    wchar_t drives[512];
    DWORD len = GetLogicalDriveStringsW(511, drives);
    if (len == 0) {
        send_json_utf8("ERROR", "Failed to get drives");
        return;
    }

    send_json_utf8("START_DRIVES", "");
    wchar_t *p = drives;
    while (*p) {
        char drive_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, p, -1, drive_utf8, sizeof(drive_utf8), NULL, NULL);
        send_json_utf8("DRIVE_DATA", drive_utf8);
        p += wcslen(p) + 1;
    }
    send_json_utf8("END_DRIVES", "");
}

// ---------------------------------------------------------------------------
// 検索ロジック (WCHAR化)
// ---------------------------------------------------------------------------
#define SEARCH_MAX_RESULTS 50
#define SEARCH_QUEUE_MAX   512
#define SPATH_MAX          1024

static void handle_search_level(const char* root_utf8, const char* keyword_utf8, const char* skip_name_utf8, int* result_count) {
    char (*queue)[SPATH_MAX] = (char(*)[SPATH_MAX])malloc((size_t)SEARCH_QUEUE_MAX * SPATH_MAX);
    if (!queue) return;
    int head = 0, tail = 0;

    strncpy(queue[tail], root_utf8, SPATH_MAX - 1);
    queue[tail][SPATH_MAX - 1] = '\0';
    tail++;

    // キーワードを小文字のWCHARに変換
    wchar_t kw_w[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, keyword_utf8, -1, kw_w, MAX_PATH);
    for (wchar_t *p = kw_w; *p; p++) *p = towlower(*p);

    wchar_t skip_w[MAX_PATH] = L"";
    if (skip_name_utf8) MultiByteToWideChar(CP_UTF8, 0, skip_name_utf8, -1, skip_w, MAX_PATH);

    while (head < tail && *result_count < SEARCH_MAX_RESULTS) {
        char current_utf8[SPATH_MAX];
        strncpy(current_utf8, queue[head], SPATH_MAX - 1);
        current_utf8[SPATH_MAX - 1] = '\0';
        head++;

        FileList list = filelist_create();
        filelist_fetch(&list, current_utf8);

        for (int i = 0; i < list.count && *result_count < SEARCH_MAX_RESULTS; i++) {
            FileEntry *e = &list.entries[i];
            int is_dir = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

            if (head == 1 && skip_w[0] && _wcsicmp(e->name, skip_w) == 0) continue;

            wchar_t name_lower[MAX_PATH];
            wcscpy(name_lower, e->name);
            for (wchar_t *p = name_lower; *p; p++) *p = towlower(*p);

            if (wcsstr(name_lower, kw_w)) {
                char name_utf8[MAX_PATH * 4];
                WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);
                
                ULARGE_INTEGER ull;
                ull.LowPart = e->updated_at.dwLowDateTime;
                ull.HighPart = e->updated_at.dwHighDateTime;
                long long ms = (ull.QuadPart - 116444736000000000ULL) / 10000ULL;

                char result_line[SPATH_MAX + MAX_PATH * 4 + 128];
                _snprintf(result_line, sizeof(result_line) - 1, "%s|%s|%s|%d|%lld",
                    is_dir ? "D" : "F", name_utf8, current_utf8,
                    (e->attributes & FILE_ATTRIBUTE_HIDDEN) ? 1 : 0, ms);
                send_json_utf8("SEARCH_RESULT", result_line);
                (*result_count)++;
            }

            if (is_dir && tail < SEARCH_QUEUE_MAX) {
                char next_dir[SPATH_MAX];
                char name_utf8[MAX_PATH * 4];
                WideCharToMultiByte(CP_UTF8, 0, e->name, -1, name_utf8, sizeof(name_utf8), NULL, NULL);
                _snprintf(next_dir, sizeof(next_dir)-1, "%s%s\\", current_utf8, name_utf8);
                strncpy(queue[tail], next_dir, SPATH_MAX - 1);
                tail++;
            }
        }
        filelist_free(&list);
    }
    free(queue);
}

void handle_search(const char* start_root_utf8, const char* keyword_utf8) {
    int result_count = 0;
    send_json_utf8("START_SEARCH", keyword_utf8);

    char current_root[SPATH_MAX];
    strncpy(current_root, start_root_utf8, SPATH_MAX - 1);
    current_root[SPATH_MAX - 1] = '\0';

    char last_searched_child[MAX_PATH] = "";

    while (result_count < SEARCH_MAX_RESULTS) {
        handle_search_level(current_root, keyword_utf8, last_searched_child[0] ? last_searched_child : NULL, &result_count);
        if (result_count >= SEARCH_MAX_RESULTS) break;

        size_t len = strlen(current_root);
        if (len <= 3) break; 
        
        if (current_root[len-1] == '\\') current_root[len-1] = '\0';
        char* last_slash = strrchr(current_root, '\\');
        if (!last_slash) break;

        strncpy(last_searched_child, last_slash + 1, MAX_PATH - 1);
        last_slash[1] = '\0';
    }
    send_json_utf8("END_SEARCH", keyword_utf8);
}

// ---------------------------------------------------------------------------
// ターミナル同期
// ---------------------------------------------------------------------------
void on_cmd_output(const char* text_cp932) {
    char* marker = strstr(text_cp932, "__CWD__:");
    if (marker) {
        if (marker > text_cp932) {
            char* prefix = _strdup(text_cp932);
            prefix[marker - text_cp932] = '\0';
            char prefix_utf8[16384];
            cp932_to_utf8(prefix, prefix_utf8, sizeof(prefix_utf8));
            send_json_utf8("CMD_OUT", prefix_utf8);
            free(prefix);
        }
        
        char path_cp932[MAX_PATH];
        char* start = marker + 8;
        char* end = strpbrk(start, "\r\n");
        size_t len = end ? (size_t)(end - start) : strlen(start);
        if (len > 0 && len < MAX_PATH) {
            strncpy(path_cp932, start, len);
            path_cp932[len] = '\0';

            char path_utf8[MAX_PATH * 4];
            cp932_to_utf8(path_cp932, path_utf8, sizeof(path_utf8));

            strncpy(currentPath, path_utf8, MAX_PATH - 1);
            if (currentPath[strlen(currentPath)-1] != '\\') {
                strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);
            }
            send_json_utf8("SYNC_PATH", path_utf8);
            Sleep(100);
            handle_list(path_utf8);
        }
        if (end) on_cmd_output(end + strspn(end, "\r\n"));
    } else {
        if (strlen(text_cp932) > 0) {
            char text_utf8[32768];
            cp932_to_utf8(text_cp932, text_utf8, sizeof(text_utf8));
            send_json_utf8("CMD_OUT", text_utf8);
        }
    }
}

// ---------------------------------------------------------------------------
// ユニークなファイル名生成
// ---------------------------------------------------------------------------
void get_unique_path_w(const wchar_t* path, wchar_t* out) {
    if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES) {
        wcscpy(out, path);
        return;
    }

    wchar_t drive[_MAX_DRIVE], dir[_MAX_DIR], fname[_MAX_FNAME], ext[_MAX_EXT];
    _wsplitpath_s(path, drive, _MAX_DRIVE, dir, _MAX_DIR, fname, _MAX_FNAME, ext, _MAX_EXT);

    for (int i = 2; i < 1000; i++) {
        wchar_t new_fname[_MAX_FNAME + 16];
        _snwprintf(new_fname, _MAX_FNAME + 15, L"%s (%d)", fname, i);
        _wmakepath_s(out, MAX_PATH, drive, dir, new_fname, ext);
        if (GetFileAttributesW(out) == INVALID_FILE_ATTRIBUTES) {
            return;
        }
    }
    wcscpy(out, path); // 万が一失敗したら元のパス（エラーになるはず）
}

// ---------------------------------------------------------------------------
// 権限昇格（UACプロンプトを表示してフォルダへのアクセス権を付与）
// ---------------------------------------------------------------------------
void handle_elevate(const char* path_utf8) {
    wchar_t wpath[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);

    // 末尾のバックスラッシュを削除（icacls "path\" となると \" がエスケープと見なされるため）
    size_t len = wcslen(wpath);
    if (len > 3 && wpath[len - 1] == L'\\') {
        wpath[len - 1] = L'\0';
    }

    // icacls を管理者権限で実行
    wchar_t parameters[MAX_PATH + 128];
    _snwprintf(parameters, (sizeof(parameters)/sizeof(wchar_t)) - 1, L"/c icacls \"%s\" /grant %%USERNAME%%:(OI)(CI)F", wpath);

    SHELLEXECUTEINFOW sei = {0};
    sei.cbSize = sizeof(sei);
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb = L"runas"; // 管理者として実行（UACプロンプトが出る）
    sei.lpFile = L"cmd.exe";
    sei.lpParameters = parameters;
    sei.nShow = SW_HIDE;

    if (ShellExecuteExW(&sei)) {
        WaitForSingleObject(sei.hProcess, INFINITE);
        DWORD exitCode;
        GetExitCodeProcess(sei.hProcess, &exitCode);
        CloseHandle(sei.hProcess);

        if (exitCode == 0) {
            send_json_utf8("LOG", "Permissions granted. Retrying...");
            handle_list(path_utf8); // 成功したので再読み取りを試行
        } else {
            char msg[256];
            _snprintf(msg, sizeof(msg), "Elevation failed with code: %lu", exitCode);
            send_json_utf8("ERROR", msg);
        }
    } else {
        DWORD err = GetLastError();
        if (err == ERROR_CANCELLED) {
            send_json_utf8("LOG", "Elevation cancelled by user");
        } else {
            char msg[256];
            _snprintf(msg, sizeof(msg), "Failed to trigger UAC: %lu", err);
            send_json_utf8("ERROR", msg);
        }
    }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
void handle_mkdir(const char* path_utf8) {
    wchar_t wpath_requested[MAX_PATH], wpath_final[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath_requested, MAX_PATH);
    
    get_unique_path_w(wpath_requested, wpath_final);

    if (CreateDirectoryW(wpath_final, NULL)) {
        char final_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, wpath_final, -1, final_utf8, sizeof(final_utf8), NULL, NULL);
        send_json_utf8("CREATED", final_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to create directory: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
}

void handle_new_file(const char* path_utf8) {
    wchar_t wpath_requested[MAX_PATH], wpath_final[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath_requested, MAX_PATH);

    get_unique_path_w(wpath_requested, wpath_final);

    HANDLE hFile = CreateFileW(wpath_final, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile != INVALID_HANDLE_VALUE) {
        CloseHandle(hFile);
        char final_utf8[MAX_PATH * 4];
        WideCharToMultiByte(CP_UTF8, 0, wpath_final, -1, final_utf8, sizeof(final_utf8), NULL, NULL);
        send_json_utf8("CREATED", final_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to create file: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
}

void handle_rename(const char* old_path_utf8, const char* new_path_utf8) {
    wchar_t wold[MAX_PATH], wnew[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, old_path_utf8, -1, wold, MAX_PATH);
    MultiByteToWideChar(CP_UTF8, 0, new_path_utf8, -1, wnew, MAX_PATH);
    if (MoveFileW(wold, wnew)) {
        send_json_utf8("RENAMED", new_path_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to rename: %lu", GetLastError());
        send_json_utf8("ERROR", msg);
    }
}

void get_directory_info(const wchar_t* path, long long* total_size, int* file_count, int* dir_count) {
    wchar_t search_path[MAX_PATH];
    _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", path);
    
    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(search_path, &fd);
    if (hFind == INVALID_HANDLE_VALUE) return;
    
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            (*dir_count)++;
            wchar_t sub_path[MAX_PATH];
            _snwprintf(sub_path, MAX_PATH - 1, L"%s\\%s", path, fd.cFileName);
            get_directory_info(sub_path, total_size, file_count, dir_count);
        } else {
            (*file_count)++;
            ULARGE_INTEGER ull;
            ull.LowPart = fd.nFileSizeLow;
            ull.HighPart = fd.nFileSizeHigh;
            *total_size += ull.QuadPart;
        }
    } while (FindNextFileW(hFind, &fd));
    
    FindClose(hFind);
}

static long long filetime_to_ms(FILETIME ft) {
    ULARGE_INTEGER ull;
    ull.LowPart = ft.dwLowDateTime;
    ull.HighPart = ft.dwHighDateTime;
    return (long long)((ull.QuadPart - 116444736000000000ULL) / 10000ULL);
}

void handle_prop(const char* path_utf8) {
    wchar_t wpath[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);
    
    WIN32_FILE_ATTRIBUTE_DATA attr;
    if (!GetFileAttributesExW(wpath, GetFileExInfoStandard, &attr)) {
        send_json_utf8("ERROR", "Failed to get file attributes");
        return;
    }
    
    long long size = 0;
    int file_count = 0;
    int dir_count = 0;
    int is_dir = (attr.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY);
    
    if (is_dir) {
        get_directory_info(wpath, &size, &file_count, &dir_count);
    } else {
        ULARGE_INTEGER ull;
        ull.LowPart = attr.nFileSizeLow;
        ull.HighPart = attr.nFileSizeHigh;
        size = ull.QuadPart;
    }
    
    long long created = filetime_to_ms(attr.ftCreationTime);
    long long modified = filetime_to_ms(attr.ftLastWriteTime);
    long long accessed = filetime_to_ms(attr.ftLastAccessTime);
    
    char result[2048];
    _snprintf(result, sizeof(result)-1, "%s|%lld|%lld|%lld|%lld|%lu|%d|%d",
        path_utf8, size, created, modified, accessed, attr.dwFileAttributes,
        file_count, dir_count);
        
    send_json_utf8("PROP_DATA", result);
}

void handle_prop_native(const char* path_utf8) {
    wchar_t wpath[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);
    
    SHELLEXECUTEINFOW sei = {0};
    sei.cbSize = sizeof(sei);
    sei.fMask = SEE_MASK_INVOKEIDLIST;
    sei.lpVerb = L"properties";
    sei.lpFile = wpath;
    sei.nShow = SW_SHOW;
    
    if (!ShellExecuteExW(&sei)) {
        char err[256];
        _snprintf(err, sizeof(err)-1, "ShellExecuteEx failed: %lu", GetLastError());
        send_json_utf8("ERROR", err);
    } else {
        send_json_utf8("LOG", "Native properties dialog opened");
    }
}

void handle_delete(const char* path_utf8, int permanent) {
    wchar_t wpath[MAX_PATH + 2];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);
    wpath[wcslen(wpath) + 1] = L'\0';

    SHFILEOPSTRUCTW op = {0};
    op.wFunc = FO_DELETE;
    op.pFrom = wpath;
    // FOF_NOCONFIRMATION: ゴミ箱への移動確認を出さない
    // FOF_WANTNUKEWARNING: ゴミ箱に入らず完全削除になる場合のみ警告を出す
#ifndef FOF_WANTNUKEWARNING
#define FOF_WANTNUKEWARNING 0x4000
#endif
    if (permanent) {
        op.fFlags = FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT;
    } else {
        op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_WANTNUKEWARNING | FOF_NOERRORUI | FOF_SILENT;
    }

    int result = SHFileOperationW(&op);
    if (result == 0 && !op.fAnyOperationsAborted) {
        send_json_utf8("DELETED", path_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to delete: %d", result);
        send_json_utf8("ERROR", msg);
    }
}

void handle_copy(const char* src_utf8, const char* dst_utf8) {
    wchar_t wsrc[MAX_PATH + 2], wdst[MAX_PATH + 2];
    MultiByteToWideChar(CP_UTF8, 0, src_utf8, -1, wsrc, MAX_PATH);
    wsrc[wcslen(wsrc) + 1] = L'\0';
    MultiByteToWideChar(CP_UTF8, 0, dst_utf8, -1, wdst, MAX_PATH);
    wdst[wcslen(wdst) + 1] = L'\0';

    SHFILEOPSTRUCTW op = {0};
    op.wFunc = FO_COPY;
    op.pFrom = wsrc;
    op.pTo = wdst;
    op.fFlags = FOF_NOERRORUI | FOF_SILENT;

    int result = SHFileOperationW(&op);
    if (result == 0 && !op.fAnyOperationsAborted) {
        send_json_utf8("COPIED", dst_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to copy: %d", result);
        send_json_utf8("ERROR", msg);
    }
}

void handle_move(const char* src_utf8, const char* dst_utf8) {
    wchar_t wsrc[MAX_PATH + 2], wdst[MAX_PATH + 2];
    MultiByteToWideChar(CP_UTF8, 0, src_utf8, -1, wsrc, MAX_PATH);
    wsrc[wcslen(wsrc) + 1] = L'\0';
    MultiByteToWideChar(CP_UTF8, 0, dst_utf8, -1, wdst, MAX_PATH);
    wdst[wcslen(wdst) + 1] = L'\0';

    SHFILEOPSTRUCTW op = {0};
    op.wFunc = FO_MOVE;
    op.pFrom = wsrc;
    op.pTo = wdst;
    op.fFlags = FOF_NOERRORUI | FOF_SILENT;

    int result = SHFileOperationW(&op);
    if (result == 0 && !op.fAnyOperationsAborted) {
        send_json_utf8("MOVED", dst_utf8);
    } else {
        char msg[256];
        _snprintf(msg, sizeof(msg), "Failed to move: %d", result);
        send_json_utf8("ERROR", msg);
    }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
int main(void) {
    char line[4096];
    InitializeCriticalSection(&g_stdout_cs);
    setvbuf(stdout, NULL, _IONBF, 0);

    if (!cmd_proc_start(on_cmd_output)) {
        send_json_utf8("ERROR", "Failed to start cmd.exe");
        return 1;
    }

    char initial_path_a[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, initial_path_a);
    char initial_path_utf8[MAX_PATH * 4];
    cp932_to_utf8(initial_path_a, initial_path_utf8, sizeof(initial_path_utf8));
    
    strncpy(currentPath, initial_path_utf8, MAX_PATH - 1);
    if (currentPath[strlen(currentPath)-1] != '\\') {
        strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);
    }
    
    send_json_utf8("READY", initial_path_utf8);
    handle_list(initial_path_utf8);

    while (fgets(line, sizeof(line), stdin)) {
        line[strcspn(line, "\r\n")] = 0;
        if (strncmp(line, "LIST|", 5) == 0) handle_list(line + 5);
        else if (strncmp(line, "SORT|", 5) == 0) {
            char *k = line + 5;
            char *o = strchr(k, '|');
            if (o) {
                *o = '\0';
                g_sort_key = (SortKey)atoi(k);
                g_sort_order = (SortOrder)atoi(o + 1);
                handle_list(currentPath);
            }
        }
        else if (strncmp(line, "TREE_LIST|", 10) == 0) handle_tree_list(line + 10);
        else if (strncmp(line, "SEARCH|", 7) == 0) handle_search(currentPath, line + 7);
        else if (strncmp(line, "MKDIR|", 6) == 0) handle_mkdir(line + 6);
        else if (strncmp(line, "NEW_FILE|", 9) == 0) handle_new_file(line + 9);
        else if (strncmp(line, "RENAME|", 7) == 0) {
            char *old_p = line + 7;
            char *new_p = strchr(old_p, '|');
            if (new_p) { *new_p = '\0'; handle_rename(old_p, new_p + 1); }
        }
        else if (strncmp(line, "DELETE_FORCE|", 13) == 0) handle_delete(line + 13, 1);
        else if (strncmp(line, "DELETE|", 7) == 0) handle_delete(line + 7, 0);
        else if (strncmp(line, "COPY|", 5) == 0) {
            char *src = line + 5;
            char *dst = strchr(src, '|');
            if (dst) { *dst = '\0'; handle_copy(src, dst + 1); }
        }
        else if (strncmp(line, "MOVE|", 5) == 0) {
            char *src = line + 5;
            char *dst = strchr(src, '|');
            if (dst) { *dst = '\0'; handle_move(src, dst + 1); }
        }
        else if (strncmp(line, "EXEC|", 5) == 0) {
            char cmd_cp932[4096];
            utf8_to_cp932(line + 5, cmd_cp932, sizeof(cmd_cp932));
            
            char combined[8192];
            _snprintf(combined, sizeof(combined) - 1, "%s & @echo __CWD__:%%cd%%", cmd_cp932);
            combined[sizeof(combined) - 1] = '\0';
            cmd_proc_send(combined);
        }
        else if (strncmp(line, "CD|", 3) == 0) {
            char path_cp932[MAX_PATH];
            utf8_to_cp932(line + 3, path_cp932, sizeof(path_cp932));
            cmd_proc_cd(path_cp932);
            handle_list(line + 3);
        }
        else if (strncmp(line, "OPEN|", 5) == 0) {
            wchar_t wpath[MAX_PATH];
            MultiByteToWideChar(CP_UTF8, 0, line + 5, -1, wpath, MAX_PATH);
            ShellExecuteW(NULL, L"open", wpath, NULL, NULL, SW_SHOWNORMAL);
        }
        else if (strncmp(line, "ELEVATE|", 8) == 0) {
            handle_elevate(line + 8);
        }
        else if (strncmp(line, "PROP_NATIVE|", 12) == 0) {
            handle_prop_native(line + 12);
        }
        else if (strncmp(line, "PROP|", 5) == 0) {
            handle_prop(line + 5);
        }
        else if (strcmp(line, "GET_DRIVES") == 0) handle_get_drives();
        else if (strcmp(line, "QUIT") == 0) break;
    }

    cmd_proc_stop();
    DeleteCriticalSection(&g_stdout_cs);
    return 0;
}
