CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11
LDFLAGS = -lshell32

TARGET  = filer.exe
SRCS    = main.c filelist.c sort.c search.c fs_ops.c cui.c
OBJS    = $(SRCS:.c=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	del /Q $(OBJS) $(TARGET) 2>nul || true

# 依存関係
main.o:     main.c cui.h
filelist.o: filelist.c filelist.h
sort.o:     sort.c sort.h filelist.h
search.o:   search.c search.h filelist.h
fs_ops.o:   fs_ops.c fs_ops.h
cui.o:      cui.c cui.h filelist.h sort.h search.h fs_ops.h
