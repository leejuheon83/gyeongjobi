import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "대외경조비 관리시스템",
    short_name: "대외경조비",
    description: "대외경조비 신청 및 관리 사내 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#123b76",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
