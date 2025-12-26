
"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Welcome, Admin!</CardTitle>
          <CardDescription>This is the central control panel for administration tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>
            You have successfully accessed the admin area. From here, you will be able to manage users,
            oversee system-wide settings, and view comprehensive analytics.
          </p>
          <p className="mt-4 text-muted-foreground">
            More administrative features will be added here soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
