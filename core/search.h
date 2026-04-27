#ifndef SEARCH_H
#define SEARCH_H

#include "filelist.h"

// --- 検索条件 ---
typedef enum
{
    SEARCH_MATCH_PARTIAL, // 部分一致
    SEARCH_MATCH_PREFIX,  // 前方一致
    SEARCH_MATCH_SUFFIX,  // 後方一致（拡張子検索に便利）
    SEARCH_MATCH_EXACT,   // 完全一致
} SearchMatchType;

typedef struct
{
    char keyword[MAX_PATH];     // 検索キーワード
    SearchMatchType match_type; // 一致条件
    int include_dirs;           // ディレクトリを含むか（1:含む 0:除外）
    int case_sensitive;         // 大文字小文字を区別するか（1:区別 0:無視）
} SearchQuery;

SearchQuery searchquery_create(const char *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive);
FileList filelist_search(FileList *list, const SearchQuery *query);

#endif // SEARCH_H