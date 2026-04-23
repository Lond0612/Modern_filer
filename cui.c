#include <stdio.h>
#include <string.h>
#include <windows.h>
#include "cui.h"
#include "filelist.h"
#include "sort.h"
#include "search.h"
#include "fs_ops.h"

// --- CUI向けファイル一覧表示 ---
void cmd_ls(const char *path)
{
    FileList list = filelist_create();
    if (filelist_fetch(&list, path) < 0)
    {
        filelist_free(&list);
        return;
    }

    // デフォルトは名前昇順
    filelist_sort(&list, SORT_NAME, SORT_ASC);

    for (int i = 0; i < list.count; i++)
    {
        FileEntry *e = &list.entries[i];
        if (e->attributes & FILE_ATTRIBUTE_DIRECTORY)
            printf("[DIR]  %s\n", e->name);
        else
            printf("[FILE] %s  (%lld bytes)\n", e->name, e->size);
    }

    filelist_free(&list);
}

// --- CUI向け絞り込み検索表示 ---
void cmd_find(const char *path, const char *keyword)
{
    FileList list = filelist_create();
    if (filelist_fetch(&list, path) < 0)
    {
        filelist_free(&list);
        return;
    }

    // デフォルト：部分一致・ディレクトリ含む・大文字小文字無視
    SearchQuery query = searchquery_create(keyword, SEARCH_MATCH_PARTIAL, 1, 0);
    FileList result = filelist_search(&list, &query);

    if (result.count == 0)
    {
        printf("No files found matching: %s\n", keyword);
    }
    else
    {
        printf("%d file(s) found:\n", result.count);
        for (int i = 0; i < result.count; i++)
        {
            FileEntry *e = &result.entries[i];
            if (e->attributes & FILE_ATTRIBUTE_DIRECTORY)
                printf("[DIR]  %s\n", e->name);
            else
                printf("[FILE] %s  (%lld bytes)\n", e->name, e->size);
        }
    }

    filelist_free(&result);
    filelist_free(&list);
}

// --- 入力の取得とコマンドの判別 ---
int process_user_input(void)
{
    char path[MAX_PATH];
    char input[256];

    GetCurrentDirectory(MAX_PATH, path);
    printf("\n%s\n>", path);

    if (fgets(input, sizeof(input), stdin) == NULL)
        return 0;
    input[strcspn(input, "\n")] = 0;

    // --- スペース区切りでトークン分割 ---
    // argv[0] = コマンド名, argv[1]以降 = 引数
    char *argv[8] = {0};
    int argc = 0;

    char *token = strtok(input, " ");
    while (token != NULL && argc < 8)
    {
        argv[argc++] = token;
        token = strtok(NULL, " ");
    }

    if (argc == 0)
        return 1; // 空入力はスルー

    // --- コマンド判別 ---
    if (strcmp(argv[0], "exit") == 0)
    {
        return 0;
    }
    else if (strcmp(argv[0], "ls") == 0)
    {
        cmd_ls(path);
    }
    else if (strcmp(argv[0], "cd") == 0)
    {
        if (argc < 2)
            printf("Usage: cd <path>\n");
        else
            cmd_cd(argv[1]);
    }
    else if (strcmp(argv[0], "cat") == 0)
    {
        if (argc < 2)
            printf("Usage: cat <file>\n");
        else
            cmd_cat(argv[1]);
    }
    else if (strcmp(argv[0], "touch") == 0)
    {
        if (argc < 2)
            printf("Usage: touch <file>\n");
        else
            cmd_touch(argv[1]);
    }
    else if (strcmp(argv[0], "rm") == 0)
    {
        if (argc < 2)
            printf("Usage: rm <file>\n");
        else
            cmd_rm(argv[1]);
    }
    else if (strcmp(argv[0], "cp") == 0)
    {
        if (argc < 3)
            printf("Usage: cp <src> <dst>\n");
        else
            cmd_cp(argv[1], argv[2]);
    }
    else if (strcmp(argv[0], "mv") == 0)
    {
        if (argc < 3)
            printf("Usage: mv <src> <dst>\n");
        else
            cmd_mv(argv[1], argv[2]);
    }
    else if (strcmp(argv[0], "find") == 0)
    {
        if (argc < 2)
            printf("Usage: find <keyword>\n");
        else
            cmd_find(path, argv[1]);
    }
    else if (strcmp(argv[0], "open") == 0)
    {
        if (argc < 2)
            printf("Usage: open <file>\n");
        else
            cmd_open(argv[1]);
    }
    else
    {
        printf("Unknown command: %s\n", argv[0]);
    }

    return 1;
}
