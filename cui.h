#ifndef CUI_H
#define CUI_H

// 入力の受付からコマンド振り分けまでを一括で行う
// 戻り値：1=継続, 0=終了
int process_user_input(void);

// CUI向けファイル一覧表示
void cmd_ls(const char *path);

// CUI向け絞り込み検索表示
void cmd_find(const char *path, const char *keyword);

#endif // CUI_H
