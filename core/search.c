#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "search.h"

// --- SearchQuery の初期化 ---
SearchQuery searchquery_create(const char *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive)
{
    SearchQuery q;
    strncpy(q.keyword, keyword, MAX_PATH - 1);
    q.keyword[MAX_PATH - 1] = '\0';
    q.match_type = match_type;
    q.include_dirs = include_dirs;
    q.case_sensitive = case_sensitive;
    return q;
}

// --- 文字列一致判定ヘルパー ---
static int match_keyword(const char *target, const SearchQuery *query)
{
    const char *kw = query->keyword;

    // case_insensitive の strstr は標準にないので自前で処理
    // target を小文字コピーして検索する
    char t_lower[MAX_PATH], k_lower[MAX_PATH];
    if (!query->case_sensitive)
    {
        strncpy(t_lower, target, MAX_PATH - 1);
        t_lower[MAX_PATH - 1] = '\0';
        strncpy(k_lower, kw, MAX_PATH - 1);
        k_lower[MAX_PATH - 1] = '\0';
        for (char *p = t_lower; *p; p++)
            *p = (char)tolower((unsigned char)*p);
        for (char *p = k_lower; *p; p++)
            *p = (char)tolower((unsigned char)*p);
        target = t_lower;
        kw = k_lower;
    }

    size_t tlen = strlen(target);
    size_t klen = strlen(kw);

    switch (query->match_type)
    {
    case SEARCH_MATCH_PARTIAL:
        return strstr(target, kw) != NULL;
    case SEARCH_MATCH_PREFIX:
        return strncmp(target, kw, klen) == 0;
    case SEARCH_MATCH_SUFFIX:
        return tlen >= klen && strcmp(target + tlen - klen, kw) == 0;
    case SEARCH_MATCH_EXACT:
        return strcmp(target, kw) == 0;
    }
    return 0;
}

// --- FileList から条件に合うエントリだけを抽出して新しい FileList として返す ---
FileList filelist_search(FileList *list, const SearchQuery *query)
{
    FileList result = filelist_create();

    for (int i = 0; i < list->count; i++)
    {
        FileEntry *e = &list->entries[i];

        // ディレクトリを除外する設定の場合はスキップ
        if (!query->include_dirs && (e->attributes & FILE_ATTRIBUTE_DIRECTORY))
            continue;

        if (!match_keyword(e->name, query))
            continue;

        // 容量が足りなければ拡張
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