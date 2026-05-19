#ifndef WIN_API_H
#define WIN_API_H

// ---------------------------------------------------------------------------
// win_api.h
// 役割: Windows OS ネイティブAPI（Shell操作・ダイアログ・ドライブ情報）の
//       呼び出しを集約する専用モジュールのインターフェース
//       ※ ファイル走査・検索は fs_orbit.h / search.h が担当する
// ---------------------------------------------------------------------------

#include <windows.h>

// ---------------------------------------------------------------------------
// ドライブ情報
// ---------------------------------------------------------------------------

// 接続されている論理ドライブを「C:\0D:\0\0」形式のバッファに取得する
// 戻り値: 取得した文字列の長さ / 0=失敗
int win_api_fetch_drives(wchar_t *buffer, int buffer_size);

// ---------------------------------------------------------------------------
// ファイル・フォルダ属性情報
// ---------------------------------------------------------------------------

// ファイル/フォルダのサイズ・日時・属性を取得してパイプ区切り文字列で返す
// out_result: "path|size|created_ms|modified_ms|accessed_ms|attrs|file_count|dir_count"
// 戻り値: 1=成功 / 0=失敗
int win_api_get_properties(const char *path_utf8, char *out_result, int out_size);

// OS標準のプロパティダイアログシートを表示する（ShellExecuteExW）
// 戻り値: 1=成功 / 0=失敗
int win_api_show_properties(const char *path_utf8);

// ファイル/フォルダをデフォルトアプリで開く（ShellExecuteW）
// 戻り値: 1=成功 / 0=失敗
int win_api_open(const char *path_utf8);

// ---------------------------------------------------------------------------
// ファイル操作（Shell経由でゴミ箱・進捗バー・確認ダイアログに対応）
// ---------------------------------------------------------------------------

// 名前変更 / 移動
// 戻り値: 1=成功 / 0=失敗
int win_api_rename(const char *old_path_utf8, const char *new_path_utf8);

// 削除 (permanent=0 → ゴミ箱 / permanent=1 → 完全削除)
// 戻り値: 1=成功 / 0=失敗またはキャンセル
int win_api_delete(const char *path_utf8, int permanent);

// コピー
// 戻り値: 1=成功 / 0=失敗またはキャンセル
int win_api_copy(const char *src_utf8, const char *dst_utf8);

// 移動
// 戻り値: 1=成功 / 0=失敗またはキャンセル
int win_api_move(const char *src_utf8, const char *dst_utf8);

// ---------------------------------------------------------------------------
// 権限昇格
// ---------------------------------------------------------------------------

// UACプロンプト経由でフォルダへのアクセス権をカレントユーザーに付与する
// 戻り値: 0=正常終了 / -1=キャンセル / -2=失敗
int win_api_elevate(const char *path_utf8);

// ---------------------------------------------------------------------------
// ファイル・フォルダ生成
// ---------------------------------------------------------------------------

// 既存パスと重複しないユニークなパスを生成する（"name (2).ext" 形式）
void win_api_unique_path(const wchar_t *path, wchar_t *out);

// フォルダを作成する（重複時は連番を付与）
// out_final_utf8: 実際に作成されたパス（UTF-8）を書き込む
// 戻り値: 1=成功 / 0=失敗
int win_api_mkdir(const char *path_utf8, char *out_final_utf8, int out_size);

// 空ファイルを作成する（重複時は連番を付与）
// out_final_utf8: 実際に作成されたパス（UTF-8）を書き込む
// 戻り値: 1=成功 / 0=失敗
int win_api_new_file(const char *path_utf8, char *out_final_utf8, int out_size);

#endif // WIN_API_H
