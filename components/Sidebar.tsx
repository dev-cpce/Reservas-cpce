'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { 
    HomeIcon, 
    TableCellsIcon, 
    CalendarDaysIcon, 
    UserGroupIcon, 
    CreditCardIcon,
    NoSymbolIcon,
    ChartBarIcon,
    ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

const navigation = [
    { name: 'Inicio', href: '/dashboard', icon: HomeIcon },
    { name: 'Recursos', href: '/recursos', icon: TableCellsIcon },
    { name: 'Bloqueos', href: '/bloqueos', icon: NoSymbolIcon },
    { name: 'Reservas', href: '/reservas', icon: CalendarDaysIcon },
    { name: 'Clientes', href: '/clientes', icon: UserGroupIcon },
    { name: 'Pagos', href: '/pagos', icon: CreditCardIcon },
    { name: 'Reportes', href: '/reportes', icon: ChartBarIcon }
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200 w-64 py-4 shadow-md">
            <div className="px-6 mb-8 flex items-center">
                <div className="bg-blue-600 text-white p-2 rounded mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">ReservaYA</h2>
            </div>
            <nav className="flex-1 px-3 space-y-1.5">
                {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'flex items-center gap-x-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200',
                                isActive
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="px-3 mt-auto pt-4 border-t border-gray-200">
                <Link
                    href="/login"
                    className="flex items-center gap-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-red-600 rounded-lg transition-colors duration-200"
                >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    Cerrar sesión
                </Link>
            </div>
        </div>
    );
}