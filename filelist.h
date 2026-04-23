#ifndef FILELIST_H
#define FILELIST_H

#include <windows.h>

// --- ファイル情報 ---
typedef struct
{
    char name[MAX_PATH];
    char extension[16]; // 拡張子（種類ソート用）
    DWORD attributes;
    LONGLONG size;
    FILETIME created_at; // 作成日時
    FILETIME updated_at; // 更新日時
} FileEntry;

// --- ls の結果リスト ---
typedef struct
{
    FileEntry *entries; // 動的配列
    int count;          // 有効件数
    int capacity;       // 確保済み件数
} FileList;

FileList filelist_create(void);
int filelist_fetch(FileList *list, const char *path);
void filelist_free(FileList *list);

#endif // FILELIST_H
