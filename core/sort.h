#ifndef SORT_H
#define SORT_H

#include "filelist.h"

typedef enum
{
    SORT_NAME,
    SORT_CREATED_AT,
    SORT_UPDATED_AT,
    SORT_EXTENSION,
    SORT_SIZE,
} SortKey;

typedef enum
{
    SORT_ASC,
    SORT_DESC,
} SortOrder;

typedef struct
{
    SortKey key;
    SortOrder order;
} SortContext;

// 与えられたリストを指定のコンテキスト（ソートキーと順序）に従って並べ替える
void filelist_sort(FileList *list, SortContext ctx);

#endif // SORT_H