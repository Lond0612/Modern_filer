#include <stdio.h>
#include <string.h>
#include <windows.h>
#include <stdarg.h>
#include "core/filelist.h"
#include "core/sort.h"
#include "proc/cmd_proc.h"

// ---------------------------------------------------------------------------
// グローバル定義
// ---------------------------------------------------------------------------
CRITICAL_SECTION g_stdout_cs;

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
            send_json("SYNC_PATH", path);
            
            // 確実にコマンド完了後の状態を拾うため、ごくわずかだけ待機
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
