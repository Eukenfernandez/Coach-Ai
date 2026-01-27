import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'coachai_theme';

/**
 * Custom hook for managing application theme (dark/light mode).
 * Persists preference to localStorage and updates the document class.
 */
export function useTheme() {
    const [theme, setThemeState] = useState<Theme>('dark');

    useEffect(() => {
        const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
        if (savedTheme) {
            setThemeState(savedTheme);
            updateHtmlClass(savedTheme);
        } else {
            // Default to dark
            updateHtmlClass('dark');
        }
    }, []);

    const updateHtmlClass = (newTheme: Theme) => {
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(THEME_KEY, newTheme);
        updateHtmlClass(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    }, [theme, setTheme]);

    return { theme, setTheme, toggleTheme };
}
