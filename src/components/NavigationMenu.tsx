import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Filter, FlaskConical, FolderUp, House, Import, Settings } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
// import { useLocation } from "react-router-dom";

import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export default function NavigationMenuDemo() {
    const { t } = useTranslation();
    const location = useLocation();

    const items = [
        {
            title: t("navigation.home"),
            url: "/",
            icon: House,
            description: t("pageDescriptions.home"),
        },
        {
            title: t("navigation.import"),
            url: "/photo-import",
            icon: Import,
            description: t("pageDescriptions.import"),
        },
        {
            title: t("navigation.filter"),
            url: "/photo-filter",
            icon: Filter,
            description: t("pageDescriptions.filter"),
        },
        {
            title: t("navigation.export"),
            url: "/photo-export",
            icon: FolderUp,
            description: t("pageDescriptions.export"),
        },
        {
            title: t("navigation.settings"),
            url: "/settings",
            icon: Settings,
            description: t("pageDescriptions.settings"),
        },
        {
            title: t("navigation.about"),
            url: "/about",
            icon: Compass,
            description: t("pageDescriptions.about"),
        },
        {
            title: t("navigation.testing"),
            url: "/testing",
            icon: FlaskConical,
            description: t("pageDescriptions.testing"),
        },
    ];

    return (
        <NavigationMenu>
            <NavigationMenuList>
                {items.map((item) => (
                    <NavigationMenuItem key={item.url}>
                        <NavigationMenuLink
                            asChild
                            className={`${navigationMenuTriggerStyle()} ${location.pathname === item.url ? "bg-gray-200" : ""}`}
                        >
                            <Link to={item.url}>
                                <div className="flex items-center gap-2">
                                    <item.icon className="h-5 w-5" />
                                    {item.title}
                                </div>
                            </Link>
                        </NavigationMenuLink>
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    );
}
