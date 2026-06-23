declare module "exif-parser" {
  interface ExifTags {
    // EXIF tag 值类型多样（数字/字符串/Date/Buffer），用 unknown 代替 any
    [key: string]: unknown;
  }

  interface ExifResult {
    tags: ExifTags;
    imageSize?: {
      width: number;
      height: number;
    };
    thumbnailOffset?: number;
    thumbnailLength?: number;
  }

  interface ExifParser {
    parse: () => ExifResult;
  }

  export function create(buffer: Buffer): ExifParser;
}
