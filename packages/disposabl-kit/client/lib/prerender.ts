import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import ts from "typescript";
import config from "../../../../disposabl.json" with { type: "json" };

/** Read route metadata without executing route components in the Vite config. */
export function pageRoutes(source: string) {
  const paths = new Map<string, boolean>();
  const file = ts.createSourceFile("routes.ts", source, ts.ScriptTarget.Latest);

  function visit(node: ts.Node) {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === "FileRoutesByPath"
    ) {
      for (const member of node.members) {
        if (
          !ts.isPropertySignature(member) ||
          !member.type ||
          !ts.isTypeLiteralNode(member.type)
        )
          continue;
        const fields = new Map<string, string>();
        for (const field of member.type.members) {
          if (
            ts.isPropertySignature(field) &&
            ts.isIdentifier(field.name) &&
            field.type &&
            ts.isLiteralTypeNode(field.type) &&
            ts.isStringLiteral(field.type.literal)
          ) {
            fields.set(field.name.text, field.type.literal.text);
          }
        }
        const id = fields.get("id");
        const fullPath = fields.get("fullPath");
        // Pathless layouts share their parent's URL; only match actual pages.
        if (id && fullPath && fields.get("path")) {
          paths.set(fullPath, id.split("/").includes("_authenticated"));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (paths.size === 0)
    throw new Error(
      "No page routes found in the generated TanStack route tree.",
    );
  return [...paths].map(([path, authenticated]) => ({ path, authenticated }));
}

function routeMatcher(source: string) {
  const root = createRootRoute();
  const paths = new Map(
    pageRoutes(source).map(({ path, authenticated }) => [path, authenticated]),
  );

  const router = createRouter({
    routeTree: root.addChildren(
      [...paths.keys()].map((path) =>
        createRoute({ getParentRoute: () => root, path }),
      ),
    ),
  });
  return (pathname: string) => {
    const matches = router.matchRoutes(pathname);
    const leaf = matches[matches.length - 1];
    return leaf ? paths.get(leaf.fullPath) === true : false;
  };
}

/** The authenticated layout is the single source of protected route membership. */
export function createPrerenderFilter(
  routeTreeFile = resolve("src/routeTree.gen.ts"),
) {
  let source: string | undefined;
  let isAuthenticated: ReturnType<typeof routeMatcher> | undefined;
  return (page: { path: string; sitemap?: { exclude?: boolean } }) => {
    // Fumapress builds its own pages, including links crawled from the web app.
    const pathname = new URL(page.path, "http://localhost").pathname;
    if (config.features.includes("docs") && /^\/docs(?:\/|$)/.test(pathname))
      return false;
    // Read lazily: Start generates the route tree after loading the Vite config.
    const nextSource = readFileSync(routeTreeFile, "utf8");
    if (nextSource !== source) {
      isAuthenticated = routeMatcher(nextSource);
      source = nextSource;
    }
    const authenticated = isAuthenticated!(pathname);
    if (authenticated) page.sitemap = { ...page.sitemap, exclude: true };
    return !authenticated;
  };
}
