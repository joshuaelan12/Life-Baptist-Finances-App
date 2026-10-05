import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { GenkitClientProvider } from '@/components/layout/genkit-client-provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

export const metadata: Metadata = {
  title: 'Life Baptist Finances',
  description: 'Financial management for Life Baptist Church Mutengene',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <GenkitClientProvider>
          <FirebaseErrorListener />
          {children}
          <Toaster />
        </GenkitClientProvider>
      </body>
    </html>
  );
}
