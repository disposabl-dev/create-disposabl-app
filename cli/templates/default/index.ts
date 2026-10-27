const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  async fetch(request) {
    if (new URL(request.url).pathname === "/docs") {
      const page = Bun.file(new URL("./docs/index.html", import.meta.url));
      return (await page.exists())
        ? new Response(page)
        : new Response("Not found", { status: 404 });
    }
    return new Response("Your Disposabl app is ready.\n");
  },
});

console.log(`Your app is running at ${server.url}`);
