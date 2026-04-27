#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "config.h"

// ---------------------------------------------------------------------------
// グローバル設定インスタンス
// ---------------------------------------------------------------------------
FilerConfig g_config;

// ---------------------------------------------------------------------------
// INI ファイルのパスを取得（実行ファイルと同じフォルダ）
// ---------------------------------------------------------------------------
static void get_ini_path(char *out, size_t out_size)
{
    char exe_path[MAX_PATH];
    GetModuleFileNameA(NULL, exe_path, MAX_PATH);

    // 実行ファイルのディレクトリ部分を取得
    char *sep = strrchr(exe_path, '\\');
    if (sep)
    {
        *(sep + 1) = '\0';
        _snprintf(out, out_size - 1, "%sfiler.ini", exe_path);
    }
    else
    {
        _snprintf(out, out_size - 1, "filer.ini");
    }
    out[out_size - 1] = '\0';
}

// ---------------------------------------------------------------------------
// "#RRGGBB" 形式の文字列を COLORREF (0x00BBGGRR) に変換
// ---------------------------------------------------------------------------
static COLORREF parse_color(const char *hex, COLORREF fallback)
{
    // "#RRGGBB" または "RRGGBB" の両方を受け付ける
    const char *p = hex;
    if (*p == '#')
        p++;

    unsigned int r = 0, g = 0, b = 0;
    if (strlen(p) >= 6 && sscanf(p, "%02x%02x%02x", &r, &g, &b) == 3)
        return RGB(r, g, b);

    return fallback;
}

// ---------------------------------------------------------------------------
// COLORREF を "#RRGGBB" 形式に変換
// ---------------------------------------------------------------------------
static void color_to_hex(COLORREF c, char *out, size_t out_size)
{
    _snprintf(out, out_size - 1, "#%02X%02X%02X",
              GetRValue(c), GetGValue(c), GetBValue(c));
    out[out_size - 1] = '\0';
}

// ---------------------------------------------------------------------------
// デフォルト値を設定
// ---------------------------------------------------------------------------
static void config_set_defaults(void)
{
    strncpy(g_config.font_name, "MS Gothic", sizeof(g_config.font_name) - 1);
    g_config.font_name[sizeof(g_config.font_name) - 1] = '\0';
    g_config.font_size = 14;

    g_config.color_bg = RGB(0xFF, 0xFF, 0xFF);       // 白
    g_config.color_text = RGB(0x00, 0x00, 0x00);     // 黒
    g_config.color_log_bg = RGB(0x1E, 0x1E, 0x1E);   // ダークグレー
    g_config.color_log_text = RGB(0xD4, 0xD4, 0xD4); // ライトグレー
    g_config.color_tree_bg = RGB(0xF5, 0xF5, 0xF5);  // 薄グレー
    g_config.color_sel_bg = RGB(0x00, 0x78, 0xD7);   // Windowsブルー
    g_config.color_sel_text = RGB(0xFF, 0xFF, 0xFF); // 白

    g_config.tree_width = 200;
    g_config.console_height = 180;
}

// ---------------------------------------------------------------------------
// INI から1行読んで値を取得するヘルパー
// ---------------------------------------------------------------------------
static void read_str(const char *ini, const char *section,
                     const char *key, char *out, size_t out_size,
                     const char *fallback)
{
    GetPrivateProfileStringA(section, key, fallback, out, (DWORD)out_size, ini);
}

static int read_int(const char *ini, const char *section,
                    const char *key, int fallback)
{
    return (int)GetPrivateProfileIntA(section, key, fallback, ini);
}

static COLORREF read_color(const char *ini, const char *section,
                           const char *key, COLORREF fallback)
{
    char hex[16];
    char fallback_hex[16];
    color_to_hex(fallback, fallback_hex, sizeof(fallback_hex));
    GetPrivateProfileStringA(section, key, fallback_hex, hex, sizeof(hex), ini);
    return parse_color(hex, fallback);
}

// ---------------------------------------------------------------------------
// config_load
// ---------------------------------------------------------------------------
void config_load(void)
{
    config_set_defaults();

    char ini[MAX_PATH];
    get_ini_path(ini, sizeof(ini));

    // ファイルが存在しなければデフォルトを書き出して終了
    if (GetFileAttributesA(ini) == INVALID_FILE_ATTRIBUTES)
    {
        config_save();
        return;
    }

    // [Font]
    read_str(ini, "Font", "Name", g_config.font_name,
             sizeof(g_config.font_name), g_config.font_name);
    g_config.font_size = read_int(ini, "Font", "Size", g_config.font_size);

    // [Color]
    g_config.color_bg = read_color(ini, "Color", "Background", g_config.color_bg);
    g_config.color_text = read_color(ini, "Color", "Text", g_config.color_text);
    g_config.color_log_bg = read_color(ini, "Color", "LogBackground", g_config.color_log_bg);
    g_config.color_log_text = read_color(ini, "Color", "LogText", g_config.color_log_text);
    g_config.color_tree_bg = read_color(ini, "Color", "TreeBackground", g_config.color_tree_bg);
    g_config.color_sel_bg = read_color(ini, "Color", "SelectionBg", g_config.color_sel_bg);
    g_config.color_sel_text = read_color(ini, "Color", "SelectionText", g_config.color_sel_text);

    // [Layout]
    g_config.tree_width = read_int(ini, "Layout", "TreeWidth", g_config.tree_width);
    g_config.console_height = read_int(ini, "Layout", "ConsoleHeight", g_config.console_height);
}

// ---------------------------------------------------------------------------
// config_save
// ---------------------------------------------------------------------------
void config_save(void)
{
    char ini[MAX_PATH];
    get_ini_path(ini, sizeof(ini));

    char val[64];

    // [Font]
    WritePrivateProfileStringA("Font", "Name", g_config.font_name, ini);
    _snprintf(val, sizeof(val) - 1, "%d", g_config.font_size);
    WritePrivateProfileStringA("Font", "Size", val, ini);

// [Color]
#define WRITE_COLOR(section, key, color)   \
    color_to_hex(color, val, sizeof(val)); \
    WritePrivateProfileStringA(section, key, val, ini);

    WRITE_COLOR("Color", "Background", g_config.color_bg)
    WRITE_COLOR("Color", "Text", g_config.color_text)
    WRITE_COLOR("Color", "LogBackground", g_config.color_log_bg)
    WRITE_COLOR("Color", "LogText", g_config.color_log_text)
    WRITE_COLOR("Color", "TreeBackground", g_config.color_tree_bg)
    WRITE_COLOR("Color", "SelectionBg", g_config.color_sel_bg)
    WRITE_COLOR("Color", "SelectionText", g_config.color_sel_text)

#undef WRITE_COLOR

    // [Layout]
    _snprintf(val, sizeof(val) - 1, "%d", g_config.tree_width);
    WritePrivateProfileStringA("Layout", "TreeWidth", val, ini);
    _snprintf(val, sizeof(val) - 1, "%d", g_config.console_height);
    WritePrivateProfileStringA("Layout", "ConsoleHeight", val, ini);
}