#ifndef SORT_H
#define SORT_H

#include "fs_orbit.h"

// --- ソートキー ---
typedef enum
{
    SORT_NAME,
    SORT_CREATED_AT,
    SORT_UPDATED_AT,
    SORT_EXTENSION,
    SORT_SIZE,
} SortKey;

// --- ソート順 ---
typedef enum
{
    SORT_ASC,
    SORT_DESC,
} SortOrder;

// ソート設定をまとめた構造体（グローバル変数を使わずに渡す）
typedef struct
{
    SortKey key;
    SortOrder order;
} SortContext;

void filelist_sort(FileList *list, SortContext ctx);

#endif // SORT_H