@echo off
echo STARTING FLOOD TEST...
for /L %%i in (1,1,500) do (
    echo [%%i] This is a line of text to flood the terminal and test IPC performance.
)
echo FLOOD TEST FINISHED.
cd ..
