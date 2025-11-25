declare module "exif-parser" {
  interface ExifTags {
    [key: string]: any;
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
