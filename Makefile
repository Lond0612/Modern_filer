CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11 -finput-charset=utf-8 -fexec-charset=cp932
LDFLAGS = -mwindows -lshell32 -lcomctl32

TARGET  = filer.exe
SRCS    = main.c filelist.c sort.c search.c fs_ops.c cui.c gui.c
OBJS    = $(SRCS:.c=.o)

# ---------------------------------------------------------------------------
# ビルドターゲット
#   debug   : cmdウィンドウあり・printf出力あり（開発中はこちら）
#   release : cmdウィンドウなし・GUIログペインのみ（配布時はこちら）
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
	del /Q $(OBJS) $(TARGET) 2>nul || true

# 依存関係
main.o:     main.c gui.h cui.h
filelist.o: filelist.c filelist.h
sort.o:     sort.c sort.h filelist.h
search.o:   search.c search.h filelist.h
fs_ops.o:   fs_ops.c fs_ops.h
cui.o:      cui.c cui.h filelist.h sort.h search.h fs_ops.h
gui.o:      gui.c gui.h filelist.h sort.h fs_ops.h