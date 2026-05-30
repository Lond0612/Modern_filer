#ifndef CMD_PROC_H
#define CMD_PROC_H

#include <windows.h>

// 出力コールバック型定義。標準出力やエラー出力の受信時に呼び出される
typedef void (*CmdOutputCallback)(const char *text);

// バックエンドのcmd.exeプロセスを起動しパイプを接続する
int cmd_proc_start(CmdOutputCallback cb);

// cmd.exeの標準入力にコマンドテキストを送信する
void cmd_proc_send(const char *line);

// cmd.exeプロセスを終了しハンドル等を解放する
void cmd_proc_stop(void);

// プロセスが生存しているかを判定する
int cmd_proc_is_alive(void);

// カレントディレクトリの変更をcmd.exeに同期する
void cmd_proc_cd(const char *path);

#endif // CMD_PROC_H
