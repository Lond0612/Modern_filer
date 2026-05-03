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

// ---------------------------------------------------------------------------
// BFS（幅優先探索）による再帰検索：現在地から近い順に結果を返す
// ---------------------------------------------------------------------------
#define SEARCH_MAX_RESULTS 50
#define SEARCH_QUEUE_MAX   512    // 探索するディレクトリの上限
#define SPATH_MAX          1024   // フルパスの最大長（バッファ溢れ防止）

// 指定されたディレクトリ(root)内をBFS検索する。ただし skip_name という名前のサブディレクトリは探索しない。
static void handle_search_level(const char* root, const char* keyword, const char* skip_name, int* result_count) {
    char (*queue)[SPATH_MAX] = (char(*)[SPATH_MAX])malloc((size_t)SEARCH_QUEUE_MAX * SPATH_MAX);
    if (!queue) return;
    int head = 0, tail = 0;

    strncpy(queue[tail], root, SPATH_MAX - 1);
    queue[tail][SPATH_MAX - 1] = '\0';
    tail++;

    char kw_lower[MAX_PATH];
    strncpy(kw_lower, keyword, MAX_PATH - 1);
    kw_lower[MAX_PATH - 1] = '\0';
    for (char *p = kw_lower; *p; p++) *p = (char)tolower((unsigned char)*p);

    while (head < tail && *result_count < SEARCH_MAX_RESULTS) {
        char current[SPATH_MAX];
        strncpy(current, queue[head], SPATH_MAX - 1);
        current[SPATH_MAX - 1] = '\0';
        head++;

        FileList list = filelist_create();
        filelist_fetch(&list, current);

        for (int i = 0; i < list.count && *result_count < SEARCH_MAX_RESULTS; i++) {
            FileEntry *e = &list.entries[i];
            int is_dir = (e->attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

            // 上から来た場合、今まさに探索してきた元のディレクトリはスキップする
            if (head == 1 && skip_name && _stricmp(e->name, skip_name) == 0) continue;

            // 部分一致判定
            char name_lower[MAX_PATH];
            strncpy(name_lower, e->name, MAX_PATH - 1);
            name_lower[MAX_PATH - 1] = '\0';
            for (char *p = name_lower; *p; p++) *p = (char)tolower((unsigned char)*p);

            if (strstr(name_lower, kw_lower)) {
                char full_path[SPATH_MAX + MAX_PATH + 8];
                _snprintf(full_path, sizeof(full_path) - 1, "%s|%s|%s",
                    is_dir ? "D" : "F", e->name, current);
                full_path[sizeof(full_path) - 1] = '\0';
                send_json("SEARCH_RESULT", full_path);
                (*result_count)++;
            }

            if (is_dir && tail < SEARCH_QUEUE_MAX) {
                size_t cur_len = strlen(current);
                size_t name_len = strlen(e->name);
                if (cur_len + name_len + 2 < SPATH_MAX) {
                    _snprintf(queue[tail], SPATH_MAX - 1, "%s%s\\", current, e->name);
                    queue[tail][SPATH_MAX - 1] = '\0';
                    tail++;
                }
            }
        }
        filelist_free(&list);
    }

    free(queue);
}

void handle_search(const char* start_root, const char* keyword) {
    int result_count = 0;
    send_json("START_SEARCH", keyword);

    char current_search_root[SPATH_MAX];
    strncpy(current_search_root, start_root, SPATH_MAX - 1);
    current_search_root[SPATH_MAX - 1] = '\0';

    char last_searched_child[MAX_PATH] = "";

    // 1. 現在地から下を探し、その後親に登りながら枝を広げていく
    while (result_count < SEARCH_MAX_RESULTS) {
        handle_search_level(current_search_root, keyword, last_searched_child[0] ? last_searched_child : NULL, &result_count);

        if (result_count >= SEARCH_MAX_RESULTS) break;

        // 親ディレクトリへ移動
        char parent[SPATH_MAX];
        strncpy(parent, current_search_root, SPATH_MAX - 1);
        parent[SPATH_MAX - 1] = '\0';

        size_t len = strlen(parent);
        if (len <= 3) break; // C:\ などに到達
        
        // 末尾の \ を除去して親ディレクトリ名とパスを特定
        if (parent[len-1] == '\\') parent[len-1] = '\0';
        char* last_slash = strrchr(parent, '\\');
        if (!last_slash) break;

        // 自分がどのディレクトリから登ってきたかを記録（再検索防止）
        strncpy(last_searched_child, last_slash + 1, MAX_PATH - 1);
        
        // 親パスを確定（末尾に \ を付ける）
        last_slash[1] = '\0';
        strncpy(current_search_root, parent, SPATH_MAX - 1);
    }

    send_json("END_SEARCH", keyword);
}

// ---------------------------------------------------------------------------
// ターミナル出力ハンドラ
// ---------------------------------------------------------------------------
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
    
    // グローバルのカレントパスを初期化（検索で使用）
    strncpy(currentPath, initial_path, MAX_PATH - 1);
    if (currentPath[strlen(currentPath)-1] != '\\') {
        strncat(currentPath, "\\", MAX_PATH - strlen(currentPath) - 1);
    }
    
    send_json("READY", initial_path);
    handle_list(initial_path);

    while (fgets(line, sizeof(line), stdin)) {
        char cp932_line[4096];
        utf8_to_cp932(line, cp932_line, sizeof(cp932_line));
        cp932_line[strcspn(cp932_line, "\r\n")] = 0;

        if (strncmp(cp932_line, "LIST|", 5) == 0) {
            handle_list(cp932_line + 5);
        } else if (strncmp(cp932_line, "SEARCH|", 7) == 0) {
            // SEARCH|keyword → 現在パスからBFS検索
            if (currentPath[0] != '\0') {
                handle_search(currentPath, cp932_line + 7);
            }
        } else if (strncmp(cp932_line, "EXEC|", 5) == 0) {
            // 1. ユーザーのコマンドを送信
            cmd_proc_send(cp932_line + 5);
            // 2. 同期用の隠し命令を送信
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
