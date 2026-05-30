#ifndef FILELIST_H
#define FILELIST_H

#include <windows.h>

typedef struct
{
    wchar_t name[MAX_PATH];
    wchar_t extension[16];
    DWORD attributes;
    LONGLONG size;
    FILETIME created_at;
    FILETIME updated_at;
} FileEntry;

typedef struct
{
    FileEntry *entries;
    int count;
    int capacity;
} FileList;

// 空のファイルリストを生成する
FileList filelist_create(void);

// 指定パスのファイル一覧を取得して格納する
int filelist_fetch(FileList *list, const char *path);

// ファイルリストのメモリを解放する
void filelist_free(FileList *list);

#endif // FILELIST_H