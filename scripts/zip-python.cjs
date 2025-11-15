// scripts/zip-python.cjs
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const projectRoot = path.resolve(__dirname, "..");
const pythonDir = path.join(projectRoot, "python");
const outDir = path.join(projectRoot, "out");
const outZip = path.join(outDir, "python.zip");

async function main() {
    // 检查 python 目录是否存在
    if (!fs.existsSync(pythonDir)) {
        console.error(`[python:zip] "python" folder not found at: ${pythonDir}`);
        process.exit(1);
    }

    // 确保 out 目录存在
    fs.mkdirSync(outDir, { recursive: true });

    // 如果之前打过包，先删除旧 zip
    if (fs.existsSync(outZip)) {
        fs.unlinkSync(outZip);
    }

    console.log(`[python:zip] Packing "${pythonDir}" -> "${outZip}"`);
    console.log('[python:zip] Ignoring any path containing "__pycache__"...');

    const output = fs.createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
        console.log(
            `[python:zip] Done. Total size: ${archive.pointer()} bytes`
        );
    });

    archive.on("warning", (err) => {
        if (err.code === "ENOENT") {
            console.warn("[python:zip] Warning:", err.message);
        } else {
            throw err;
        }
    });

    archive.on("error", (err) => {
        console.error("[python:zip] Archive error:", err);
        process.exit(1);
    });

    // scripts/zip-python.cjs（只展示改动的部分）

    archive.pipe(output);

    // 把 python 目录打包到 zip 根目录下，并过滤不需要的内容
    archive.directory(pythonDir, false, (entry) => {
        const name = entry.name || "";
        const lowerName = name.toLowerCase();

        // 1) 忽略 __pycache__
        if (lowerName.includes("__pycache__")) {
            return false;
        }

        // 2) 忽略 .ipynb_checkpoints
        if (lowerName.includes(".ipynb_checkpoints")) {
            return false;
        }

        // 3) 忽略任何名为 dataset / datasets 的目录
        //    例如 python/dataset/xxx.py 或 python/foo/datasets/bar.py
        const segments = lowerName.split(/[\\/]/); // 兼容 Windows/Unix 路径分隔符
        if (segments.includes("dataset") || segments.includes("datasets")) {
            return false;
        }

        // 4) 忽略所有 .pdf 文件
        if (lowerName.endsWith(".pdf")) {
            return false;
        }

        // 其他文件正常打包
        return entry;
    });

    await archive.finalize();

}

main().catch((err) => {
    console.error("[python:zip] Failed:", err);
    process.exit(1);
});
