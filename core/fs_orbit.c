// ---------------------------------------------------------------------------
// fs_orbit.c
// 役割: ファイルシステムの「一階層フラット走査」専用モジュールの実装
//       指定パス直下の一階層のみを FindFirstFileW/FindNextFileW で高速スキャンする
//       ※ 再帰的な走査・深い検索は search.c が担当する
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "fs_orbit.h"

// ---------------------------------------------------------------------------
// ライフサイクル管理
// ---------------------------------------------------------------------------

FileList fs_orbit_create(void)
{
    FileList list;
    list.count    = 0;
    list.capacity = 64;
    list.entries  = (FileEntry *)malloc(list.capacity * sizeof(FileEntry));
    return list;
}

void fs_orbit_free(FileList *list)
{
    free(list->entries);
    list->entries  = NULL;
    list->count    = 0;
    list->capacity = 0;
}

// ---------------------------------------------------------------------------
// 走査: 指定パス直下の一階層のみ
// ---------------------------------------------------------------------------

int fs_orbit_fetch(FileList *list, const char *path_utf8)
{
    // UTF-8 → ワイド文字に変換
    wchar_t wpath[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, path_utf8, -1, wpath, MAX_PATH);

    // ワイルドカードを追加してFindFirstFileW に渡せるパスを構築
    wchar_t search_path[MAX_PATH];
    _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", wpath);
    search_path[MAX_PATH - 1] = L'\0';

    WIN32_FIND_DATAW find_data;
    HANDLE h_find = FindFirstFileW(search_path, &find_data);
    if (h_find == INVALID_HANDLE_VALUE)
    {
        DWORD err = GetLastError();
        if (err == ERROR_ACCESS_DENIED) return -5; // アクセス拒否
        return -1;
    }

    list->count = 0;

    do
    {
        // カレントディレクトリ（.）と親ディレクトリ（..）はスキップ
        if (wcscmp(find_data.cFileName, L".") == 0 ||
            wcscmp(find_data.cFileName, L"..") == 0)
            continue;

        // 容量が不足している場合は動的配列を2倍に拡張
        if (list->count >= list->capacity)
        {
            int new_cap = list->capacity * 2;
            FileEntry *new_entries =
                (FileEntry *)realloc(list->entries, new_cap * sizeof(FileEntry));
            if (new_entries == NULL) break;
            list->entries  = new_entries;
            list->capacity = new_cap;
        }

        FileEntry *e = &list->entries[list->count];

        // ファイル名を格納
        wcsncpy(e->name, find_data.cFileName, MAX_PATH - 1);
        e->name[MAX_PATH - 1] = L'\0';

        // 属性・日時を格納
        e->attributes  = find_data.dwFileAttributes;
        e->created_at  = find_data.ftCreationTime;
        e->updated_at  = find_data.ftLastWriteTime;

        // 拡張子を抽出（ファイルのみ）
        const wchar_t *dot = wcsrchr(find_data.cFileName, L'.');
        if (dot && !(find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY))
        {
            wcsncpy(e->extension, dot + 1, 15);
            e->extension[15] = L'\0';
        }
        else
        {
            e->extension[0] = L'\0';
        }

        // サイズを格納（フォルダは 0）
        if (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            e->size = 0;
        }
        else
        {
            LARGE_INTEGER size;
            size.LowPart  = find_data.nFileSizeLow;
            size.HighPart = find_data.nFileSizeHigh;
            e->size = size.QuadPart;
        }

        list->count++;

    } while (FindNextFileW(h_find, &find_data));

    FindClose(h_find);
    return list->count;
}
