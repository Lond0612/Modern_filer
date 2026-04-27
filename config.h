#ifndef CONFIG_H
#define CONFIG_H

#include <windows.h>

// ---------------------------------------------------------------------------
// アプリ設定
//
// filer.ini を実行ファイルと同じフォルダから読み込む。
// ファイルが存在しない場合はデフォルト値を使用し、
// config_save() でデフォルト値を書き出す。
// ---------------------------------------------------------------------------

typedef struct
{
    // [Font]
    char font_name[64];   // フォント名
    int  font_size;       // フォントサイズ（pt）

    // [Color] - COLORREF (0x00BBGGRR)
    COLORREF color_bg;          // ウィンドウ背景
    COLORREF color_text;        // 通常テキスト
    COLORREF color_log_bg;      // ログペイン背景
    COLORREF color_log_text;    // ログペインテキスト
    COLORREF color_tree_bg;     // ツリービュー背景
    COLORREF color_sel_bg;      // 選択背景
    COLORREF color_sel_text;    // 選択テキスト

    // [Layout]
    int tree_width;       // ツリーペインの初期幅
    int console_height;   // ログペインの高さ
} FilerConfig;

// グローバル設定インスタンス（gui.c / main.c から参照）
extern FilerConfig g_config;

// 実行ファイルと同じフォルダの filer.ini を読み込む。
// ファイルがなければデフォルト値で g_config を初期化し filer.ini を生成する。
void config_load(void);

// 現在の g_config を filer.ini に書き出す。
void config_save(void);

#endif // CONFIG_H
