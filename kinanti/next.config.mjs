import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output ramping untuk Docker: hanya file yang dibutuhkan runtime.
  output: "standalone",
  // Root file-tracing di folder project ini (menghindari salah deteksi workspace
  // saat ada lockfile lain di parent directory).
  outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;
