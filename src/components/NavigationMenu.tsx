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

export default function NavigationMenuDemo() {
  const { t } = useTranslation();
  const location = useLocation();

  // 左侧主导航 & 右侧工具导航
  const mainItems = [
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
  ]; // home / import / filter / export
  const utilItems = [
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
  ]; // settings / about / testing

  return (
    <NavigationMenu className="w-full">
      <div className="flex w-full items-center justify-between">
        {/* 左侧：主导航 */}
        <NavigationMenuList>
          {mainItems.map((item) => {
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

        {/* 右侧：分割线 + 工具导航 */}
          <span className="h-6 m-2 w-px bg-gray-200 dark:bg-gray-700" />
          <NavigationMenuList>
            {utilItems.map((item) => {
              const isActive = location.pathname === item.url;

              return (
                <NavigationMenuItem key={item.url}>
                  <NavigationMenuLink
                    asChild
                    className={cn(
                      navigationMenuTriggerStyle(),
                      isActive &&
                        "bg-gray-100 dark:bg-gray-800 dark:text-white",
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
      </div>
    </NavigationMenu>
  );
}
