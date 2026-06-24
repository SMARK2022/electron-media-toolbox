// scripts/python-make.cjs
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const scriptsDir = path.resolve(__dirname);
const batFile = path.join(scriptsDir, "python-make.bat");
const shFile = path.join(scriptsDir, "python-make.sh");

function main() {
  console.log(`[python:make] Starting Python Nuitka packaging...`);
  console.log(`[python:make] Platform: ${os.platform()}`);

  let child;

  if (os.platform() === "win32") {
    // Windows：通过 cmd.exe 执行 bat 文件
    console.log(`[python:make] Executing: ${batFile}`);
    child = spawn("cmd.exe", ["/c", batFile], {
      cwd: scriptsDir,
      stdio: "inherit",
      shell: true,
    });
  } else {
    // macOS / Linux：通过 bash 执行 sh 文件
    console.log(`[python:make] Executing: bash ${shFile}`);
    child = spawn("bash", [shFile], {
      cwd: scriptsDir,
      stdio: "inherit",
      shell: false,
      // 环境变量原样透传，CONDA_ENV_NAME 默认值由 python-make.sh 内部处理
      env: { ...process.env },
    });
  }

  // 命名为 child，避免遮蔽 Node 全局 process（否则 process.exit 作用于已退出的子进程，无法传播退出码）
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
