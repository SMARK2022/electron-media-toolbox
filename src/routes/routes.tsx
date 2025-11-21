import AboutPage from "@/pages/AboutPage";
import { createRoute } from "@tanstack/react-router";
import HomePage from "../pages/HomePage";
import PhotoFilterSubpage from "../pages/PhotoFilterPage";
import PhotoImportPage from "../pages/PhotoImportPage";
import SettingPage from "../pages/SettingsPage";
import TestingPage from "../pages/TestingPage";
import { RootRoute } from "./__root";

import PhotoExportSubpage from "../pages/PhotoExportPage";

// TODO: Steps to add a new route:
// 1. Create a new page component in the '../pages/' directory (e.g., NewPage.tsx)
// 2. Import the new page component at the top of this file
// 3. Define a new route for the page using createRoute()
// 4. Add the new route to the routeTree in RootRoute.addChildren([...])
// 5. Add a new Link in the navigation section of RootRoute if needed

// Example of adding a new route:
// 1. Create '../pages/NewPage.tsx'
// 2. Import: import NewPage from '../pages/NewPage';
// 3. Define route:
//    const NewRoute = createRoute({
//      getParentRoute: () => RootRoute,
//      path: '/new',
//      component: NewPage,
//    });
// 4. Add to routeTree: RootRoute.addChildren([HomeRoute, NewRoute, ...])
// 5. Add Link: <Link to="/new">New Page</Link>

export const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: HomePage,
});

export const AboutRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/about",
  component: AboutPage,
});

export const PhotoImportRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/photo-import",
  component: PhotoImportPage,
});

export const PhotoFilterRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/photo-filter",
  component: PhotoFilterSubpage,
});

export const SettingRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingPage,
});

export const PhotoExportRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/photo-export",
  component: PhotoExportSubpage,
});

export const TestingRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/testing",
  component: TestingPage,
});

export const rootTree = RootRoute.addChildren([
  HomeRoute,
  AboutRoute,
  PhotoImportRoute,
  PhotoFilterRoute,
  SettingRoute,
  PhotoExportRoute,
  TestingRoute,
]);
