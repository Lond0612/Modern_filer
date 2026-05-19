CC      = gcc
CFLAGS  = -Wall -Wextra -std=c11 -finput-charset=utf-8
LDFLAGS = -lshell32 -static

TARGET_SERVER = filer_server.exe

SRCS_SERVER = \
    server.c            \
    core/fs_orbit.c     \
    core/win_api.c      \
    core/sort.c         \
    core/search.c       \
    proc/cmd_proc.c

OBJS_SERVER = $(SRCS_SERVER:.c=.o)

all: server

server: $(OBJS_SERVER)
	$(CC) $(CFLAGS) -o $(TARGET_SERVER) $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	del /Q $(subst /,\,$(OBJS_SERVER)) $(TARGET_SERVER) 2>nul || exit 0
