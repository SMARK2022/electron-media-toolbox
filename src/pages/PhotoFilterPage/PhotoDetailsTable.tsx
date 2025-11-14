import React from "react";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhotoExtend } from "@/lib/db";

interface PhotoDetailsTableProps {
  photo: PhotoExtend; // Use the Photo type here
  isPreviewEnabled: boolean;
  setIsPreviewEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  updatePhotoEnabledStatus: (
    filePath: string,
    isEnabled: boolean,
  ) => Promise<void>;
  setPhotos: React.Dispatch<React.SetStateAction<any[]>>;
}

const PhotoDetailsTable: React.FC<PhotoDetailsTableProps> = ({
    photo,
    isPreviewEnabled,
    setIsPreviewEnabled,
    updatePhotoEnabledStatus,
    setPhotos,
}) => {
    return (
        <Table>
            <TableCaption>Preview Photo Details</TableCaption>
            <TableBody>
                {[
                    { label: "文件名", value: photo.fileName },
                    { label: "文件路径", value: photo.filePath },
                    {
                        label: "文件大小",
                        value:
                            photo.fileSize &&
                            (photo.fileSize >= 1048576
                                ? (photo.fileSize / 1048576).toFixed(2) + " MB"
                                : photo.fileSize >= 1024
                                ? (photo.fileSize / 1024).toFixed(2) + " KB"
                                : photo.fileSize + " B"),
                    },
                    { label: "信息", value: photo.info },
                    { label: "日期", value: photo.date },
                    { label: "分组编号", value: photo.groupId },
                    { label: "相似度", value: photo.similarity },
                    { label: "IQA", value: photo.IQA },
                ]
                    .filter((item) => item.value !== undefined)
                    .map((item, index) => (
                        <TableRow key={index}>
                            <TableCell className="font-medium" style={{ width: '100px' }}>{item.label}</TableCell>
                            <TableCell >{item.value}</TableCell>
                        </TableRow>
                    ))}
                {photo.isEnabled !== undefined && (
                    <TableRow>
                        <TableCell className="font-medium" style={{ width: '100px' }}>是否启用</TableCell>
                        <TableCell >
                            <div className="flex items-center gap-2">
                                <Switch
                                    key={photo.isEnabled ? "enabled" : "disabled"}
                                    id="disabled-display"
                                    checked={isPreviewEnabled}
                                    onClick={async () => {
                                        await updatePhotoEnabledStatus(photo.filePath, !isPreviewEnabled);

                                        setPhotos((prevPhotos) =>
                                          prevPhotos.map((group) =>
                                            group.map((p: PhotoExtend) =>
                                              p.filePath === photo.filePath
                                                ? {
                                                    ...p,
                                                    isEnabled:
                                                      !isPreviewEnabled,
                                                  }
                                                : p,
                                            ),
                                          ),
                                        );
                                        setIsPreviewEnabled(!isPreviewEnabled);
                                    }}
                                />
                                <Label htmlFor="disabled-display">
                                    {photo.isEnabled ? "启用" : "弃用"}
                                </Label>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
};

export default PhotoDetailsTable;