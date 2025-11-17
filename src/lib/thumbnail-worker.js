// 追加两个 buffer
const appendBuffer = (buffer1, buffer2) => {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp;
};

// 异步读取并解析 EXIF 缩略图
const fetchEXIFThumb = async (url) => {
  const response = await fetch(url);
  const reader = response.body.getReader();
  let result = await reader.read();
  let start;
  let end;
  let buffer;
  let stream;

  while (!result.done) {
    const { value } = result;
    buffer = buffer ? appendBuffer(buffer, value) : new Uint8Array(value);

    // 扫描缓冲区寻找 EXIF 起始和结束位置
    for (let i = start ? start + 1 : 2, j = buffer.length; i < j; i++) {
      if (buffer[i] !== 0xff) continue; // 不是图片标志，跳过
      if (!start && buffer[i + 1] === 0xd8) {
        start = i; // 找到 JPEG 起始标志
        continue;
      }
      if (start && buffer[i + 1] === 0xd9) end = i + 2; // 找到 JPEG 结束标志
    }

    if (start && end) {
      stream = buffer.subarray(start, end); // 提取 EXIF 缩略图部分
      reader.cancel("Thumbnail found");
      break;
    }

    // 防止加载过大图片导致卡顿，超过 80KB 就停止读取
    if (buffer.length > 80000) {
      reader.cancel("Thumbnail not found");
      break;
    }

    // 继续读取下一部分
    result = await reader.read();
  }

  return new Response(stream)?.blob();
};

// Web Worker 处理逻辑
onmessage = (e) => {
  const { path } = e.data;

  // 获取 EXIF 缩略图
  fetchEXIFThumb(path)
    .then((blob) => {
      postMessage({ blob }); // 返回生成的 EXIF 缩略图
    })
    .catch((error) => {
      console.error("Error processing EXIF thumbnail:", error);
      postMessage({ error: error.message }); // 传回错误信息
    });
};
