#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "filelist.h"

// --- FileList の初期化 ---
FileList filelist_create(void)
{
    FileList list;
    list.count = 0;
    list.capacity = 64;
    list.entries = (FileEntry *)malloc(list.capacity * sizeof(FileEntry));
    return list;
}

// --- 指定パスのファイル一覧を取得して list に格納 ---
// 戻り値：成功した件数、失敗時 -1
int filelist_fetch(FileList *list, const char *path)
{
    char search_path[MAX_PATH];
    _snprintf(search_path, sizeof(search_path) - 1, "%s\\*", path);
    search_path[sizeof(search_path) - 1] = '\0';

    WIN32_FIND_DATA findData;
    HANDLE hFind = FindFirstFile(search_path, &findData);
    if (hFind == INVALID_HANDLE_VALUE)
    {
        printf("Failed to list directory: %s\n", path);
        return -1;
    }

    list->count = 0;

    do
    {
        if (strcmp(findData.cFileName, ".") == 0 || strcmp(findData.cFileName, "..") == 0)
            continue;

        // 容量が足りなければ2倍に拡張
        if (list->count >= list->capacity)
        {
            int new_cap = list->capacity * 2;
            FileEntry *new_entries = (FileEntry *)realloc(list->entries, new_cap * sizeof(FileEntry));
            if (new_entries == NULL) break; // メモリ不足時は途中終了
            list->entries   = new_entries;
            list->capacity  = new_cap;
        }

        FileEntry *e = &list->entries[list->count];

        strncpy(e->name, findData.cFileName, MAX_PATH - 1);
        e->name[MAX_PATH - 1] = '\0';
        e->attributes = findData.dwFileAttributes;
        e->created_at = findData.ftCreationTime;
        e->updated_at = findData.ftLastWriteTime;

        // 拡張子を抽出
        const char *dot = strrchr(findData.cFileName, '.');
        if (dot && !(findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY))
        {
            strncpy(e->extension, dot + 1, sizeof(e->extension) - 1);
            e->extension[sizeof(e->extension) - 1] = '\0';
        }
        else
        {
            e->extension[0] = '\0'; // ディレクトリや拡張子なしは空文字
        }

        // サイズはディレクトリの場合0とする
        if (findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            e->size = 0;
        }
        else
        {
            LARGE_INTEGER size;
            size.LowPart = findData.nFileSizeLow;
            size.HighPart = findData.nFileSizeHigh;
            e->size = size.QuadPart;
        }

        list->count++;
    } while (FindNextFile(hFind, &findData));

    FindClose(hFind);
    return list->count;
}

// --- FileList の解放 ---
void filelist_free(FileList *list)
{
    free(list->entries);
    list->entries = NULL;
    list->count = 0;
    list->capacity = 0;
}
