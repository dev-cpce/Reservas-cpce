import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { AutoCancelProvider } from '@/components/AutoCancelProvider';
import { RealtimeManager } from '@/components/RealtimeManager';
import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';

export const revalidate = 0;

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const cookieStore = cookies();

    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      redirect('/login');
    }

    const perfil = await obtenerPerfil();

    if (!perfil) {
      redirect('/login');
    }

    return (
      <AutoCancelProvider>
        <RealtimeManager />

        <div className="flex h-screen">
          <Sidebar />

          <div className="flex-1 flex flex-col">
            <Navbar />

            <main className="flex-1 overflow-auto p-8 bg-gray-50">
              {children}
            </main>
          </div>
        </div>
      </AutoCancelProvider>
    );
  } catch {
    redirect('/login');
  }
}