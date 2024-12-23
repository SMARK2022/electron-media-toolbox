import DragWindowRegion from "@/components/DragWindowRegion";
import NavigationMenu from "@/components/NavigationMenu";
import React from "react";

export default function BaseLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <DragWindowRegion title="Electron Media Toolbox" />
            <div>
                <NavigationMenu />
            </div>
            <hr />
            <main>{children}</main>
        </div>
    );
}
