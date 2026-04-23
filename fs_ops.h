#ifndef FS_OPS_H
#define FS_OPS_H

// --- ファイルシステム操作コマンド ---
// GUI・CUI 両方から呼び出し可能なファイル操作の実装層
// 操作結果は printf でコンソールに出力する

void cmd_cd(const char *arg);
void cmd_cat(const char *arg);
void cmd_touch(const char *arg);
void cmd_rm(const char *arg);
void cmd_cp(const char *src, const char *dst);
void cmd_mv(const char *src, const char *dst);
void cmd_open(const char *arg);

#endif // FS_OPS_H
