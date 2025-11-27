// @/db/index.ts

export interface Photo {
  fileName: string;
  fileUrl: string;
  filePath: string;
  info?: string;
  isEnabled?: boolean;
}

export interface PhotoExtend {
  fileName: string;
  fileUrl: string;
  filePath: string;
  fileSize?: number;
  info?: string;
  date?: string;
  groupId?: number;
  similarity?: number;
  IQA?: number;
  isEnabled?: boolean;
  // Python 端写入的 JSON 串，包含人脸检测结果等扩展信息
  // 例如：{"faces":[{"bbox":[x1,y1,x2,y2],"score":0.9}, ...]}
  faceData?: string;
}

// 初始化数据库（创建表）
export function initializeDatabase() {
  const sqlPresent = `
        CREATE TABLE IF NOT EXISTS present (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fileName TEXT NOT NULL,
            fileUrl TEXT NOT NULL,
            filePath TEXT NOT NULL,
            fileSize INTEGER,
            info TEXT,
            date TEXT,
            groupId INTEGER,
            simRefPath TEXT,
            similarity REAL,
            IQA REAL,
            isEnabled INTEGER DEFAULT 1,
            histH BLOB,
            histS BLOB,
            histV BLOB,
            faceData TEXT
        )
    `;
  const sqlPrevious = `
        CREATE TABLE IF NOT EXISTS previous (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fileName TEXT NOT NULL,
            fileUrl TEXT NOT NULL,
            filePath TEXT NOT NULL,
            fileSize INTEGER,
            info TEXT,
            date TEXT,
            groupId INTEGER,
            simRefPath TEXT,
            similarity REAL,
            IQA REAL,
            isEnabled INTEGER DEFAULT 1,
            histH BLOB,
            histS BLOB,
            histV BLOB,
            faceData TEXT
        )
    `;
  window.ElectronDB.exec(sqlPresent); // 调用 exec 执行 SQL
  window.ElectronDB.exec(sqlPrevious); // 调用 exec 执行 SQL
}

// 插入单个照片记录（简化信息）
export function addPhoto(photo: Photo) {
  const sql = `
        INSERT INTO present (fileName, fileUrl, filePath, info, isEnabled)
        VALUES (@fileName, @fileUrl, @filePath, @info, @isEnabled)
    `;
  window.ElectronDB.run(sql, photo); // 执行单条插入
}

// 批量插入照片记录（简化信息）
export function addPhotos(photos: Photo[]) {
  const sql = `
        INSERT INTO present (fileName, fileUrl, filePath, info, isEnabled)
        VALUES (@fileName, @fileUrl, @filePath, @info, @isEnabled)
    `;

  for (const photo of photos) {
    window.ElectronDB.run(sql, photo); // 使用 run 插入每一条记录
  }
}

// 插入单个照片记录（带可选扩展字段）
// 注意：不再从前端写入 simRefPath / 直方图，交由 Python 后端更新
export function addPhotoExtend(photo: PhotoExtend) {
  const columns = ["fileName", "fileUrl", "filePath"];
  const values = ["@fileName", "@fileUrl", "@filePath"];

  if (photo.fileSize !== undefined) {
    columns.push("fileSize");
    values.push("@fileSize");
  }
  if (photo.info !== undefined) {
    columns.push("info");
    values.push("@info");
  }
  if (photo.date !== undefined) {
    columns.push("date");
    values.push("@date");
  }
  if (photo.groupId !== undefined) {
    columns.push("groupId");
    values.push("@groupId");
  }
  if (photo.similarity !== undefined) {
    columns.push("similarity");
    values.push("@similarity");
  }
  if (photo.IQA !== undefined) {
    columns.push("IQA");
    values.push("@IQA");
  }
  if (photo.isEnabled !== undefined) {
    columns.push("isEnabled");
    values.push(photo.isEnabled ? "1" : "0");
  }

  const sql = `
        INSERT INTO present (${columns.join(", ")})
        VALUES (${values.join(", ")})
    `;
  window.ElectronDB.run(sql, photo); // 执行单条插入
}

// 批量插入照片记录（扩展）
export function addPhotosExtend(photos: PhotoExtend[]) {
  for (const photo of photos) {
    addPhotoExtend(photo); // 使用 addPhotoExtend 插入每一条记录
  }
}

// 获取所有照片记录（简化版）
export function getPhotos(): Promise<Photo[]> {
  const sql = `
        SELECT
            fileName,
            fileUrl,
            filePath,
            info,
            isEnabled
        FROM present
    `;
  return window.ElectronDB.all(sql, []); // all 方法期望传递 SQL 和参数，参数为空数组表示无附加参数
}

// 获取所有详细照片记录（不包含 simRefPath / 直方图）
export function getPhotosExtend(): Promise<PhotoExtend[]> {
  const sql = `
        SELECT
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            similarity,
            IQA,
            isEnabled,
            faceData
        FROM present
    `;
  return window.ElectronDB.all(sql, []);
}

// 获取所有启用的照片记录（不包含 simRefPath / 直方图）
export function getEnabledPhotosExtend(): Promise<PhotoExtend[]> {
  const sql = `
        SELECT
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            similarity,
            IQA,
            isEnabled,
            faceData
        FROM present
        WHERE isEnabled = 1
    `;
  return window.ElectronDB.all(sql, []);
}

// 清空照片表并将内容移动到 previous 表（包含 simRefPath 和直方图）
export function clearPhotos() {
  const moveSql = `
        INSERT INTO previous (
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            simRefPath,
            similarity,
            IQA,
            isEnabled,
            histH,
            histS,
            histV
        )
        SELECT
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            simRefPath,
            similarity,
            IQA,
            isEnabled,
            histH,
            histS,
            histV
        FROM present
    `;
  const deleteSql = `DELETE FROM present`;
  window.ElectronDB.run(moveSql, []); // 将 present 表的内容移动到 previous 表
  window.ElectronDB.run(deleteSql, []); // 清空 present 表
}

// 根据条件获取照片记录（不拉取 simRefPath / 直方图）
export function getPhotosExtendByCriteria(
  groupId: number,
  sortColumn?: string,
  considerEnabled: boolean = true,
): Promise<PhotoExtend[]> {
  let sql = `
        SELECT
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            similarity,
      IQA,
      isEnabled,
      faceData
        FROM present
        WHERE 1=1
    `;

  if (groupId !== -2) {
    if (groupId === -1) {
      sql += ` AND groupId IS NULL`;
    } else {
      sql += ` AND groupId = ${groupId}`;
    }
  }

  if (considerEnabled) {
    sql += ` AND isEnabled = 1`;
  }

  if (sortColumn) {
    sql += ` ORDER BY ${sortColumn} DESC`;
  }

  return window.ElectronDB.all(sql, []);
}

// 获取单个照片的详细记录（异步，有限列）
export async function getPhotoExtendByPhoto(
  photo: Photo,
): Promise<PhotoExtend | null> {
  const sql = `
        SELECT
            fileName,
            fileUrl,
            filePath,
            fileSize,
            info,
            date,
            groupId,
            similarity,
      IQA,
      isEnabled,
      faceData
        FROM present
        WHERE fileName = @fileName AND filePath = @filePath
    `;
  try {
    const row = await window.ElectronDB.get(sql, photo);
    return (row ?? null) as PhotoExtend | null;
  } catch (err) {
    console.error("getPhotoExtendByPhoto 查询失败:", err, photo);
    return null;
  }
}

// 更新单个照片的启用状态
export function updatePhotoEnabledStatus(filePath: string, isEnabled: boolean) {
  const sql = `
        UPDATE present
        SET isEnabled = @isEnabled
        WHERE filePath = @filePath
    `;
  const params = {
    filePath: filePath,
    isEnabled: isEnabled ? 1 : 0,
  };
  return window.ElectronDB.run(sql, params); // 执行更新操作
}

// 获取多个照片的详细记录（异步，返回真实数据数组而不是 Promise 数组）
export async function getPhotosExtendByPhotos(
  photos: Photo[],
): Promise<PhotoExtend[]> {
  const rows = await Promise.all(
    photos.map((photo) => getPhotoExtendByPhoto(photo)),
  );
  // 过滤掉 null / undefined
  return rows.filter((row): row is PhotoExtend => row != null);
}

// 根据 filePath 删除单条照片记录
export function deletePhotoByPath(filePath: string) {
  const sql = `
        DELETE FROM present
        WHERE filePath = @filePath
    `;
  const params = { filePath };
  return window.ElectronDB.run(sql, params);
}
