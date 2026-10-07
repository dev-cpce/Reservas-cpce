'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

interface NavbarProps {
  title?: string;
}

export default function Navbar({ title }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const user = useUser();
  const [isLoading, setIsLoading] = useState(false);
  
  // Función para cerrar sesión
  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {

    } finally {
      setIsLoading(false);
    }
  };

  // Determinar el título basado en la ruta actual si no se proporciona uno
  const getTitle = () => {
    if (title) return title;
    
    if (pathname.includes('/dashboard')) return 'Panel del Control';
    if (pathname.includes('/recursos')) return 'Gestión de Recursos';
    if (pathname.includes('/bloqueos')) return 'Gestión de Bloqueos';
    if (pathname.includes('/reservas')) return 'Gestión de Reservas';
    if (pathname.includes('/clientes')) return 'Gestión de Clientes';
    if (pathname.includes('/pagos')) return 'Gestión de Pagos';
    if (pathname.includes('/reportes')) return 'Reportes';
    
    return 'ReservaYA';
  };

  return (
    <div className="h-16 px-8 border-b border-gray-200 flex items-center justify-between bg-white">
      <h1 className="text-2xl font-bold text-gray-900">{getTitle()}</h1>
      
      <div className="flex items-center gap-4">
    
        
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
            <Image 
              src="/user-avatar.svg"
              alt="Profile" 
              width={36}
              height={36}
              className="h-full w-full object-cover text-gray-500"
            />
          </div>
          
          {user && (
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-gray-900">{user.email}</span>
              <button 
                onClick={handleSignOut}
                disabled={isLoading}
                className="text-xs text-red-600 hover:text-red-800"
              >
                {isLoading ? 'Cerrando sesión...' : 'Cerrar sesión'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}