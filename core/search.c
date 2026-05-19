// ---------------------------------------------------------------------------
// search.c
// 役割: 再帰的なファイル検索 および 画像ファイルの再帰収集を行う専用モジュールの実装
//       ・filelist_search  : 一覧から条件に合うエントリを抽出する（フィルタ）
//       ・search_recursive : BFS で再帰走査してキーワード検索を行う
//       ・search_scan_images: BFS で再帰走査して画像ファイルを収集する
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <wchar.h>
#include <wctype.h>
#include "search.h"

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

#define SEARCH_MAX_RESULTS 50
#define SEARCH_QUEUE_MAX   512
#define SPATH_MAX          1024

// 壁紙スキャン対象の画像拡張子リスト
static const wchar_t *IMAGE_EXTENSIONS[] = {
    L"jpg", L"jpeg", L"png", L"webp", L"bmp", L"gif", NULL
};

// ---------------------------------------------------------------------------
// SearchQuery の初期化
// ---------------------------------------------------------------------------

SearchQuery searchquery_create(const wchar_t *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive)
{
    SearchQuery q;
    wcsncpy(q.keyword, keyword, MAX_PATH - 1);
    q.keyword[MAX_PATH - 1] = L'\0';
    q.match_type   = match_type;
    q.include_dirs = include_dirs;
    q.case_sensitive = case_sensitive;
    return q;
}

// ---------------------------------------------------------------------------
// 内部ヘルパー：文字列一致判定
// ---------------------------------------------------------------------------

static int _match_keyword(const wchar_t *target, const SearchQuery *query)
{
    const wchar_t *kw = query->keyword;

    wchar_t t_lower[MAX_PATH], k_lower[MAX_PATH];
    if (!query->case_sensitive)
    {
        wcsncpy(t_lower, target, MAX_PATH - 1);
        t_lower[MAX_PATH - 1] = L'\0';
        wcsncpy(k_lower, kw, MAX_PATH - 1);
        k_lower[MAX_PATH - 1] = L'\0';
        for (wchar_t *p = t_lower; *p; p++) *p = towlower(*p);
        for (wchar_t *p = k_lower; *p; p++) *p = towlower(*p);
        target = t_lower;
        kw     = k_lower;
    }

    size_t tlen = wcslen(target);
    size_t klen = wcslen(kw);

    switch (query->match_type)
    {
    case SEARCH_MATCH_PARTIAL: return wcsstr(target, kw) != NULL;
    case SEARCH_MATCH_PREFIX:  return wcsncmp(target, kw, klen) == 0;
    case SEARCH_MATCH_SUFFIX:
        return tlen >= klen && wcscmp(target + tlen - klen, kw) == 0;
    case SEARCH_MATCH_EXACT:   return wcscmp(target, kw) == 0;
    }
    return 0;
}

// ---------------------------------------------------------------------------
// filelist_search: 既存 FileList からのフィルタ抽出
// ---------------------------------------------------------------------------

FileList filelist_search(FileList *list, const SearchQuery *query)
{
    FileList result = fs_orbit_create();

    for (int i = 0; i < list->count; i++)
    {
        FileEntry *e = &list->entries[i];

        if (!query->include_dirs && (e->attributes & FILE_ATTRIBUTE_DIRECTORY))
            continue;

        if (!_match_keyword(e->name, query))
            continue;

        if (result.count >= result.capacity)
        {
            result.capacity *= 2;
            result.entries = (FileEntry *)realloc(result.entries,
                                                  result.capacity * sizeof(FileEntry));
            if (result.entries == NULL)
                return result;
        }

        result.entries[result.count++] = *e;
    }

    return result;
}

// ---------------------------------------------------------------------------
// search_recursive: BFS再帰走査によるキーワード検索
// ---------------------------------------------------------------------------

void search_recursive(const char *root_utf8, const char *keyword_utf8,
                      const char *skip_name_utf8, int *result_count,
                      void (*send_fn)(const char *, const char *))
{
    char (*queue)[SPATH_MAX] = (char (*)[SPATH_MAX])malloc((size_t)SEARCH_QUEUE_MAX * SPATH_MAX);
    if (!queue) return;

    int head = 0, tail = 0;
    strncpy(queue[tail], root_utf8, SPATH_MAX - 1);
    queue[tail][SPATH_MAX - 1] = '\0';
    tail = (tail + 1) % SEARCH_QUEUE_MAX;

    // skip_name を ワイド文字に変換（スキップ名なしの場合は空）
    wchar_t skip_name_w[MAX_PATH] = {0};
    if (skip_name_utf8 && *skip_name_utf8)
        MultiByteToWideChar(CP_UTF8, 0, skip_name_utf8, -1, skip_name_w, MAX_PATH);

    // keyword を ワイド文字に変換
    wchar_t keyword_w[MAX_PATH];
    MultiByteToWideChar(CP_UTF8, 0, keyword_utf8, -1, keyword_w, MAX_PATH);

    // 大文字小文字を区別しない検索のためにキーワードを小文字化
    wchar_t kw_lower[MAX_PATH];
    wcsncpy(kw_lower, keyword_w, MAX_PATH - 1);
    kw_lower[MAX_PATH - 1] = L'\0';
    for (wchar_t *p = kw_lower; *p; p++) *p = towlower(*p);

    char last_searched_child[SPATH_MAX] = {0};

    while (head != tail && *result_count < SEARCH_MAX_RESULTS)
    {
        char current_root[SPATH_MAX];
        strncpy(current_root, queue[head], SPATH_MAX - 1);
        current_root[SPATH_MAX - 1] = '\0';
        head = (head + 1) % SEARCH_QUEUE_MAX;

        wchar_t wcurrent[MAX_PATH];
        MultiByteToWideChar(CP_UTF8, 0, current_root, -1, wcurrent, MAX_PATH);

        wchar_t search_path[MAX_PATH];
        _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", wcurrent);

        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileW(search_path, &fd);
        if (h == INVALID_HANDLE_VALUE) continue;

        do
        {
            if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0)
                continue;
            if (skip_name_w[0] && _wcsicmp(fd.cFileName, skip_name_w) == 0)
                continue;

            // ファイル名を小文字化して一致を確認
            wchar_t fname_lower[MAX_PATH];
            wcsncpy(fname_lower, fd.cFileName, MAX_PATH - 1);
            fname_lower[MAX_PATH - 1] = L'\0';
            for (wchar_t *p = fname_lower; *p; p++) *p = towlower(*p);

            if (wcsstr(fname_lower, kw_lower) != NULL && *result_count < SEARCH_MAX_RESULTS)
            {
                // マッチしたエントリのフルパスを UTF-8 で送信
                wchar_t full_path_w[MAX_PATH];
                _snwprintf(full_path_w, MAX_PATH - 1, L"%s\\%s", wcurrent, fd.cFileName);
                char full_path_utf8[MAX_PATH * 4];
                WideCharToMultiByte(CP_UTF8, 0, full_path_w, -1,
                                    full_path_utf8, sizeof(full_path_utf8), NULL, NULL);
                send_fn("SEARCH_DATA", full_path_utf8);
                (*result_count)++;
            }

            // サブフォルダはキューに積む
            if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
                !(fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT))
            {
                char sub_utf8[SPATH_MAX];
                wchar_t sub_w[MAX_PATH];
                _snwprintf(sub_w, MAX_PATH - 1, L"%s\\%s", wcurrent, fd.cFileName);
                WideCharToMultiByte(CP_UTF8, 0, sub_w, -1,
                                    sub_utf8, sizeof(sub_utf8), NULL, NULL);

                int next_tail = (tail + 1) % SEARCH_QUEUE_MAX;
                if (next_tail != head)
                {
                    strncpy(queue[tail], sub_utf8, SPATH_MAX - 1);
                    queue[tail][SPATH_MAX - 1] = '\0';
                    tail = next_tail;
                }
            }
        } while (FindNextFileW(h, &fd));

        FindClose(h);
    }

    free(queue);
    (void)last_searched_child; // 未使用変数警告を抑制
}

// ---------------------------------------------------------------------------
// search_scan_images: BFS再帰走査による画像ファイル収集
// ---------------------------------------------------------------------------

static int _is_image_extension(const wchar_t *ext)
{
    for (int i = 0; IMAGE_EXTENSIONS[i] != NULL; i++)
    {
        if (_wcsicmp(ext, IMAGE_EXTENSIONS[i]) == 0)
            return 1;
    }
    return 0;
}

void search_scan_images(const char *root_utf8,
                        void (*send_fn)(const char *, const char *))
{
    char (*queue)[SPATH_MAX] = (char (*)[SPATH_MAX])malloc((size_t)SEARCH_QUEUE_MAX * SPATH_MAX);
    if (!queue) return;

    int head = 0, tail = 0;
    strncpy(queue[tail], root_utf8, SPATH_MAX - 1);
    queue[tail][SPATH_MAX - 1] = '\0';
    tail = (tail + 1) % SEARCH_QUEUE_MAX;

    while (head != tail)
    {
        char current_root[SPATH_MAX];
        strncpy(current_root, queue[head], SPATH_MAX - 1);
        current_root[SPATH_MAX - 1] = '\0';
        head = (head + 1) % SEARCH_QUEUE_MAX;

        wchar_t wcurrent[MAX_PATH];
        MultiByteToWideChar(CP_UTF8, 0, current_root, -1, wcurrent, MAX_PATH);

        wchar_t search_path[MAX_PATH];
        _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", wcurrent);

        WIN32_FIND_DATAW fd;
        HANDLE h = FindFirstFileW(search_path, &fd);
        if (h == INVALID_HANDLE_VALUE) continue;

        do
        {
            if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0)
                continue;

            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
            {
                // シンボリックリンクは再帰しない（無限ループ防止）
                if (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) continue;

                char sub_utf8[SPATH_MAX];
                wchar_t sub_w[MAX_PATH];
                _snwprintf(sub_w, MAX_PATH - 1, L"%s\\%s", wcurrent, fd.cFileName);
                WideCharToMultiByte(CP_UTF8, 0, sub_w, -1,
                                    sub_utf8, sizeof(sub_utf8), NULL, NULL);

                int next_tail = (tail + 1) % SEARCH_QUEUE_MAX;
                if (next_tail != head)
                {
                    strncpy(queue[tail], sub_utf8, SPATH_MAX - 1);
                    queue[tail][SPATH_MAX - 1] = '\0';
                    tail = next_tail;
                }
            }
            else
            {
                // 拡張子を取得して画像かどうかを判定
                const wchar_t *dot = wcsrchr(fd.cFileName, L'.');
                if (!dot) continue;
                const wchar_t *ext = dot + 1;
                if (!_is_image_extension(ext)) continue;

                // 画像ファイルのフルパスを UTF-8 で送信
                wchar_t full_path_w[MAX_PATH];
                _snwprintf(full_path_w, MAX_PATH - 1, L"%s\\%s", wcurrent, fd.cFileName);
                char full_path_utf8[MAX_PATH * 4];
                WideCharToMultiByte(CP_UTF8, 0, full_path_w, -1,
                                    full_path_utf8, sizeof(full_path_utf8), NULL, NULL);
                send_fn("SCAN_IMAGE_DATA", full_path_utf8);
            }
        } while (FindNextFileW(h, &fd));

        FindClose(h);
    }

    send_fn("SCAN_IMAGE_END", root_utf8);
    free(queue);
}