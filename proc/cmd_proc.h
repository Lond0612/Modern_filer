#ifndef CMD_PROC_H
#define CMD_PROC_H

#include <windows.h>

// ---------------------------------------------------------------------------
// cmd.exe プロセス管理
//
// cmd_proc_start() で cmd.exe を子プロセスとして起動し、
// stdin/stdout/stderr をパイプで接続する。
//
// 出力は内部スレッドが非同期で読み続け、登録したコールバックに渡す。
// GUI はコールバック内で PostMessage して安全にログペインへ追記する。
// ---------------------------------------------------------------------------

// 出力コールバック: cmd の stdout/stderr が届くたびに呼ばれる
// text は呼び出し側で free してはいけない（コールバック内でコピーすること）
typedef void (*CmdOutputCallback)(const char *text);

// cmd.exe を起動してパイプを接続する。成功で 1、失敗で 0 を返す。
int cmd_proc_start(CmdOutputCallback cb);
int cmd_proc_start_with_shell(CmdOutputCallback cb, const char *shell_type);

// cmd の stdin にテキストを送る（末尾に \r\n が自動付与される）
void cmd_proc_send(const char *line);

// プロセスを終了して全リソースを解放する
void cmd_proc_stop(void);

// プロセスが起動中かどうかを返す
int cmd_proc_is_alive(void);

// カレントディレクトリを GUI と cmd で同期する
void cmd_proc_cd(const char *path);
void cmd_proc_cd_with_shell(const char *path, const char *shell_type);

#endif // CMD_PROC_H
