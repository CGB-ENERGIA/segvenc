import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SegVenc - CGB",
  description: "Sistema de gestão de ASOs e treinamentos",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}