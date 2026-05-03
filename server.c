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
static char currentPath[MAX_PATH] = {0}; // 検索で使う現在パス

// UTF-8への変換（Electron用）
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

// CP932への変換（cmd.exe用）
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

// JSONエスケープ（簡易版）
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

// 共通JSON送信関数（これが通信の生命線）
void send_json(const char* type, const char* content) {
    char utf8_content[32768];
    char escaped[65536];
    
    cp932_to_utf8(content ? content : "", utf8_content, sizeof(utf8_content));
    json_escape(utf8_content, escaped, sizeof(escaped));

    EnterCriticalSection(&g_stdout_cs);
    printf("{\"type\":\"%s\",\"content\":\"%s\"}\n", type, escaped);
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

// ---------------------------------------------------------------------------
// 各種ハンドラ
// ---------------------------------------------------------------------------
void handle_list(const char* path) {
    FileList list = filelist_create();
    filelist_fetch(&list, path);
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});
    
    send_json("START_LIST", path);
    for (int i = 0; i < list.count; i++) {
        FileEntry *e = &list.entries[i];
        char line[MAX_PATH + 64];
        _snprintf(line, sizeof(line)-1, "%s|%s|%lld", 
            (e->attributes & FILE_ATTRIBUTE_DIRECTORY) ? "D" : "F", 
            e->name, (long long)e->size);
        send_json("DATA", line);
    }
    send_json("END_LIST", path);
    filelist_free(&list);
}

// BFS（幅優先探索）による再帰検索：現在地から近い順に結果を返す
#define SEARCH_MAX_RESULTS 50
#define SEARCH_QUEUE_MAX   4096

void handle_search(const char* root, const char* keyword) {
    // BFSキュー（ディレクトリのパスを積む）
    char (*queue)[MAX_PATH] = malloc(SEARCH_QUEUE_MAX * MAX_PATH);
    if (!queue) return;
    int head = 0, tail = 0;

    strncpy(queue[tail++], root, MAX_PATH - 1);

    int result_count = 0;
    char kw_lower[MAX_PATH];
    strncpy(kw_lower, keyword, MAX_PATH - 1);
    kw_lower[MAX_PATH - 1] = '\0';
    for (char *p = kw_lower; *p; p++) *p = (char)tolower((unsigned char)*p);

    send_json("START_SEARCH", keyword);

    while (head < tail && result_count < SEARCH_MAX_RESULTS) {
        char current[MAX_PATH];
        strncpy(current, queue[head++], MAX_PATH - 1);

        FileList list = filelist_create();
        filelist_fetch(&list, current);

        for (int i = 0; i < list.count && result_count < SEARCH_MAX_RESULTS; i++) {
            FileEntry *e = &list.entries[i];
            int is_dir = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

            // ファイル名を小文字変換して部分一致
            char name_lower[MAX_PATH];
            strncpy(name_lower, e->name, MAX_PATH - 1);
            name_lower[MAX_PATH - 1] = '\0';
            for (char *p = name_lower; *p; p++) *p = (char)tolower((unsigned char)*p);

            if (strstr(name_lower, kw_lower)) {
                char full_path[MAX_PATH * 2];
                _snprintf(full_path, sizeof(full_path) - 1, "%s|%s|%s",
                    is_dir ? "D" : "F",
                    e->name,
                    current);
                send_json("SEARCH_RESULT", full_path);
                result_count++;
            }

            // サブディレクトリをキューに追加
            if (is_dir && tail < SEARCH_QUEUE_MAX) {
                char sub[MAX_PATH];
                _snprintf(sub, sizeof(sub) - 1, "%s%s\\", current, e->name);
                strncpy(queue[tail++], sub, MAX_PATH - 1);
            }
        }
        filelist_free(&list);
    }

    send_json("END_SEARCH", keyword);
    free(queue);
}

void on_cmd_output(const char* text) {
    char* marker = strstr(text, "__CWD__:");
    if (marker) {
        // 1. Prefix
        if (marker > text) {
            char* prefix = _strdup(text);
            prefix[marker - text] = '\0';
            send_json("CMD_OUT", prefix);
            free(prefix);
        }
        
        // 2. Path Sync & Auto-List
        char path[MAX_PATH];
        char* start = marker + 8;
        char* end = strpbrk(start, "\r\n");
        size_t len = end ? (size_t)(end - start) : strlen(start);
        if (len > 0 && len < MAX_PATH) {
            strncpy(path, start, len);
            path[len] = '\0';
            // グローバルのカレントパスを更新（検索に使用）
            strncpy(currentPath, path, MAX_PATH - 1);
            if (currentPath[strlen(currentPath)-1] != '\\') {
                strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);
            }
            send_json("SYNC_PATH", path);
            
            Sleep(100);
            handle_list(path);
        }
        
        // 3. Suffix
        if (end) {
            on_cmd_output(end + strspn(end, "\r\n"));
        }
    } else {
        if (strlen(text) > 0) {
            send_json("CMD_OUT", text);
        }
    }
}

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------
int main(void) {
    char line[4096];
    InitializeCriticalSection(&g_stdout_cs);
    setvbuf(stdout, NULL, _IONBF, 0);

    if (!cmd_proc_start(on_cmd_output)) {
        send_json("ERROR", "Failed to start cmd.exe");
        return 1;
    }

    // 初期化完了通知と最初のリスト送信
    char initial_path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, initial_path);
    send_json("READY", initial_path);
    handle_list(initial_path);

    while (fgets(line, sizeof(line), stdin)) {
        char cp932_line[4096];
        utf8_to_cp932(line, cp932_line, sizeof(cp932_line));
        cp932_line[strcspn(cp932_line, "\r\n")] = 0;

        if (strncmp(cp932_line, "LIST|", 5) == 0) {
            handle_list(cp932_line + 5);
        } else if (strncmp(cp932_line, "SEARCH|", 7) == 0) {
            // SEARCH|keyword  → 現在パスからBFS検索
            if (currentPath[0] != '\0') {
                handle_search(currentPath, cp932_line + 7);
            }
        } else if (strncmp(cp932_line, "EXEC|", 5) == 0) {
            cmd_proc_send(cp932_line + 5);
            cmd_proc_send("@echo __CWD__:%cd%");
        } else if (strncmp(cp932_line, "CD|", 3) == 0) {
            cmd_proc_cd(cp932_line + 3);
            handle_list(cp932_line + 3);
        } else if (strncmp(cp932_line, "OPEN|", 5) == 0) {
            ShellExecuteA(NULL, "open", cp932_line + 5, NULL, NULL, SW_SHOWNORMAL);
        } else if (strcmp(cp932_line, "QUIT") == 0) {
            break;
        }
    }

    cmd_proc_stop();
    DeleteCriticalSection(&g_stdout_cs);
    return 0;
}
