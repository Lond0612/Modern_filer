#include <stdio.h>
#include <string.h>
#include <windows.h>
#include <shellapi.h>

// --- プロトタイプ宣言 ---
int process_user_input(); // 入力の受付から振り分けまでを一括で行う
void cmd_ls(const char *path);
void cmd_cd(const char *arg);
void cmd_cat(const char *arg);
void cmd_touch(const char *arg);
void cmd_rm(const char *arg);
void cmd_cp(const char *src, const char *dst);
void cmd_mv(const char *src, const char *dst);

static int resolve_full_path(const char *arg, char *out, size_t out_size);
static int copy_directory_recursive(const char *src, const char *dst);

int main()
{
    printf("Filer Core System Started.\n");

    while (1)
    {
        if (process_user_input() == 0)
        {
            break;
        }
    }

    printf("System Shutdown.\n");
    return 0;
}

// 入力の取得とコマンドの判別
int process_user_input()
{
    char path[MAX_PATH];
    char input[256];

    // プロンプト表示用のパスを取得
    GetCurrentDirectory(MAX_PATH, path);
    printf("\n%s\n>", path);

    // 入力取得
    if (fgets(input, sizeof(input), stdin) == NULL)
        return 0;
    input[strcspn(input, "\n")] = 0; // 改行除去

    // コマンド判別
    if (strcmp(input, "exit") == 0)
    {
        return 0;
    }

    if (strcmp(input, "ls") == 0)
    {
        cmd_ls(path);
    }
    else if (strncmp(input, "cd ", 3) == 0)
    {
        cmd_cd(input + 3);
    }
    else if (strncmp(input, "cat ", 4) == 0)
    {
        cmd_cat(input + 4);
    }
    else if (strncmp(input, "touch ", 6) == 0)
    {
        cmd_touch(input + 6);
    }
    else if (strncmp(input, "rm ", 3) == 0)
    {
        cmd_rm(input + 3);
    }
    else if (strncmp(input, "cp ", 3) == 0)
    {
        // "cp src dst" の形式で引数を2つに分割
        char src[MAX_PATH], dst[MAX_PATH];
        if (sscanf(input + 3, "%s %s", src, dst) != 2)
        {
            printf("Usage: cp <src> <dst>\n");
        }
        else
        {
            cmd_cp(src, dst);
        }
    }
    else if (strncmp(input, "mv ", 3) == 0)
    {
        char src[MAX_PATH], dst[MAX_PATH];
        if (sscanf(input + 3, "%s %s", src, dst) != 2)
        {
            printf("Usage: mv <src> <dst>\n");
        }
        else
        {
            cmd_mv(src, dst);
        }
    }
    else if (strlen(input) > 0)
    {
        printf("Unknown command: %s\n", input);
    }

    return 1;
}

void cmd_ls(const char *path)
{
    char search_path[MAX_PATH];

    _snprintf(search_path, sizeof(search_path) - 1, "%s\\*", path);
    search_path[sizeof(search_path) - 1] = '\0';

    WIN32_FIND_DATA findData;
    HANDLE hFind = FindFirstFile(search_path, &findData);

    if (hFind == INVALID_HANDLE_VALUE)
    {
        printf("Failed to list directory: %s\n", path);
        return;
    }

    do
    {
        if (strcmp(findData.cFileName, ".") == 0 || strcmp(findData.cFileName, "..") == 0)
            continue;
        printf("%s\n", findData.cFileName);
    } while (FindNextFile(hFind, &findData));

    FindClose(hFind);
}

void cmd_cd(const char *arg)
{
    if (SetCurrentDirectory(arg) == 0)
    {
        printf("Failed to change directory: %s\n", arg);
    }
}

void cmd_cat(const char *arg)
{
    FILE *file = fopen(arg, "r");
    if (file == NULL)
    {
        printf("Failed to open file: %s\n", arg);
        return;
    }

    char buffer[256];
    while (fgets(buffer, sizeof(buffer), file) != NULL)
    {
        printf("%s", buffer);
    }

    fclose(file);
}

void cmd_touch(const char *arg)
{
    FILE *file = fopen(arg, "r");
    if (file != NULL)
    {
        printf("File already exists: %s\n", arg);
        fclose(file);
        return;
    }
    file = fopen(arg, "w");
    if (file == NULL)
    {
        printf("Failed to create file: %s\n", arg);
        return;
    }
    fclose(file);
}

// --- パスをフルパスに変換するヘルパー ---
static int resolve_full_path(const char *arg, char *out, size_t out_size)
{
    if (GetFullPathName(arg, (DWORD)out_size, out, NULL) == 0)
    {
        printf("Failed to resolve path: %s\n", arg);
        return 0;
    }
    return 1;
}

void cmd_rm(const char *arg)
{
    // --- フルパスに変換 ---
    char fullpath[MAX_PATH + 1];
    memset(fullpath, 0, sizeof(fullpath));
    if (resolve_full_path(arg, fullpath, MAX_PATH) == 0)
        return;

    // --- 存在確認 + サイズ取得 ---
    WIN32_FILE_ATTRIBUTE_DATA fileInfo;
    if (GetFileAttributesEx(fullpath, GetFileExInfoStandard, &fileInfo) == FALSE)
    {
        printf("File not found: %s\n", fullpath);
        return;
    }

    LARGE_INTEGER size;
    size.LowPart = fileInfo.nFileSizeLow;
    size.HighPart = fileInfo.nFileSizeHigh;

    // --- サイズ判定（閾値：100MB）---
    const LONGLONG THRESHOLD = 100LL * 1024 * 1024;

    if (size.QuadPart > THRESHOLD)
    {
        printf("Warning: File size is %.1f MB. Permanently delete? (y/n): ",
               (double)size.QuadPart / (1024 * 1024));

        char confirm[8];
        if (fgets(confirm, sizeof(confirm), stdin) == NULL)
            return;
        if (confirm[0] != 'y' && confirm[0] != 'Y')
        {
            printf("Cancelled.\n");
            return;
        }

        if (remove(fullpath) != 0)
            printf("Failed to delete: %s\n", fullpath);
        else
            printf("Permanently deleted: %s\n", fullpath);
    }
    else
    {
        SHFILEOPSTRUCT op;
        memset(&op, 0, sizeof(op));
        op.wFunc = FO_DELETE;
        op.pFrom = fullpath;
        op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT;

        if (SHFileOperation(&op) != 0)
            printf("Failed to move to trash: %s\n", fullpath);
        else
            printf("Moved to trash: %s\n", fullpath);
    }
}

// --- ディレクトリを再帰的にコピーするヘルパー ---
static int copy_directory_recursive(const char *src, const char *dst)
{
    // --- コピー先ディレクトリを作成 ---
    if (CreateDirectory(dst, NULL) == 0)
    {
        // 既に存在する場合はそのまま続行、それ以外はエラー
        if (GetLastError() != ERROR_ALREADY_EXISTS)
        {
            printf("Failed to create directory: %s\n", dst);
            return 0;
        }
    }

    // --- コピー元の中身を列挙 ---
    char search_path[MAX_PATH];
    _snprintf(search_path, sizeof(search_path) - 1, "%s\\*", src);
    search_path[sizeof(search_path) - 1] = '\0';

    WIN32_FIND_DATA findData;
    HANDLE hFind = FindFirstFile(search_path, &findData);
    if (hFind == INVALID_HANDLE_VALUE)
    {
        printf("Failed to open directory: %s\n", src);
        return 0;
    }

    int success = 1;
    do
    {
        if (strcmp(findData.cFileName, ".") == 0 || strcmp(findData.cFileName, "..") == 0)
            continue;

        // --- src と dst にエントリ名を連結してフルパスを構築 ---
        char child_src[MAX_PATH], child_dst[MAX_PATH];
        _snprintf(child_src, sizeof(child_src) - 1, "%s\\%s", src, findData.cFileName);
        _snprintf(child_dst, sizeof(child_dst) - 1, "%s\\%s", dst, findData.cFileName);
        child_src[sizeof(child_src) - 1] = '\0';
        child_dst[sizeof(child_dst) - 1] = '\0';

        if (findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            // サブディレクトリは再帰
            if (copy_directory_recursive(child_src, child_dst) == 0)
                success = 0;
        }
        else
        {
            // ファイルは上書きあり（FALSE）でコピー
            if (CopyFile(child_src, child_dst, FALSE) == 0)
            {
                printf("Failed to copy file: %s\n", child_src);
                success = 0;
            }
        }
    } while (FindNextFile(hFind, &findData));

    FindClose(hFind);
    return success;
}

void cmd_cp(const char *src, const char *dst)
{
    // --- フルパスに変換 ---
    char fullsrc[MAX_PATH], fulldst[MAX_PATH];
    if (resolve_full_path(src, fullsrc, MAX_PATH) == 0)
        return;
    if (resolve_full_path(dst, fulldst, MAX_PATH) == 0)
        return;

    // --- コピー元の存在確認 ---
    WIN32_FILE_ATTRIBUTE_DATA fileInfo;
    if (GetFileAttributesEx(fullsrc, GetFileExInfoStandard, &fileInfo) == FALSE)
    {
        printf("File not found: %s\n", fullsrc);
        return;
    }

    // --- ディレクトリは再帰コピー ---
    if (fileInfo.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
    {
        if (copy_directory_recursive(fullsrc, fulldst) == 0)
            printf("Failed to copy directory: %s -> %s\n", fullsrc, fulldst);
        else
            printf("Copied directory: %s -> %s\n", fullsrc, fulldst);
        return;
    }

    // --- コピー先が既存ファイルの場合は確認 ---
    if (GetFileAttributesEx(fulldst, GetFileExInfoStandard, &fileInfo) != FALSE)
    {
        printf("'%s' already exists. Overwrite? (y/n): ", fulldst);
        char confirm[8];
        if (fgets(confirm, sizeof(confirm), stdin) == NULL)
            return;
        if (confirm[0] != 'y' && confirm[0] != 'Y')
        {
            printf("Cancelled.\n");
            return;
        }
    }

    // --- コピー実行 ---
    // 第3引数 FALSE：コピー先が既存でも上書きする
    if (CopyFile(fullsrc, fulldst, FALSE) == 0)
        printf("Failed to copy: %s -> %s\n", fullsrc, fulldst);
    else
        printf("Copied: %s -> %s\n", fullsrc, fulldst);
}

void cmd_mv(const char *src, const char *dst)
{
    // --- フルパスに変換 ---
    char fullsrc[MAX_PATH], fulldst[MAX_PATH];
    if (resolve_full_path(src, fullsrc, MAX_PATH) == 0)
        return;
    if (resolve_full_path(dst, fulldst, MAX_PATH) == 0)
        return;

    // --- 移動元の存在確認 ---
    WIN32_FILE_ATTRIBUTE_DATA fileInfo;
    if (GetFileAttributesEx(fullsrc, GetFileExInfoStandard, &fileInfo) == FALSE)
    {
        printf("Not found: %s\n", fullsrc);
        return;
    }

    // --- 移動先がディレクトリならファイル名を補完 ---
    WIN32_FILE_ATTRIBUTE_DATA dstInfo;
    if (GetFileAttributesEx(fulldst, GetFileExInfoStandard, &dstInfo) != FALSE)
    {
        if (dstInfo.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        {
            // fulldst の末尾に "\ファイル名" を追加
            const char *filename = strrchr(fullsrc, '\\');
            filename = filename ? filename + 1 : fullsrc;

            char tmp[MAX_PATH];
            _snprintf(tmp, sizeof(tmp) - 1, "%s\\%s", fulldst, filename);
            tmp[sizeof(tmp) - 1] = '\0';
            strncpy(fulldst, tmp, MAX_PATH);
        }
    }

    // --- 移動先が既存ファイルの場合は確認 ---
    if (GetFileAttributesEx(fulldst, GetFileExInfoStandard, &dstInfo) != FALSE)
    {
        printf("'%s' already exists. Overwrite? (y/n): ", fulldst);
        char confirm[8];
        if (fgets(confirm, sizeof(confirm), stdin) == NULL)
            return;

        // 先頭のスペースをスキップして y/n を判定
        char *p = confirm;
        while (*p == ' ' || *p == '\t')
            p++;
        if (*p != 'y' && *p != 'Y')
        {
            printf("Cancelled.\n");
            return;
        }
    }

    // --- 移動実行 ---
    if (MoveFileEx(fullsrc, fulldst, MOVEFILE_REPLACE_EXISTING | MOVEFILE_COPY_ALLOWED) == 0)
        printf("Failed to move: %s -> %s\n", fullsrc, fulldst);
    else
        printf("Moved: %s -> %s\n", fullsrc, fulldst);
}