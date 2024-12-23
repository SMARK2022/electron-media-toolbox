import { PhotoGridEnhance } from "@/components/PhotoGrid";
import React from 'react';

interface Photo {
    fileName: string;
    fileUrl: string;
    filePath: string;
    info: string;
    isEnabled: boolean;
}

import { ScrollArea } from "@/components/ui/scroll-area";

interface PhotoGridProps {
    photos: Photo[];
    aspectRatio?: 'portrait' | 'square';
    width?: number;
    height?: number;
}

import image from "@/assets/images/__mamehinata_vrchat_drawn_by_mashir_oxo__effe8b756f9078d5d6149d06c6bbe5d9.jpg";

export default function TestingPage() {
    const photos: Photo[] = [
        {
            fileName: "0.jpg",
            fileUrl: image,
            filePath: "NULL0",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "1.jpg",
            fileUrl: image,
            filePath: "NULL1",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "2.jpg",
            fileUrl: image,
            filePath: "NULL2",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "3.jpg",
            fileUrl: image,
            filePath: "NULL3",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "4.jpg",
            fileUrl: image,
            filePath: "NULL4",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "5.jpg",
            fileUrl: image,
            filePath: "NULL5",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "6.jpg",
            fileUrl: image,
            filePath: "NULL6",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "7.jpg",
            fileUrl: image,
            filePath: "NULL7",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "8.jpg",
            fileUrl: image,
            filePath: "NULL8",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "9.jpg",
            fileUrl: image,
            filePath: "NULL9",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "10.jpg",
            fileUrl: image,
            filePath: "NULL10",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "11.jpg",
            fileUrl: image,
            filePath: "NULL11",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "12.jpg",
            fileUrl: image,
            filePath: "NULL12",
            info: "Info Bar",
            isEnabled: true,
        },
        {
            fileName: "13.jpg",
            fileUrl: image,
            filePath: "NULL13",
            info: "Info Bar",
            isEnabled: false,
        },
        {
            fileName: "14.jpg",
            fileUrl: image,
            filePath: "NULL14",
            info: "Info Bar",
            isEnabled: false,
        },
        {
            fileName: "15.jpg",
            fileUrl: image,
            filePath: "NULL15",
            info: "Info Bar",
            isEnabled: false,
        },
        {
            fileName: "16.jpg",
            fileUrl: image,
            filePath: "NULL16",
            info: "Info Bar",
            isEnabled: false,
        },
        // ... other photos
    ];

    return (
        <div className="min-h-screen p-4">
            <label>This page is for testing purposes</label>
            <div className="m-4">
                <ScrollArea className="mx-auto h-[80vh] w-[90vw] rounded-md border p-4">
                    <PhotoGridEnhance photos={photos} />
                </ScrollArea>
            </div>
        </div>
    );
}
