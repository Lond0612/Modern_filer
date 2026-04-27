CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11 -finput-charset=utf-8 -fexec-charset=cp932
LDFLAGS = -mwindows -lshell32 -lcomctl32

TARGET  = filer.exe
SRCS    = main.c cmd_proc.c filelist.c sort.c search.c gui.c
OBJS    = $(SRCS:.c=.o)

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
main.o:      main.c gui.h
cmd_proc.o:  cmd_proc.c cmd_proc.h
filelist.o:  filelist.c filelist.h
sort.o:      sort.c sort.h filelist.h
search.o:    search.c search.h filelist.h
gui.o:       gui.c gui.h cmd_proc.h filelist.h sort.h