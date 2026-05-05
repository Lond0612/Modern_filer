#include <string.h>
#include <stdlib.h>
#include "sort.h"

// --- qsort コールバック用のスレッドローカルコンテキスト ---
// （同一スレッド内での使用を前提とする）
static _Thread_local SortContext s_ctx;

static int compare_filetime(const FILETIME *a, const FILETIME *b)
{
    if (a->dwHighDateTime != b->dwHighDateTime)
        return (a->dwHighDateTime > b->dwHighDateTime) ? 1 : -1;
    if (a->dwLowDateTime != b->dwLowDateTime)
        return (a->dwLowDateTime > b->dwLowDateTime) ? 1 : -1;
    return 0;
}

static int file_entry_compare(const void *a, const void *b)
{
    const FileEntry *ea = (const FileEntry *)a;
    const FileEntry *eb = (const FileEntry *)b;
    int result = 0;

    // --- 1. ディレクトリを優先して上に表示するロジック ---
    int a_is_dir = (ea->attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
    int b_is_dir = (eb->attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

    if (a_is_dir && !b_is_dir) return -1; // aがディレクトリなら上へ
    if (!a_is_dir && b_is_dir) return 1;  // bがディレクトリなら下へ

    // --- 2. 同じカテゴリ（両方フォルダ or 両方ファイル）内でのソート ---
    switch (s_ctx.key)
    {
    case SORT_NAME:
        result = _wcsicmp(ea->name, eb->name);
        break;
    case SORT_CREATED_AT:
        result = compare_filetime(&ea->created_at, &eb->created_at);
        break;
    case SORT_UPDATED_AT:
        result = compare_filetime(&ea->updated_at, &eb->updated_at);
        break;
    case SORT_EXTENSION:
        result = _wcsicmp(ea->extension, eb->extension);
        if (result == 0)
            result = _wcsicmp(ea->name, eb->name);
        break;
    case SORT_SIZE:
        if (ea->size != eb->size)
            result = (ea->size > eb->size) ? 1 : -1;
        break;
    }

    return (s_ctx.order == SORT_ASC) ? result : -result;
}

// --- ソート実行 ---
void filelist_sort(FileList *list, SortContext ctx)
{
    s_ctx = ctx;
    qsort(list->entries, list->count, sizeof(FileEntry), file_entry_compare);
}