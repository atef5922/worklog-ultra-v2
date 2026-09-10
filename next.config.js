/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Dev-server origins allowed to open the HMR socket. Without the LAN address
  // here, pages opened from another device render but never hydrate, so nothing
  // on them is clickable. Add your machine's LAN IP when it changes.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.68.84", "192.168.68.*"],
  // The standalone server (what the desktop build runs) resolves `/public/*`
  // against a file list built once at process startup, so anything written
  // to public/uploads after that (avatar uploads, message attachments)
  // 404s until the next restart. Routing these through an API handler that
  // reads the filesystem per-request instead of Next's static file serving
  // fixes that everywhere, not just the desktop build.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: "/api/uploads/:path*" }];
  },
  // Desktop build output and runtime uploads live inside the project. Without
  // this the dev file watcher walks ~1.8GB of packaged binaries on every change.
  webpack(config) {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/release/**", "**/public/uploads/**"],
    };
    return config;
  },
};

module.exports = nextConfig;
