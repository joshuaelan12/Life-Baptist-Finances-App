
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getUserDocument } from '@/services/userService';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/layout/admin-sidebar';

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
      // Still waiting for auth state, do nothing.
      return;
    }

    if (authError) {
      console.error("Auth Error in AdminLayout:", authError);
      // On auth error, treat as not an admin and redirect to login.
      setIsAdmin(false);
      router.replace('/admin/login');
      return;
    }

    if (user) {
      // User is authenticated, now check if they are an admin.
      getUserDocument(user.uid)
        .then(userDoc => {
          // An admin is a user who does NOT have a user document.
          if (userDoc) {
            console.log('User has a user document, this is not an admin account. Redirecting to user dashboard.');
            setIsAdmin(false);
            router.replace('/dashboard'); // Not an admin, send to regular user dashboard.
          } else {
            console.log('User does not have a user document. Verified as admin.');
            setIsAdmin(true); // Is an admin, allow access.
          }
        })
        .catch(err => {
          console.error("Error checking admin status:", err);
          setIsAdmin(false);
          router.replace('/admin/login'); // Error during check, send to admin login.
        });
    } else {
        // No user is logged in.
        // Don't redirect. Let the child (which should be the login page) render.
        console.log('No user logged in, allowing render for login page.');
        setIsAdmin(false);
    }
  }, [user, authLoading, authError, router]);

  // While checking auth state or verifying admin status for a logged-in user.
  if (authLoading || (user && isAdmin === null)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Verifying admin access...</p>
      </div>
    );
  }

  // If we have a user and they are confirmed to be an admin, show the protected layout.
  if (user && isAdmin) {
    return (
      <SidebarProvider defaultOpen={true}>
        <AdminSidebar />
        <SidebarInset className="flex flex-col">
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // If there's no user (and we're not loading), just render the children.
  // This is the crucial part that allows the /admin/login page to be displayed.
  return <>{children}</>;
}
