#include <stdio.h>
#include <string.h>
#include <windows.h>

// --- プロトタイプ宣言 ---
int process_user_input(); // 入力の受付から振り分けまでを一括で行う
void cmd_ls(const char *path);
void cmd_cd(const char *arg);
void cmd_cat(const char *arg);
void cmd_touch(const char *arg);

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