#ifndef SORT_H
#define SORT_H

#include "filelist.h"

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

void filelist_sort(FileList *list, SortKey key, SortOrder order);

#endif // SORT_H
