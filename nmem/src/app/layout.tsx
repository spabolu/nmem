import type { Metadata } from "next";
import localFont from "next/font/local";
import { GlobalBar } from "@/components/global-bar";
import { Theme } from "@/components/theme";
import "./globals.css";
import "./nmem.css";

const mona = localFont({
  src: "./fonts/mona-sans.woff2",
  weight: "200 900",
  variable: "--font-mona",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "nmem", template: "%s · nmem" },
  description: "What a repository does and why, read from its history.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={mona.variable}
      data-color-mode="auto"
      data-light-theme="light"
      data-dark-theme="dark"
      suppressHydrationWarning
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Theme>
          <GlobalBar />
          {children}
        </Theme>
      </body>
    </html>
  );
}
