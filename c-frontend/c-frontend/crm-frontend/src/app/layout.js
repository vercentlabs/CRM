import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { ChatNotificationProvider } from "../components/chat/ChatNotificationContext";
import { LeadMessageProvider } from "../context/LeadMessageContext";
import ClientOnly from "../components/ClientOnly";
import { ReduxProvider } from "../components/providers/ReduxProvider";
import ThemeManager from "../components/ThemeManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "CRM Enterprise",
  description: "Customer Relationship Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientOnly>
          <ThemeManager />
          <ReduxProvider>
            <AuthProvider>
              <ChatNotificationProvider>
                <LeadMessageProvider>
                  {children}
                </LeadMessageProvider>
              </ChatNotificationProvider>
            </AuthProvider>
          </ReduxProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
