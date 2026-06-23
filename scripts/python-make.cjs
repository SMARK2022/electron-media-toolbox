// scripts/python-make.cjs
const { spawn } = require("child_process");
const path = require("path");

const scriptsDir = path.resolve(__dirname);
const batFile = path.join(scriptsDir, "python-make.bat");

function main() {
  console.log(`[python:make] Starting Python Nuitka packaging...`);
  console.log(`[python:make] Executing: ${batFile}`);

  // 在 Windows 上使用 cmd.exe 执行 bat 文件
  // 命名为 child，避免遮蔽 Node 全局 process（否则 process.exit 作用于已退出的子进程，无法传播退出码）
  const child = spawn("cmd.exe", ["/c", batFile], {
    cwd: scriptsDir,
    stdio: "inherit",
    shell: true,
  });

  child.on("error", (err) => {
    console.error("[python:make] Failed to start process:", err);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[python:make] Process exited with code ${code}`);
      process.exit(code ?? 1);
    } else {
      console.log(`[python:make] Process completed successfully`);
    }
  });
}

main();
