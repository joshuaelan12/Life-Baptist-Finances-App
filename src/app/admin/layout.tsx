
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

    if (authError) {
      console.error("Auth Error in AdminLayout:", authError);
      setIsAdmin(false); // Treat auth error as not an admin
      return;
    }

    if (user) {
      // User is authenticated, now check if they are an admin
      getUserDocument(user.uid)
        .then(userDoc => {
          // Admins are users who do NOT have a user document
          if (userDoc) {
            console.log('User has a user document, redirecting. Not an admin.');
            router.replace('/dashboard'); // Not an admin, send to regular dashboard
          } else {
            setIsAdmin(true); // Is an admin, allow access
          }
        })
        .catch(err => {
          console.error("Error checking admin status:", err);
          router.replace('/admin/login'); // Error during check, send to login
        });
    } else {
        // No user logged in, allow children to render (which should be the login page)
        setIsAdmin(false);
    }
  }, [user, authLoading, authError, router]);

  // While checking auth state or admin status
  if (authLoading || (user && isAdmin === null)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Verifying admin access...</p>
      </div>
    );
  }

  // If we have a user and they are an admin, show the protected layout
  if (user && isAdmin) {
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

  // If there's no user (and we're not loading), just render the children
  // This allows the /admin/login page to be displayed.
  return <>{children}</>;
}
