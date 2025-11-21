// scripts/python-make.cjs
/* eslint-disable no-console */
const { spawn } = require("child_process");
const path = require("path");

const scriptsDir = path.resolve(__dirname);
const batFile = path.join(scriptsDir, "python-make.bat");

function main() {
  console.log(`[python:make] Starting Python Nuitka packaging...`);
  console.log(`[python:make] Executing: ${batFile}`);

  // 在 Windows 上使用 cmd.exe 执行 bat 文件
  const process = spawn("cmd.exe", ["/c", batFile], {
      cwd: scriptsDir,
    stdio: "inherit",
    shell: true,
  });

  process.on("error", (err) => {
    console.error("[python:make] Failed to start process:", err);
    process.exit(1);
  });

  process.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[python:make] Process exited with code ${code}`);
      process.exit(code);
    } else {
      console.log(`[python:make] Process completed successfully`);
    }
  });
}

main();
