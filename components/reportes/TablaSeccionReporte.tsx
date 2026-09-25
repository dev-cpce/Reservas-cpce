'use client';

interface TablaSeccionReporteProps {
  titulo: string;
  descripcion?: string;
  columnas: string[];
  filas: (string | number)[][];
  mensajeVacio?: string;
}

// Tabla genérica reutilizada por cada sección del reporte, para no duplicar el markup.
export default function TablaSeccionReporte({
  titulo,
  descripcion,
  columnas,
  filas,
  mensajeVacio = 'Sin datos para el período seleccionado.'
}: TablaSeccionReporteProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900">{titulo}</h3>
      {descripcion && <p className="text-sm text-gray-500 mt-1 mb-4">{descripcion}</p>}
      {!descripcion && <div className="mb-3" />}

      {filas.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{mensajeVacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columnas.map((columna) => (
                  <th key={columna} scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filas.map((fila, indexFila) => (
                <tr key={indexFila} className="hover:bg-gray-50">
                  {fila.map((valor, indexColumna) => (
                    <td key={indexColumna} className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                      {valor}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
