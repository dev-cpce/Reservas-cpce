export type Rol = 'ADMIN' | 'GERENCIA' | 'EMPLEADO';

export type Permiso =
  | 'dashboard.ver'
  | 'reservas.ver'
  | 'reservas.crear'
  | 'reservas.editar'
  | 'reservas.cancelar'
  | 'reservas.eliminar'
  | 'clientes.ver'
  | 'clientes.crear'
  | 'clientes.editar'
  | 'clientes.eliminar'
  | 'pagos.ver'
  | 'pagos.confirmar'
  | 'pagos.editar'
  | 'pagos.eliminar'
  | 'recursos.ver'
  | 'recursos.crear'
  | 'recursos.editar'
  | 'recursos.eliminar'
  | 'bloqueos.ver'
  | 'bloqueos.crear'
  | 'bloqueos.editar'
  | 'bloqueos.eliminar'
  | 'reportes.ver'
  | 'reportes.exportar'
  | 'usuarios.ver'
  | 'usuarios.crear'
  | 'usuarios.editar'
  | 'usuarios.eliminar';

const PERMISOS_ADMIN: readonly Permiso[] = [
  'dashboard.ver',

  'reservas.ver',
  'reservas.crear',
  'reservas.editar',
  'reservas.cancelar',
  'reservas.eliminar',

  'clientes.ver',
  'clientes.crear',
  'clientes.editar',
  'clientes.eliminar',

  'pagos.ver',
  'pagos.confirmar',
  'pagos.editar',
  'pagos.eliminar',

  'recursos.ver',
  'recursos.crear',
  'recursos.editar',
  'recursos.eliminar',

  'bloqueos.ver',
  'bloqueos.crear',
  'bloqueos.editar',
  'bloqueos.eliminar',

  'reportes.ver',
  'reportes.exportar',

  'usuarios.ver',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.eliminar',
];

const PERMISOS_GERENCIA: readonly Permiso[] = [
  ...PERMISOS_ADMIN,
];

const PERMISOS_EMPLEADO: readonly Permiso[] = [
  'dashboard.ver',

  'reservas.ver',
  'reservas.crear',
  'reservas.editar',

  'clientes.ver',
  'clientes.crear',

  'pagos.ver',
  'pagos.confirmar',

  'recursos.ver',
];

const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  ADMIN: PERMISOS_ADMIN,
  GERENCIA: PERMISOS_GERENCIA,
  EMPLEADO: PERMISOS_EMPLEADO,
};

export function tienePermiso(
  rol: Rol,
  permiso: Permiso
): boolean {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}

export function obtenerPermisosPorRol(
  rol: Rol
): readonly Permiso[] {
  return PERMISOS_POR_ROL[rol];
}