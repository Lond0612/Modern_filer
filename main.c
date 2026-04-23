#include <stdio.h>
#include "cui.h"

int main(void)
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
