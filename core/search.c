#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "search.h"

#include <wchar.h>
#include <wctype.h>

// SearchQuery構造体を初期化し、検索条件を設定する
SearchQuery searchquery_create(const wchar_t *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive)
{
    SearchQuery q;
    wcsncpy(q.keyword, keyword, MAX_PATH - 1);
    q.keyword[MAX_PATH - 1] = L'\0';
    q.match_type = match_type;
    q.include_dirs = include_dirs;
    q.case_sensitive = case_sensitive;
    return q;
}

// ファイル名が検索クエリ（キーワードやマッチ方法）に一致するか判定する
static int match_keyword(const wchar_t *target, const SearchQuery *query)
{
    const wchar_t *kw = query->keyword;

    wchar_t t_lower[MAX_PATH], k_lower[MAX_PATH];
    if (!query->case_sensitive)
    {
        wcsncpy(t_lower, target, MAX_PATH - 1);
        t_lower[MAX_PATH - 1] = L'\0';
        wcsncpy(k_lower, kw, MAX_PATH - 1);
        k_lower[MAX_PATH - 1] = L'\0';
        for (wchar_t *p = t_lower; *p; p++)
            *p = towlower(*p);
        for (wchar_t *p = k_lower; *p; p++)
            *p = towlower(*p);
        target = t_lower;
        kw = k_lower;
    }

    size_t tlen = wcslen(target);
    size_t klen = wcslen(kw);

    switch (query->match_type)
    {
    case SEARCH_MATCH_PARTIAL:
        return wcsstr(target, kw) != NULL;
    case SEARCH_MATCH_PREFIX:
        return wcsncmp(target, kw, klen) == 0;
    case SEARCH_MATCH_SUFFIX:
        return tlen >= klen && wcscmp(target + tlen - klen, kw) == 0;
    case SEARCH_MATCH_EXACT:
        return wcscmp(target, kw) == 0;
    }
    return 0;
}

// ファイルリストから検索条件に合致する項目のみを抽出した新しいファイルリストを生成する
FileList filelist_search(FileList *list, const SearchQuery *query)
{
    FileList result = filelist_create();

    for (int i = 0; i < list->count; i++)
    {
        FileEntry *e = &list->entries[i];

        if (!query->include_dirs && (e->attributes & FILE_ATTRIBUTE_DIRECTORY))
            continue;

        if (!match_keyword(e->name, query))
            continue;

        if (result.count >= result.capacity)
        {
            result.capacity *= 2;
            result.entries = (FileEntry *)realloc(result.entries,
                                                  result.capacity * sizeof(FileEntry));
            if (result.entries == NULL)
            {
                printf("Memory allocation failed.\n");
                return result;
            }
        }

        result.entries[result.count++] = *e;
    }

    return result;
}