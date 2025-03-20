import LangToggle from "@/components/LangToggle";
import ToggleTheme from "@/components/ToggleTheme";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function HomePage() {
    const { t, i18n } = useTranslation();
    const [serverStatusKey, setServerStatusKey] = useState("status.checking");
    const [statusColor, setStatusColor] = useState("gray");

    const checkServerStatus = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch("http://localhost:8000/status", { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                setServerStatusKey("status.backendRunning");
                setStatusColor("green");
            } else {
                setServerStatusKey("status.backendNotRunning");
                setStatusColor("red");
            }
        } catch {
            setServerStatusKey("status.backendNotRunning");
            setStatusColor("red");
        }
    };

    useEffect(() => {
        checkServerStatus();
    }, [i18n.language]);

    return (
        <>
            <div className="flex h-screen flex-col items-center justify-center gap-2">
                <h1 className="text-4xl font-bold">{t("page.title")}</h1>
                <LangToggle />

                <div className="mt-4 text-center">
                    <p>{t("instructions.importPhotos")}</p>
                </div>
                <div className="mt-4 flex items-center space-x-2">
                    <Button onClick={checkServerStatus} className="underline">
                        <span
                            className={`mr-2 h-3 w-3 rounded-full`}
                            style={{ backgroundColor: statusColor }}
                        ></span>
                        {t(serverStatusKey)}
                    </Button>
                    <ToggleTheme />
                </div>
            </div>
        </>
    );
}
