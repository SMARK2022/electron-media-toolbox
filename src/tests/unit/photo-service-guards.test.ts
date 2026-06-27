/**
 * PhotoService 并发守卫单元测试
 * ===============================
 * 验证两个并发安全不变量：
 * 1. 后端忙时（status ≠ "空闲中"）submitImportTask 拒绝执行，
 *    防止 clearPhotos 在检测运行期间破坏 DBManager 的行 ID 缓存。
 * 2. refreshPhotos 的取消令牌：当新的 refreshPhotos 被触发时，
 *    旧的异步请求不再写入 store，防止分组模式数据覆盖总览模式数据。
 *
 * 若移除 isBackendBusy guard 或 refreshToken 逻辑，对应断言将失败。
 */
import { vi } from "vitest";

// ============================================================================
// Mock 依赖：PhotoService 内部依赖 window.ElectronDB、usePhotoFilterStore、db.ts
// ============================================================================

const mockElectronDB = {
  exec: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  all: vi.fn().mockResolvedValue([]),
  getDbPath: vi.fn().mockResolvedValue("test.db"),
};

// 可控的 store 状态——测试中动态修改 status 模拟后端忙/空闲
const mockStoreState: {
  objServerStatusData: { status: string } | null;
  fnSetAllPhotos: ReturnType<typeof vi.fn>;
  fnSetGalleryGroupedPhotos: ReturnType<typeof vi.fn>;
  fnCalculateEyeStats: ReturnType<typeof vi.fn>;
  fnSetServerPollingNeeded: ReturnType<typeof vi.fn>;
  fnSetServerStatusData: ReturnType<typeof vi.fn>;
  fnSetServerStatusText: ReturnType<typeof vi.fn>;
  modeGalleryView: string;
  strSortedColumnKey: string;
  boolShowDisabledPhotos: boolean;
  boolServerPollingNeeded: boolean;
} = {
  objServerStatusData: { status: "空闲中" },
  fnSetAllPhotos: vi.fn(),
  fnSetGalleryGroupedPhotos: vi.fn(),
  fnCalculateEyeStats: vi.fn(),
  fnSetServerPollingNeeded: vi.fn(),
  fnSetServerStatusData: vi.fn(),
  fnSetServerStatusText: vi.fn(),
  modeGalleryView: "total",
  strSortedColumnKey: "IQA",
  boolShowDisabledPhotos: false,
  boolServerPollingNeeded: true,
};

// Mock db.ts 模块——clearPhotos / addPhotosExtend / getPhotosExtendByCriteria 等
vi.mock("@/helpers/ipc/database/db", () => ({
  initializeDatabase: vi.fn(),
  getPhotos: vi.fn().mockResolvedValue([]),
  getPhotosExtendByCriteria: vi.fn().mockResolvedValue([]),
  addPhotosExtend: vi.fn(),
  clearPhotos: vi.fn().mockResolvedValue(undefined),
  updatePhotoExtendByPath: vi.fn().mockResolvedValue(undefined),
  Photo: {},
  PhotoExtend: {},
}));

// Mock usePhotoFilterStore——返回可控的 state 对象
vi.mock("@/helpers/store/usePhotoFilterStore", () => ({
  usePhotoFilterStore: {
    getState: () => mockStoreState,
  },
}));

// 注入全局 ElectronDB
beforeEach(() => {
  (globalThis as unknown as { ElectronDB: unknown }).ElectronDB =
    mockElectronDB;
  vi.clearAllMocks();
});

// 延迟导入——在 mock 生效后加载
import { PhotoService } from "@/helpers/services/PhotoService";

// ============================================================================
// isBackendBusy guard：后端忙时拒绝导入
// ============================================================================

describe("submitImportTask 后端忙时拒绝", () => {
  test("status='正在处理' 时返回 false 且不调用 clearPhotos", async () => {
    // 模拟检测正在进行——Python 后端 status 非"空闲中"
    mockStoreState.objServerStatusData = { status: "正在处理: 图像检测" };

    const result = await PhotoService.submitImportTask({
      filePaths: ["E:/photos/1.jpg"],
    });

    // 不变量：检测进行中不允许 clearPhotos，
    // 否则 DBManager._file_id_cache 中的行 ID 会因 DELETE + INSERT 变为过期值
    expect(result).toBe(false);
    const { clearPhotos } = await import("@/helpers/ipc/database/db");
    expect(vi.mocked(clearPhotos)).not.toHaveBeenCalled();
  });

  test("status='空闲中' 时正常执行导入", async () => {
    mockStoreState.objServerStatusData = { status: "空闲中" };

    const result = await PhotoService.submitImportTask({
      filePaths: ["E:/photos/1.jpg"],
    });

    expect(result).toBe(true);
    const { clearPhotos } = await import("@/helpers/ipc/database/db");
    expect(vi.mocked(clearPhotos)).toHaveBeenCalled();
  });

  test("status=null（后端未连接）时允许导入", async () => {
    // 后端未启动时 status 为 null，不应阻塞导入——用户可能先导入再启动检测
    mockStoreState.objServerStatusData = null;

    const result = await PhotoService.submitImportTask({
      filePaths: ["E:/photos/1.jpg"],
    });

    expect(result).toBe(true);
  });
});

// ============================================================================
// refreshToken：refreshPhotos 取消令牌
// ============================================================================

describe("refreshPhotos 取消令牌", () => {
  test("旧请求的 store 写入被新请求取代时跳过", async () => {
    const { getPhotosExtendByCriteria, getPhotos } =
      await import("@/helpers/ipc/database/db");

    // 延迟 p1 的 getPhotos（loadPhotos 内部调用），使 p2 先完成 + 递增 token。
    // 这样 p1 恢复后 token 检查失败，跳过 fnSetGalleryGroupedPhotos 写入。
    let resolveFirstGetPhotos: (val: never[]) => void = () => {};
    let getPhotosCallCount = 0;
    vi.mocked(getPhotos).mockImplementation(() => {
      getPhotosCallCount++;
      if (getPhotosCallCount === 1) {
        // p1 的 loadPhotos：延迟 resolve，让 p2 先跑完
        return new Promise((resolve) => {
          resolveFirstGetPhotos = resolve as (val: never[]) => void;
        });
      }
      // p2 的 loadPhotos：立即 resolve
      return Promise.resolve([] as never[]);
    });
    vi.mocked(getPhotosExtendByCriteria).mockResolvedValue([]);

    // 重置 mock 调用计数——只关心 refreshPhotos 内部的 store 写入
    mockStoreState.fnSetGalleryGroupedPhotos.mockClear();

    // p1 启动——卡在 getPhotos（loadPhotos 内部）
    mockStoreState.modeGalleryView = "total";
    const p1 = PhotoService.refreshPhotos();

    // p2 启动——getPhotos 立即 resolve，token 递增到 2
    const p2 = PhotoService.refreshPhotos();
    await p2;

    // p2 完成：fnSetGalleryGroupedPhotos 被调用 1 次
    expect(mockStoreState.fnSetGalleryGroupedPhotos).toHaveBeenCalledTimes(1);

    // resolve p1 的 getPhotos——p1 恢复后 token 检查 1 !== 2 失败，跳过 store 写入
    resolveFirstGetPhotos([]);
    await p1;

    // p1 完成后 fnSetGalleryGroupedPhotos 仍应只被调用 1 次——
    // p1 的 token 已过期，store 写入被跳过
    expect(mockStoreState.fnSetGalleryGroupedPhotos).toHaveBeenCalledTimes(1);
  });

  test("无并发时 store 写入正常执行", async () => {
    const { getPhotosExtendByCriteria, getPhotos } =
      await import("@/helpers/ipc/database/db");
    vi.mocked(getPhotos).mockResolvedValue([]);
    vi.mocked(getPhotosExtendByCriteria).mockResolvedValue([]);

    mockStoreState.fnSetGalleryGroupedPhotos.mockClear();
    await PhotoService.refreshPhotos();

    // 无并发时，store 写入应正常执行
    expect(mockStoreState.fnSetGalleryGroupedPhotos).toHaveBeenCalled();
  });
});
