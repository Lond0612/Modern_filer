#include <windows.h>
#include "gui/config.h"
#include "gui/gui.h"

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE _prev, LPSTR _cmdline, int nCmdShow)
{
    (void)_prev;
    (void)_cmdline;

    // 設定を読み込む（filer.iniがなければデフォルト値で生成）
    config_load();

    return gui_run(hInstance, nCmdShow);
}