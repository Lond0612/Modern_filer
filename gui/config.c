#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "config.h"

FilerConfig g_config;

static void get_ini_path(char *out, size_t out_size)
{
    char exe_path[MAX_PATH];
    char *sep;

    GetModuleFileNameA(NULL, exe_path, MAX_PATH);

    sep = strrchr(exe_path, '\\');
    if (sep != NULL)
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

static COLORREF parse_color(const char *hex, COLORREF fallback)
{
    const char *p = hex;
    unsigned int r = 0;
    unsigned int g = 0;
    unsigned int b = 0;

    if (*p == '#')
        p++;

    if (strlen(p) >= 6 && sscanf(p, "%02x%02x%02x", &r, &g, &b) == 3)
        return RGB(r, g, b);

    return fallback;
}

static void color_to_hex(COLORREF c, char *out, size_t out_size)
{
    _snprintf(out, out_size - 1, "#%02X%02X%02X",
              GetRValue(c), GetGValue(c), GetBValue(c));
    out[out_size - 1] = '\0';
}

static void config_set_defaults(void)
{
    strncpy(g_config.font_name, "Segoe UI", sizeof(g_config.font_name) - 1);
    g_config.font_name[sizeof(g_config.font_name) - 1] = '\0';
    g_config.font_size = 9;

    g_config.color_bg = GetSysColor(COLOR_WINDOW);
    g_config.color_text = GetSysColor(COLOR_WINDOWTEXT);
    g_config.color_log_bg = GetSysColor(COLOR_WINDOW);
    g_config.color_log_text = GetSysColor(COLOR_WINDOWTEXT);
    g_config.color_tree_bg = GetSysColor(COLOR_WINDOW);
    g_config.color_sel_bg = GetSysColor(COLOR_HIGHLIGHT);
    g_config.color_sel_text = GetSysColor(COLOR_HIGHLIGHTTEXT);

    g_config.tree_width = 220;
    g_config.console_height = 180;
}

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

void config_load(void)
{
    char ini[MAX_PATH];

    config_set_defaults();
    get_ini_path(ini, sizeof(ini));

    if (GetFileAttributesA(ini) == INVALID_FILE_ATTRIBUTES)
    {
        config_save();
        return;
    }

    read_str(ini, "Font", "Name", g_config.font_name,
             sizeof(g_config.font_name), g_config.font_name);
    g_config.font_size = read_int(ini, "Font", "Size", g_config.font_size);

    g_config.color_bg = read_color(ini, "Color", "Background", g_config.color_bg);
    g_config.color_text = read_color(ini, "Color", "Text", g_config.color_text);
    g_config.color_log_bg = read_color(ini, "Color", "LogBackground", g_config.color_log_bg);
    g_config.color_log_text = read_color(ini, "Color", "LogText", g_config.color_log_text);
    g_config.color_tree_bg = read_color(ini, "Color", "TreeBackground", g_config.color_tree_bg);
    g_config.color_sel_bg = read_color(ini, "Color", "SelectionBg", g_config.color_sel_bg);
    g_config.color_sel_text = read_color(ini, "Color", "SelectionText", g_config.color_sel_text);

    g_config.tree_width = read_int(ini, "Layout", "TreeWidth", g_config.tree_width);
    g_config.console_height = read_int(ini, "Layout", "ConsoleHeight", g_config.console_height);
}

void config_save(void)
{
    char ini[MAX_PATH];
    char val[64];

    get_ini_path(ini, sizeof(ini));

    WritePrivateProfileStringA("Font", "Name", g_config.font_name, ini);
    _snprintf(val, sizeof(val) - 1, "%d", g_config.font_size);
    WritePrivateProfileStringA("Font", "Size", val, ini);

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

    _snprintf(val, sizeof(val) - 1, "%d", g_config.tree_width);
    WritePrivateProfileStringA("Layout", "TreeWidth", val, ini);
    _snprintf(val, sizeof(val) - 1, "%d", g_config.console_height);
    WritePrivateProfileStringA("Layout", "ConsoleHeight", val, ini);
}
