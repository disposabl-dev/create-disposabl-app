const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch() {
    return new Response("Your Disposabl app is ready.\n");
  },
});

console.log(`Your app is running at ${server.url}`);
