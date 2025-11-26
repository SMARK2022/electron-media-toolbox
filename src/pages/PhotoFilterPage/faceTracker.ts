/**
 * 人脸追踪匹配器
 *
 * 基于概率匹配的人脸追踪算法，用于在图片切换时自动识别并聚焦到同一个人脸。
 * 使用多个相似度分量加权计算，最终通过 softmax 得到匹配概率。
 */

export interface FaceInfo {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  score?: number;
}

export interface TrackedFace {
  face: FaceInfo;
  index: number;
}

export interface MatchResult {
  matchedIndex: number | null;
  confidence: number;
  probabilities: number[];
}

// 高斯核函数
const gaussian = (x: number, sigma: number): number => {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
};

// 计算两个 bbox 的 IoU
const computeIoU = (
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number]
): number => {
  const [x1_1, y1_1, x2_1, y2_1] = bbox1;
  const [x1_2, y1_2, x2_2, y2_2] = bbox2;

  const xi1 = Math.max(x1_1, x1_2);
  const yi1 = Math.max(y1_1, y1_2);
  const xi2 = Math.min(x2_1, x2_2);
  const yi2 = Math.min(y2_1, y2_2);

  const interWidth = Math.max(0, xi2 - xi1);
  const interHeight = Math.max(0, yi2 - yi1);
  const interArea = interWidth * interHeight;

  const area1 = (x2_1 - x1_1) * (y2_1 - y1_1);
  const area2 = (x2_2 - x1_2) * (y2_2 - y1_2);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
};

// 从 bbox 提取特征
const extractFeatures = (bbox: [number, number, number, number]) => {
  const [x1, y1, x2, y2] = bbox;
  const width = x2 - x1;
  const height = y2 - y1;
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;
  const area = width * height;
  const aspectRatio = width / Math.max(height, 1);

  return { centerX, centerY, width, height, area, aspectRatio };
};

// Softmax 函数
const softmax = (logits: number[]): number[] => {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExps);
};

export interface FaceTrackerConfig {
  // 位置相似度的 sigma（相对于图像对角线的比例）
  positionSigma: number;
  // 尺度相似度的 sigma（log-ratio）
  scaleSigma: number;
  // IoU 权重
  iouWeight: number;
  // Score 连续性权重
  scoreWeight: number;
  // 排序先验权重（很弱）
  rankWeight: number;
  // 最小置信度阈值，低于此值不匹配
  minConfidence: number;
}

const DEFAULT_CONFIG: FaceTrackerConfig = {
  positionSigma: 0.15, // 相对于图像对角线 15%
  scaleSigma: 0.4, // log-ratio sigma
  iouWeight: 2.0, // IoU 权重较高
  scoreWeight: 0.5, // score 连续性权重较低
  rankWeight: 0.2, // 排序先验很弱
  minConfidence: 0.2, // 最小置信度 30%
};

export class FaceTracker {
  private config: FaceTrackerConfig;
  private lastTrackedFace: TrackedFace | null = null;
  private lastImageSize: { width: number; height: number } | null = null;
  private lastFacesCount: number = 0;

  constructor(config: Partial<FaceTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新追踪状态（当用户手动选择人脸时调用）
   */
  setTrackedFace(
    face: FaceInfo | null,
    index: number,
    imageSize: { width: number; height: number },
    totalFaces: number
  ): void {
    if (face && index >= 0) {
      this.lastTrackedFace = { face, index };
      this.lastImageSize = imageSize;
      this.lastFacesCount = totalFaces;
    } else {
      this.clearTracking();
    }
  }

  /**
   * 清除追踪状态
   */
  clearTracking(): void {
    this.lastTrackedFace = null;
    this.lastImageSize = null;
    this.lastFacesCount = 0;
  }

  /**
   * 检查是否有有效的追踪状态
   */
  hasTracking(): boolean {
    return this.lastTrackedFace !== null && this.lastImageSize !== null;
  }

  /**
   * 在新图片的人脸列表中查找匹配的人脸
   */
  findMatch(
    newFaces: FaceInfo[],
    newImageSize: { width: number; height: number }
  ): MatchResult {
    // 没有追踪状态或没有候选人脸
    if (!this.hasTracking() || newFaces.length === 0) {
      return { matchedIndex: null, confidence: 0, probabilities: [] };
    }

    const prevFace = this.lastTrackedFace!.face;
    const prevIndex = this.lastTrackedFace!.index;
    const prevImageSize = this.lastImageSize!;
    const prevFacesCount = this.lastFacesCount;

    // 提取上一帧人脸的归一化特征
    const prevFeatures = extractFeatures(prevFace.bbox);
    const prevNormCenter = {
      x: prevFeatures.centerX / prevImageSize.width,
      y: prevFeatures.centerY / prevImageSize.height,
    };
    const prevNormArea =
      prevFeatures.area / (prevImageSize.width * prevImageSize.height);
    const prevScore = prevFace.score ?? 0.9;
    const prevRankRatio = prevFacesCount > 1 ? prevIndex / (prevFacesCount - 1) : 0;

    // 计算图像对角线（用于归一化距离）
    const diagonal = Math.sqrt(
      newImageSize.width ** 2 + newImageSize.height ** 2
    );

    // 为每个候选人脸计算匹配分数（log 空间）
    const logScores: number[] = newFaces.map((candidateFace, candidateIndex) => {
      const candFeatures = extractFeatures(candidateFace.bbox);
      const candNormCenter = {
        x: candFeatures.centerX / newImageSize.width,
        y: candFeatures.centerY / newImageSize.height,
      };
      const candNormArea =
        candFeatures.area / (newImageSize.width * newImageSize.height);
      const candScore = candidateFace.score ?? 0.9;
      const candRankRatio =
        newFaces.length > 1 ? candidateIndex / (newFaces.length - 1) : 0;

      // 1. 位置相似度（归一化坐标的欧氏距离）
      const posDist = Math.sqrt(
        (candNormCenter.x - prevNormCenter.x) ** 2 +
          (candNormCenter.y - prevNormCenter.y) ** 2
      );
      const posSim = gaussian(posDist, this.config.positionSigma);

      // 2. 尺度相似度（面积的 log-ratio）
      const areaRatio = Math.log(
        Math.max(candNormArea, 1e-6) / Math.max(prevNormArea, 1e-6)
      );
      const scaleSim = gaussian(areaRatio, this.config.scaleSigma);

      // 3. 宽高比相似度
      const aspectRatio = Math.log(
        Math.max(candFeatures.aspectRatio, 0.1) /
          Math.max(prevFeatures.aspectRatio, 0.1)
      );
      const aspectSim = gaussian(aspectRatio, this.config.scaleSigma);

      // 4. IoU 相似度（需要将 bbox 归一化到相同尺度）
      // 将前一帧的 bbox 按比例缩放到新图像尺寸
      const scaledPrevBbox: [number, number, number, number] = [
        (prevFace.bbox[0] / prevImageSize.width) * newImageSize.width,
        (prevFace.bbox[1] / prevImageSize.height) * newImageSize.height,
        (prevFace.bbox[2] / prevImageSize.width) * newImageSize.width,
        (prevFace.bbox[3] / prevImageSize.height) * newImageSize.height,
      ];
      const iou = computeIoU(scaledPrevBbox, candidateFace.bbox);

      // 5. Score 连续性（允许一定范围的变化）
      const scoreDiff = Math.abs(candScore - prevScore);
      const scoreSim = gaussian(scoreDiff, 0.1); // sigma = 10%

      // 6. 排序先验（很弱，允许较大变化）
      const rankDiff = Math.abs(candRankRatio - prevRankRatio);
      const rankSim = gaussian(rankDiff, 0.5); // sigma = 50%

      // 加权组合（log 空间）
      const logScore =
        Math.log(Math.max(posSim, 1e-10)) * 1.5 + // 位置权重最高
        Math.log(Math.max(scaleSim, 1e-10)) * 1.0 +
        Math.log(Math.max(aspectSim, 1e-10)) * 0.5 +
        Math.log(Math.max(iou + 0.01, 1e-10)) * this.config.iouWeight +
        Math.log(Math.max(scoreSim, 1e-10)) * this.config.scoreWeight +
        Math.log(Math.max(rankSim, 1e-10)) * this.config.rankWeight;

      return logScore;
    });

    // Softmax 得到概率分布
    const probabilities = softmax(logScores);

    // 找到最大概率的索引
    let maxProb = 0;
    let maxIndex = -1;
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIndex = i;
      }
    }

    // 如果最大概率低于阈值，尝试选取 softmax 前 30% 中最高置信度的
    if (maxProb < this.config.minConfidence) {
      const topCount = Math.max(1, Math.ceil(probabilities.length * 0.3));
      const topIndices = probabilities
      .map((prob, idx) => ({ prob, idx }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, topCount)
      .sort((a, b) => b.prob - a.prob);

      if (topIndices.length > 0) {
      const topMatch = topIndices[0];
      return {
        matchedIndex: topMatch.idx,
        confidence: topMatch.prob,
        probabilities,
      };
      }

      return { matchedIndex: null, confidence: maxProb, probabilities };
    }

    return {
      matchedIndex: maxIndex,
      confidence: maxProb,
      probabilities,
    };
    }

  /**
   * 获取当前追踪状态（用于调试）
   */
  getTrackingState(): {
    face: FaceInfo | null;
    index: number;
    imageSize: { width: number; height: number } | null;
  } {
    return {
      face: this.lastTrackedFace?.face ?? null,
      index: this.lastTrackedFace?.index ?? -1,
      imageSize: this.lastImageSize,
    };
  }
}

// 创建全局单例（也可以在组件中创建实例）
export const globalFaceTracker = new FaceTracker();
