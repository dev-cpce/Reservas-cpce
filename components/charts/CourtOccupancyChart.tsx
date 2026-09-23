'use client';

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface CourtOccupancyProps {
  occupied: number;
  available: number;
}

export default function CourtOccupancyChart({ occupied, available }: CourtOccupancyProps) {
  const data = {
    labels: ['Fuera de servicio', 'Disponibles'],
    datasets: [
      {
        label: 'Recursos',
        data: [occupied, available],
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)',
          'rgba(75, 192, 192, 0.7)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(75, 192, 192, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      title: {
        display: true,
        text: 'Disponibilidad de Recursos',
        font: {
          size: 16,
        },
      },
    },
  };

  return (
    <div className="h-64">
      <Pie data={data} options={options} />
    </div>
  );
}