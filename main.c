#include <windows.h>
#include "gui.h"

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE _prev, LPSTR _cmdline, int nCmdShow)
{
    (void)_prev;
    (void)_cmdline;
    return gui_run(hInstance, nCmdShow);
}