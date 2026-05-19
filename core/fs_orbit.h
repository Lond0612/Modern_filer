#ifndef FS_ORBIT_H
#define FS_ORBIT_H

// ---------------------------------------------------------------------------
// fs_orbit.h
// 役割: ファイルシステムの「一階層フラット走査」専用モジュールのインターフェース
//       ※ 再帰的な走査・深い検索は search.h/search.c が担当する
// ---------------------------------------------------------------------------

#include <windows.h>

// --- ファイル個別エントリー情報 ---
typedef struct
{
    wchar_t name[MAX_PATH];     // ファイル名（ワイド文字）
    wchar_t extension[16];      // 拡張子（ソート用 / 種別判定用）
    DWORD   attributes;         // Win32 ファイル属性フラグ
    LONGLONG size;              // ファイルサイズ（バイト）
    FILETIME created_at;        // 作成日時
    FILETIME updated_at;        // 最終更新日時
} FileEntry;

// --- ファイル一覧リストのコンテナ（動的配列） ---
typedef struct
{
    FileEntry *entries;         // 動的配列の先頭ポインタ
    int count;                  // 有効なエントリー件数
    int capacity;               // 現在確保済みの最大件数
} FileList;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// ライフサイクル: 初期化
FileList fs_orbit_create(void);

// ライフサイクル: メモリ解放
void fs_orbit_free(FileList *list);

// 走査: 指定パス直下の「一階層のみ」を高速スキャンして list に格納する
// 戻り値: 取得件数 / -1=エラー / -5=アクセス拒否
int fs_orbit_fetch(FileList *list, const char *path_utf8);

#endif // FS_ORBIT_H
