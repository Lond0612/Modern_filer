#ifndef FS_OPS_H
#define FS_OPS_H

// --- ファイルシステム操作コマンド ---
// GUI・CUI 両方から呼び出し可能なファイル操作の実装層
//
// force: 上書き・削除確認をスキップするか（1=スキップ, 0=戻り値で確認を要求）
//   force=0 かつ確認が必要な場合、関数は FS_NEED_CONFIRM を返す

// --- 戻り値定数 ---
#define FS_OK 0
#define FS_ERROR -1
#define FS_NEED_CONFIRM 1

// --- 出力フック ---
// fs_ops 内の printf 出力を GUI にも転送するためのコールバック。
// NULL のときは printf のみ（デフォルト）。
// gui_run() の前に fs_ops_set_output_hook(gui_log) で登録する。
typedef void (*FsOutputHook)(const char *text);
void fs_ops_set_output_hook(FsOutputHook hook);

void cmd_cd(const char *arg);
void cmd_cat(const char *arg);
void cmd_touch(const char *arg);
int cmd_rm(const char *arg, int force);
int cmd_cp(const char *src, const char *dst, int force);
int cmd_mv(const char *src, const char *dst, int force);
void cmd_open(const char *arg);

#endif // FS_OPS_H