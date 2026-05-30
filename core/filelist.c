#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "filelist.h"

// FileList構造体を初期化し、空のリストを生成する
FileList filelist_create(void)
{
    FileList list;
    list.count = 0;
    list.capacity = 64;
    list.entries = (FileEntry *)malloc(list.capacity * sizeof(FileEntry));
    return list;
}

// 指定パスのファイル一覧を取得してリストに格納する。戻り値は取得件数、またはエラーコード
int filelist_fetch(FileList *list, const char *path_utf8)
{
    wchar_t wpath[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);

    wchar_t search_path[MAX_PATH];
    _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", wpath);
    search_path[MAX_PATH - 1] = L'\0';

    WIN32_FIND_DATAW findData;
    HANDLE hFind = FindFirstFileW(search_path, &findData);
    if (hFind == INVALID_HANDLE_VALUE)
    {
        DWORD err = GetLastError();
        if (err == ERROR_ACCESS_DENIED) return -5;
        return -1;
    }

    list->count = 0;

    do
    {
        if (wcscmp(findData.cFileName, L".") == 0 || wcscmp(findData.cFileName, L"..") == 0)
            continue;

        if (list->count >= list->capacity)
        {
            int new_cap = list->capacity * 2;
            FileEntry *new_entries = (FileEntry *)realloc(list->entries, new_cap * sizeof(FileEntry));
            if (new_entries == NULL) break;
            list->entries   = new_entries;
            list->capacity  = new_cap;
        }

        FileEntry *e = &list->entries[list->count];

        wcsncpy(e->name, findData.cFileName, MAX_PATH - 1);
        e->name[MAX_PATH - 1] = L'\0';
        e->attributes = findData.dwFileAttributes;
        e->created_at = findData.ftCreationTime;
        e->updated_at = findData.ftLastWriteTime;

        const wchar_t *dot = wcsrchr(findData.cFileName, L'.');
        if (dot && !(findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY))
        {
            wcsncpy(e->extension, dot + 1, 15);
            e->extension[15] = L'\0';
        }
        else
        {
            e->extension[0] = L'\0';
        }

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
    } while (FindNextFileW(hFind, &findData));

    FindClose(hFind);
    return list->count;
}

// FileList構造体で使用しているメモリ領域を解放する
void filelist_free(FileList *list)
{
    free(list->entries);
    list->entries = NULL;
    list->count = 0;
    list->capacity = 0;
}
