import { Link } from "@tanstack/react-router";
import { Compass, Filter, FlaskConical, FolderUp, House, Import, Settings } from "lucide-react";
import React from "react";

import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    navigationMenuTriggerStyle
} from "@/components/ui/navigation-menu";


const items = [
    {
        title: "首页",
        url: "/",
        icon: House,
        description: "上传您的照片到图库中进行管理。",
    },
    {
        title: "导入",
        url: "/photo-import",
        icon: Import,
        description: "上传您的照片到图库中进行管理。",
    },
    {
        title: "筛选",
        url: "/photo-filter",
        icon: Filter,
        description: "按条件筛选和查看您的照片集合。",
    },
    {
        title: "导出",
        url: "/photo-export",
        icon: FolderUp,
        description: "将您的照片导出到本地或其他平台。",
    },
    {
        title: "设置",
        url: "/settings",
        icon: Settings,
        description: "配置应用程序的功能与偏好设置。",
    },
    {
        title: "关于",
        url: "/about",
        icon: Compass,
        description: "配置应用程序的功能与偏好设置。",
    },
    {
        title: "测试",
        url: "/testing",
        icon: FlaskConical,
        description: "配置应用程序的功能与偏好设置。",
    },
];

export default function NavigationMenuDemo() {
    return (
        <NavigationMenu>
            <NavigationMenuList>

                {items.map((item) => (
                    <NavigationMenuItem key={item.url}>
                        <Link to={item.url}>
                            <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                <div className="flex items-center gap-2">
                                    <item.icon className="h-5 w-5" />
                                    {item.title}
                                </div>
                            </NavigationMenuLink>
                        </Link>
                    </NavigationMenuItem>
                ))}

            </NavigationMenuList>
        </NavigationMenu>
    );
}
