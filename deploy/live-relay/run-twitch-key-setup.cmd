@echo off
"C:\Windows\System32\OpenSSH\ssh.exe" -i "C:\Users\HADJAL\.ssh\id_ed25519" -o ConnectTimeout=30 root@84.46.244.117 /opt/osgard/live-relay/configure-twitch-key.sh
echo.
pause
