#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "core/filelist.h"
#include "core/sort.h"
#include "proc/cmd_proc.h"

void handle_list(const char* path) {
    FileList list = filelist_create();
    int i;
    filelist_fetch(&list, path);
    filelist_sort(&list, (SortContext){SORT_NAME, SORT_ASC});
    
    printf("START_LIST\n");
    for (i = 0; i < list.count; i++) {
        FileEntry *e = &list.entries[i];
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY) {
            printf("D|%s|-\n", e->name);
        } else {
            printf("F|%s|%lld\n", e->name, (long long)e->size);
        }
    }
    printf("END_LIST\n");
    fflush(stdout);
    filelist_free(&list);
}

void handle_drives() {
    DWORD drives = GetLogicalDrives();
    int i;
    printf("START_DRIVES\n");
    for (i = 0; i < 26; i++) {
        if (drives & (1 << i)) {
            printf("%c:\\\n", 'A' + i);
        }
    }
    printf("END_DRIVES\n");
    fflush(stdout);
}

void on_cmd_output(const char* text) {
    printf("CMD_OUT|%s", text);
    fflush(stdout);
}

int main(void) {
    char line[1024];
    
    // Disable buffering for stdout to ensure immediate IPC delivery
    setvbuf(stdout, NULL, _IONBF, 0);

    if (!cmd_proc_start(on_cmd_output)) {
        printf("ERROR|Failed to start cmd.exe\n");
        return 1;
    }

    while (fgets(line, sizeof(line), stdin)) {
        line[strcspn(line, "\r\n")] = 0; // trim newline
        
        if (strncmp(line, "LIST|", 5) == 0) {
            handle_list(line + 5);
        } else if (strcmp(line, "DRIVES") == 0) {
            handle_drives();
        } else if (strncmp(line, "EXEC|", 5) == 0) {
            cmd_proc_send(line + 5);
        } else if (strcmp(line, "QUIT") == 0) {
            break;
        } else {
            printf("ERROR|Unknown command: %s\n", line);
            fflush(stdout);
        }
    }

    cmd_proc_stop();
    return 0;
}
