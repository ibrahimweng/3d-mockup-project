import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AdminEmails } from "./admin";
import { AppHome } from "./index";
import { PrivacyNote } from "./privacy";

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

const privacyRoute = createRoute({
  component: PrivacyNote,
  getParentRoute: () => rootRoute,
  path: "/privacy",
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  adminRoute,
  privacyRoute,
]);
