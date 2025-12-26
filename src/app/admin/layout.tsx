
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getUserDocument } from '@/services/userService';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, authLoading, authError] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) {
      // Still waiting for auth state
      return;
    }

    if (!user || authError) {
      // Not logged in or auth error, redirect to admin login
      router.replace('/admin/login');
      return;
    }

    // User is authenticated, now check if they are an admin
    getUserDocument(user.uid)
      .then(userDoc => {
        // Admins are users who do NOT have a user document
        if (userDoc) {
          console.log('User has a user document, redirecting. Not an admin.');
          setIsAdmin(false);
          router.replace('/dashboard'); // or a dedicated "access-denied" page
        } else {
          setIsAdmin(true);
        }
      })
      .catch(err => {
        console.error("Error checking admin status:", err);
        setIsAdmin(false);
        router.replace('/admin/login');
      });

  }, [user, authLoading, authError, router]);

  // While checking auth state or admin status
  if (authLoading || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Verifying admin access...</p>
      </div>
    );
  }

  // If user is confirmed to not be an admin (this is a fallback for the redirect)
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p>Redirecting...</p>
      </div>
    );
  }

  // Confirmed admin, render the layout
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
