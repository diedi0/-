@echo off
chcp 65001 >nul
title 蓝海电子销售开单系统 - 数据库后端服务
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=F:\HBuilderX\plugins\node\node.exe"
echo 正在启动后端服务（端口 3001）...
"%NODE_EXE%" server.js
echo.
echo 服务已停止，按任意键关闭窗口...
pause >nul
