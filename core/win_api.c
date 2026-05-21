// ---------------------------------------------------------------------------
// win_api.c
// 役割: Windows OS ネイティブAPI（Shell操作・ダイアログ・ドライブ情報）の
//       呼び出しを集約する専用モジュールの実装
//       ※ ファイル走査・検索は fs_orbit.c / search.c が担当する
// ---------------------------------------------------------------------------

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include "win_api.h"
#include "fs_orbit.h"

// ---------------------------------------------------------------------------
// 内部ヘルパー：UTF-8 ↔ ワイド文字変換
// ---------------------------------------------------------------------------

static void utf8_to_wide(const char *utf8, wchar_t *out, int out_size)
{
    MultiByteToWideChar(CP_UTF8, 0, utf8, -1, out, out_size);
}

static void wide_to_utf8(const wchar_t *wide, char *out, int out_size)
{
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, out, out_size, NULL, NULL);
}

// ---------------------------------------------------------------------------
// ドライブ情報
// ---------------------------------------------------------------------------

int win_api_fetch_drives(wchar_t *buffer, int buffer_size)
{
    if (buffer == NULL || buffer_size <= 0) return 0;

    DWORD len = GetLogicalDriveStringsW(buffer_size - 1, buffer);
    if (len == 0) return 0;

    buffer[len] = L'\0';
    return (int)len;
}

// ---------------------------------------------------------------------------
// ファイル・フォルダ属性情報
// ---------------------------------------------------------------------------

// フォルダの総サイズ・ファイル数・サブフォルダ数を再帰的に算出する内部関数
static void _calc_dir_info(const wchar_t *path,
                           long long *total_size,
                           int *file_count,
                           int *dir_count)
{
    wchar_t search_path[MAX_PATH];
    _snwprintf(search_path, MAX_PATH - 1, L"%s\\*", path);

    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW(search_path, &fd);
    if (h == INVALID_HANDLE_VALUE) return;

    do
    {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0)
            continue;

        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            (*dir_count)++;
            wchar_t sub[MAX_PATH];
            _snwprintf(sub, MAX_PATH - 1, L"%s\\%s", path, fd.cFileName);
            _calc_dir_info(sub, total_size, file_count, dir_count);
        }
        else
        {
            (*file_count)++;
            ULARGE_INTEGER ull;
            ull.LowPart  = fd.nFileSizeLow;
            ull.HighPart = fd.nFileSizeHigh;
            *total_size += (long long)ull.QuadPart;
        }
    } while (FindNextFileW(h, &fd));

    FindClose(h);
}

// FILETIME を Unix ミリ秒タイムスタンプに変換する内部関数
static long long _filetime_to_ms(FILETIME ft)
{
    ULARGE_INTEGER ull;
    ull.LowPart  = ft.dwLowDateTime;
    ull.HighPart = ft.dwHighDateTime;
    return (long long)((ull.QuadPart - 116444736000000000ULL) / 10000ULL);
}

int win_api_get_properties(const char *path_utf8, char *out_result, int out_size)
{
    wchar_t wpath[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);

    WIN32_FILE_ATTRIBUTE_DATA attr;
    if (!GetFileAttributesExW(wpath, GetFileExInfoStandard, &attr)) return 0;

    long long size       = 0;
    int       file_count = 0;
    int       dir_count  = 0;
    int       is_dir     = (attr.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY);

    if (is_dir)
    {
        _calc_dir_info(wpath, &size, &file_count, &dir_count);
    }
    else
    {
        ULARGE_INTEGER ull;
        ull.LowPart  = attr.nFileSizeLow;
        ull.HighPart = attr.nFileSizeHigh;
        size = (long long)ull.QuadPart;
    }

    long long created  = _filetime_to_ms(attr.ftCreationTime);
    long long modified = _filetime_to_ms(attr.ftLastWriteTime);
    long long accessed = _filetime_to_ms(attr.ftLastAccessTime);

    _snprintf(out_result, out_size - 1,
              "%s|%lld|%lld|%lld|%lld|%lu|%d|%d",
              path_utf8, size, created, modified, accessed,
              attr.dwFileAttributes, file_count, dir_count);

    return 1;
}

int win_api_show_properties(const char *path_utf8)
{
    wchar_t wpath[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);

    SHELLEXECUTEINFOW sei = {0};
    sei.cbSize = sizeof(sei);
    sei.fMask  = SEE_MASK_INVOKEIDLIST;
    sei.lpVerb = L"properties";
    sei.lpFile = wpath;
    sei.nShow  = SW_SHOW;

    return ShellExecuteExW(&sei) ? 1 : 0;
}

int win_api_open(const char *path_utf8)
{
    wchar_t wpath[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);

    HINSTANCE result = ShellExecuteW(NULL, L"open", wpath, NULL, NULL, SW_SHOWNORMAL);
    return ((INT_PTR)result > 32) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// ファイル操作（Shell経由でゴミ箱・進捗バー・確認ダイアログに対応）
// ---------------------------------------------------------------------------

int win_api_rename(const char *old_path_utf8, const char *new_path_utf8)
{
    wchar_t wold[MAX_PATH], wnew[MAX_PATH];
    utf8_to_wide(old_path_utf8, wold, MAX_PATH);
    utf8_to_wide(new_path_utf8, wnew, MAX_PATH);

    return MoveFileW(wold, wnew) ? 1 : 0;
}

int win_api_delete(const char *path_utf8, int permanent)
{
    wchar_t wpath[MAX_PATH + 2];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);
    wpath[wcslen(wpath) + 1] = L'\0'; // SHFileOperationW はダブルヌル終端を要求

#ifndef FOF_WANTNUKEWARNING
#define FOF_WANTNUKEWARNING 0x4000
#endif

    SHFILEOPSTRUCTW op = {0};
    op.wFunc  = FO_DELETE;
    op.pFrom  = wpath;
    op.fFlags = permanent
        ? (FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT)
        : (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_WANTNUKEWARNING | FOF_NOERRORUI | FOF_SILENT);

    int result = SHFileOperationW(&op);
    return (result == 0 && !op.fAnyOperationsAborted) ? 1 : 0;
}

int win_api_copy(const char *src_utf8, const char *dst_utf8)
{
    wchar_t wsrc[MAX_PATH + 2], wdst[MAX_PATH + 2];
    utf8_to_wide(src_utf8, wsrc, MAX_PATH);
    wsrc[wcslen(wsrc) + 1] = L'\0';
    utf8_to_wide(dst_utf8, wdst, MAX_PATH);
    wdst[wcslen(wdst) + 1] = L'\0';

    SHFILEOPSTRUCTW op = {0};
    op.wFunc  = FO_COPY;
    op.pFrom  = wsrc;
    op.pTo    = wdst;
    op.fFlags = FOF_NOERRORUI | FOF_SILENT;

    int result = SHFileOperationW(&op);
    return (result == 0 && !op.fAnyOperationsAborted) ? 1 : 0;
}

int win_api_move(const char *src_utf8, const char *dst_utf8)
{
    wchar_t wsrc[MAX_PATH + 2], wdst[MAX_PATH + 2];
    utf8_to_wide(src_utf8, wsrc, MAX_PATH);
    wsrc[wcslen(wsrc) + 1] = L'\0';
    utf8_to_wide(dst_utf8, wdst, MAX_PATH);
    wdst[wcslen(wdst) + 1] = L'\0';

    SHFILEOPSTRUCTW op = {0};
    op.wFunc  = FO_MOVE;
    op.pFrom  = wsrc;
    op.pTo    = wdst;
    op.fFlags = FOF_NOERRORUI | FOF_SILENT;

    int result = SHFileOperationW(&op);
    return (result == 0 && !op.fAnyOperationsAborted) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// 権限昇格
// ---------------------------------------------------------------------------

int win_api_elevate(const char *path_utf8)
{
    wchar_t wpath[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);

    // 末尾の「\」を除去（icacls の引数解析でエスケープ扱いになるのを防ぐ）
    size_t len = wcslen(wpath);
    if (len > 3 && wpath[len - 1] == L'\\')
        wpath[len - 1] = L'\0';

    wchar_t params[MAX_PATH + 128];
    _snwprintf(params, (sizeof(params) / sizeof(wchar_t)) - 1,
               L"/c icacls \"%s\" /grant %%USERNAME%%:(OI)(CI)F", wpath);

    SHELLEXECUTEINFOW sei = {0};
    sei.cbSize     = sizeof(sei);
    sei.fMask      = SEE_MASK_NOCLOSEPROCESS;
    sei.lpVerb     = L"runas"; // UACプロンプトを表示して管理者として実行
    sei.lpFile     = L"cmd.exe";
    sei.lpParameters = params;
    sei.nShow      = SW_HIDE;

    if (!ShellExecuteExW(&sei))
    {
        DWORD err = GetLastError();
        return (err == ERROR_CANCELLED) ? -1 : -2;
    }

    WaitForSingleObject(sei.hProcess, INFINITE);
    DWORD exit_code;
    GetExitCodeProcess(sei.hProcess, &exit_code);
    CloseHandle(sei.hProcess);

    return (exit_code == 0) ? 0 : -2;
}



// ---------------------------------------------------------------------------
// ファイル・フォルダ生成
// ---------------------------------------------------------------------------

void win_api_unique_path(const wchar_t *path, wchar_t *out)
{
    // パスが存在しなければそのまま使用
    if (GetFileAttributesW(path) == INVALID_FILE_ATTRIBUTES)
    {
        wcscpy(out, path);
        return;
    }

    wchar_t drive[_MAX_DRIVE], dir[_MAX_DIR], fname[_MAX_FNAME], ext[_MAX_EXT];
    _wsplitpath_s(path, drive, _MAX_DRIVE, dir, _MAX_DIR, fname, _MAX_FNAME, ext, _MAX_EXT);

    for (int i = 2; i < 1000; i++)
    {
        wchar_t new_fname[_MAX_FNAME + 16];
        _snwprintf(new_fname, _MAX_FNAME + 15, L"%s (%d)", fname, i);
        _wmakepath_s(out, MAX_PATH, drive, dir, new_fname, ext);
        if (GetFileAttributesW(out) == INVALID_FILE_ATTRIBUTES) return;
    }

    wcscpy(out, path); // 全番号が衝突した場合はフォールバック（エラーになる）
}

int win_api_mkdir(const char *path_utf8, char *out_final_utf8, int out_size)
{
    wchar_t wpath[MAX_PATH], wfinal[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);
    win_api_unique_path(wpath, wfinal);

    if (!CreateDirectoryW(wfinal, NULL)) return 0;

    wide_to_utf8(wfinal, out_final_utf8, out_size);
    return 1;
}

int win_api_new_file(const char *path_utf8, char *out_final_utf8, int out_size)
{
    wchar_t wpath[MAX_PATH], wfinal[MAX_PATH];
    utf8_to_wide(path_utf8, wpath, MAX_PATH);
    win_api_unique_path(wpath, wfinal);

    HANDLE h = CreateFileW(wfinal, GENERIC_WRITE, 0, NULL,
                           CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return 0;

    CloseHandle(h);
    wide_to_utf8(wfinal, out_final_utf8, out_size);
    return 1;
}
