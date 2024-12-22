import { PhotoGridEnhance } from "@/components/PhotoGrid";
import React from 'react';


interface Photo {
    fileName: string;
    fileUrl: string;
    filePath: string;
    info: string;
}

interface PhotoGridProps {
    photos: Photo[];
    aspectRatio?: 'portrait' | 'square';
    width?: number;
    height?: number;
}


export default function TestingPage() {
    const photos: Photo[] = [
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        {
            fileName: "1.jpg",
            fileUrl: "local-resource://E:/Users/Lenovo/桌面/tmp/1.jpg",
            filePath: "E:/Users/Lenovo/桌面/tmp/1.jpg",
            info: "宽度25%",
        },
        // ... other photos
    ];

    return (
        <div
            className="flex h-screen flex-col items-center justify-center gap-2"
            style={{ marginTop: "-5vh" }}
        >
            <PhotoGridEnhance photos={photos} />
        </div>
    );
}
