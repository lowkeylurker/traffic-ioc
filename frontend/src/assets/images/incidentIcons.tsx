import React from 'react';
import {
    CarFront, // ACCIDENT
    Waves, // FLOOD
    Cone, // CONSTRUCTION
    Flame, // FIRE
    AlertTriangle // Default
} from 'lucide-react';

export const getIncidentIcon = (type: string, size = 24, color = 'white') => {
    switch (type?.toUpperCase()) {
        case 'ACCIDENT':
            return <CarFront size={size} color={color} />;
        case 'FLOOD':
            return <Waves size={size} color={color} />;
        case 'CONSTRUCTION':
            return <Cone size={size} color={color} />;
        case 'FIRE':
            return <Flame size={size} color={color} />;
        default:
            return <AlertTriangle size={size} color={color} />;
    }
};


export const getIncidentColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
        case 'HIGH':
            return '#ef4444';
        case 'MEDIUM':
            return '#f97316';
        case 'LOW':
            return '#eab308';
        default:
            return '#6b7280';
    }
};


export const timeAgo = (date: string | Date | null): string => {
    if (!date) return 'Không rõ';

    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} tiếng trước`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
};
