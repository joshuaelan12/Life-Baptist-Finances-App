
"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getUserDocument } from '@/services/userService';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, authLoading, authError] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(true);

  React.useEffect(() => {
    if (authLoading) {
      // Still loading, so we are verifying.
      setIsVerifying(true);
      return;
    }

    if (!user) {
      // No user logged in, not an admin. Stop verifying.
      // The login page will be rendered.
      setIsAdmin(false);
      setIsVerifying(false);
      return;
    }

    if (authError) {
      // Error checking auth state.
      console.error("Auth error in admin layout:", authError);
      setIsAdmin(false);
      setIsVerifying(false);
      router.replace('/admin/login');
      return;
    }
    
    // User is authenticated, now check their role.
    getUserDocument(user.uid)
      .then(userDoc => {
        if (userDoc) {
          // This is a regular user, not an admin.
          setIsAdmin(false);
          router.replace('/dashboard'); // Redirect to user dashboard.
        } else {
          // No user doc means they are an admin.
          setIsAdmin(true);
        }
      })
      .catch(err => {
        console.error("Error verifying admin status:", err);
        setIsAdmin(false);
        router.replace('/admin/login'); // On error, redirect to admin login.
      })
      .finally(() => {
        setIsVerifying(false);
      });

  }, [user, authLoading, authError, router]);

  if (isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4">Verifying access...</p>
      </div>
    );
  }

  if (isAdmin) {
    // User is an admin, show the protected layout.
    return (
      <SidebarProvider defaultOpen={true}>
        <AdminSidebar />
        <SidebarInset className="flex flex-col">
           <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6 md:hidden">
              <SidebarTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SidebarTrigger>
              <h1 className="text-lg font-semibold">Admin Panel</h1>
            </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // If not verifying and not an admin (e.g., logged out), render children.
  // This allows the /admin/login page to be displayed.
  return <>{children}</>;
}
