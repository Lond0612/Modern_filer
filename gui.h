#ifndef GUI_H
#define GUI_H

#include <windows.h>

// --- GUI の初期化とメッセージループ ---
// WinMain から呼び出す。ウィンドウを作成してメッセージループに入る。
// 戻り値は WinMain の戻り値としてそのまま返す。
int gui_run(HINSTANCE hInstance, int nCmdShow);

// --- コンソールペインへのログ出力 ---
// fs_ops / filelist 等から printf される出力を
// GUI のコンソールペインにも転送するために使う。
// gui_run を呼ぶ前は何もしない（安全）。
void gui_log(const char *text);

#endif // GUI_H
