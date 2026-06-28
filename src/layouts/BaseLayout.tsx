import DragWindowRegion from "@/components/DragWindowRegion";
import NavigationMenu from "@/components/NavigationMenu";
import { Separator } from "@/components/ui/separator";
import React from "react";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <DragWindowRegion title="Electron Media Toolbox" />
      <div>
        <NavigationMenu />
      </div>
      {/* Separator 替代裸 <hr>：使用主题 border token，与 AboutPage 风格一致 */}
      <Separator />
      <main>{children}</main>
    </div>
  );
}
