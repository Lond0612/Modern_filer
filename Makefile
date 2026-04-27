CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11 -finput-charset=utf-8 -fexec-charset=cp932
LDFLAGS = -mwindows -lshell32 -lcomctl32 -luxtheme

TARGET  = filer.exe

# ---------------------------------------------------------------------------
# ソースファイル（サブフォルダ構成）
# ---------------------------------------------------------------------------
SRCS = \
    main.c              \
    core/filelist.c     \
    core/sort.c         \
    core/search.c       \
    proc/cmd_proc.c     \
    gui/config.c        \
    gui/gui.c

OBJS = $(SRCS:.c=.o)

# ---------------------------------------------------------------------------
# ビルドターゲット
#   debug   : 開発用（-DDEBUG -g）
#   release : 配布用
#   all     : debug と同じ（デフォルト）
# ---------------------------------------------------------------------------
all: debug

debug: CFLAGS += -DDEBUG -g
debug: $(TARGET)

release: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	del /Q $(subst /,\,$(OBJS)) $(TARGET) 2>nul || true

# ---------------------------------------------------------------------------
# 依存関係
# ---------------------------------------------------------------------------
main.o:             main.c gui/gui.h gui/config.h

core/filelist.o:    core/filelist.c core/filelist.h
core/sort.o:        core/sort.c core/sort.h core/filelist.h
core/search.o:      core/search.c core/search.h core/filelist.h

proc/cmd_proc.o:    proc/cmd_proc.c proc/cmd_proc.h

gui/config.o:       gui/config.c gui/config.h
gui/gui.o:          gui/gui.c gui/gui.h gui/config.h \
                    proc/cmd_proc.h core/filelist.h core/sort.h
