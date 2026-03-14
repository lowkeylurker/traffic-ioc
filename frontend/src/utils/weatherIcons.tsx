import { Sun, Cloud, CloudRain, CloudLightning, HelpCircle } from 'lucide-react';

export const getWeatherIcon = (conditionCode: string) => {
    switch (conditionCode) {
        case 'Clear':
            return Sun;
        case 'Clouds':
            return Cloud;
        case 'Rain':
        case 'Drizzle':
            return CloudRain;
        case 'Thunderstorm':
        case 'Extreme':
        case 'Tornado':
            return CloudLightning;
        default:
            return HelpCircle;
    }
};
