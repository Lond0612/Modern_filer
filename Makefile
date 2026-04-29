CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11 -finput-charset=utf-8 -fexec-charset=cp932
LDFLAGS = -mwindows -lshell32 -lcomctl32 -luxtheme -lole32 -luuid

TARGET  = filer.exe
TARGET_SERVER = filer_server.exe

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

SRCS_SERVER = \
    server.c            \
    core/filelist.c     \
    core/sort.c         \
    core/search.c       \
    proc/cmd_proc.c

OBJS = $(SRCS:.c=.o)
OBJS_SERVER = $(SRCS_SERVER:.c=.o)

# ---------------------------------------------------------------------------
# ビルドターゲット
# ---------------------------------------------------------------------------
all: debug server

debug: CFLAGS += -DDEBUG -g
debug: $(TARGET)

release: $(TARGET) server

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

server: $(OBJS_SERVER)
	$(CC) $(CFLAGS) -o $(TARGET_SERVER) $^ -lshell32

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	del /Q $(subst /,\,$(OBJS)) $(subst /,\,$(OBJS_SERVER)) $(TARGET) $(TARGET_SERVER) 2>nul || true

# ---------------------------------------------------------------------------
# 依存関係
# ---------------------------------------------------------------------------
main.o:             main.c gui/gui.h gui/config.h
server.o:           server.c core/filelist.h core/sort.h proc/cmd_proc.h

core/filelist.o:    core/filelist.c core/filelist.h
core/sort.o:        core/sort.c core/sort.h core/filelist.h
core/search.o:      core/search.c core/search.h core/filelist.h

proc/cmd_proc.o:    proc/cmd_proc.c proc/cmd_proc.h

gui/config.o:       gui/config.c gui/config.h
gui/gui.o:          gui/gui.c gui/gui.h gui/config.h \
                    proc/cmd_proc.h core/filelist.h core/sort.h
