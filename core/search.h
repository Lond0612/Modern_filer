#ifndef SEARCH_H
#define SEARCH_H

#include "filelist.h"

typedef enum
{
    SEARCH_MATCH_PARTIAL,
    SEARCH_MATCH_PREFIX,
    SEARCH_MATCH_SUFFIX,
    SEARCH_MATCH_EXACT,
} SearchMatchType;

typedef struct
{
    wchar_t keyword[MAX_PATH];
    SearchMatchType match_type;
    int include_dirs;
    int case_sensitive;
} SearchQuery;

// 検索条件を指定してSearchQuery構造体を生成する
SearchQuery searchquery_create(const wchar_t *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive);

// 与えられたリストからクエリ条件に合致するファイルを検索して返す
FileList filelist_search(FileList *list, const SearchQuery *query);

#endif // SEARCH_H