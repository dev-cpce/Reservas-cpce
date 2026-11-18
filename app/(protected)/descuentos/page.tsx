'use client';

import { useState, useEffect, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import type { Recurso } from '@/types';
import type { Descuento, DescuentoInput } from '@/types/promociones';
import DescuentoForm from '@/components/descuentos/DescuentoForm';
import DescuentosList from '@/components/descuentos/DescuentosList';
import notifications from '@/lib/notifications';
import {
  obtenerDescuentos,
  crearDescuento,
  actualizarDescuento,
  cambiarEstadoDescuento,
  obtenerPermisosDescuentos,
} from '@/app/api/descuentos/actions';
import { obtenerRecursosDisponibles } from '@/app/api/reservas/actions';

const mensaje = (e: unknown, def: string) => (e instanceof Error && e.message ? e.message : def);

export default function DescuentosPage() {
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [editando, setEditando] = useState<Descuento | undefined>();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [permisos, setPermisos] = useState({ puedeVer: false, puedeCrear: false, puedeEditar: false });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = await obtenerPermisosDescuentos();
      setPermisos(p);

      if (p.puedeVer) {
        const [lista, rec] = await Promise.all([
          obtenerDescuentos(),
          obtenerRecursosDisponibles().catch(() => []),
        ]);
        setDescuentos(lista);
        setRecursos(rec);
      }
    } catch (e) {
      setError(mensaje(e, 'Error al cargar los descuentos.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrarFormulario = () => {
    setEditando(undefined);
    setMostrarFormulario(false);
  };

  const guardar = async (data: DescuentoInput) => {
    setGuardando(true);
    setError('');
    try {
      if (editando) {
        const actualizado = await actualizarDescuento(editando.id_descuento, data);
        setDescuentos((prev) => prev.map((d) => (d.id_descuento === actualizado.id_descuento ? actualizado : d)));
      } else {
        const creado = await crearDescuento(data);
        setDescuentos((prev) => [creado, ...prev]);
      }
      cerrarFormulario();
    } catch (e) {
      const texto = mensaje(e, 'No se pudo guardar el descuento.');
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
      const actualizado = await cambiarEstadoDescuento(id, activo);
      setDescuentos((prev) => prev.map((d) => (d.id_descuento === id ? actualizado : d)));
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
          {error || 'No tenés permisos para ver los descuentos.'}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-600">
          Los descuentos se aplican sobre el precio base de la tarifa. Si coinciden varios, se aplica solo el de
          mayor porcentaje.
        </p>
        {!mostrarFormulario && permisos.puedeCrear && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0 ml-4"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Nuevo descuento
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {mostrarFormulario ? (
        <DescuentoForm
          key={editando?.id_descuento ?? 'nuevo'}
          descuento={editando}
          recursos={recursos}
          onSubmit={guardar}
          onCancel={cerrarFormulario}
          isSubmitting={guardando}
        />
      ) : (
        <DescuentosList
          descuentos={descuentos}
          recursos={recursos}
          puedeEditar={permisos.puedeEditar}
          onEdit={(d) => {
            setEditando(d);
            setMostrarFormulario(true);
          }}
          onChangeStatus={cambiarEstado}
        />
      )}
    </div>
  );
}
