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
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";

export default function AboutPage() {
    const { t } = useTranslation();
    return (
        <div
            className="flex h-screen flex-col items-center justify-center gap-2"
            style={{ marginTop: "-5vh" }}
        >
            <Card>
                <CardHeader>
                    <CardTitle>{t("about.pageTitle")}</CardTitle>
                    <CardDescription>{t("about.personalInfo")}</CardDescription>
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
                        <p>{t("labels.author")}: SMARK</p>
                        <p>{t("labels.email")}: SMARK2019@outlook.com</p>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-2">
                    <p>{t("about.toolboxDescription")}</p>
                    <p>{t("about.contactInfo")}</p>
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
                    <Separator />
                    <p className="text-sm">
                        <em>{t("about.basedOnProject")}:</em>{" "}
                        <a
                            href="https://github.com/LuanRoger/electron-shadcn"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500"
                        >
                            <em>https://github.com/LuanRoger/electron-shadcn</em>
                        </a>
                        <em> {t("about.build")}</em>
                    </p>
                    <p className="text-sm">
                        <em>{t("about.adoptedProject")}:</em>{" "}
                        <a
                            href="https://github.com/nasimjamshidi/LAR-IQA"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500"
                        >
                            <em>https://github.com/nasimjamshidi/LAR-IQA</em>
                        </a>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
