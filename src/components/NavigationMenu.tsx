import React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Compass,
  Filter,
  FlaskConical,
  FolderUp,
  House,
  Import,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description?: string;
};

export default function NavigationMenuDemo() {
  const { t } = useTranslation();
  const location = useLocation();

  // 用 Node 风格的环境变量来判断是否为开发模式
  // Vite / Webpack 等打包器通常会在构建时把它替换掉
  const isDev =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  // 左侧主导航
  const mainItems: NavItem[] = [
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
  ];

  // 右侧工具导航：
  // - 生产环境：只保留 About
  // - 开发环境：Settings + About + Testing
  const utilItems: NavItem[] = [
    {
      title: t("navigation.about"),
      url: "/about",
      icon: Compass,
      description: t("pageDescriptions.about"),
    },
  ];

  if (isDev) {
    // 开发环境才显示 Settings / Testing
    utilItems.unshift({
      title: t("navigation.settings"),
      url: "/settings",
      icon: Settings,
      description: t("pageDescriptions.settings"),
    });
    utilItems.push({
      title: t("navigation.testing"),
      url: "/testing",
      icon: FlaskConical,
      description: t("pageDescriptions.testing"),
    });
  }

  const renderNavList = (items: NavItem[]) => (
    <NavigationMenuList>
      {items.map((item) => {
        const isActive = location.pathname === item.url;

        return (
          <NavigationMenuItem key={item.url}>
            <NavigationMenuLink
              asChild
              className={cn(
                navigationMenuTriggerStyle(),
                isActive && "bg-gray-100 dark:bg-gray-800 dark:text-white",
              )}
            >
              <Link to={item.url}>
                <div className="flex items-center gap-2">
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </div>
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        );
      })}
    </NavigationMenuList>
  );

  return (
    <NavigationMenu className="w-full">
      <div className="flex w-full items-center justify-between">
        {/* 左侧：主导航 */}
        {renderNavList(mainItems)}

        {/* 右侧：分割线 + 工具导航 */}
        <span className="m-2 h-6 w-px bg-gray-200 dark:bg-gray-700" />
        {renderNavList(utilItems)}
      </div>
    </NavigationMenu>
  );
}
