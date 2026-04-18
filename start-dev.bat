@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 python，请先安装 Python 并加入 PATH。
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

if not exist "frontend\node_modules\" (
  echo [提示] 未检测到 frontend\node_modules，正在执行 npm install ...
  pushd frontend
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败。
    popd
    pause
    exit /b 1
  )
  popd
)

echo 正在启动后端 ^(Flask，默认 http://127.0.0.1:5000^) 与前端 ^(Vite，默认 http://127.0.0.1:5173^) ...
echo.

cd backend
if exist ".venv\Scripts\python.exe" (
  start "TaskFlow-后端" cmd /k ".venv\Scripts\python.exe app.py"
) else (
  start "TaskFlow-后端" cmd /k "python app.py"
)
cd ..

timeout /t 1 /nobreak >nul

cd frontend
start "TaskFlow-前端" cmd /k "npm run dev"
cd ..

echo.
echo 已在新窗口中启动后端与前端，关闭对应窗口即可停止服务。
pause
