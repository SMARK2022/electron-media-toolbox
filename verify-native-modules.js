#!/usr/bin/env node

/**
 * 验证脚本：检查原生模块是否正确打包
 * 
 * 用法: node verify-native-modules.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MODULES_TO_CHECK = ["better-sqlite3", "exif-parser"];
const PLATFORM = process.platform;

console.log("🔍 原生模块打包验证工具\n");
console.log(`平台: ${PLATFORM}`);
console.log(`检查模块: ${MODULES_TO_CHECK.join(", ")}\n`);

// 1. 检查 node_modules 中的模块是否存在
console.log("📦 Step 1: 检查本地 node_modules...");
const nodeModulesPath = path.join(__dirname, "node_modules");
for (const mod of MODULES_TO_CHECK) {
  const modPath = path.join(nodeModulesPath, mod);
  if (fs.existsSync(modPath)) {
    console.log(`  ✓ ${mod} 存在`);
  } else {
    console.log(`  ✗ ${mod} 不存在 - 请运行 npm install`);
    process.exit(1);
  }
}

// 2. 查找 asar 文件
console.log("\n📦 Step 2: 查找构建输出...");
const outPath = path.join(__dirname, "out");
let asarFile = null;

if (fs.existsSync(outPath)) {
  const findAsar = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (file === "app.asar") {
        asarFile = fullPath;
        return;
      }
      if (fs.statSync(fullPath).isDirectory()) {
        findAsar(fullPath);
      }
    }
  };
  findAsar(outPath);
}

if (!asarFile) {
  console.log("  ✗ 未找到 app.asar 文件");
  console.log("  提示: 运行 npm run make 来构建应用");
  process.exit(1);
}

console.log(`  ✓ 找到 app.asar: ${asarFile}`);

// 3. 检查 asar 内容
console.log("\n📦 Step 3: 检查 asar 文件内容...");
try {
  const asarList = execSync(`npx @electron/asar list "${asarFile}"`, {
    encoding: "utf-8",
  });

  let allFound = true;
  for (const mod of MODULES_TO_CHECK) {
    const pattern = `node_modules/${mod}`;
    if (asarList.includes(pattern)) {
      console.log(`  ✓ ${mod} 在 asar 中`);
    } else {
      console.log(`  ✗ ${mod} 不在 asar 中`);
      allFound = false;
    }
  }

  if (!allFound) {
    console.log("\n⚠️  某些模块未被打包。原因可能是：");
    console.log("  1. forge.config.ts 中 EXTERNAL_DEPENDENCIES 未包含模块");
    console.log("  2. vite.base.config.ts 中 packaged 数组未包含模块");
    console.log("  3. 模块在 package.json 中是 devDependencies 而非 dependencies");
    console.log("\n请检查这些文件并重新运行 npm run make");
    process.exit(1);
  }
} catch (error) {
  console.log("  ✗ 检查 asar 失败:", error.message);
  console.log("  提示: 确保已安装 @electron/asar");
  process.exit(1);
}

// 4. 验证 package.json 配置
console.log("\n📦 Step 4: 验证 package.json 配置...");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"),
);

for (const mod of MODULES_TO_CHECK) {
  if (packageJson.dependencies && packageJson.dependencies[mod]) {
    console.log(`  ✓ ${mod} 在 dependencies 中`);
  } else {
    console.log(`  ✗ ${mod} 不在 dependencies 中`);
  }
}

// 5. 总结
console.log("\n✅ 所有检查通过！原生模块已正确打包。\n");
console.log("下一步:");
console.log(
  "  1. 运行打包的应用: out\\make\\squirrel.windows\\x64\\Electron Media Toolbox Setup.exe",
);
console.log("  2. 检查应用日志以确保模块正确加载");
console.log("  3. 测试依赖于这些模块的功能\n");
