import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 첨부파일 업로드(최대 10MB) 여유분 포함
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
