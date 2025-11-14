// src/types/assets.d.ts
declare module "*.svg" {
  // 如果你是以 <img src={icon} /> 的方式使用，导出的就是 URL 字符串
  const src: string;
  export default src;
}

// src/types/assets.d.ts
declare module "*.jpg" {
  // 如果你是以 <img src={icon} /> 的方式使用，导出的就是 URL 字符串
  const src: string;
  export default src;
}
