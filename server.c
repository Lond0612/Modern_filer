#include <stdio.h>
#include <string.h>
#include <windows.h>
#include <stdarg.h>
#include "core/filelist.h"
#include "core/sort.h"
#include "proc/cmd_proc.h"

CRITICAL_SECTION g_stdout_cs;
FILE* g_debug_log = NULL;

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

void cp932_to_utf8(const char* cp932, char* utf8, size_t utf8_size) {
    if (!cp932 || !utf8 || utf8_size == 0) return;
    wchar_t wbuf[16384];
    // Use MB_ERR_INVALID_CHARS to be strict, or 0 to be lenient
    int wlen = MultiByteToWideChar(932, 0, cp932, -1, wbuf, 16384);
    if (wlen > 0) {
        WideCharToMultiByte(CP_UTF8, 0, wbuf, -1, utf8, (int)utf8_size, NULL, NULL);
    } else {
        // Fallback: If conversion fails, copy as much as possible as ASCII/Raw
        strncpy(utf8, cp932, utf8_size - 1);
        utf8[utf8_size - 1] = '\0';
    }
}

// Buffer for cmd.exe output to handle partial reads
static char g_cmd_buffer[65536];
static size_t g_cmd_buffer_len = 0;

void debug_log(const char* format, ...) {
    if (!g_debug_log) return;
    va_list args;
    va_start(args, format);
    vfprintf(g_debug_log, format, args);
    va_end(args);
    fflush(g_debug_log);
}

void safe_print_output(const char* type, const char* data) {
    char utf8_data[32768]; // Large enough for long paths in UTF-8
    if (data) {
        cp932_to_utf8(data, utf8_data, sizeof(utf8_data));
    }

    EnterCriticalSection(&g_stdout_cs);
    if (data) {
        printf("%s|%s\n", type, utf8_data);
        debug_log("SENT: %s|%s\n", type, utf8_data);
    } else {
        printf("%s\n", type);
        debug_log("SENT: %s\n", type);
    }
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

void handle_list(const char* path) {
    FileList list = filelist_create();
    int i;
    filelist_fetch(&list, path);
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});
    
    // Sync background cmd directory
    cmd_proc_cd(path);

    EnterCriticalSection(&g_stdout_cs);
    printf("START_LIST\n");
    for (i = 0; i < list.count; i++) {
        FileEntry *e = &list.entries[i];
        char utf8_name[MAX_PATH * 3];
        cp932_to_utf8(e->name, utf8_name, sizeof(utf8_name));
        
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY) {
            printf("D|%s|-\n", utf8_name);
        } else {
            printf("F|%s|%lld\n", utf8_name, (long long)e->size);
        }
    }
    printf("END_LIST\n");
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
    
    filelist_free(&list);
}

void handle_move(const char* src, const char* dst) {
    if (MoveFileA(src, dst)) {
        safe_print_output("MOVE_OK", NULL);
    } else {
        char err[256];
        _snprintf(err, sizeof(err)-1, "Move failed: %lu", GetLastError());
        safe_print_output("ERROR", err);
    }
}

void handle_open(const char* path) {
    HINSTANCE res = ShellExecuteA(NULL, "open", path, NULL, NULL, SW_SHOWNORMAL);
    if ((INT_PTR)res <= 32) {
        char err[256];
        _snprintf(err, sizeof(err)-1, "Open failed: %p", res);
        safe_print_output("ERROR", err);
    } else {
        safe_print_output("OPEN_OK", NULL);
    }
}

void handle_delete(const char* path) {
    SHFILEOPSTRUCTA fileOp = {0};
    fileOp.wFunc = FO_DELETE;
    fileOp.pFrom = path;
    fileOp.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION;
    
    // pFrom must be double-null terminated
    char path_buf[MAX_PATH + 2];
    strncpy(path_buf, path, MAX_PATH);
    path_buf[strlen(path)] = '\0';
    path_buf[strlen(path) + 1] = '\0';
    fileOp.pFrom = path_buf;

    if (SHFileOperationA(&fileOp) == 0) {
        safe_print_output("DELETE_OK", NULL);
    } else {
        safe_print_output("ERROR", "Delete failed");
    }
}

void handle_drives() {
    DWORD drives = GetLogicalDrives();
    int i;
    EnterCriticalSection(&g_stdout_cs);
    printf("START_DRIVES\n");
    for (i = 0; i < 26; i++) {
        if (drives & (1 << i)) {
            char drive[16];
            char utf8_drive[64];
            _snprintf(drive, sizeof(drive)-1, "%c:\\", 'A' + i);
            cp932_to_utf8(drive, utf8_drive, sizeof(utf8_drive));
            printf("%s\n", utf8_drive);
        }
    }
    printf("END_DRIVES\n");
    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

void on_cmd_output(const char* text) {
    debug_log("CMD_RAW_CHUNK: %s", text);
    
    EnterCriticalSection(&g_stdout_cs); // Hold CS for the entire processing

    // Append to global buffer
    size_t text_len = strlen(text);
    if (g_cmd_buffer_len + text_len >= sizeof(g_cmd_buffer)) {
        g_cmd_buffer_len = 0; 
    }
    memcpy(g_cmd_buffer + g_cmd_buffer_len, text, text_len);
    g_cmd_buffer_len += text_len;
    g_cmd_buffer[g_cmd_buffer_len] = '\0';

    char* current = g_cmd_buffer;
    while (1) {
        char* marker = strstr(current, "__CWD__:");
        if (marker) {
            char* path_end = strpbrk(marker + 8, "\r\n");
            if (path_end) {
                // Print prefix before marker
                if (marker > current) {
                    char saved = *marker;
                    *marker = '\0';
                    // We don't use safe_print_output here to avoid nested CS
                    char utf8_prefix[32768];
                    cp932_to_utf8(current, utf8_prefix, sizeof(utf8_prefix));
                    printf("CMD_OUT|%s\n", utf8_prefix);
                    *marker = saved;
                }
                
                // Extract and print path
                char path[MAX_PATH];
                char utf8_path[MAX_PATH * 3];
                size_t path_len = path_end - (marker + 8);
                if (path_len < MAX_PATH) {
                    memcpy(path, marker + 8, path_len);
                    path[path_len] = '\0';
                    cp932_to_utf8(path, utf8_path, sizeof(utf8_path));
                    printf("SYNC_PATH|%s\n", utf8_path);
                }
                
                current = path_end;
                while (*current == '\r' || *current == '\n') current++;
                continue;
            } else {
                break;
            }
        } else {
            char* newline = strpbrk(current, "\r\n");
            if (newline) {
                char* next = newline;
                while (*next == '\r' || *next == '\n') next++;
                
                char saved = *next;
                *next = '\0';
                char utf8_line[32768];
                cp932_to_utf8(current, utf8_line, sizeof(utf8_line));
                printf("CMD_OUT|%s\n", utf8_line);
                *next = saved;
                
                current = next;
                continue;
            } else {
                size_t len = strlen(current);
                if (len > 8) {
                    size_t flush_len = len - 8;
                    char saved = current[flush_len];
                    current[flush_len] = '\0';
                    char utf8_chunk[32768];
                    cp932_to_utf8(current, utf8_chunk, sizeof(utf8_chunk));
                    printf("CMD_OUT|%s\n", utf8_chunk);
                    current[flush_len] = saved;
                    current += flush_len;
                }
                break;
            }
        }
    }

    // Shift remaining data
    size_t remaining = (g_cmd_buffer + g_cmd_buffer_len) - current;
    if (remaining > 0) {
        memmove(g_cmd_buffer, current, remaining);
    }
    g_cmd_buffer_len = remaining;
    g_cmd_buffer[g_cmd_buffer_len] = '\0';

    fflush(stdout);
    LeaveCriticalSection(&g_stdout_cs);
}

int main(void) {
    char line[4096]; // Increased for long UTF-8 paths
    
    g_debug_log = fopen("debug_server.log", "w");
    debug_log("Server started\n");

    InitializeCriticalSection(&g_stdout_cs);

    // Disable buffering for stdout to ensure immediate IPC delivery
    setvbuf(stdout, NULL, _IONBF, 0);

    if (!cmd_proc_start(on_cmd_output)) {
        safe_print_output("ERROR", "Failed to start cmd.exe");
        return 1;
    }

    // Send initial path to sync GUI (Wait a bit for Electron to be ready)
    Sleep(1000);
    char initial_path[MAX_PATH];
    GetCurrentDirectoryA(MAX_PATH, initial_path);
    safe_print_output("SYNC_PATH", initial_path);

    while (fgets(line, sizeof(line), stdin)) {
        debug_log("RECV_RAW: %s", line);
        
        char cp932_line[4096];
        utf8_to_cp932(line, cp932_line, sizeof(cp932_line));
        debug_log("RECV_CP932: %s", cp932_line);

        cp932_line[strcspn(cp932_line, "\r\n")] = 0; // trim newline
        
        if (strncmp(cp932_line, "LIST|", 5) == 0) {
            handle_list(cp932_line + 5);
        } else if (strcmp(cp932_line, "DRIVES") == 0) {
            handle_drives();
        } else if (strncmp(cp932_line, "EXEC|", 5) == 0) {
            char cmd[2048];
            _snprintf(cmd, sizeof(cmd)-1, "%s & echo __CWD__:%%cd%%", cp932_line + 5);
            cmd_proc_send(cmd);
        } else if (strncmp(cp932_line, "MOVE|", 5) == 0) {
            char* sep = strchr(cp932_line + 5, '|');
            if (sep) {
                *sep = '\0';
                handle_move(cp932_line + 5, sep + 1);
            }
        } else if (strncmp(cp932_line, "OPEN|", 5) == 0) {
            handle_open(cp932_line + 5);
        } else if (strncmp(cp932_line, "DELETE|", 7) == 0) {
            handle_delete(cp932_line + 7);
        } else if (strcmp(cp932_line, "QUIT") == 0) {
            break;
        } else {
            char err[1280];
            _snprintf(err, sizeof(err)-1, "Unknown command: %s", cp932_line);
            safe_print_output("ERROR", err);
        }
    }

    cmd_proc_stop();
    DeleteCriticalSection(&g_stdout_cs);
    return 0;
}
