import localFont from "next/font/local";

export const inter = localFont({
  src: [
    { path: "./fonts/inter-400.woff2", weight: "400" },
    { path: "./fonts/inter-500.woff2", weight: "500" },
    { path: "./fonts/inter-600.woff2", weight: "600" },
    { path: "./fonts/inter-700.woff2", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

export const kufi = localFont({
  src: [
    { path: "./fonts/noto-kufi-arabic-400.woff2", weight: "400" },
    { path: "./fonts/noto-kufi-arabic-500.woff2", weight: "500" },
    { path: "./fonts/noto-kufi-arabic-700.woff2", weight: "700" },
  ],
  variable: "--font-kufi",
  display: "swap",
  preload: false,
});
