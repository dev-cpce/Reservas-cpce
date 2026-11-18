'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { Voucher, VoucherInput } from '@/types/promociones';
import VoucherForm from '@/components/vouchers/VoucherForm';
import VouchersList from '@/components/vouchers/VouchersList';
import notifications from '@/lib/notifications';
import {
  obtenerVouchers,
  crearVoucher,
  cambiarEstadoVoucher,
  obtenerPermisosVouchers,
} from '@/app/api/vouchers/actions';

const mensaje = (e: unknown, def: string) => (e instanceof Error && e.message ? e.message : def);

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [permisos, setPermisos] = useState({ puedeVer: false, puedeCrear: false, puedeEditar: false });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = await obtenerPermisosVouchers();
      setPermisos(p);

      if (p.puedeVer) {
        setVouchers(await obtenerVouchers());
      }
    } catch (e) {
      setError(mensaje(e, 'Error al cargar los vouchers.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (data: VoucherInput) => {
    setGuardando(true);
    setError('');
    try {
      const creado = await crearVoucher(data);
      setVouchers((prev) => [creado, ...prev]);
      setMostrarFormulario(false);
      notifications.success(`Voucher creado: ${creado.codigo}`);
    } catch (e) {
      const texto = mensaje(e, 'No se pudo crear el voucher.');
      setError(texto);
      notifications.error(texto);
      throw e;
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (id: number, activo: boolean) => {
    setError('');
    try {
      await cambiarEstadoVoucher(id, activo);
      setVouchers((prev) => prev.map((v) => (v.id_voucher === id ? { ...v, activo } : v)));
    } catch (e) {
      const texto = mensaje(e, 'No se pudo cambiar el estado.');
      setError(texto);
      notifications.error(texto);
    }
  };

  if (cargando) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!permisos.puedeVer) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          {error || 'No tenés permisos para ver los vouchers.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-600">
          El cliente usa el código desde el asistente de WhatsApp. Solo es válido desde el teléfono del beneficiario.
        </p>
        {!mostrarFormulario && permisos.puedeCrear && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0 ml-4"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Nuevo voucher
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {mostrarFormulario ? (
        <VoucherForm onSubmit={crear} onCancel={() => setMostrarFormulario(false)} isSubmitting={guardando} />
      ) : (
        <VouchersList vouchers={vouchers} puedeEditar={permisos.puedeEditar} onChangeStatus={cambiarEstado} />
      )}
    </div>
  );
}
