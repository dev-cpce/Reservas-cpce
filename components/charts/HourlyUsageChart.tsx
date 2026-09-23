'use client';

import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface HourlyUsageChartProps {
  data?: Array<{ hora: string; cantidad: number }>;
}

export default function HourlyUsageChart({ data: chartData = [] }: HourlyUsageChartProps) {
  // Generar horarios desde 08:00 hasta 23:30 en pasos de 30 min (slots del nuevo modelo de recurso)
  const allHours = [];
  for (let i = 8; i <= 23; i++) {
    allHours.push(`${i.toString().padStart(2, '0')}:00`);
    allHours.push(`${i.toString().padStart(2, '0')}:30`);
  }
  
  // Mapear datos reales a los horarios
  const reservasPorHora = allHours.map(hora => {
    const encontrado = chartData.find(item => item.hora === hora);
    return encontrado ? encontrado.cantidad : 0;
  });
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      title: {
        display: true,
        text: 'Reservas por Horario',
        font: {
          size: 16,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  const data = {
    labels: allHours,
    datasets: [
      {
        label: 'Total de Reservas',
        data: reservasPorHora,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        tension: 0.3,
      },
    ],
  };

  return (
    <div className="h-72">
      <Line options={options} data={data} />
    </div>
  );
}