import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import React from "react";

import avatar from "@/assets/images/avatar.jpg";

// import Image from "next/image";

export default function AboutPage() {
    return (
        <div
            className="flex h-screen flex-col items-center justify-center gap-2"
            style={{ marginTop: "-5vh" }}
        >
            <Card>
                <CardHeader>
                    <CardTitle>关于页面</CardTitle>
                    <CardDescription>个人信息</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded-full">
                        <img
                            src={avatar}
                            alt="SMARK's Avatar"
                            width={64}
                            height={64}
                            className="object-cover"
                        />
                    </div>
                    <div>
                        <p>作者: SMARK</p>
                        <p>邮箱: SMARK2019@outlook.com</p>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2">
                    <p>这是我的个人媒体工具箱，版本 a1.0</p>
                    <p>如果您有任何问题或建议，请随时联系我。 感谢您的使用！</p>
                    <p>
                        <em>GitHub:</em>{" "}
                        <a
                            href="https://github.com/SMARK"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500"
                        >
                            <em>https://github.com/SMARK</em>
                        </a>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
