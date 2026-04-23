#ifndef FS_OPS_H
#define FS_OPS_H

// --- ファイルシステム操作コマンド ---
// GUI・CUI 両方から呼び出し可能なファイル操作の実装層
// 操作結果は printf でコンソールに出力する
//
// force: 上書き・削除確認をスキップするか（1=スキップ, 0=戻り値で確認を要求）
//   force=0 かつ確認が必要な場合、関数は FS_NEED_CONFIRM を返す
//   呼び出し側はダイアログ等で確認を取り、force=1 で再度呼び出す

// --- 戻り値定数 ---
#define FS_OK 0           // 成功
#define FS_ERROR -1       // 失敗
#define FS_NEED_CONFIRM 1 // 呼び出し側に確認を求める（force=0 時のみ）

void cmd_cd(const char *arg);
void cmd_cat(const char *arg);
void cmd_touch(const char *arg);
int cmd_rm(const char *arg, int force);
int cmd_cp(const char *src, const char *dst, int force);
int cmd_mv(const char *src, const char *dst, int force);
void cmd_open(const char *arg);

#endif // FS_OPS_H