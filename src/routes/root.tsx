import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AdminEmails } from "./admin";
import { AppHome } from "./index";

function RootLayout(): React.JSX.Element {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  component: AppHome,
  getParentRoute: () => rootRoute,
  path: "/",
});

const adminRoute = createRoute({
  component: AdminEmails,
  getParentRoute: () => rootRoute,
  path: "/admin",
});

export const routeTree = rootRoute.addChildren([indexRoute, adminRoute]);
