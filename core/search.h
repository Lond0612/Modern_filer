#ifndef SEARCH_H
#define SEARCH_H

// ---------------------------------------------------------------------------
// search.h
// 役割: 再帰的なファイル検索 および 画像ファイルの再帰収集を行う専用モジュール
//       ・filelist_search  : 一覧から条件に合うエントリを抽出する（フィルタ）
//       ・handle_search    : 指定フォルダを再帰走査してキーワード検索を行う
//       ・search_scan_images: 指定フォルダを再帰走査して画像ファイルを収集する
// ---------------------------------------------------------------------------

#include "fs_orbit.h"

// ---------------------------------------------------------------------------
// 検索クエリ定義
// ---------------------------------------------------------------------------

typedef enum
{
    SEARCH_MATCH_PARTIAL, // 部分一致
    SEARCH_MATCH_PREFIX,  // 前方一致
    SEARCH_MATCH_SUFFIX,  // 後方一致（拡張子検索に便利）
    SEARCH_MATCH_EXACT,   // 完全一致
} SearchMatchType;

typedef struct
{
    wchar_t keyword[MAX_PATH]; // 検索キーワード
    SearchMatchType match_type;// 一致条件
    int include_dirs;          // ディレクトリを含むか（1:含む 0:除外）
    int case_sensitive;        // 大文字小文字を区別するか（1:区別 0:無視）
} SearchQuery;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// 検索クエリを生成する
SearchQuery searchquery_create(const wchar_t *keyword, SearchMatchType match_type,
                               int include_dirs, int case_sensitive);

// 取得済みの FileList から条件に合うエントリだけを抽出して新しい FileList を返す
FileList filelist_search(FileList *list, const SearchQuery *query);

// 指定フォルダを出発点に BFS で再帰走査し、キーワードにヒットしたファイルを
// send_json_utf8() で随時送信する（SEARCH_DATA / END_SEARCH）
// ※ server.c の send_json_utf8 を通じてフロントエンドへ配信する
// skip_name_utf8: 検索対象から除外するフォルダ名（NULL可）
void search_recursive(const char *root_utf8, const char *keyword_utf8,
                      const char *skip_name_utf8, int *result_count,
                      void (*send_fn)(const char *, const char *));

// 指定フォルダを出発点に再帰走査し、画像ファイルのパスを収集して
// send_fn コールバックで随時送信する（SCAN_IMAGE_DATA / SCAN_IMAGE_END）
void search_scan_images(const char *root_utf8,
                        void (*send_fn)(const char *, const char *));

#endif // SEARCH_H